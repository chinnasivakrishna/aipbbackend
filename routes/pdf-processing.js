const express = require("express")
const multer = require("multer")
const path = require("path")
const fs = require("fs")
const axios = require("axios")
const PDFProcessor = require("../services/PDFProcessor")
const mongoose = require("mongoose")
const modelName = "datastoreitems"

const router = express.Router()
const upload = multer({ dest: "temp-uploads/" })

// Ensure temp-uploads directory exists
const tempUploadsDir = path.join(__dirname, "../temp-uploads")
if (!fs.existsSync(tempUploadsDir)) {
  fs.mkdirSync(tempUploadsDir, { recursive: true })
}

// Authentication middleware - adjust the path based on your project structure
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers["authorization"]
  const token = authHeader && authHeader.split(" ")[1]

  if (!token) {
    return res.status(401).json({ success: false, message: "Access token required" })
  }

  // Add your JWT verification logic here
  // For now, we'll assume the token is valid and extract user info
  try {
    // Replace this with your actual JWT verification
    // const decoded = jwt.verify(token, process.env.JWT_SECRET)
    // req.user = decoded

    // Temporary - you should replace this with actual JWT verification
    req.user = { id: "user_id_from_token" }
    next()
  } catch (error) {
    return res.status(403).json({ success: false, message: "Invalid token" })
  }
}

// Initialize PDF processor with environment variables
const processor = new PDFProcessor({
  chunkrApiKey: process.env.CHUNKR_API_KEY,
  geminiApiKey: process.env.GEMINI_API_KEY,
  astraToken: process.env.ASTRA_TOKEN,
  astraApiEndpoint: process.env.ASTRA_API_ENDPOINT,
  keyspace: process.env.ASTRA_KEYSPACE,
  collectionName: process.env.ASTRA_COLLECTION,
  embeddingModel: process.env.EMBEDDING_MODEL || "text-embedding-004",
  chatModel: process.env.CHAT_MODEL || "gemini-1.5-flash",
  vectorDimensions: Number.parseInt(process.env.VECTOR_DIMENSIONS) || 768,
  chunkSize: Number.parseInt(process.env.CHUNK_SIZE) || 400,
  chunkOverlap: Number.parseInt(process.env.CHUNK_OVERLAP) || 100,
  maxContextChunks: Number.parseInt(process.env.MAX_CONTEXT_CHUNKS) || 20,
})

// Debug route to check what models are available
router.get("/debug/models", (req, res) => {
  try {
    const mongoose = require("mongoose")
    const modelNames = mongoose.modelNames()
    res.json({
      success: true,
      availableModels: modelNames,
      message: "Available Mongoose models",
    })
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Error getting models: " + error.message,
    })
  }
})

// Debug route to check items in database
router.get("/debug/items", authenticateToken, async (req, res) => {
  try {
    const mongoose = require("mongoose")

    // Try to find the correct model
    let DatastoreItem
    try {
      DatastoreItem = mongoose.model("datastoreitems") // Corrected model name
    } catch (error) {
      // If model doesn't exist, try to require it
      try {
        DatastoreItem = require("../models/DatastoreItem")
      } catch (requireError) {
        return res.status(500).json({
          success: false,
          message: "DatastoreItem model not found",
          error: requireError.message,
        })
      }
    }

    const allItems = await DatastoreItem.find({}).limit(10)
    const pdfItems = await DatastoreItem.find({
      $or: [{ type: "pdf" }, { fileType: "application/pdf" }],
    }).limit(10)

    res.json({
      success: true,
      totalItems: allItems.length,
      pdfItems: pdfItems.length,
      sampleItems: allItems.map((item) => ({
        id: item._id,
        title: item.title,
        type: item.type,
        fileType: item.fileType,
        user: item.user,
      })),
      samplePDFs: pdfItems.map((item) => ({
        id: item._id,
        title: item.title,
        type: item.type,
        fileType: item.fileType,
        user: item.user,
      })),
    })
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Error getting items: " + error.message,
    })
  }
})

// Check if PDF embeddings already exist
router.get("/check-embeddings/:itemId", authenticateToken, async (req, res) => {
  try {
    const { itemId } = req.params
    console.log("Checking embeddings for item ID:", itemId)

    const mongoose = require("mongoose")
    let DatastoreItem
    try {
      DatastoreItem = mongoose.model(modelName) // Corrected model name
    } catch (error) {
      console.log("Model not found, attempting to require...")
      // If model doesn't exist, try to require it
      try {
        DatastoreItem = require("../models/DatastoreItem")
        console.log("Model required successfully.")
      } catch (requireError) {
        console.error("Error requiring model:", requireError)
        return res.status(500).json({
          success: false,
          message: "DatastoreItem model not found",
          error: requireError.message,
        })
      }
    }

    try {
      console.log("Attempting to find item with ID:", itemId)
      const item = await DatastoreItem.findById(itemId)
      console.log("Found item:", item)

      if (!item) {
        // Let's also try to find any item with this ID in case there's a collection name issue
        const allCollections = await mongoose.connection.db.listCollections().toArray()
        console.log(
          "Available collections:",
          allCollections.map((c) => c.name),
        )

        return res.status(404).json({
          success: false,
          message: "PDF not found",
          debug: {
            searchedId: itemId,
            availableCollections: allCollections.map((c) => c.name),
          },
        })
      }

      if (item.type !== "pdf" && item.fileType !== "application/pdf") {
        return res.status(400).json({
          success: false,
          message: "Item is not a PDF",
          debug: {
            itemType: item.type,
            fileType: item.fileType,
          },
        })
      }

      // For now, skip user ownership check for debugging
      // if (item.user.toString() !== req.user.id) {
      //   return res.status(403).json({ success: false, message: "Access denied" })
      // }

      // Check if embeddings exist in AstraDB using the title as filename
      const hasEmbeddings = await processor.checkEmbeddingsExist(item.title)

      res.json({
        success: true,
        hasEmbeddings: hasEmbeddings || item.embeddingsProcessed,
        fileName: item.title,
        itemId: item._id,
        embeddingStatus: item.embeddingStatus || "idle",
        canChat: item.canChat || false,
        debug: {
          itemFound: true,
          itemType: item.type,
          fileType: item.fileType,
          title: item.title,
        },
      })
    } catch (findError) {
      console.error("Error finding item:", findError)
      return res.status(500).json({
        success: false,
        message: "Error finding item: " + findError.message,
        debug: {
          itemId: itemId,
          error: findError.message,
          stack: findError.stack,
        },
      })
    }
  } catch (error) {
    console.error("Error checking embeddings:", error)
    res.status(500).json({
      success: false,
      message: "Error checking embeddings: " + error.message,
      debug: {
        error: error.message,
        stack: error.stack,
      },
    })
  }
})

// Create embeddings for a PDF
router.post("/create-embeddings/:itemId", authenticateToken, async (req, res) => {
  try {
    const { itemId } = req.params
    console.log("Creating embeddings for item ID:", itemId)

    const mongoose = require("mongoose")
    let DatastoreItem
    try {
      DatastoreItem = mongoose.model(modelName) // Corrected model name
    } catch (error) {
      console.log("Model not found, attempting to require...")
      // If model doesn't exist, try to require it
      try {
        DatastoreItem = require("../models/DatastoreItem")
        console.log("Model required successfully.")
      } catch (requireError) {
        console.error("Error requiring model:", requireError)
        return res.status(500).json({
          success: false,
          message: "DatastoreItem model not found",
          error: requireError.message,
        })
      }
    }

    try {
      console.log("Attempting to find item with ID:", itemId)
      const item = await DatastoreItem.findById(itemId)
      console.log("Found item:", item)

      if (!item) {
        console.log(`PDF with ID ${itemId} not found`)
        return res.status(404).json({ success: false, message: "PDF not found" })
      }

      if (item.type !== "pdf" && item.fileType !== "application/pdf") {
        return res.status(400).json({ success: false, message: "Item is not a PDF" })
      }

      // Skip user ownership check for debugging
      // if (item.user.toString() !== req.user.id) {
      //   return res.status(403).json({ success: false, message: "Access denied" })
      // }

      // Check if embeddings already exist
      if (item.embeddingsProcessed && item.embeddingStatus === "completed") {
        return res.json({
          success: true,
          message: "Embeddings already exist for this PDF",
          fileName: item.title,
          skipProcessing: true,
        })
      }

      // Update status to processing if the method exists
      if (typeof item.updateEmbeddingStatus === "function") {
        await item.updateEmbeddingStatus("processing")
      } else {
        // Fallback for basic update
        item.embeddingStatus = "processing"
        await item.save()
      }

      try {
        // Download PDF from URL and process
        const response = await axios({
          method: "GET",
          url: item.url,
          responseType: "stream",
        })

        const tempFilePath = path.join(__dirname, "../temp-uploads", `${itemId}.pdf`)
        const writer = fs.createWriteStream(tempFilePath)

        response.data.pipe(writer)

        await new Promise((resolve, reject) => {
          writer.on("finish", resolve)
          writer.on("error", reject)
        })

        // Process PDF and create embeddings
        const result = await processor.processPDFPipeline(tempFilePath, item.title)

        // Clean up temp file
        fs.unlinkSync(tempFilePath)

        // Update item with successful result
        if (typeof item.updateEmbeddingStatus === "function") {
          await item.updateEmbeddingStatus("completed", result.summary)
        } else {
          item.embeddingStatus = "completed"
          item.embeddingsProcessed = true
          item.embeddingsCreatedAt = new Date()
          item.processingResult = result.summary
        }

        item.embeddingTaskId = result.taskId
        await item.save()

        res.json({
          success: true,
          message: "Embeddings created successfully",
          fileName: item.title,
          result: result,
        })
      } catch (processingError) {
        // Update status to failed
        if (typeof item.updateEmbeddingStatus === "function") {
          await item.updateEmbeddingStatus("failed", { error_message: processingError.message })
        } else {
          item.embeddingStatus = "failed"
          await item.save()
        }
        throw processingError
      }
    } catch (findError) {
      console.error("Error finding item:", findError)
      return res.status(500).json({
        success: false,
        message: "Error finding item: " + findError.message,
        debug: {
          itemId: itemId,
          error: findError.message,
          stack: findError.stack,
        },
      })
    }
  } catch (error) {
    console.error("Error creating embeddings:", error)
    res.status(500).json({
      success: false,
      message: "Error creating embeddings: " + error.message,
    })
  }
})

// Chat with PDF
router.post("/chat/:itemId", authenticateToken, async (req, res) => {
  try {
    const { itemId } = req.params
    const { question } = req.body

    if (!question) {
      return res.status(400).json({ success: false, message: "Question is required" })
    }

    const mongoose = require("mongoose")
    let DatastoreItem
    try {
      DatastoreItem = mongoose.model(modelName) // Corrected model name
    } catch (error) {
      DatastoreItem = require("../models/DatastoreItem")
    }

    const item = await DatastoreItem.findById(itemId)

    if (!item) {
      return res.status(404).json({ success: false, message: "PDF not found" })
    }

    if (item.type !== "pdf" && item.fileType !== "application/pdf") {
      return res.status(400).json({ success: false, message: "Item is not a PDF" })
    }

    // Skip user ownership check for debugging
    // if (item.user.toString() !== req.user.id) {
    //   return res.status(403).json({ success: false, message: "Access denied" })
    // }

    // Check if embeddings exist and are ready
    const canChat = item.embeddingsProcessed && item.embeddingStatus === "completed"
    if (!canChat) {
      return res.status(400).json({
        success: false,
        message: "Embeddings not found or not ready. Please create embeddings first.",
      })
    }

    // Get answer from PDF
    const result = await processor.answerQuestion(question, item.title)

    // Save chat message to history if method exists
    if (typeof item.addChatMessage === "function") {
      await item.addChatMessage(question, result.answer, result.confidence, result.sources)
    } else {
      // Fallback - add to chatHistory array
      if (!item.chatHistory) {
        item.chatHistory = []
      }
      item.chatHistory.push({
        question,
        answer: result.answer,
        confidence: result.confidence,
        sources: result.sources,
        timestamp: new Date(),
      })
      item.lastChatAt = new Date()
      await item.save()
    }

    res.json({
      success: true,
      question,
      answer: result.answer,
      confidence: result.confidence,
      sources: result.sources,
      analysis: result.analysis,
      sourceDetails: result.sourceDetails,
      fileName: item.title,
    })
  } catch (error) {
    console.error("Error in PDF chat:", error)
    res.status(500).json({
      success: false,
      message: "Error processing question: " + error.message,
    })
  }
})

// Get chat history for a PDF
router.get("/chat-history/:itemId", authenticateToken, async (req, res) => {
  try {
    const { itemId } = req.params

    const mongoose = require("mongoose")
    let DatastoreItem
    try {
      DatastoreItem = mongoose.model(modelName) // Corrected model name
    } catch (error) {
      DatastoreItem = require("../models/DatastoreItem")
    }

    const item = await DatastoreItem.findById(itemId).select("chatHistory lastChatAt title type")

    if (!item) {
      return res.status(404).json({ success: false, message: "PDF not found" })
    }

    // Skip user ownership check for debugging
    // if (item.user.toString() !== req.user.id) {
    //   return res.status(403).json({ success: false, message: "Access denied" })
    // }

    res.json({
      success: true,
      chatHistory: item.chatHistory || [],
      lastChatAt: item.lastChatAt,
      itemId,
      fileName: item.title,
    })
  } catch (error) {
    console.error("Error getting chat history:", error)
    res.status(500).json({ success: false, message: "Error getting chat history" })
  }
})

// Get all PDFs with their embedding status for a user
router.get("/pdf-status", authenticateToken, async (req, res) => {
  try {
    const mongoose = require("mongoose")
    let DatastoreItem
    try {
      DatastoreItem = mongoose.model(modelName) // Corrected model name
    } catch (error) {
      DatastoreItem = require("../models/DatastoreItem")
    }

    const pdfs = await DatastoreItem.find({
      // user: req.user.id, // Skip for debugging
      $or: [{ type: "pdf" }, { fileType: "application/pdf" }],
    }).select("title embeddingsProcessed embeddingStatus lastChatAt processingResult")

    res.json({
      success: true,
      pdfs: pdfs.map((pdf) => ({
        id: pdf._id,
        title: pdf.title,
        embeddingsProcessed: pdf.embeddingsProcessed || false,
        embeddingStatus: pdf.embeddingStatus || "idle",
        canChat: pdf.embeddingsProcessed && pdf.embeddingStatus === "completed",
        lastChatAt: pdf.lastChatAt,
        chunksInserted: pdf.processingResult?.chunks_inserted || 0,
      })),
    })
  } catch (error) {
    console.error("Error getting PDF status:", error)
    res.status(500).json({ success: false, message: "Error getting PDF status" })
  }
})

module.exports = router

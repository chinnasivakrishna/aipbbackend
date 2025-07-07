const express = require("express")
const router = express.Router()
const EnhancedPDFProcessor = require("../services/PDFProcessor")
const DataStore = require("../models/DatastoreItems")
const Book = require("../models/Book")
const { authenticateMobileUser } = require("../middleware/mobileAuth")

// Initialize enhanced processor
const processor = new EnhancedPDFProcessor({
  chunkrApiKey: process.env.CHUNKR_API_KEY,
  openaiApiKey: process.env.OPENAI_API_KEY,
  astraToken: process.env.ASTRA_TOKEN,
  astraApiEndpoint: process.env.ASTRA_API_ENDPOINT,
  keyspace: process.env.ASTRA_KEYSPACE,
  collectionName: process.env.ASTRA_COLLECTION,
  embeddingModel: process.env.EMBEDDING_MODEL || "text-embedding-3-small",
  chatModel: process.env.CHAT_MODEL || "gpt-4o-mini",
  vectorDimensions: process.env.VECTOR_DIMENSIONS || "1536",
  chunkSize: process.env.CHUNK_SIZE || "400",
  chunkOverlap: process.env.CHUNK_OVERLAP || "100",
  maxContextChunks: process.env.MAX_CONTEXT_CHUNKS || "20",
})

// Check if chat is available for a specific PDF in a book
router.get("/check-availability/:bookId/:itemId", authenticateMobileUser, async (req, res) => {
  try {
    const { bookId, itemId } = req.params
    const userId = req.user.id
    const clientId = req.clientId || req.user.clientId

    console.log(`📱 Mobile chat availability check`)
    console.log(`📚 Book: ${bookId}, 📄 Item: ${itemId}`)
    console.log(`👤 User: ${userId}, 🏢 Client: ${clientId}`)

    // Validate required parameters
    if (!bookId || !itemId) {
      return res.status(400).json({
        success: false,
        message: "Book ID and Item ID are required",
        chatAvailable: false,
      })
    }

    // Find the book and verify access
    const book = await Book.findOne({
      _id: bookId,
      $or: [{ user: userId, userType: "MobileUser" }, { clientId: clientId }, { isPublic: true }],
    })

    if (!book) {
      return res.status(404).json({
        success: false,
        message: "Book not found or access denied",
        chatAvailable: false,
        debug: {
          bookId,
          userId,
          clientId,
        },
      })
    }

    // Find the PDF item
    const item = await DataStore.findOne({
      _id: itemId,
      book: bookId,
      $or: [{ fileType: "application/pdf" }, { itemType: "pdf" }],
    })

    if (!item) {
      return res.status(404).json({
        success: false,
        message: "PDF item not found in this book",
        chatAvailable: false,
        debug: {
          itemId,
          bookId,
          searchCriteria: {
            _id: itemId,
            book: bookId,
            fileTypes: ["application/pdf", "pdf"],
          },
        },
      })
    }

    // Check if embeddings exist for this PDF in this book
    console.log(`🔍 Checking embeddings for: ${item.name} in book: ${bookId}`)
    const embeddingStatus = await processor.checkExistingEmbeddings(item.name, userId, bookId)

    const response = {
      success: true,
      chatAvailable: embeddingStatus.exists,
      bookInfo: {
        id: book._id,
        title: book.title,
        author: book.author,
        mainCategory: book.mainCategory,
        subCategory: book.subCategory,
      },
      pdfInfo: {
        id: item._id,
        name: item.name,
        fileType: item.fileType,
        itemType: item.itemType,
        url: item.url,
        isEmbedded: item.isEmbedded,
        embeddingCount: item.embeddingCount,
        embeddedAt: item.embeddedAt,
      },
      embeddingInfo: {
        exists: embeddingStatus.exists,
        count: embeddingStatus.count,
        collectionName: embeddingStatus.collectionName,
        clusters: embeddingStatus.clusters || [],
        files: embeddingStatus.files || [],
      },
      timestamp: new Date().toISOString(),
    }

    if (!embeddingStatus.exists) {
      response.message = "Chat not available - PDF needs to be processed first"
      response.suggestion = "Please create embeddings for this PDF to enable chat functionality"
      response.nextStep = {
        action: "create_embeddings",
        endpoint: `/api/mobile/pdf-embedding/create/${bookId}/${itemId}`,
        method: "POST",
      }
    } else {
      response.message = "Chat is available for this PDF"
      response.suggestion = "You can now ask questions about this PDF content"
      response.nextStep = {
        action: "start_chat",
        endpoint: `/api/mobile/pdf-chat/chat/${bookId}/${itemId}`,
        method: "POST",
      }
    }

    console.log(`✅ Chat availability check completed: ${embeddingStatus.exists ? "Available" : "Not Available"}`)
    res.json(response)
  } catch (error) {
    console.error("❌ Error checking chat availability:", error)
    res.status(500).json({
      success: false,
      message: "Failed to check chat availability",
      chatAvailable: false,
      error: {
        message: error.message,
        stack: process.env.NODE_ENV === "development" ? error.stack : undefined,
      },
      timestamp: new Date().toISOString(),
    })
  }
})

// Chat with a specific PDF
router.post("/chat/:bookId/:itemId", authenticateMobileUser, async (req, res) => {
  try {
    const { bookId, itemId } = req.params
    const { question } = req.body
    const userId = req.user.id
    const clientId = req.clientId || req.user.clientId

    console.log(`📱 Mobile PDF chat request`)
    console.log(`📚 Book: ${bookId}, 📄 Item: ${itemId}`)
    console.log(`👤 User: ${userId}, 🏢 Client: ${clientId}`)
    console.log(`❓ Question: "${question}"`)

    // Validate question
    if (!question || typeof question !== "string" || question.trim().length === 0) {
      return res.status(400).json({
        success: false,
        message: "Question is required and cannot be empty",
        chatAvailable: false,
      })
    }

    if (question.length > 1000) {
      return res.status(400).json({
        success: false,
        message: "Question is too long. Please limit to 1000 characters.",
        chatAvailable: false,
        currentLength: question.length,
        maxLength: 1000,
      })
    }

    // Find the book and verify access
    const book = await Book.findOne({
      _id: bookId,
      $or: [{ user: userId, userType: "MobileUser" }, { clientId: clientId }, { isPublic: true }],
    })

    if (!book) {
      return res.status(404).json({
        success: false,
        message: "Book not found or access denied",
        chatAvailable: false,
      })
    }

    // Find the PDF item
    const item = await DataStore.findOne({
      _id: itemId,
      book: bookId,
      $or: [{ fileType: "application/pdf" }, { itemType: "pdf" }],
    })

    if (!item) {
      return res.status(404).json({
        success: false,
        message: "PDF item not found in this book",
        chatAvailable: false,
      })
    }

    // Check if embeddings exist
    console.log(`🔍 Checking embeddings before chat...`)
    const embeddingStatus = await processor.checkExistingEmbeddings(item.name, userId, bookId)

    if (!embeddingStatus.exists) {
      return res.status(400).json({
        success: false,
        message: "Chat not available - No embeddings found for this PDF",
        chatAvailable: false,
        suggestion: "Please create embeddings for this PDF first to enable chat functionality",
        embeddingInfo: {
          exists: false,
          count: 0,
        },
        nextStep: {
          action: "create_embeddings",
          endpoint: `/api/mobile/pdf-embedding/create/${bookId}/${itemId}`,
          method: "POST",
        },
      })
    }

    console.log(`🤖 Processing question with AI...`)
    const startTime = Date.now()

    // Process the question
    const result = await processor.answerQuestion(
      question,
      item.name,
      userId,
      false, // Don't require strict auth for mobile
      bookId,
    )

    const processingTime = Date.now() - startTime

    // Prepare response
    const response = {
      success: true,
      chatAvailable: true,
      question: question.trim(),
      answer: result.answer,
      confidence: result.confidence,
      sources: result.sources,
      bookInfo: {
        id: book._id,
        title: book.title,
        author: book.author,
        mainCategory: book.mainCategory,
        subCategory: book.subCategory,
      },
      pdfInfo: {
        id: item._id,
        name: item.name,
        fileType: item.fileType,
      },
      metadata: {
        method: result.method,
        clustersUsed: result.clusters_used || [],
        collectionName: result.collectionName,
        aiModel: process.env.CHAT_MODEL || "gpt-4o-mini",
        processingTimeMs: processingTime,
        processingTime: `${(processingTime / 1000).toFixed(2)}s`,
        timestamp: new Date().toISOString(),
      },
      embeddingInfo: {
        exists: embeddingStatus.exists,
        count: embeddingStatus.count,
        clusters: embeddingStatus.clusters || [],
      },
    }

    // Add source details if available
    if (result.sourceDetails && result.sourceDetails.length > 0) {
      response.sourceDetails = result.sourceDetails.slice(0, 3).map((source, index) => ({
        index: index + 1,
        similarity: source.similarity,
        preview: source.preview,
        cluster: source.cluster,
        contentType: source.contentType,
        fileName: source.fileName,
      }))
    }

    // Add analysis if available
    if (result.analysis) {
      response.analysis = result.analysis
    }

    console.log(`✅ Chat response generated successfully in ${(processingTime / 1000).toFixed(2)}s`)
    res.json(response)
  } catch (error) {
    console.error("❌ Error in mobile PDF chat:", error)
    res.status(500).json({
      success: false,
      message: "Failed to process chat request",
      error: {
        message: error.message,
        stack: process.env.NODE_ENV === "development" ? error.stack : undefined,
      },
      chatAvailable: false,
      timestamp: new Date().toISOString(),
    })
  }
})

// Get chat suggestions for a book
router.get("/suggestions/:bookId", authenticateMobileUser, async (req, res) => {
  try {
    const { bookId } = req.params
    const userId = req.user.id
    const clientId = req.clientId || req.user.clientId

    console.log(`📱 Getting chat suggestions for book: ${bookId}`)

    // Find the book
    const book = await Book.findOne({
      _id: bookId,
      $or: [{ user: userId, userType: "MobileUser" }, { clientId: clientId }, { isPublic: true }],
    })

    if (!book) {
      return res.status(404).json({
        success: false,
        message: "Book not found or access denied",
      })
    }

    // Check if book has any embeddings
    const embeddingStatus = await processor.checkExistingEmbeddings(
      null, // Check all files in book
      userId,
      bookId,
    )

    let suggestions = []
    let categorySpecificSuggestions = []

    // Generate category-specific suggestions based on book category
    if (book.mainCategory) {
      switch (book.mainCategory) {
        case "Civil Services":
          categorySpecificSuggestions = [
            "What are the key topics for UPSC preparation?",
            "Explain the important constitutional provisions",
            "What are the current affairs highlights?",
            "Summarize the governance and polity concepts",
          ]
          break
        case "Law":
          categorySpecificSuggestions = [
            "What are the fundamental legal principles?",
            "Explain the important case laws mentioned",
            "What are the key constitutional articles?",
            "Summarize the legal procedures discussed",
          ]
          break
        case "CA":
        case "CMA":
        case "CS":
          categorySpecificSuggestions = [
            "What are the key accounting principles?",
            "Explain the important financial concepts",
            "What are the taxation rules mentioned?",
            "Summarize the audit procedures",
          ]
          break
        case "NCERT":
          categorySpecificSuggestions = [
            "What are the main learning objectives?",
            "Explain the key concepts in simple terms",
            "What are the important formulas or facts?",
            "Provide examples mentioned in the text",
          ]
          break
        default:
          categorySpecificSuggestions = [
            "What are the main topics covered?",
            "Explain the key concepts",
            "What are the important points to remember?",
            "Provide a summary of the content",
          ]
      }
    }

    if (!embeddingStatus.exists) {
      suggestions = [
        "Upload a PDF document to this book to get started",
        "Create embeddings for your documents to enable chat",
        "Ask questions about content once PDFs are processed",
        ...categorySpecificSuggestions.slice(0, 2),
      ]
    } else {
      suggestions = [
        `What are the main topics covered in "${book.title}"?`,
        `Can you provide a summary of the key concepts in this ${book.mainCategory} book?`,
        `Explain the important points from "${book.title}"`,
        ...categorySpecificSuggestions,
      ]

      // Add cluster-based suggestions if available
      if (embeddingStatus.clusters && embeddingStatus.clusters.length > 0) {
        embeddingStatus.clusters.slice(0, 3).forEach((cluster) => {
          const readableCluster = cluster.replace(/_/g, " ").replace(/\b\w/g, (l) => l.toUpperCase())
          suggestions.push(`Tell me about ${readableCluster}`)
        })
      }

      // Add subject-specific suggestions if available
      if (book.subject) {
        suggestions.push(`What does this book say about ${book.subject}?`)
      }

      if (book.exam) {
        suggestions.push(`How does this content relate to ${book.exam}?`)
      }
    }

    // Remove duplicates and limit to 8 suggestions
    suggestions = [...new Set(suggestions)].slice(0, 8)

    res.json({
      success: true,
      bookInfo: {
        id: book._id,
        title: book.title,
        author: book.author,
        mainCategory: book.mainCategory,
        subCategory: book.subCategory,
        subject: book.subject,
        exam: book.exam,
      },
      chatAvailable: embeddingStatus.exists,
      suggestions: suggestions,
      embeddingInfo: {
        exists: embeddingStatus.exists,
        count: embeddingStatus.count,
        files: embeddingStatus.files || [],
        clusters: embeddingStatus.clusters || [],
        collectionName: embeddingStatus.collectionName,
      },
      metadata: {
        totalSuggestions: suggestions.length,
        hasClusterBasedSuggestions: embeddingStatus.clusters && embeddingStatus.clusters.length > 0,
        hasCategorySpecificSuggestions: categorySpecificSuggestions.length > 0,
        timestamp: new Date().toISOString(),
      },
    })
  } catch (error) {
    console.error("❌ Error getting chat suggestions:", error)
    res.status(500).json({
      success: false,
      message: "Failed to get chat suggestions",
      error: {
        message: error.message,
        stack: process.env.NODE_ENV === "development" ? error.stack : undefined,
      },
      timestamp: new Date().toISOString(),
    })
  }
})

// Get chat history for a book (placeholder for future implementation)
router.get("/history/:bookId", authenticateMobileUser, async (req, res) => {
  try {
    const { bookId } = req.params
    const userId = req.user.id

    // This is a placeholder for chat history functionality
    // You can implement this based on your requirements
    // For now, we'll return an empty history with metadata

    const book = await Book.findOne({
      _id: bookId,
      $or: [{ user: userId, userType: "MobileUser" }, { isPublic: true }],
    })

    if (!book) {
      return res.status(404).json({
        success: false,
        message: "Book not found or access denied",
      })
    }

    res.json({
      success: true,
      message: "Chat history feature coming soon",
      bookInfo: {
        id: book._id,
        title: book.title,
        author: book.author,
      },
      history: [],
      metadata: {
        totalChats: 0,
        lastChatAt: null,
        timestamp: new Date().toISOString(),
      },
      note: "Chat history will be implemented in a future update",
    })
  } catch (error) {
    console.error("❌ Error getting chat history:", error)
    res.status(500).json({
      success: false,
      message: "Failed to get chat history",
      error: {
        message: error.message,
        stack: process.env.NODE_ENV === "development" ? error.stack : undefined,
      },
      timestamp: new Date().toISOString(),
    })
  }
})

// Get book-level chat status
router.get("/book-status/:bookId", authenticateMobileUser, async (req, res) => {
  try {
    const { bookId } = req.params
    const userId = req.user.id
    const clientId = req.clientId || req.user.clientId

    console.log(`📱 Getting book chat status: ${bookId}`)

    // Find the book
    const book = await Book.findOne({
      _id: bookId,
      $or: [{ user: userId, userType: "MobileUser" }, { clientId: clientId }, { isPublic: true }],
    })

    if (!book) {
      return res.status(404).json({
        success: false,
        message: "Book not found or access denied",
      })
    }

    // Get all PDF items in this book
    const pdfItems = await DataStore.find({
      book: bookId,
      $or: [{ fileType: "application/pdf" }, { itemType: "pdf" }],
    }).select("_id name fileType itemType isEmbedded embeddingCount embeddedAt")

    // Check book-level embedding status
    const bookEmbeddingStatus = await processor.getBookKnowledgeBaseStatus(bookId, userId)

    // Get individual PDF statuses
    const pdfStatuses = []
    for (const item of pdfItems) {
      const itemStatus = await processor.checkExistingEmbeddings(item.name, userId, bookId)

      pdfStatuses.push({
        id: item._id,
        name: item.name,
        fileType: item.fileType,
        itemType: item.itemType,
        hasEmbeddings: itemStatus.exists,
        embeddingCount: itemStatus.count,
        isEmbedded: item.isEmbedded,
        embeddedAt: item.embeddedAt,
        chatAvailable: itemStatus.exists,
      })
    }

    const embeddedCount = pdfStatuses.filter((p) => p.hasEmbeddings).length
    const totalCount = pdfStatuses.length

    res.json({
      success: true,
      bookInfo: {
        id: book._id,
        title: book.title,
        author: book.author,
        mainCategory: book.mainCategory,
        subCategory: book.subCategory,
      },
      chatStatus: {
        bookChatAvailable: bookEmbeddingStatus.hasContent,
        totalPDFs: totalCount,
        embeddedPDFs: embeddedCount,
        pendingPDFs: totalCount - embeddedCount,
        completionPercentage: totalCount > 0 ? Math.round((embeddedCount / totalCount) * 100) : 0,
      },
      bookEmbeddingStatus: {
        hasContent: bookEmbeddingStatus.hasContent,
        totalEmbeddings: bookEmbeddingStatus.totalEmbeddings,
        availableFiles: bookEmbeddingStatus.availableFiles || [],
        availableClusters: bookEmbeddingStatus.availableClusters || [],
        collectionName: bookEmbeddingStatus.collectionName,
      },
      pdfItems: {
        total: totalCount,
        embedded: embeddedCount,
        statuses: pdfStatuses,
      },
      recommendations:
        totalCount === 0
          ? ["Upload PDF documents to this book to enable chat functionality"]
          : embeddedCount === 0
            ? ["Create embeddings for your PDFs to start chatting"]
            : embeddedCount < totalCount
              ? ["Complete embedding creation for all PDFs for full chat capability"]
              : ["All PDFs are ready for chat! Start asking questions."],
      timestamp: new Date().toISOString(),
    })
  } catch (error) {
    console.error("❌ Error getting book chat status:", error)
    res.status(500).json({
      success: false,
      message: "Failed to get book chat status",
      error: {
        message: error.message,
        stack: process.env.NODE_ENV === "development" ? error.stack : undefined,
      },
      timestamp: new Date().toISOString(),
    })
  }
})

// Check if chat is available for any documents in a book
router.get("/book-chat-availability/:bookId", authenticateMobileUser, async (req, res) => {
  try {
    const { bookId } = req.params
    const userId = req.user.id
    const clientId = req.clientId || req.user.clientId

    console.log(`📱 Checking book chat availability`)
    console.log(`📚 Book: ${bookId}`)
    console.log(`👤 User: ${userId}, 🏢 Client: ${clientId}`)

    // Validate required parameters
    if (!bookId) {
      return res.status(400).json({
        success: false,
        message: "Book ID is required",
        chatAvailable: false,
      })
    }

    // Find the book and verify access
    const book = await Book.findOne({
      _id: bookId,
      $or: [{ user: userId, userType: "MobileUser" }, { clientId: clientId }, { isPublic: true }],
    })

    if (!book) {
      return res.status(404).json({
        success: false,
        message: "Book not found or access denied",
        chatAvailable: false,
        debug: {
          bookId,
          userId,
          clientId,
        },
      })
    }

    // Get all PDF items in this book
    const pdfItems = await DataStore.find({
      book: bookId,
      $or: [{ fileType: "application/pdf" }, { itemType: "pdf" }],
    }).select("_id name fileType itemType isEmbedded embeddingCount embeddedAt url")

    console.log(`📄 Found ${pdfItems.length} PDF items in book`)

    // Check if any PDFs have embeddings
    let hasEmbeddedDocuments = false
    let totalEmbeddings = 0
    const embeddedPDFs = []
    const nonEmbeddedPDFs = []

    // Check each PDF for embeddings
    for (const item of pdfItems) {
      // First check the database flag
      if (item.isEmbedded && item.embeddingCount > 0) {
        hasEmbeddedDocuments = true
        totalEmbeddings += item.embeddingCount
        embeddedPDFs.push({
          id: item._id,
          name: item.name,
          embeddingCount: item.embeddingCount,
          embeddedAt: item.embeddedAt,
        })
      } else {
        // Double-check with vector database
        try {
          const embeddingStatus = await processor.checkExistingEmbeddings(item.name, userId, bookId)
          if (embeddingStatus.exists && embeddingStatus.count > 0) {
            hasEmbeddedDocuments = true
            totalEmbeddings += embeddingStatus.count
            embeddedPDFs.push({
              id: item._id,
              name: item.name,
              embeddingCount: embeddingStatus.count,
              embeddedAt: item.embeddedAt,
            })

            // Update the database record if it's out of sync
            await DataStore.findByIdAndUpdate(item._id, {
              isEmbedded: true,
              embeddingCount: embeddingStatus.count,
              embeddedAt: item.embeddedAt || new Date(),
            })
          } else {
            nonEmbeddedPDFs.push({
              id: item._id,
              name: item.name,
              url: item.url,
            })
          }
        } catch (error) {
          console.log(`⚠️ Could not check embeddings for ${item.name}:`, error.message)
          nonEmbeddedPDFs.push({
            id: item._id,
            name: item.name,
            url: item.url,
          })
        }
      }
    }

    // Prepare response
    const response = {
      success: true,
      chatAvailable: hasEmbeddedDocuments,
      bookInfo: {
        id: book._id,
        title: book.title,
        author: book.author,
        mainCategory: book.mainCategory,
        subCategory: book.subCategory,
      },
      chatStatus: {
        hasEmbeddedDocuments: hasEmbeddedDocuments,
        totalPDFs: pdfItems.length,
        embeddedPDFs: embeddedPDFs.length,
        nonEmbeddedPDFs: nonEmbeddedPDFs.length,
        totalEmbeddings: totalEmbeddings,
      },
      embeddedDocuments: embeddedPDFs,
      nonEmbeddedDocuments: nonEmbeddedPDFs,
      timestamp: new Date().toISOString(),
    }

    // Add appropriate message and next steps
    if (pdfItems.length === 0) {
      response.message = "No PDF documents found in this book"
      response.suggestion = "Upload PDF documents to this book to enable chat functionality"
      response.nextStep = {
        action: "upload_documents",
        description: "Add PDF documents to this book first",
      }
    } else if (!hasEmbeddedDocuments) {
      response.message = "Chat not available - No documents are processed yet"
      response.suggestion = "Process the PDF documents in this book to enable chat functionality"
      response.nextStep = {
        action: "create_embeddings",
        description: "Process documents to enable chat",
        availableDocuments: nonEmbeddedPDFs.map((pdf) => ({
          id: pdf.id,
          name: pdf.name,
          endpoint: `/api/mobile/pdf-embedding/create/${bookId}/${pdf.id}`,
        })),
      }
    } else {
      response.message = "Chat is available for this book"
      response.suggestion = "You can now ask questions about the processed documents in this book"
      response.nextStep = {
        action: "start_chat",
        description: "Start asking questions about the book content",
        chatEndpoint: `/api/mobile/pdf-chat/suggestions/${bookId}`,
      }

      // If some documents are not embedded, mention it
      if (nonEmbeddedPDFs.length > 0) {
        response.partialAvailability = {
          message: `Chat is available for ${embeddedPDFs.length} out of ${pdfItems.length} documents`,
          suggestion: "Process remaining documents for complete book coverage",
          remainingDocuments: nonEmbeddedPDFs.length,
        }
      }
    }

    console.log(`✅ Book chat availability check completed: ${hasEmbeddedDocuments ? "Available" : "Not Available"}`)
    console.log(
      `📊 Stats: ${embeddedPDFs.length}/${pdfItems.length} PDFs embedded, ${totalEmbeddings} total embeddings`,
    )

    res.json(response)
  } catch (error) {
    console.error("❌ Error checking book chat availability:", error)
    res.status(500).json({
      success: false,
      message: "Failed to check book chat availability",
      chatAvailable: false,
      error: {
        message: error.message,
        stack: process.env.NODE_ENV === "development" ? error.stack : undefined,
      },
      timestamp: new Date().toISOString(),
    })
  }
})

module.exports = router

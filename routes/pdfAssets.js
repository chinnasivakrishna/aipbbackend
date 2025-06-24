const express = require("express")
const router = express.Router()
const multer = require("multer")
const cloudinary = require("cloudinary").v2
const PDF = require("../models/PDF")
const { verifyToken } = require("../middleware/auth")

// Configure Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
})

// Configure multer for file upload
const storage = multer.memoryStorage()
const upload = multer({
  storage: storage,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
  },
  fileFilter: (req, file, cb) => {
    if (file.mimetype === "application/pdf") {
      cb(null, true)
    } else {
      cb(new Error("Only PDF files are allowed"), false)
    }
  },
})

// Helper function to get model name from item type
const getModelName = (itemType) => {
  const modelMap = {
    book: "Book",
    chapter: "Chapter",
    topic: "Topic",
    subtopic: "Subtopic",
  }
  return modelMap[itemType]
}

// Helper function to validate item existence
const validateItemExists = async (itemType, itemId, isWorkbook) => {
  const modelName = getModelName(itemType)
  if (!modelName) {
    throw new Error("Invalid item type")
  }

  const Model = require(`../models/${modelName}`)
  const item = await Model.findById(itemId)

  if (!item) {
    throw new Error(`${itemType} not found`)
  }

  return item
}

// GET /api/pdf-assets/:itemType/:itemId/pdfs - Get all PDFs for an item (NO AUTH REQUIRED)
router.get("/:itemType/:itemId/pdfs", async (req, res) => {
  try {
    const { itemType, itemId } = req.params
    const { isWorkbook } = req.query

    // Validate item type
    if (!["book", "chapter", "topic", "subtopic"].includes(itemType)) {
      return res.status(400).json({
        success: false,
        message: "Invalid item type",
      })
    }

    // Validate item exists
    await validateItemExists(itemType, itemId, isWorkbook === "true")

    // Fetch PDFs
    const pdfs = await PDF.find({
      itemType,
      itemId,
      isWorkbook: isWorkbook === "true",
    }).sort({ createdAt: -1 })

    res.json({
      success: true,
      pdfs,
    })
  } catch (error) {
    console.error("Error fetching PDFs:", error)
    res.status(500).json({
      success: false,
      message: error.message || "Error fetching PDFs",
    })
  }
})

// POST /api/pdf-assets/:itemType/:itemId/pdfs - Upload a new PDF (AUTH REQUIRED)
router.post("/:itemType/:itemId/pdfs", verifyToken, upload.single("file"), async (req, res) => {
  try {
    const { itemType, itemId } = req.params
    const { isWorkbook } = req.query
    const { title, description } = req.body

    // Validate required fields
    if (!title || !req.file) {
      return res.status(400).json({
        success: false,
        message: "Title and PDF file are required",
      })
    }

    // Validate item type
    if (!["book", "chapter", "topic", "subtopic"].includes(itemType)) {
      return res.status(400).json({
        success: false,
        message: "Invalid item type",
      })
    }

    // Validate item exists
    await validateItemExists(itemType, itemId, isWorkbook === "true")

    // Upload to Cloudinary
    const uploadResult = await new Promise((resolve, reject) => {
      cloudinary.uploader
        .upload_stream(
          {
            resource_type: "raw",
            folder: `pdfs/${itemType}/${itemId}`,
            public_id: `${Date.now()}_${req.file.originalname.replace(/\.[^/.]+$/, "")}`,
          },
          (error, result) => {
            if (error) reject(error)
            else resolve(result)
          },
        )
        .end(req.file.buffer)
    })

    // Create new PDF record
    const newPDF = new PDF({
      title: title.trim(),
      description: description?.trim() || "",
      url: uploadResult.secure_url,
      publicId: uploadResult.public_id,
      fileName: req.file.originalname,
      fileSize: req.file.size,
      itemType,
      itemId,
      itemModel: getModelName(itemType),
      isWorkbook: isWorkbook === "true",
      createdBy: req.user.id,
    })

    await newPDF.save()

    res.status(201).json({
      success: true,
      message: "PDF uploaded successfully",
      pdf: newPDF,
    })
  } catch (error) {
    console.error("Error uploading PDF:", error)
    res.status(500).json({
      success: false,
      message: error.message || "Error uploading PDF",
    })
  }
})

// DELETE /api/pdf-assets/pdfs/:pdfId - Delete a PDF (AUTH REQUIRED)
router.delete("/pdfs/:pdfId", verifyToken, async (req, res) => {
  try {
    const { pdfId } = req.params

    // Find the PDF
    const pdf = await PDF.findById(pdfId)
    if (!pdf) {
      return res.status(404).json({
        success: false,
        message: "PDF not found",
      })
    }

    // Check if user owns this PDF or is admin
    if (pdf.createdBy.toString() !== req.user.id && req.user.role !== "admin") {
      return res.status(403).json({
        success: false,
        message: "Not authorized to delete this PDF",
      })
    }

    // Delete from Cloudinary
    try {
      await cloudinary.uploader.destroy(pdf.publicId, { resource_type: "raw" })
    } catch (cloudinaryError) {
      console.error("Error deleting from Cloudinary:", cloudinaryError)
      // Continue with database deletion even if Cloudinary deletion fails
    }

    // Delete from database
    await PDF.findByIdAndDelete(pdfId)

    res.json({
      success: true,
      message: "PDF deleted successfully",
    })
  } catch (error) {
    console.error("Error deleting PDF:", error)
    res.status(500).json({
      success: false,
      message: error.message || "Error deleting PDF",
    })
  }
})

// PUT /api/pdf-assets/pdfs/:pdfId - Update PDF metadata (AUTH REQUIRED)
router.put("/pdfs/:pdfId", verifyToken, async (req, res) => {
  try {
    const { pdfId } = req.params
    const { title, description } = req.body

    // Find the PDF
    const pdf = await PDF.findById(pdfId)
    if (!pdf) {
      return res.status(404).json({
        success: false,
        message: "PDF not found",
      })
    }

    // Check if user owns this PDF or is admin
    if (pdf.createdBy.toString() !== req.user.id && req.user.role !== "admin") {
      return res.status(403).json({
        success: false,
        message: "Not authorized to update this PDF",
      })
    }

    // Update fields
    if (title) pdf.title = title.trim()
    if (description !== undefined) pdf.description = description.trim()

    await pdf.save()

    res.json({
      success: true,
      message: "PDF updated successfully",
      pdf,
    })
  } catch (error) {
    console.error("Error updating PDF:", error)
    res.status(500).json({
      success: false,
      message: error.message || "Error updating PDF",
    })
  }
})

module.exports = router

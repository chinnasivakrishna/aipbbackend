const fetch = require("node-fetch")
const fs = require("fs")
const path = require("path")

// Utility functions for PDF processing

// Download PDF from Cloudinary URL
const downloadPDFFromCloudinary = async (cloudinaryUrl) => {
  try {
    console.log("Downloading PDF from Cloudinary:", cloudinaryUrl)
    const response = await fetch(cloudinaryUrl)

    if (!response.ok) {
      throw new Error(`Failed to download PDF: ${response.status} ${response.statusText}`)
    }

    const contentType = response.headers.get("content-type")
    if (!contentType || !contentType.includes("application/pdf")) {
      console.warn("Warning: Content type is not PDF:", contentType)
    }

    return await response.buffer()
  } catch (error) {
    console.error("Error downloading PDF from Cloudinary:", error)
    throw new Error(`Failed to download PDF: ${error.message}`)
  }
}

// Create temporary file for PDF processing
const createTempFile = (buffer, itemId) => {
  const tempDir = path.join(__dirname, "../temp")

  // Ensure temp directory exists
  if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir, { recursive: true })
  }

  const tempFilePath = path.join(tempDir, `${itemId}_${Date.now()}.pdf`)
  fs.writeFileSync(tempFilePath, buffer)

  return tempFilePath
}

// Clean up temporary file
const cleanupTempFile = (filePath) => {
  try {
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath)
      console.log("Temporary file cleaned up:", filePath)
    }
  } catch (error) {
    console.error("Error cleaning up temporary file:", error)
  }
}

// Validate PDF URL
const isValidPDFUrl = (url) => {
  try {
    const urlObj = new URL(url)
    return urlObj.protocol === "http:" || urlObj.protocol === "https:"
  } catch (error) {
    return false
  }
}

// Get file size in MB
const getFileSizeMB = (buffer) => {
  return (buffer.length / (1024 * 1024)).toFixed(2)
}

// Validate file size (max 50MB)
const validateFileSize = (buffer, maxSizeMB = 50) => {
  const sizeMB = Number.parseFloat(getFileSizeMB(buffer))
  return sizeMB <= maxSizeMB
}

module.exports = {
  downloadPDFFromCloudinary,
  createTempFile,
  cleanupTempFile,
  isValidPDFUrl,
  getFileSizeMB,
  validateFileSize,
}

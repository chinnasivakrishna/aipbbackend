const mongoose = require("mongoose")

const pdfSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: true,
      trim: true,
    },
    description: {
      type: String,
      trim: true,
    },
    url: {
      type: String,
      required: true,
    },
    publicId: {
      type: String,
      required: true, // Cloudinary public ID for deletion
    },
    fileName: {
      type: String,
      required: true,
    },
    fileSize: {
      type: Number,
    },
    // Context information
    itemType: {
      type: String,
      enum: ["book", "chapter", "topic", "subtopic"],
      required: true,
    },
    itemId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      refPath: "itemModel",
    },
    itemModel: {
      type: String,
      required: true,
      enum: ["Book", "Chapter", "Topic", "Subtopic"],
    },
    isWorkbook: {
      type: Boolean,
      default: false,
    },
    // User who uploaded this PDF
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
  },
  {
    timestamps: true,
  },
)

// Index for efficient querying
pdfSchema.index({ itemType: 1, itemId: 1, isWorkbook: 1 })
pdfSchema.index({ title: 1 })

module.exports = mongoose.model("PDF", pdfSchema)

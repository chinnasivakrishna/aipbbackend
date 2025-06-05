const mongoose = require('mongoose');

const summarySchema = new mongoose.Schema({
  content: {
    type: String,
    required: true,
    trim: true
  },
  // Reference to the parent item
  itemType: {
    type: String,
    required: true,
    enum: ['book', 'chapter', 'topic', 'subtopic']
  },
  itemId: {
    type: mongoose.Schema.Types.ObjectId,
    required: true,
    refPath: 'itemType'
  },
  // Additional metadata
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  isWorkbook: {
    type: Boolean,
    default: false
  }
}, {
  timestamps: true
});

// Index for efficient querying
summarySchema.index({ itemType: 1, itemId: 1 });
summarySchema.index({ createdBy: 1 });

module.exports = mongoose.model('Summary', summarySchema);
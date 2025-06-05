const mongoose = require('mongoose');

const pyqSchema = new mongoose.Schema({
  year: {
    type: String,
    required: true,
    trim: true
  },
  question: {
    type: String,
    required: true,
    trim: true
  },
  answer: {
    type: String,
    trim: true
  },
  difficulty: {
    type: String,
    enum: ['easy', 'medium', 'hard'],
    default: 'medium'
  },
  source: {
    type: String,
    trim: true
  },
  // Context information
  itemType: {
    type: String,
    enum: ['book', 'chapter', 'topic', 'subtopic'],
    required: true
  },
  itemId: {
    type: mongoose.Schema.Types.ObjectId,
    required: true,
    refPath: 'itemModel'
  },
  itemModel: {
    type: String,
    required: true,
    enum: ['Book', 'Chapter', 'Topic', 'Subtopic']
  },
  isWorkbook: {
    type: Boolean,
    default: false
  },
  // User who created this PYQ
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  }
}, {
  timestamps: true
});

// Index for efficient querying
pyqSchema.index({ itemType: 1, itemId: 1, isWorkbook: 1 });
pyqSchema.index({ year: 1, source: 1 });
pyqSchema.index({ difficulty: 1 });

module.exports = mongoose.model('PYQ', pyqSchema);
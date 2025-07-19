const mongoose = require('mongoose');

const aiswbSetSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true
  },
  itemType: {
    type: String,
    enum: ['book', 'workbook', 'chapter', 'topic', 'subtopic'],
    required: true
  },
  itemId: {
    type: mongoose.Schema.Types.ObjectId,
    required: true
  },
  isWorkbook: {
    type: Boolean,
    default: false
  },
  questions: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'AiswbQuestion'
  }]
}, {
  timestamps: true
});

module.exports = mongoose.model('AISWBSet', aiswbSetSchema);
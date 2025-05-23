const mongoose = require('mongoose');

const PreviousYearQuestionSchema = new mongoose.Schema({
  year: {
    type: String,
    required: [true, 'Please add the year'],
    trim: true
  },
  question: {
    type: String,
    required: [true, 'Please add the question text']
  },
  answer: {
    type: String
  },
  difficulty: {
    type: String,
    enum: ['easy', 'medium', 'hard'],
    required: true
  },
  source: {
    type: String
  },
  book: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Book'
  },
  workbook: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Workbook'
  },
  chapter: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Chapter'
  },
  topic: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Topic'
  },
  subtopic: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'SubTopic'
  },
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
});

module.exports = mongoose.model('PreviousYearQuestion', PreviousYearQuestionSchema);
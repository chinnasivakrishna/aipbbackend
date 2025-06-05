const mongoose = require('mongoose');

const SubjectiveQuestionSchema = new mongoose.Schema({
  question: {
    type: String,
    required: [true, 'Please add the question text'],
  },
  answer: {
    type: String
  },
  keywords: {
    type: String
  },
  difficulty: {
    type: String,
    enum: ['L1', 'L2', 'L3'],
    required: true
  },
  questionSet: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'QuestionSet',
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

module.exports = mongoose.model('SubjectiveQuestion', SubjectiveQuestionSchema);

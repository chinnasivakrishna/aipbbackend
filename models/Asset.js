const mongoose = require('mongoose');

const AssetSchema = new mongoose.Schema({
  // Common fields for all assets
  type: {
    type: String,
    required: true,
    enum: ['summary', 'subjective_question', 'objective_question', 'video', 'pyq']
  },
  book: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Book',
    required: false
  },
  workbook: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Workbook',
    required: false
  },
  chapter: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Chapter',
    required: false
  },
  topic: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Topic',
    required: false
  },
  subtopic: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'SubTopic',
    required: false
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
  },
  
  // Fields specific to each asset type
  content: { // For summaries
    type: String,
    required: function() { return this.type === 'summary'; }
  },
  
  // For subjective questions
  question: {
    type: String,
    required: function() { 
      return this.type === 'subjective_question' || this.type === 'objective_question'; 
    }
  },
  answer: {
    type: String,
    required: function() { return this.type === 'subjective_question'; }
  },
  keywords: {
    type: String,
    required: function() { return this.type === 'subjective_question'; }
  },
  difficulty: {
    type: String,
    enum: ['L1', 'L2', 'L3'],
    required: function() { 
      return this.type === 'subjective_question' || this.type === 'objective_question'; 
    }
  },
  questionSet: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'QuestionSet'
  },
  
  // For objective questions
  options: {
    type: [String],
    required: function() { return this.type === 'objective_question'; }
  },
  correctAnswer: {
    type: Number,
    required: function() { return this.type === 'objective_question'; }
  },
  
  // For videos
  videoTitle: {
    type: String,
    required: function() { return this.type === 'video'; }
  },
  videoUrl: {
    type: String,
    required: function() { return this.type === 'video'; }
  },
  videoDescription: {
    type: String
  },
  
  // For PYQs (Previous Year Questions)
  year: {
    type: String,
    required: function() { return this.type === 'pyq'; }
  },
  source: {
    type: String,
    required: function() { return this.type === 'pyq'; }
  },
  pyqDifficulty: {
    type: String,
    enum: ['easy', 'medium', 'hard'],
    required: function() { return this.type === 'pyq'; }
  }
});

// Indexes for better query performance
AssetSchema.index({ type: 1 });
AssetSchema.index({ book: 1 });
AssetSchema.index({ workbook: 1 });
AssetSchema.index({ chapter: 1 });
AssetSchema.index({ topic: 1 });
AssetSchema.index({ subtopic: 1 });
AssetSchema.index({ user: 1 });

module.exports = mongoose.model('Asset', AssetSchema);
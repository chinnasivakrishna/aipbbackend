const mongoose = require('mongoose');

const questionSchema = new mongoose.Schema({
  question: {
    type: String,
    required: true,
    trim: true
  },
  answer: {
    type: String,
    default: '',
    trim: true
  },
  keywords: {
    type: String,
    default: '',
    trim: true
  },
  difficulty: {
    type: String,
    required: true,
    enum: ['L1', 'L2', 'L3'], // L1: Beginner, L2: Intermediate, L3: Advanced
    default: 'L1'
  },
  type: {
    type: String,
    required: true,
    enum: ['subjective', 'objective'],
    default: 'subjective'
  },
  // For objective questions
  options: [{
    type: String,
    trim: true
  }],
  correctAnswer: {
    type: Number, // Index of correct option for objective questions
    min: 0
  },
  // Reference to the question set
  questionSet: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'QuestionSet',
    required: true
  },
  // Metadata
  createdBy: {
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
  // Additional fields
  explanation: {
    type: String,
    default: '',
    trim: true
  },
  tags: [{
    type: String,
    trim: true
  }],
  isActive: {
    type: Boolean,
    default: true
  },
  // Statistics
  timesAnswered: {
    type: Number,
    default: 0
  },
  correctAnswers: {
    type: Number,
    default: 0
  },
  // For subjective questions - estimated time to answer
  estimatedTime: {
    type: Number, // in minutes
    default: 5
  },
  // Points/marks for the question
  points: {
    type: Number,
    default: 1
  }
});

// Index for efficient queries
questionSchema.index({ questionSet: 1, type: 1 });
questionSchema.index({ difficulty: 1, type: 1 });
questionSchema.index({ createdBy: 1 });
questionSchema.index({ isActive: 1 });
questionSchema.index({ createdAt: -1 });

// Text index for search functionality
questionSchema.index({ 
  question: 'text', 
  answer: 'text', 
  keywords: 'text',
  explanation: 'text'
});

// Pre-save middleware
questionSchema.pre('save', function(next) {
  this.updatedAt = new Date();
  
  // Validate objective question specifics
  if (this.type === 'objective') {
    if (!this.options || this.options.length < 2) {
      return next(new Error('Objective questions must have at least 2 options'));
    }
    if (this.correctAnswer === undefined || this.correctAnswer >= this.options.length) {
      return next(new Error('Correct answer index is invalid'));
    }
  }
  
  next();
});

// Virtual for getting the difficulty display name
questionSchema.virtual('difficultyDisplay').get(function() {
  switch(this.difficulty) {
    case 'L1':
      return 'Beginner';
    case 'L2':
      return 'Intermediate';
    case 'L3':
      return 'Advanced';
    default:
      return this.difficulty;
  }
});

// Virtual for getting keywords as array
questionSchema.virtual('keywordsArray').get(function() {
  if (!this.keywords) return [];
  return this.keywords.split(',').map(keyword => keyword.trim()).filter(Boolean);
});

// Virtual for success rate (for statistics)
questionSchema.virtual('successRate').get(function() {
  if (this.timesAnswered === 0) return 0;
  return ((this.correctAnswers / this.timesAnswered) * 100).toFixed(2);
});

// Method to increment answer statistics
questionSchema.methods.recordAnswer = function(isCorrect) {
  this.timesAnswered += 1;
  if (isCorrect) {
    this.correctAnswers += 1;
  }
  return this.save();
};

// Static method to find questions by difficulty
questionSchema.statics.findByDifficulty = function(difficulty, options = {}) {
  return this.find({ difficulty, isActive: true, ...options })
    .populate('questionSet', 'name level')
    .sort({ createdAt: -1 });
};

// Static method to search questions
questionSchema.statics.searchQuestions = function(searchTerm, options = {}) {
  return this.find({
    $text: { $search: searchTerm },
    isActive: true,
    ...options
  }, { score: { $meta: 'textScore' } })
    .populate('questionSet', 'name level')
    .sort({ score: { $meta: 'textScore' } });
};

// Static method to find random questions
questionSchema.statics.findRandomQuestions = function(count, options = {}) {
  return this.aggregate([
    { $match: { isActive: true, ...options } },
    { $sample: { size: count } },
    { $lookup: {
        from: 'questionsets',
        localField: 'questionSet',
        foreignField: '_id',
        as: 'questionSet'
      }
    }
  ]);
};

module.exports = mongoose.model('Question', questionSchema);
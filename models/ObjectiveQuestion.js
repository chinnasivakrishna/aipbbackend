const mongoose = require('mongoose');

const objectiveQuestionSchema = new mongoose.Schema({
  question: {
    type: String,
    required: true,
    trim: true
  },
  options: [{
    type: String,
    required: true,
    trim: true
  }],
  correctAnswer: {
    type: Number,
    required: true,
    min: 0
  },
  difficulty: {
    type: String,
    required: true,
    enum: ['L1', 'L2', 'L3'],
    default: 'L1'
  },
  // Reference to the question set this question belongs to
  questionSet: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'QuestionSet',
    required: true
  },
  // Reference to the parent item (book, chapter, topic, or subtopic)
  book: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Book'
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
    ref: 'Subtopic'
  },
  // For workbook support
  isWorkbook: {
    type: Boolean,
    default: false
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
  // Additional metadata
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
  timesCorrect: {
    type: Number,
    default: 0
  }
});

// Index for efficient queries
objectiveQuestionSchema.index({ questionSet: 1 });
objectiveQuestionSchema.index({ book: 1, difficulty: 1 });
objectiveQuestionSchema.index({ chapter: 1, difficulty: 1 });
objectiveQuestionSchema.index({ topic: 1, difficulty: 1 });
objectiveQuestionSchema.index({ subtopic: 1, difficulty: 1 });
objectiveQuestionSchema.index({ createdBy: 1 });
objectiveQuestionSchema.index({ isWorkbook: 1 });

// Pre-save middleware to update timestamps
objectiveQuestionSchema.pre('save', function(next) {
  this.updatedAt = new Date();
  next();
});

// Virtual for getting the difficulty display name
objectiveQuestionSchema.virtual('difficultyDisplay').get(function() {
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

// Virtual for getting accuracy percentage
objectiveQuestionSchema.virtual('accuracyPercentage').get(function() {
  if (this.timesAnswered === 0) return 0;
  return Math.round((this.timesCorrect / this.timesAnswered) * 100);
});

// Virtual for getting the parent item type
objectiveQuestionSchema.virtual('parentType').get(function() {
  if (this.subtopic) return 'subtopic';
  if (this.topic) return 'topic';
  if (this.chapter) return 'chapter';
  if (this.book) return 'book';
  return null;
});

// Virtual for getting the parent item ID
objectiveQuestionSchema.virtual('parentId').get(function() {
  if (this.subtopic) return this.subtopic;
  if (this.topic) return this.topic;
  if (this.chapter) return this.chapter;
  if (this.book) return this.book;
  return null;
});

// Method to record an answer attempt
objectiveQuestionSchema.methods.recordAnswer = function(isCorrect) {
  this.timesAnswered += 1;
  if (isCorrect) {
    this.timesCorrect += 1;
  }
  return this.save();
};

// Static method to find questions by parent item
objectiveQuestionSchema.statics.findByParent = function(itemType, itemId, options = {}) {
  const query = {
    [itemType]: itemId,
    isActive: true,
    ...options
  };
  return this.find(query).populate('questionSet').sort({ createdAt: -1 });
};

// Static method to find questions by difficulty
objectiveQuestionSchema.statics.findByDifficulty = function(difficulty, options = {}) {
  return this.find({ difficulty, isActive: true, ...options })
    .populate('questionSet')
    .sort({ createdAt: -1 });
};

// Static method to find questions by question set
objectiveQuestionSchema.statics.findByQuestionSet = function(questionSetId, options = {}) {
  return this.find({ questionSet: questionSetId, isActive: true, ...options })
    .sort({ createdAt: -1 });
};

module.exports = mongoose.model('ObjectiveQuestion', objectiveQuestionSchema);
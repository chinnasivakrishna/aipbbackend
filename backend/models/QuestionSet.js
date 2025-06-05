const mongoose = require('mongoose');

const questionSetSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true
  },
  description: {
    type: String,
    default: '',
    trim: true
  },
  level: {
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
  // Array of question references
  questions: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Question'
  }],
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
  totalQuestions: {
    type: Number,
    default: 0
  },
  averageDifficulty: {
    type: String,
    enum: ['L1', 'L2', 'L3']
  }
});

// Index for efficient queries
questionSetSchema.index({ book: 1, type: 1, level: 1 });
questionSetSchema.index({ chapter: 1, type: 1, level: 1 });
questionSetSchema.index({ topic: 1, type: 1, level: 1 });
questionSetSchema.index({ subtopic: 1, type: 1, level: 1 });
questionSetSchema.index({ createdBy: 1 });
questionSetSchema.index({ isWorkbook: 1 });

// Pre-save middleware to update totalQuestions
questionSetSchema.pre('save', function(next) {
  if (this.questions) {
    this.totalQuestions = this.questions.length;
  }
  this.updatedAt = new Date();
  next();
});

// Virtual for getting the level display name
questionSetSchema.virtual('levelDisplay').get(function() {
  switch(this.level) {
    case 'L1':
      return 'Beginner';
    case 'L2':
      return 'Intermediate';
    case 'L3':
      return 'Advanced';
    default:
      return this.level;
  }
});

// Virtual for getting the parent item type
questionSetSchema.virtual('parentType').get(function() {
  if (this.subtopic) return 'subtopic';
  if (this.topic) return 'topic';
  if (this.chapter) return 'chapter';
  if (this.book) return 'book';
  return null;
});

// Virtual for getting the parent item ID
questionSetSchema.virtual('parentId').get(function() {
  if (this.subtopic) return this.subtopic;
  if (this.topic) return this.topic;
  if (this.chapter) return this.chapter;
  if (this.book) return this.book;
  return null;
});

// Method to add a question to the set
questionSetSchema.methods.addQuestion = function(questionId) {
  if (!this.questions.includes(questionId)) {
    this.questions.push(questionId);
    this.totalQuestions = this.questions.length;
  }
  return this.save();
};

// Method to remove a question from the set
questionSetSchema.methods.removeQuestion = function(questionId) {
  this.questions = this.questions.filter(id => !id.equals(questionId));
  this.totalQuestions = this.questions.length;
  return this.save();
};

// Static method to find sets by parent item
questionSetSchema.statics.findByParent = function(itemType, itemId, options = {}) {
  const query = {
    [itemType]: itemId,
    isActive: true,
    ...options
  };
  return this.find(query).populate('questions').sort({ createdAt: -1 });
};

// Static method to find sets by level
questionSetSchema.statics.findByLevel = function(level, options = {}) {
  return this.find({ level, isActive: true, ...options })
    .populate('questions')
    .sort({ createdAt: -1 });
};

module.exports = mongoose.model('QuestionSet', questionSetSchema);
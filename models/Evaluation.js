// models/Evaluation.js
const mongoose = require('mongoose');

const evaluationSchema = new mongoose.Schema({
  submissionId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'UserAnswer',
    required: true
  },
  questionId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'AiswbQuestion',
    required: true
  },
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'MobileUser',
    required: true
  },
  clientId: {
    type: String,
    required: true
  },
  evaluationMode: {
    type: String,
    enum: ['auto', 'manual'],
    default: 'auto'
  },
  marks: {
    type: Number,
    min: 0,
    max: 100,
    default: 0
  },
  accuracy: {
    type: Number,
    min: 0,
    max: 100,
    default: 0
  },
  feedback: {
    type: String,
    trim: true,
    default: ''
  },
  extractedTexts: [{
    type: String,
    trim: true
  }],
  geminiAnalysis: {
    accuracy: {
      type: Number,
      min: 0,
      max: 100,
      required: true,
      default: 0
    },
    strengths: [{
      type: String,
      trim: true
    }],
    weaknesses: [{
      type: String,
      trim: true
    }],
    suggestions: [{
      type: String,
      trim: true
    }]
  },
  status: {
    type: String,
    enum: ['published', 'not_published', 'processing', 'review', 'rejected'],
    default: 'not_published'
  },
  evaluatedAt: {
    type: Date,
    default: Date.now
  },
  evaluatedBy: {
    type: String,
    default: 'system'
  },
  publishHistory: [{
    status: {
      type: String,
      enum: ['published', 'not_published', 'review', 'rejected']
    },
    timestamp: {
      type: Date,
      default: Date.now
    },
    changedBy: {
      type: String,
      default: 'system'
    },
    mode: {
      type: String,
      enum: ['auto', 'manual'],
      default: 'auto'
    },
    reason: {
      type: String,
      trim: true
    }
  }],
  autoEvaluationDetails: {
    processingTime: {
      type: Number,
      default: 0
    },
    confidenceScore: {
      type: Number,
      min: 0,
      max: 1,
      default: 0
    },
    autoPublishReason: {
      type: String,
      trim: true
    }
  },
  evaluationConfig: {
    minAccuracyThreshold: {
      type: Number,
      min: 0,
      max: 100,
      default: 60
    },
    autoPublishThreshold: {
      type: Number,
      min: 0,
      max: 100,
      default: 80
    },
    reviewThreshold: {
      type: Number,
      min: 0,
      max: 100,
      default: 50
    }
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

// Indexes for better query performance
evaluationSchema.index({ userId: 1 });
evaluationSchema.index({ questionId: 1 });
evaluationSchema.index({ submissionId: 1 }, { unique: true });
evaluationSchema.index({ status: 1 });
evaluationSchema.index({ evaluatedAt: -1 });
evaluationSchema.index({ userId: 1, questionId: 1 });
evaluationSchema.index({ clientId: 1 });
evaluationSchema.index({ evaluationMode: 1 });

// Update timestamp on save
evaluationSchema.pre('save', function(next) {
  this.updatedAt = Date.now();
  
  // Sync accuracy with geminiAnalysis if available
  if (this.geminiAnalysis && this.geminiAnalysis.accuracy) {
    this.accuracy = this.geminiAnalysis.accuracy;
  }
  
  // Set marks based on accuracy if not explicitly set
  if (this.marks === 0 && this.accuracy > 0) {
    this.marks = this.accuracy;
  }
  
  next();
});

// Static method to get user evaluations with pagination
evaluationSchema.statics.getUserEvaluations = function(userId, options = {}) {
  const {
    questionId,
    status,
    page = 1,
    limit = 10
  } = options;

  const query = { userId };
  
  if (questionId) {
    query.questionId = questionId;
  }
  
  if (status) {
    query.status = status;
  }

  const skip = (page - 1) * limit;

  return Promise.all([
    this.find(query)
      .populate('questionId', 'question detailedAnswer metadata')
      .populate('submissionId', 'attemptNumber submittedAt')
      .sort({ evaluatedAt: -1 })
      .skip(skip)
      .limit(limit),
    this.countDocuments(query)
  ]).then(([evaluations, total]) => ({
    evaluations,
    pagination: {
      total,
      page: parseInt(page),
      limit: parseInt(limit),
      totalPages: Math.ceil(total / limit)
    }
  }));
};

// Static method to get question evaluations with pagination
evaluationSchema.statics.getQuestionEvaluations = function(questionId, options = {}) {
  const {
    status,
    evaluationMode,
    page = 1,
    limit = 10,
    sortBy = 'evaluatedAt',
    sortOrder = 'desc'
  } = options;

  const query = { questionId };
  
  if (status) {
    query.status = status;
  }
  
  if (evaluationMode) {
    query.evaluationMode = evaluationMode;
  }

  const sort = {};
  sort[sortBy] = sortOrder === 'asc' ? 1 : -1;

  const skip = (page - 1) * limit;

  return Promise.all([
    this.find(query)
      .populate('userId', 'mobile')
      .populate('submissionId', 'attemptNumber submittedAt answerImages')
      .populate('questionId', 'question metadata')
      .sort(sort)
      .skip(skip)
      .limit(limit),
    this.countDocuments(query)
  ]).then(([evaluations, total]) => ({
    evaluations,
    pagination: {
      total,
      page: parseInt(page),
      limit: parseInt(limit),
      totalPages: Math.ceil(total / limit)
    }
  }));
};

// Method to start auto evaluation
evaluationSchema.methods.startAutoEvaluation = function(config = {}) {
  this.evaluationMode = 'auto';
  this.status = 'processing';
  
  // Simulate processing time
  const processingTime = Math.random() * 3 + 1; // 1-4 seconds
  const confidenceScore = Math.random() * 0.3 + 0.7; // 0.7-1.0
  
  this.autoEvaluationDetails = {
    processingTime,
    confidenceScore,
    autoPublishReason: config.autoPublish ? 'Auto-publish enabled' : 'Manual review required'
  };
  
  // Mock analysis
  const accuracy = Math.floor(Math.random() * 40) + 60; // 60-100
  this.geminiAnalysis = {
    accuracy,
    strengths: ['Clear presentation', 'Good understanding of concepts'],
    weaknesses: ['Could be more detailed', 'Missing some examples'],
    suggestions: ['Add more examples', 'Elaborate on key points']
  };
  
  this.extractedTexts = ['Sample extracted text from answer images'];
  this.marks = accuracy;
  this.accuracy = accuracy;
  
  // Auto-publish logic
  if (config.autoPublish && accuracy >= (config.autoPublishThreshold || 80)) {
    this.status = 'published';
    this.publishHistory.push({
      status: 'published',
      timestamp: new Date(),
      changedBy: 'system',
      mode: 'auto',
      reason: 'Auto-published based on accuracy threshold'
    });
  } else if (accuracy >= (config.reviewThreshold || 50)) {
    this.status = 'not_published';
  } else {
    this.status = 'review';
  }
  
  return this.save();
};

// Method to start manual evaluation
evaluationSchema.methods.startManualEvaluation = function(evaluatorId) {
  this.evaluationMode = 'manual';
  this.status = 'review';
  this.evaluatedBy = evaluatorId || 'manual_evaluator';
  
  return this.save();
};

// Method to publish evaluation
evaluationSchema.methods.publish = function(publishedBy = 'system', reason = '') {
  this.status = 'published';
  
  this.publishHistory.push({
    status: 'published',
    timestamp: new Date(),
    changedBy: publishedBy,
    mode: this.evaluationMode,
    reason
  });
  
  return this.save();
};

// Method to unpublish evaluation
evaluationSchema.methods.unpublish = function(unpublishedBy = 'system', reason = '') {
  this.status = 'not_published';
  
  this.publishHistory.push({
    status: 'not_published',
    timestamp: new Date(),
    changedBy: unpublishedBy,
    mode: this.evaluationMode,
    reason
  });
  
  return this.save();
};

// Virtual for formatted evaluation result
evaluationSchema.virtual('evaluationResult').get(function() {
  return {
    evaluationId: this._id,
    evaluationMode: this.evaluationMode,
    marks: this.marks,
    accuracy: this.accuracy,
    status: this.status,
    evaluatedAt: this.evaluatedAt,
    evaluatedBy: this.evaluatedBy,
    feedback: this.feedback,
    geminiAnalysis: this.geminiAnalysis,
    extractedTexts: this.extractedTexts
  };
});

module.exports = mongoose.model('Evaluation', evaluationSchema);
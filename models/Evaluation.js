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
  extractedTexts: [{
    type: String,
    trim: true
  }],
  geminiAnalysis: {
    accuracy: {
      type: Number,
      min: 0,
      max: 100,
      required: true
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
    enum: ['published', 'not_published'],
    default: 'not_published'
  },
  evaluatedAt: {
    type: Date,
    default: Date.now
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
evaluationSchema.index({ status: 1 });
evaluationSchema.index({ evaluatedAt: -1 });
evaluationSchema.index({ userId: 1, questionId: 1 });
evaluationSchema.index({ clientId: 1 });

// Update timestamp on save
evaluationSchema.pre('save', function(next) {
  this.updatedAt = Date.now();
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

module.exports = mongoose.model('Evaluation', evaluationSchema);
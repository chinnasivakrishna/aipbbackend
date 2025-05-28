const mongoose = require('mongoose');

const userAnswerSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'MobileUser',
    required: true
  },
  questionId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'AiswbQuestion',
    required: true
  },
  setId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'AISWBSet',
    required: false // Optional if question is accessed directly via QR
  },
  clientId: {
    type: String,
    required: true
  },
  answerImages: [{
    imageUrl: {
      type: String,
      required: true
    },
    cloudinaryPublicId: {
      type: String,
      required: true
    },
    originalName: {
      type: String
    },
    uploadedAt: {
      type: Date,
      default: Date.now
    }
  }],
  textAnswer: {
    type: String,
    trim: true
  },
  submissionStatus: {
    type: String,
    enum: ['draft', 'submitted', 'reviewed'],
    default: 'draft'
  },
  submittedAt: {
    type: Date
  },
  reviewedAt: {
    type: Date
  },
  reviewedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  feedback: {
    score: {
      type: Number,
      min: 0,
      max: 100
    },
    comments: {
      type: String,
      trim: true
    },
    suggestions: [{
      type: String,
      trim: true
    }]
  },
  metadata: {
    timeSpent: {
      type: Number, // in seconds
      default: 0
    },
    deviceInfo: {
      type: String
    },
    appVersion: {
      type: String
    },
    sourceType: {
      type: String,
      enum: ['qr_scan', 'direct_access', 'set_practice'],
      default: 'qr_scan'
    }
  }
}, {
  timestamps: true
});

// Compound index for efficient queries
userAnswerSchema.index({ userId: 1, questionId: 1 }, { unique: true });
userAnswerSchema.index({ userId: 1, clientId: 1 });
userAnswerSchema.index({ questionId: 1, clientId: 1 });
userAnswerSchema.index({ submissionStatus: 1 });

// Pre-save middleware
userAnswerSchema.pre('save', function(next) {
  if (this.isModified('submissionStatus') && this.submissionStatus === 'submitted' && !this.submittedAt) {
    this.submittedAt = new Date();
  }
  next();
});

module.exports = mongoose.model('UserAnswer', userAnswerSchema);
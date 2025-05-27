const mongoose = require('mongoose');

const answerSheetSchema = new mongoose.Schema({
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
  userProfile: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'UserProfile',
    required: true
  },
  images: [{
    filename: {
      type: String,
      required: true
    },
    originalName: {
      type: String,
      required: true
    },
    mimetype: {
      type: String,
      required: true
    },
    size: {
      type: Number,
      required: true
    },
    uploadedAt: {
      type: Date,
      default: Date.now
    },
    url: {
      type: String,
      required: true
    }
  }],
  submissionData: {
    language: {
      type: String,
      enum: ['english', 'hindi'],
      required: true
    },
    deviceInfo: {
      userAgent: String,
      platform: String,
      timestamp: {
        type: Date,
        default: Date.now
      }
    },
    location: {
      latitude: Number,
      longitude: Number,
      accuracy: Number
    }
  },
  status: {
    type: String,
    enum: ['submitted', 'reviewed', 'flagged', 'rejected'],
    default: 'submitted'
  },
  adminReview: {
    reviewedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    reviewedAt: Date,
    comments: String,
    rating: {
      type: Number,
      min: 0,
      max: 10
    }
  },
  clientId: {
    type: String,
    required: true
  }
}, {
  timestamps: true
});

// Compound indexes for efficient querying
answerSheetSchema.index({ questionId: 1, userId: 1 });
answerSheetSchema.index({ clientId: 1, status: 1 });
answerSheetSchema.index({ createdAt: -1 });
answerSheetSchema.index({ questionId: 1, status: 1 });

// Virtual populate for question details
answerSheetSchema.virtual('question', {
  ref: 'AiswbQuestion',
  localField: 'questionId',
  foreignField: '_id',
  justOne: true
});

// Virtual populate for user details
answerSheetSchema.virtual('user', {
  ref: 'MobileUser',
  localField: 'userId',
  foreignField: '_id',
  justOne: true
});

answerSheetSchema.virtual('profile', {
  ref: 'UserProfile',
  localField: 'userProfile',
  foreignField: '_id',
  justOne: true
});

module.exports = mongoose.model('AnswerSheet', answerSheetSchema);
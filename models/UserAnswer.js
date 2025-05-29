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
    required: false
  },
  clientId: {
    type: String,
    required: true
  },
  attemptNumber: {
    type: Number,
    required: true,
    min: 1,
    max: 5
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
    default: 'submitted'
  },
  submittedAt: {
    type: Date,
    default: Date.now
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
      type: Number,
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

// Compound index for unique attempts per user per question
userAnswerSchema.index({ userId: 1, questionId: 1, attemptNumber: 1 }, { unique: true });
userAnswerSchema.index({ userId: 1, clientId: 1 });
userAnswerSchema.index({ questionId: 1, clientId: 1 });
userAnswerSchema.index({ submissionStatus: 1 });

// Pre-save middleware to set attempt number
userAnswerSchema.pre('save', async function(next) {
  if (this.isNew) {
    try {
      // Find the highest attempt number for this user and question
      const lastAttempt = await this.constructor.findOne({
        userId: this.userId,
        questionId: this.questionId
      }).sort({ attemptNumber: -1 });

      if (lastAttempt) {
        if (lastAttempt.attemptNumber >= 5) {
          const error = new Error('Maximum submission limit (5) reached for this question');
          error.code = 'SUBMISSION_LIMIT_EXCEEDED';
          return next(error);
        }
        this.attemptNumber = lastAttempt.attemptNumber + 1;
      } else {
        this.attemptNumber = 1;
      }
    } catch (error) {
      return next(error);
    }
  }
  next();
});

// Static method to check if user can submit more answers
userAnswerSchema.statics.canUserSubmit = async function(userId, questionId) {
  const count = await this.countDocuments({
    userId: userId,
    questionId: questionId
  });
  
  return {
    canSubmit: count < 5,
    currentAttempts: count,
    remainingAttempts: Math.max(0, 5 - count)
  };
};

// Static method to get user's attempt history for a question
userAnswerSchema.statics.getUserAttempts = function(userId, questionId) {
  return this.find({
    userId: userId,
    questionId: questionId
  }).sort({ attemptNumber: 1 });
};

// Static method to get user's latest attempt for a question
userAnswerSchema.statics.getUserLatestAttempt = function(userId, questionId) {
  return this.findOne({
    userId: userId,
    questionId: questionId
  }).sort({ attemptNumber: -1 });
};

// Method to check if this is the final attempt
userAnswerSchema.methods.isFinalAttempt = function() {
  return this.attemptNumber === 5;
};

// Export the model
module.exports = mongoose.model('UserAnswer', userAnswerSchema);
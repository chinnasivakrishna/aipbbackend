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
    max: 5,
    default: 1  // Add default value
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
  // Only calculate attemptNumber for new documents
  if (this.isNew) {
    try {
      console.log(`Setting attemptNumber for new document. Current value: ${this.attemptNumber}`);
      
      // Find the highest attempt number for this user and question
      const lastAttempt = await this.constructor.findOne({
        userId: this.userId,
        questionId: this.questionId
      }).sort({ attemptNumber: -1 }).lean();

      let nextAttemptNumber = 1;
      if (lastAttempt && typeof lastAttempt.attemptNumber === 'number') {
        if (lastAttempt.attemptNumber >= 5) {
          const error = new Error('Maximum submission limit (5) reached for this question');
          error.code = 'SUBMISSION_LIMIT_EXCEEDED';
          return next(error);
        }
        nextAttemptNumber = lastAttempt.attemptNumber + 1;
      }
      
      // Set the attempt number
      this.attemptNumber = nextAttemptNumber;
      
      console.log(`Set attemptNumber to ${this.attemptNumber} for user ${this.userId} question ${this.questionId}`);
      
    } catch (error) {
      console.error('Error in pre-save middleware:', error);
      return next(error);
    }
  }
  
  // Additional validation to ensure attemptNumber is valid
  if (!this.attemptNumber || isNaN(this.attemptNumber) || this.attemptNumber < 1 || this.attemptNumber > 5) {
    const error = new Error(`Invalid attemptNumber: ${this.attemptNumber}. Must be a number between 1 and 5.`);
    error.code = 'INVALID_ATTEMPT_NUMBER';
    return next(error);
  }
  
  next();
});

// Pre-validate middleware to ensure attemptNumber is set before validation
userAnswerSchema.pre('validate', async function(next) {
  // Only set for new documents that don't have attemptNumber set
  if (this.isNew && (!this.attemptNumber || isNaN(this.attemptNumber))) {
    try {
      console.log(`Pre-validate: Setting attemptNumber for new document`);
      
      // Find the highest attempt number for this user and question
      const lastAttempt = await this.constructor.findOne({
        userId: this.userId,
        questionId: this.questionId
      }).sort({ attemptNumber: -1 }).lean();

      let nextAttemptNumber = 1;
      if (lastAttempt && typeof lastAttempt.attemptNumber === 'number') {
        if (lastAttempt.attemptNumber >= 5) {
          const error = new Error('Maximum submission limit (5) reached for this question');
          error.code = 'SUBMISSION_LIMIT_EXCEEDED';
          return next(error);
        }
        nextAttemptNumber = lastAttempt.attemptNumber + 1;
      }
      
      // Set the attempt number
      this.attemptNumber = nextAttemptNumber;
      
      console.log(`Pre-validate: Set attemptNumber to ${this.attemptNumber} for user ${this.userId} question ${this.questionId}`);
      
    } catch (error) {
      console.error('Error in pre-validate middleware:', error);
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
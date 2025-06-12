const mongoose = require('mongoose');
const axios = require('axios');

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
    enum: ['submitted', 'rejected', 'evaluated'],
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
    }],
    expertReview: {
      result: {
        type: String,
        required: false
      },
      score: {
        type: Number,
        min: 0,
        max: 100
      },
      remarks: {
        type: String,
        trim: true
      },
      annotatedImages: [{
        s3Key: {
          type: String,
          required: true
        },
        downloadUrl: {
          type: String,
          required: true
        },
        uploadedAt: {
          type: Date,
          default: Date.now
        }
      }],
      reviewedAt: {
        type: Date,
        default: Date.now
      }
    },
    userFeedbackReview: [{
      message: {
        type: String,
        required: true
      },
      submittedAt: {
        type: Date,
        default: Date.now
      }
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
  },
  evaluation: {
    accuracy: {
      type: Number,
      min: 0,
      max: 100,
      default: 0
    },
    extractedText: {
      type: String,
      trim: true
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
    }],
    marks: {
      type: Number,
      min: 0
    },
    feedback: {
      type: String,
      trim: true
    },
    userFeedback: [{
      message: {
        type: String,
        required: true
      },
      submittedAt: {
        type: Date,
        default: Date.now
      }
    }]
  },
  publishStatus: {
    type: String,
    enum: ['published', 'not_published'],
    default: 'not_published'
  },
  reviewStatus: {
    type: String,
    enum: ['review_pending', 'review_accepted', 'review_completed'],
    default: null
  },
  popularityStatus: {
    type: String,
    enum: ['popular', 'not_popular'],
    default: 'not_popular'
  },
  extractedTexts: [{
    type: String,
    trim: true
  }],
  evaluatedAt: {
    type: Date
  }
}, {
  timestamps: true
});

// PERFORMANCE INDEXES ONLY - No unique constraints
userAnswerSchema.index({ userId: 1, questionId: 1, attemptNumber: 1 }); // Non-unique compound index
userAnswerSchema.index({ userId: 1, clientId: 1 }); // Non-unique index
userAnswerSchema.index({ questionId: 1, clientId: 1 }); // Non-unique index
userAnswerSchema.index({ submissionStatus: 1 }); // Non-unique index
userAnswerSchema.index({ userId: 1, questionId: 1 }); // Non-unique index for querying user's attempts
userAnswerSchema.index({ publishStatus: 1 }); // Index for publishStatus queries

// Static method to clean up old indexes
userAnswerSchema.statics.cleanupOldIndexes = async function() {
  try {
    const collection = this.collection;
    const indexes = await collection.indexes();
    
    // Remove any indexes that are not the default _id index
    for (const index of indexes) {
      if (index.name !== '_id_') {
        await collection.dropIndex(index.name);
      }
    }
    
    // Create the required indexes
    await this.createIndexes();
  } catch (error) {
    console.error('Error cleaning up indexes:', error);
  }
};

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

// Static method to get published answers
userAnswerSchema.statics.getPublishedAnswers = function(filter = {}) {
  return this.find({
    publishStatus: 'published',
    ...filter
  }).populate('userId', 'name email').populate('questionId');
};

// Static method to get not published answers
userAnswerSchema.statics.getNotPublishedAnswers = function(filter = {}) {
  return this.find({
    publishStatus: 'not_published',
    ...filter
  }).populate('userId', 'name email').populate('questionId');
};

// Method to check if this is the final attempt
userAnswerSchema.methods.isFinalAttempt = function() {
  return this.attemptNumber === 5;
};

// Method to check if answer is published
userAnswerSchema.methods.isPublished = function() {
  return this.publishStatus === 'published';
};

// Method to publish answer
userAnswerSchema.methods.publish = function() {
  this.publishStatus = 'published';
  return this.save();
};

// Method to unpublish answer
userAnswerSchema.methods.unpublish = function() {
  this.publishStatus = 'not_published';
  return this.save();
};

// Enhanced create new attempt method with better error handling
userAnswerSchema.statics.createNewAttempt = async function(answerData) {
  const { userId, questionId } = answerData;
  
  console.log(`Creating new attempt for user ${userId} and question ${questionId}`);
  
  // Use a transaction to ensure data consistency
  const session = await mongoose.startSession();
  
  try {
    return await session.withTransaction(async () => {
      // Check if user has reached maximum attempts
      const existingCount = await this.countDocuments({ userId, questionId }).session(session);
      if (existingCount >= 5) {
        const error = new Error('Maximum submission limit (5) reached for this question');
        error.code = 'SUBMISSION_LIMIT_EXCEEDED';
        throw error;
      }
      
      // Find the highest existing attempt number for this user and question
      const latestAttempt = await this.findOne(
        { userId, questionId },
        { attemptNumber: 1 }
      ).sort({ attemptNumber: -1 }).session(session);
      
      // Calculate the next attempt number
      const nextAttemptNumber = latestAttempt ? latestAttempt.attemptNumber + 1 : 1;
      
      console.log(`Latest attempt number: ${latestAttempt ? latestAttempt.attemptNumber : 'none'}`);
      console.log(`Next attempt number will be: ${nextAttemptNumber}`);
      
      // Validate the next attempt number
      if (nextAttemptNumber > 5) {
        const error = new Error('Maximum submission limit (5) reached for this question');
        error.code = 'SUBMISSION_LIMIT_EXCEEDED';
        throw error;
      }
      
      // Create the new attempt with the calculated attempt number
      const attemptData = {
        ...answerData,
        attemptNumber: nextAttemptNumber
      };
      
      const userAnswer = new this(attemptData);
      await userAnswer.save({ session });
      
      console.log(`Successfully created attempt ${nextAttemptNumber} for user ${userId} and question ${questionId}`);
      return userAnswer;
    });
  } finally {
    await session.endSession();
  }
};

// Safer alternative method that handles race conditions better
userAnswerSchema.statics.createNewAttemptSafe = async function(answerData) {
  const { userId, questionId } = answerData;
  
  console.log(`Creating new attempt (safe) for user ${userId} and question ${questionId}`);
  
  const maxRetries = 3;
  let attempt = 0;
  
  while (attempt < maxRetries) {
    try {
      // Check current attempt count
      const existingCount = await this.countDocuments({ userId, questionId });
      if (existingCount >= 5) {
        const error = new Error('Maximum submission limit (5) reached for this question');
        error.code = 'SUBMISSION_LIMIT_EXCEEDED';
        throw error;
      }
      
      // Get all existing attempts to find the correct next number
      const existingAttempts = await this.find(
        { userId, questionId },
        { attemptNumber: 1 }
      ).sort({ attemptNumber: 1 });
      
      // Find the next available attempt number
      let nextAttemptNumber = 1;
      const existingNumbers = existingAttempts.map(a => a.attemptNumber).sort((a, b) => a - b);
      
      for (let i = 1; i <= 5; i++) {
        if (!existingNumbers.includes(i)) {
          nextAttemptNumber = i;
          break;
        }
      }
      
      if (nextAttemptNumber > 5) {
        const error = new Error('Maximum submission limit (5) reached for this question');
        error.code = 'SUBMISSION_LIMIT_EXCEEDED';
        throw error;
      }
      
      console.log(`Attempting to create attempt number: ${nextAttemptNumber}`);
      
      // Create the new attempt
      const attemptData = {
        ...answerData,
        attemptNumber: nextAttemptNumber
      };
      
      const userAnswer = new this(attemptData);
      await userAnswer.save();
      
      console.log(`Successfully created attempt ${nextAttemptNumber} for user ${userId} and question ${questionId}`);
      return userAnswer;
      
    } catch (error) {
      attempt++;
      
      if (error.code === 'SUBMISSION_LIMIT_EXCEEDED') {
        throw error;
      }
      
      // If it's a duplicate key error and we haven't exceeded retries, try again
      if ((error.code === 11000 || error.message.includes('E11000')) && attempt < maxRetries) {
        console.log(`Duplicate key error on attempt ${attempt}, retrying...`);
        // Wait a bit before retrying
        await new Promise(resolve => setTimeout(resolve, 100 * attempt));
        continue;
      }
      
      // If it's the last attempt or a different error, throw it
      throw error;
    }
  }
  
  // If we get here, all retries failed
  const error = new Error('Failed to create answer after multiple attempts');
  error.code = 'CREATION_FAILED';
  throw error;
};

// Static method to check if user has a review request
userAnswerSchema.statics.hasReviewRequest = async function(userId, clientId) {
  try {
    const response = await axios.get(`${process.env.API_BASE_URL}/api/clients/${clientId}/mobile/review/request`, {
      headers: {
        'Authorization': `Bearer ${process.env.API_TOKEN}`
      }
    });
    return response.data?.hasReviewRequest || false;
  } catch (error) {
    console.error('Error checking review request:', error);
    return false;
  }
};

// Export the model
const UserAnswer = mongoose.model('UserAnswer', userAnswerSchema);

// Clean up old indexes when the model is loaded
UserAnswer.cleanupOldIndexes().catch(console.error);

module.exports = UserAnswer;

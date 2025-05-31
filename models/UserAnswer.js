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
    }
  },
  // Main status for overall answer processing
  status: {
    type: String,
    enum: ['pending', 'rejected', 'published', 'not_published'],
    default: 'pending'
  },
  // Review status for manual review process
  reviewStatus: {
    type: String,
    enum: ['review_pending', 'review_accepted', 'review_completed'],
    default: 'review_pending'
  },
  // Popularity status
  popularityStatus: {
    type: String,
    enum: ['popular', 'not_popular'],
    default: 'not_popular'
  },
  // Evaluation status to track evaluation completion
  evaluationStatus: {
    type: String,
    enum: ['evaluated','not_evaluated', 'auto_evaluated', 'manual_evaluated', 'evaluation_failed'],
    default: 'not_evaluated'
  },
  // Evaluation mode
  evaluationMode: {
    type: String,
    enum: ['auto', 'manual'],
    default: 'auto'
  },
  extractedTexts: [{
    type: String,
    trim: true
  }],
  evaluatedAt: {
    type: Date
  },
  // Status update history for tracking
  statusHistory: [{
    status: {
      type: String,
      required: true
    },
    statusType: {
      type: String,
      enum: ['main', 'review', 'popularity', 'evaluation'],
      required: true
    },
    changedAt: {
      type: Date,
      default: Date.now
    },
    previousStatus: String,
    reason: String
  }]
}, {
  timestamps: true
});

// PERFORMANCE INDEXES ONLY - No unique constraints
userAnswerSchema.index({ userId: 1, questionId: 1, attemptNumber: 1 }); // Non-unique compound index
userAnswerSchema.index({ userId: 1, clientId: 1 }); // Non-unique index
userAnswerSchema.index({ questionId: 1, clientId: 1 }); // Non-unique index
userAnswerSchema.index({ submissionStatus: 1 }); // Non-unique index
userAnswerSchema.index({ userId: 1, questionId: 1 }); // Non-unique index for querying user's attempts
userAnswerSchema.index({ status: 1 }); // Index for main status
userAnswerSchema.index({ reviewStatus: 1 }); // Index for review status
userAnswerSchema.index({ evaluationStatus: 1 }); // Index for evaluation status
userAnswerSchema.index({ evaluationMode: 1 }); // Index for evaluation mode

// Method to update status with history tracking
userAnswerSchema.methods.updateStatus = function(statusType, newStatus, reason = '') {
  // Use let instead of const since we need to reassign the variable
  let statusField = `${statusType}Status`;
  if (statusType === 'main') {
    statusField = 'status';
  }
  
  const previousStatus = this[statusField];
  this[statusField] = newStatus;
  
  // Add to status history
  this.statusHistory.push({
    status: newStatus,
    statusType: statusType,
    previousStatus: previousStatus,
    reason: reason,
    changedAt: new Date()
  });
  
  return this.save();
};

// Method to auto-progress status after evaluation
userAnswerSchema.methods.autoProgressAfterEvaluation = async function() {
  if (this.evaluationMode === 'auto' && this.evaluationStatus === 'auto_evaluated') {
    // Auto mode: after evaluation -> published
    await this.updateStatus('main', 'published', 'Auto-published after successful evaluation');
    await this.updateStatus('review', 'review_completed', 'Auto-completed review for auto evaluation');
    return true;
  }
  return false;
};

// Add a method to clean up old indexes when the model is initialized
userAnswerSchema.statics.cleanupOldIndexes = async function() {
  try {
    const collection = this.collection;
    const indexes = await collection.listIndexes().toArray();
    
    console.log('Current indexes:', indexes.map(idx => ({ name: idx.name, key: idx.key, unique: idx.unique })));
    
    // Find and drop the problematic unique index
    const problematicIndex = indexes.find(idx => 
      idx.name.includes('version') || 
      (idx.unique && idx.key && idx.key.userId && idx.key.questionId && idx.key.version !== undefined)
    );
    
    if (problematicIndex) {
      console.log(`Dropping problematic index: ${problematicIndex.name}`);
      await collection.dropIndex(problematicIndex.name);
      console.log('Problematic index dropped successfully');
    }
    
    // Also check for any other unique indexes that might cause issues
    const uniqueIndexes = indexes.filter(idx => 
      idx.unique && 
      idx.name !== '_id_' && 
      (idx.key.userId !== undefined || idx.key.questionId !== undefined)
    );
    
    for (const uniqueIdx of uniqueIndexes) {
      console.log(`Dropping unique index: ${uniqueIdx.name}`);
      try {
        await collection.dropIndex(uniqueIdx.name);
        console.log(`Unique index ${uniqueIdx.name} dropped successfully`);
      } catch (dropError) {
        console.error(`Error dropping index ${uniqueIdx.name}:`, dropError.message);
      }
    }
    
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

// Method to check if this is the final attempt
userAnswerSchema.methods.isFinalAttempt = function() {
  return this.attemptNumber === 5;
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

// Export the model
const UserAnswer = mongoose.model('UserAnswer', userAnswerSchema);

// Clean up old indexes when the model is loaded
UserAnswer.cleanupOldIndexes().catch(console.error);

module.exports = UserAnswer;
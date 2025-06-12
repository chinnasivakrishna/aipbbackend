const mongoose = require('mongoose');

const reviewRequestSchema = new mongoose.Schema({
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
  answerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'UserAnswer',
    required: true
  },
  clientId: {
    type: String,
    required: true
  },
  requestStatus: {
    type: String,
    enum: ['pending', 'assigned', 'in_progress', 'completed', 'cancelled'],
    default: 'pending'
  },
  assignedEvaluator: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Evaluator'
  },
  priority: {
    type: String,
    enum: ['low', 'medium', 'high'],
    default: 'medium'
  },
  notes: {
    type: String,
    trim: true
  },
  requestedAt: {
    type: Date,
    default: Date.now
  },
  assignedAt: {
    type: Date
  },
  startedAt: {
    type: Date
  },
  completedAt: {
    type: Date
  },
  reviewData: {
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
  }
}, {
  timestamps: true
});

// Add methods to the schema
reviewRequestSchema.methods.assignEvaluator = async function(evaluatorId) {
  this.assignedEvaluator = evaluatorId;
  this.requestStatus = 'assigned';
  this.assignedAt = new Date();
  return this.save();
};

reviewRequestSchema.methods.markInProgress = async function() {
  this.requestStatus = 'in_progress';
  this.startedAt = new Date();
  return this.save();
};

reviewRequestSchema.methods.completeReview = async function(reviewData) {
  this.requestStatus = 'completed';
  this.completedAt = new Date();
  this.reviewData = reviewData;
  return this.save();
};

const ReviewRequest = mongoose.model('ReviewRequest', reviewRequestSchema);

module.exports = ReviewRequest; 
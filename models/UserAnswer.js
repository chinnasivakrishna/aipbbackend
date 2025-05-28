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
    },
    // OCR data for each individual image
    ocrData: {
      extractedText: {
        type: String,
        trim: true,
        default: ''
      },
      processingTime: {
        type: Number,
        default: 0
      },
      modelUsed: {
        type: String,
        default: 'mistral-ocr-latest'
      },
      processedAt: {
        type: Date
      },
      confidenceScore: {
        type: Number,
        min: 0,
        max: 1
      },
      success: {
        type: Boolean,
        default: false
      },
      error: {
        type: String
      }
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
  // Keep this for backward compatibility and global OCR data
  ocrData: {
    extractedText: {
      type: String,
      trim: true
    },
    processingTime: {
      type: Number
    },
    modelUsed: {
      type: String
    },
    processedAt: {
      type: Date
    },
    confidenceScore: {
      type: Number
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

// Add index for OCR searches
userAnswerSchema.index({ 'answerImages.ocrData.success': 1 });
userAnswerSchema.index({ 'answerImages.ocrData.extractedText': 'text' });

// Pre-save middleware
userAnswerSchema.pre('save', function(next) {
  if (this.isModified('submissionStatus') && this.submissionStatus === 'submitted' && !this.submittedAt) {
    this.submittedAt = new Date();
  }
  next();
});

// Virtual to get all extracted text from images
userAnswerSchema.virtual('allExtractedText').get(function() {
  if (!this.answerImages || this.answerImages.length === 0) {
    return '';
  }
  
  return this.answerImages
    .filter(img => img.ocrData && img.ocrData.extractedText)
    .map(img => img.ocrData.extractedText)
    .join('\n\n');
});

// Virtual to get OCR processing statistics
userAnswerSchema.virtual('ocrStats').get(function() {
  if (!this.answerImages || this.answerImages.length === 0) {
    return {
      totalImages: 0,
      processedImages: 0,
      successfulOCR: 0,
      failedOCR: 0,
      averageProcessingTime: 0
    };
  }
  
  const imagesWithOCR = this.answerImages.filter(img => img.ocrData);
  const successfulOCR = imagesWithOCR.filter(img => img.ocrData.success);
  const failedOCR = imagesWithOCR.filter(img => !img.ocrData.success);
  
  const totalProcessingTime = imagesWithOCR.reduce((sum, img) => {
    return sum + (img.ocrData.processingTime || 0);
  }, 0);
  
  return {
    totalImages: this.answerImages.length,
    processedImages: imagesWithOCR.length,
    successfulOCR: successfulOCR.length,
    failedOCR: failedOCR.length,
    averageProcessingTime: imagesWithOCR.length > 0 ? 
      Math.round(totalProcessingTime / imagesWithOCR.length) : 0
  };
});

// Virtual to check if answer has any successful OCR
userAnswerSchema.virtual('hasSuccessfulOCR').get(function() {
  if (!this.answerImages || this.answerImages.length === 0) {
    return false;
  }
  
  return this.answerImages.some(img => 
    img.ocrData && img.ocrData.success && img.ocrData.extractedText
  );
});

// Method to get combined text content (text answer + OCR)
userAnswerSchema.methods.getCombinedTextContent = function() {
  const textParts = [];
  
  // Add manual text answer if exists
  if (this.textAnswer && this.textAnswer.trim()) {
    textParts.push('Manual Answer:\n' + this.textAnswer.trim());
  }
  
  // Add OCR extracted text if exists
  const ocrText = this.allExtractedText;
  if (ocrText && ocrText.trim()) {
    textParts.push('Extracted from Images:\n' + ocrText.trim());
  }
  
  return textParts.join('\n\n---\n\n');
};

// Method to update OCR data for a specific image
userAnswerSchema.methods.updateImageOCR = function(imageIndex, ocrResult) {
  if (this.answerImages && this.answerImages[imageIndex]) {
    this.answerImages[imageIndex].ocrData = {
      extractedText: ocrResult.extractedText || '',
      processingTime: ocrResult.processingTime || 0,
      modelUsed: ocrResult.modelUsed || 'mistral-ocr-latest',
      processedAt: ocrResult.processedAt || new Date(),
      confidenceScore: ocrResult.confidenceScore || null,
      success: ocrResult.success || false,
      ...(ocrResult.error && { error: ocrResult.error })
    };
    
    // Mark the document as modified
    this.markModified('answerImages');
  }
};

// Static method to find answers with successful OCR
userAnswerSchema.statics.findWithSuccessfulOCR = function(filter = {}) {
  return this.find({
    ...filter,
    'answerImages.ocrData.success': true
  });
};

// Static method to find answers by extracted text search
userAnswerSchema.statics.searchByOCRText = function(searchText, filter = {}) {
  return this.find({
    ...filter,
    $text: { $search: searchText }
  });
};

// Static method to get OCR statistics for a user
userAnswerSchema.statics.getOCRStatsForUser = async function(userId, clientId) {
  const pipeline = [
    { $match: { userId: mongoose.Types.ObjectId(userId), clientId: clientId } },
    { $unwind: '$answerImages' },
    {
      $group: {
        _id: null,
        totalImages: { $sum: 1 },
        processedImages: {
          $sum: {
            $cond: [{ $ifNull: ['$answerImages.ocrData', false] }, 1, 0]
          }
        },
        successfulOCR: {
          $sum: {
            $cond: ['$answerImages.ocrData.success', 1, 0]
          }
        },
        failedOCR: {
          $sum: {
            $cond: [
              { $and: [
                { $ifNull: ['$answerImages.ocrData', false] },
                { $eq: ['$answerImages.ocrData.success', false] }
              ]}, 1, 0
            ]
          }
        },
        totalProcessingTime: {
          $sum: { $ifNull: ['$answerImages.ocrData.processingTime', 0] }
        }
      }
    },
    {
      $project: {
        _id: 0,
        totalImages: 1,
        processedImages: 1,
        successfulOCR: 1,
        failedOCR: 1,
        averageProcessingTime: {
          $cond: [
            { $gt: ['$processedImages', 0] },
            { $round: [{ $divide: ['$totalProcessingTime', '$processedImages'] }, 0] },
            0
          ]
        },
        ocrSuccessRate: {
          $cond: [
            { $gt: ['$processedImages', 0] },
            { $round: [{ $multiply: [{ $divide: ['$successfulOCR', '$processedImages'] }, 100] }, 2] },
            0
          ]
        }
      }
    }
  ];

  const result = await this.aggregate(pipeline);
  return result[0] || {
    totalImages: 0,
    processedImages: 0,
    successfulOCR: 0,
    failedOCR: 0,
    averageProcessingTime: 0,
    ocrSuccessRate: 0
  };
};

// Export the model
module.exports = mongoose.model('UserAnswer', userAnswerSchema);
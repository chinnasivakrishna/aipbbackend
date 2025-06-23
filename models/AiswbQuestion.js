const mongoose = require('mongoose');

const questionSchema = new mongoose.Schema({
  question: {
    type: String,
    required: true,
    trim: true
  },
  detailedAnswer: {
    type: String,
    required: true,
    trim: true
  },
  modalAnswer: {
    type: String,
    trim: true
  },
  answerVideoUrls: [{
    type: String,
    trim: true,
    validate: {
      validator: function(v) {
        if (!v) return true; // Optional field
        // YouTube URL validation regex
        const youtubeRegex = /^(https?:\/\/)?(www\.)?(youtube\.com\/(watch\?v=|embed\/|v\/)|youtu\.be\/)[\w-]+(&[\w=]*)?$/;
        return youtubeRegex.test(v);
      },
      message: 'Answer video URL must be a valid YouTube URL'
    }
  }],
  metadata: {
    keywords: [{
      type: String,
      trim: true
    }],
    difficultyLevel: {
      type: String,
      enum: ['level1', 'level2', 'level3'],
      required: true
    },
    wordLimit: {
      type: Number,
      min: 0,
      required: true
    },
    estimatedTime: {
      type: Number,
      min: 0,
      required: true
    },
    maximumMarks: {
      type: Number,
      min: 0,
      required: true
    },
    qualityParameters: {
      intro: {
        type: Boolean,
        default: false
      },
      body: {
        enabled: {
          type: Boolean,
          default: false
        },
        features: {
          type: Boolean,
          default: false
        },
        examples: {
          type: Boolean,
          default: false
        },
        facts: {
          type: Boolean,
          default: false
        },
        diagram: {
          type: Boolean,
          default: false
        }
      },
      conclusion: {
        type: Boolean,
        default: false
      },
      customParams: [{
        type: String,
        trim: true
      }]
    }
  },
  languageMode: {
    type: String,
    enum: ['english', 'hindi'],
    required: true
  },
  evaluationMode: {
    type: String,
    enum: ['auto', 'manual'],
    required: true,
    default: 'auto'
  },
  evaluationType: {
    type: String,
    enum: ['with annotation', 'without annotation'],
    required: function() {
      return this.evaluationMode === 'manual';
    },
    default:'without annotation'
  },
  
  setId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'AISWBSet'
  }
}, {
  timestamps: true
});

// Ensure keywords are unique and case-insensitive
questionSchema.pre('save', function(next) {
  if (this.metadata && this.metadata.keywords) {
    const uniqueKeywords = [...new Set(
      this.metadata.keywords.map(k => k.toLowerCase())
    )];
    this.metadata.keywords = uniqueKeywords;
  }
  
  // Ensure custom params are unique
  if (this.metadata && this.metadata.qualityParameters && this.metadata.qualityParameters.customParams) {
    const uniqueParams = [...new Set(this.metadata.qualityParameters.customParams)];
    this.metadata.qualityParameters.customParams = uniqueParams;
  }
  
  // Ensure video URLs are unique
  if (this.answerVideoUrls && this.answerVideoUrls.length > 0) {
    const uniqueUrls = [...new Set(this.answerVideoUrls.filter(url => url && url.trim()))];
    this.answerVideoUrls = uniqueUrls;
  }
  
  next();
});

module.exports = mongoose.model('AiswbQuestion', questionSchema);
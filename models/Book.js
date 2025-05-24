// models/Book.js - Updated with additional fields
const mongoose = require('mongoose');

const BookSchema = new mongoose.Schema({
  title: {
    type: String,
    required: [true, 'Please add a title'],
    trim: true,
    maxlength: [100, 'Title cannot be more than 100 characters']
  },
  description: {
    type: String,
    required: [true, 'Please add a description'],
    maxlength: [1000, 'Description cannot be more than 1000 characters']
  },
  author: {
    type: String,
    required: [true, 'Please add an author'],
    trim: true,
    maxlength: [100, 'Author name cannot be more than 100 characters']
  },
  publisher: {
    type: String,
    required: [true, 'Please add a publisher'],
    trim: true,
    maxlength: [100, 'Publisher name cannot be more than 100 characters']
  },
  language: {
    type: String,
    required: [true, 'Please select a language'],
    enum: ['Hindi', 'English', 'Bengali', 'Telugu', 'Marathi', 'Tamil', 'Gujarati', 'Urdu', 'Kannada', 'Odia', 'Malayalam', 'Punjabi', 'Assamese', 'Other'],
    default: 'English'
  },
  rating: {
    type: Number,
    min: [0, 'Rating cannot be less than 0'],
    max: [5, 'Rating cannot be more than 5'],
    default: 0,
    set: function(val) {
      return Math.round(val * 10) / 10; // Round to 1 decimal place
    }
  },
  ratingCount: {
    type: Number,
    default: 0,
    min: [0, 'Rating count cannot be negative']
  },
  coverImage: {
    type: String,
    default: ''
  },
  category: {
    type: String,
    required: [true, 'Please select a category'],
    enum: ['UPSC', 'CA', 'CMA', 'CS', 'ACCA', 'CFA', 'FRM', 'NEET', 'JEE', 'GATE', 'CAT', 'GMAT', 'GRE', 'IELTS', 'TOEFL', 'Other'],
    default: 'Other'
  },
  customCategory: {
    type: String,
    trim: true,
    maxlength: [50, 'Custom category cannot be more than 50 characters'],
  },
  tags: [{
    type: String,
    trim: true,
    maxlength: [30, 'Tag cannot be more than 30 characters']
  }],
  clientId: {
    type: String,
    required: true
  },
  user: {
    type: mongoose.Schema.Types.ObjectId,
    refPath: 'userType',
    required: true
  },
  userType: {
    type: String,
    required: true,
    enum: ['User', 'MobileUser']
  },
  isPublic: {
    type: Boolean,
    default: false
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
});

// Create compound indexes for efficient queries
BookSchema.index({ clientId: 1, category: 1 });
BookSchema.index({ clientId: 1, user: 1 });
BookSchema.index({ clientId: 1, tags: 1 });
BookSchema.index({ clientId: 1, rating: -1 });
BookSchema.index({ clientId: 1, author: 1 });
BookSchema.index({ clientId: 1, language: 1 });

// Update timestamp on save
BookSchema.pre('save', function(next) {
  this.updatedAt = Date.now();
  
  // If category is not 'Other', clear customCategory
  if (this.category !== 'Other') {
    this.customCategory = undefined;
  }
  
  // Clean up tags - remove empty strings and duplicates
  if (this.tags && this.tags.length > 0) {
    this.tags = [...new Set(this.tags.filter(tag => tag && tag.trim().length > 0))];
  }
  
  next();
});

// Virtual to get the effective category
BookSchema.virtual('effectiveCategory').get(function() {
  return this.category === 'Other' ? this.customCategory : this.category;
});

// Method to update rating
BookSchema.methods.updateRating = function(newRating) {
  const totalRating = (this.rating * this.ratingCount) + newRating;
  this.ratingCount += 1;
  this.rating = totalRating / this.ratingCount;
  return this.save();
};

// Ensure virtual fields are serialized
BookSchema.set('toJSON', { virtuals: true });

module.exports = mongoose.model('Book', BookSchema);
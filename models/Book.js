// models/Book.js
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
    // This field is used when category is 'Other'
  },
  tags: [{
    type: String,
    trim: true,
    maxlength: [30, 'Tag cannot be more than 30 characters']
  }],
  client: {
    type: String,
    required: true,
    enum: ['kitabai', 'ailisher'],
    default: 'kitabai'
  },
  // Reference to either regular User or MobileUser
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
    default: false // Books are private by default
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

// Create compound index for client-specific queries
BookSchema.index({ client: 1, category: 1 });
BookSchema.index({ client: 1, user: 1 });
BookSchema.index({ client: 1, tags: 1 });

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

// Virtual to get the effective category (either predefined or custom)
BookSchema.virtual('effectiveCategory').get(function() {
  return this.category === 'Other' ? this.customCategory : this.category;
});

// Ensure virtual fields are serialized
BookSchema.set('toJSON', { virtuals: true });

module.exports = mongoose.model('Book', BookSchema);
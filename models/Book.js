// models/Book.js - Updated with better clientId documentation
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
  // Main category (broader classification)
  mainCategory: {
    type: String,
    required: [true, 'Please select a main category'],
    enum: ['Competitive Exams', 'Professional Courses', 'Language Tests', 'Academic', 'Other'],
    default: 'Other'
  },
  // Subcategory (specific classification under main category)
  subCategory: {
    type: String,
    required: [true, 'Please select a subcategory'],
    enum: [
      // Competitive Exams subcategories
      'UPSC', 'NEET', 'JEE', 'GATE', 'CAT', 
      // Professional Courses subcategories
      'CA', 'CMA', 'CS', 'ACCA', 'CFA', 'FRM',
      // Language Tests subcategories
      'IELTS', 'TOEFL', 'GRE', 'GMAT',
      // Academic subcategories
      'Engineering', 'Medical', 'Management', 'Science', 'Arts', 'Commerce',
      // Other
      'Other'
    ],
    default: 'Other'
  },
  // Custom subcategory when subCategory is 'Other'
  customSubCategory: {
    type: String,
    trim: true,
    maxlength: [50, 'Custom subcategory cannot be more than 50 characters'],
  },
  tags: [{
    type: String,
    trim: true,
    maxlength: [30, 'Tag cannot be more than 30 characters']
  }],
  // Client ID - stores the User's userId field (for client users) or user._id (fallback)
  // This identifies which client/organization the book belongs to
  clientId: {
    type: String,
    required: true,
    index: true // Add index for better query performance
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
BookSchema.index({ clientId: 1, mainCategory: 1 });
BookSchema.index({ clientId: 1, subCategory: 1 });
BookSchema.index({ clientId: 1, mainCategory: 1, subCategory: 1 });
BookSchema.index({ clientId: 1, user: 1 });
BookSchema.index({ clientId: 1, tags: 1 });
BookSchema.index({ clientId: 1, rating: -1 });
BookSchema.index({ clientId: 1, author: 1 });
BookSchema.index({ clientId: 1, language: 1 });

// Define category mappings - CA is in Professional Courses
const CATEGORY_MAPPINGS = {
  'Competitive Exams': ['UPSC', 'NEET', 'JEE', 'GATE', 'CAT'],
  'Professional Courses': ['CA', 'CMA', 'CS', 'ACCA', 'CFA', 'FRM'],
  'Language Tests': ['IELTS', 'TOEFL', 'GRE', 'GMAT'],
  'Academic': ['Engineering', 'Medical', 'Management', 'Science', 'Arts', 'Commerce'],
  'Other': ['Other']
};

// Update timestamp on save
BookSchema.pre('save', function(next) {
  this.updatedAt = Date.now();
  
  // Validate category-subcategory relationship
  const validSubCategories = CATEGORY_MAPPINGS[this.mainCategory] || [];
  if (!validSubCategories.includes(this.subCategory) && this.subCategory !== 'Other') {
    // Log the issue but don't auto-correct, let validation catch it
    console.log(`Warning: Subcategory '${this.subCategory}' is not valid for main category '${this.mainCategory}'`);
    console.log(`Valid subcategories for '${this.mainCategory}':`, validSubCategories);
  }
  
  // If subCategory is not 'Other', clear customSubCategory
  if (this.subCategory !== 'Other') {
    this.customSubCategory = undefined;
  }
  
  // Clean up tags - remove empty strings and duplicates
  if (this.tags && this.tags.length > 0) {
    this.tags = [...new Set(this.tags.filter(tag => tag && tag.trim().length > 0))];
  }
  
  next();
});

// Custom validation for category-subcategory relationship
BookSchema.path('subCategory').validate(function(value) {
  const validSubCategories = CATEGORY_MAPPINGS[this.mainCategory] || [];
  const isValid = validSubCategories.includes(value) || value === 'Other';
  
  if (!isValid) {
    console.log(`Validation failed: '${value}' is not a valid subcategory for '${this.mainCategory}'`);
    console.log(`Valid subcategories:`, validSubCategories);
  }
  
  return isValid;
}, function() {
  return `Subcategory '${this.subCategory}' is not valid for main category '${this.mainCategory}'`;
});

// Virtual to get the effective subcategory
BookSchema.virtual('effectiveSubCategory').get(function() {
  return this.subCategory === 'Other' ? this.customSubCategory : this.subCategory;
});

// Virtual to get full category path
BookSchema.virtual('fullCategory').get(function() {
  const effectiveSub = this.subCategory === 'Other' ? this.customSubCategory : this.subCategory;
  return `${this.mainCategory} > ${effectiveSub}`;
});

// Static method to get category mappings
BookSchema.statics.getCategoryMappings = function() {
  return CATEGORY_MAPPINGS;
};

// Static method to get valid subcategories for a main category
BookSchema.statics.getValidSubCategories = function(mainCategory) {
  return CATEGORY_MAPPINGS[mainCategory] || [];
};

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
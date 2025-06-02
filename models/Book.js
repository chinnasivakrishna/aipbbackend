// models/Book.js - Updated with trending functionality and new exam categories
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
  // Updated main category (Exam focused)
  mainCategory: {
    type: String,
    required: [true, 'Please select a main category'],
    enum: ['Civil Services', 'SSC', 'Defense', 'Teacher', 'Law', 'CA', 'CMA', 'CS', 'NCERT', 'Others'],
    default: 'Others'
  },
  // Updated subcategory (specific classification under main category)
  subCategory: {
    type: String,
    required: [true, 'Please select a subcategory'],
    enum: [
      // Civil Services subcategories
      'UPSC(IAS)', 'BPSC', 'UPPCS', 'JPSC', 'RPSC', 'HPSC', 'MPPCS',
      // SSC subcategories
      'SSC-CGL', 'SSC-CHSL', 'SSC-GD',
      // Defense subcategories
      'NDA', 'FAC', 'CDS',
      // Teacher subcategories
      'DSSSB', 'CTET', 'UPTET', 'Bihar-TET',
      // Law subcategories
      'CLAT', 'DU-LLB', 'JUDICIARY',
      // CA subcategories
      'Foundation', 'Inter', 'Final',
      // CMA subcategories (same as CA)
      'Foundation', 'Inter', 'Final',
      // CS subcategories
      'CSEET', 'Executive', 'Professional',
      // NCERT subcategories
      '1st CLASS', '2nd CLASS', '3rd CLASS', '4th CLASS', '5th CLASS', '6th CLASS', 
      '7th CLASS', '8th CLASS', '9th CLASS', '10th CLASS', '11th CLASS', '12th CLASS',
      // Others
      'Others'
    ],
    default: 'Others'
  },
  // Custom subcategory when subCategory is 'Others'
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
  // NEW: Trending functionality
  isTrending: {
    type: Boolean,
    default: false,
    index: true // Add index for efficient queries
  },
  trendingAt: {
    type: Date,
    default: null
  },
  trendingOrder: {
    type: Number,
    default: 0,
    index: true // For sorting trending books
  },
  trendingNote: {
    type: String,
    trim: true,
    maxlength: [200, 'Trending note cannot be more than 200 characters'],
    default: ''
  },
  // Highlights functionality
  isHighlighted: {
    type: Boolean,
    default: false,
    index: true // Add index for efficient queries
  },
  highlightedAt: {
    type: Date,
    default: null
  },
  highlightedBy: {
    type: mongoose.Schema.Types.ObjectId,
    refPath: 'highlightedByType',
    default: null
  },
  highlightedByType: {
    type: String,
    enum: ['User', 'MobileUser'],
    default: null
  },
  highlightOrder: {
    type: Number,
    default: 0,
    index: true // For sorting highlighted books
  },
  highlightNote: {
    type: String,
    trim: true,
    maxlength: [200, 'Highlight note cannot be more than 200 characters'],
    default: ''
  },
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
// Indexes for highlights
BookSchema.index({ clientId: 1, isHighlighted: 1, highlightOrder: 1 });
BookSchema.index({ clientId: 1, isHighlighted: 1, highlightedAt: -1 });
// NEW: Indexes for trending
BookSchema.index({ clientId: 1, isTrending: 1, trendingOrder: 1 });
BookSchema.index({ clientId: 1, isTrending: 1, trendingAt: -1 });

// Define new category mappings with order
const CATEGORY_MAPPINGS = {
  'Civil Services': {
    order: 1,
    subcategories: ['UPSC(IAS)', 'BPSC', 'UPPCS', 'JPSC', 'RPSC', 'HPSC', 'MPPCS']
  },
  'SSC': {
    order: 2,
    subcategories: ['SSC-CGL', 'SSC-CHSL', 'SSC-GD']
  },
  'Defense': {
    order: 3,
    subcategories: ['NDA', 'FAC', 'CDS']
  },
  'Teacher': {
    order: 4,
    subcategories: ['DSSSB', 'CTET', 'UPTET', 'Bihar-TET']
  },
  'Law': {
    order: 5,
    subcategories: ['CLAT', 'DU-LLB', 'JUDICIARY']
  },
  'CA': {
    order: 6,
    subcategories: ['Foundation', 'Inter', 'Final']
  },
  'CMA': {
    order: 7,
    subcategories: ['Foundation', 'Inter', 'Final']
  },
  'CS': {
    order: 8,
    subcategories: ['CSEET', 'Executive', 'Professional']
  },
  'NCERT': {
    order: 9,
    subcategories: ['1st CLASS', '2nd CLASS', '3rd CLASS', '4th CLASS', '5th CLASS', '6th CLASS', 
                   '7th CLASS', '8th CLASS', '9th CLASS', '10th CLASS', '11th CLASS', '12th CLASS']
  },
  'Others': {
    order: 999,
    subcategories: ['Others']
  }
};

// Update timestamp on save
BookSchema.pre('save', function(next) {
  this.updatedAt = Date.now();
  
  // Handle highlighting logic
  if (this.isModified('isHighlighted')) {
    if (this.isHighlighted && !this.highlightedAt) {
      this.highlightedAt = new Date();
    } else if (!this.isHighlighted) {
      this.highlightedAt = null;
      this.highlightedBy = null;
      this.highlightedByType = null;
      this.highlightOrder = 0;
      this.highlightNote = '';
    }
  }
  
  // Handle trending logic
  if (this.isModified('isTrending')) {
    if (this.isTrending && !this.trendingAt) {
      this.trendingAt = new Date();
    } else if (!this.isTrending) {
      this.trendingAt = null;
      this.trendingOrder = 0;
      this.trendingNote = '';
    }
  }
  
  // Validate category-subcategory relationship
  const categoryData = CATEGORY_MAPPINGS[this.mainCategory];
  if (categoryData) {
    const validSubCategories = categoryData.subcategories || [];
    if (!validSubCategories.includes(this.subCategory) && this.subCategory !== 'Others') {
      console.log(`Warning: Subcategory '${this.subCategory}' is not valid for main category '${this.mainCategory}'`);
      console.log(`Valid subcategories for '${this.mainCategory}':`, validSubCategories);
    }
  }
  
  // If subCategory is not 'Others', clear customSubCategory
  if (this.subCategory !== 'Others') {
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
  const categoryData = CATEGORY_MAPPINGS[this.mainCategory];
  if (!categoryData) return false;
  
  const validSubCategories = categoryData.subcategories || [];
  const isValid = validSubCategories.includes(value) || value === 'Others';
  
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
  return this.subCategory === 'Others' ? this.customSubCategory : this.subCategory;
});

// Virtual to get full category path
BookSchema.virtual('fullCategory').get(function() {
  const effectiveSub = this.subCategory === 'Others' ? this.customSubCategory : this.subCategory;
  return `${this.mainCategory} > ${effectiveSub}`;
});

// Virtual to get category order for sorting
BookSchema.virtual('categoryOrder').get(function() {
  const categoryData = CATEGORY_MAPPINGS[this.mainCategory];
  return categoryData ? categoryData.order : 999;
});

// Static method to get category mappings
BookSchema.statics.getCategoryMappings = function() {
  return CATEGORY_MAPPINGS;
};

// Static method to get categories sorted by order
BookSchema.statics.getCategoriesSortedByOrder = function() {
  return Object.entries(CATEGORY_MAPPINGS)
    .sort(([,a], [,b]) => a.order - b.order)
    .map(([category, data]) => ({
      name: category,
      order: data.order,
      subcategories: data.subcategories
    }));
};

// Static method to get valid subcategories for a main category
BookSchema.statics.getValidSubCategories = function(mainCategory) {
  const categoryData = CATEGORY_MAPPINGS[mainCategory];
  return categoryData ? categoryData.subcategories : [];
};

// Method to update rating
BookSchema.methods.updateRating = function(newRating) {
  const totalRating = (this.rating * this.ratingCount) + newRating;
  this.ratingCount += 1;
  this.rating = totalRating / this.ratingCount;
  return this.save();
};

// Method to highlight/unhighlight book
BookSchema.methods.toggleHighlight = function(userId, userType, note = '', order = 0) {
  this.isHighlighted = !this.isHighlighted;
  
  if (this.isHighlighted) {
    this.highlightedAt = new Date();
    this.highlightedBy = userId;
    this.highlightedByType = userType;
    this.highlightNote = note;
    this.highlightOrder = order;
  } else {
    this.highlightedAt = null;
    this.highlightedBy = null;
    this.highlightedByType = null;
    this.highlightNote = '';
    this.highlightOrder = 0;
  }
  
  return this.save();
};

// NEW: Method to toggle trending status
BookSchema.methods.toggleTrending = function(note = '', order = 0) {
  this.isTrending = !this.isTrending;
  
  if (this.isTrending) {
    this.trendingAt = new Date();
    this.trendingNote = note;
    this.trendingOrder = order;
  } else {
    this.trendingAt = null;
    this.trendingNote = '';
    this.trendingOrder = 0;
  }
  
  return this.save();
};

// Static method to get highlighted books for a client
BookSchema.statics.getHighlightedBooks = function(clientId, limit = null) {
  const query = this.find({ 
    clientId: clientId, 
    isHighlighted: true 
  })
  .populate('user', 'name email userId')
  .populate('highlightedBy', 'name email userId')
  .sort({ highlightOrder: 1, highlightedAt: -1 });
  
  if (limit) {
    query.limit(limit);
  }
  
  return query;
};

// NEW: Static method to get trending books for a client
BookSchema.statics.getTrendingBooks = function(clientId, limit = null) {
  const query = this.find({ 
    clientId: clientId, 
    isTrending: true 
  })
  .populate('user', 'name email userId')
  .sort({ trendingOrder: 1, trendingAt: -1 });
  
  if (limit) {
    query.limit(limit);
  }
  
  return query;
};

// Ensure virtual fields are serialized
BookSchema.set('toJSON', { virtuals: true });

module.exports = mongoose.model('Book', BookSchema);
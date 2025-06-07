// models/MyBook.js
const mongoose = require('mongoose');

const MyBookSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'MobileUser',
    required: true,
    index: true
  },
  bookId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Book', 
    required: true,
    index: true
  },
  clientId: {
    type: String,
    required: true,
    index: true
  },
  addedAt: {
    type: Date,
    default: Date.now
  },
  // Optional: Track user interaction with saved books
  lastAccessedAt: {
    type: Date,
    default: Date.now
  },
  // Optional: Allow users to add personal notes
  personalNote: {
    type: String,
    maxlength: [500, 'Personal note cannot be more than 500 characters'],
    default: ''
  },
  // Optional: Priority/order for user's saved books
  priority: {
    type: Number,
    default: 0,
    min: 0
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Compound indexes for efficient queries
MyBookSchema.index({ userId: 1, clientId: 1 });
MyBookSchema.index({ userId: 1, bookId: 1 }, { unique: true }); // Prevent duplicates
MyBookSchema.index({ clientId: 1, addedAt: -1 });

// Virtual populate for book details
MyBookSchema.virtual('book', {
  ref: 'Book',
  localField: 'bookId',
  foreignField: '_id',
  justOne: true
});

// Virtual populate for user details
MyBookSchema.virtual('user', {
  ref: 'MobileUser',
  localField: 'userId',
  foreignField: '_id',
  justOne: true
});

// Static methods
MyBookSchema.statics.isBookSavedByUser = async function(userId, bookId) {
  const savedBook = await this.findOne({ userId, bookId });
  return !!savedBook;
};

MyBookSchema.statics.getUserSavedBooks = function(userId, clientId, options = {}) {
  const {
    limit = null,
    skip = 0,
    sortBy = 'addedAt',
    sortOrder = -1,
    populate = true
  } = options;

  let query = this.find({ userId, clientId });
  
  if (populate) {
    query = query.populate({
      path: 'bookId',
      select: 'title author publisher description coverImage rating ratingCount mainCategory subCategory exam paper subject tags viewCount createdAt',
      populate: {
        path: 'user',
        select: 'name email userId'
      }
    });
  }
  
  // Sorting
  const sortObj = {};
  sortObj[sortBy] = sortOrder;
  query = query.sort(sortObj);
  
  // Pagination
  if (skip > 0) query = query.skip(skip);
  if (limit) query = query.limit(limit);
  
  return query;
};

MyBookSchema.statics.getUserSavedBooksCount = function(userId, clientId) {
  return this.countDocuments({ userId, clientId });
};

MyBookSchema.statics.removeUserBook = function(userId, bookId) {
  return this.findOneAndDelete({ userId, bookId });
};

// Instance methods
MyBookSchema.methods.updateLastAccessed = function() {
  this.lastAccessedAt = new Date();
  return this.save();
};

MyBookSchema.methods.updatePersonalNote = function(note) {
  this.personalNote = note || '';
  return this.save();
};

MyBookSchema.methods.updatePriority = function(priority) {
  this.priority = priority || 0;
  return this.save();
};

// Pre-save middleware
MyBookSchema.pre('save', async function(next) {
  if (this.isNew) {
    this.lastAccessedAt = this.addedAt;
    
    // Update the Book's isAddedToMyBooks field
    try {
      const Book = mongoose.model('Book');
      await Book.findByIdAndUpdate(
        this.bookId,
        { $set: { isAddedToMyBooks: true } }
      );
      console.log(`Updated Book ${this.bookId} isAddedToMyBooks to true`);
    } catch (error) {
      console.error('Error updating Book isAddedToMyBooks:', error);
    }
  }
  next();
});

// Pre-find middleware to populate book details by default
MyBookSchema.pre(/^find/, function(next) {
  // Only populate if not explicitly disabled
  if (!this.getOptions().skipPopulate) {
    this.populate({
      path: 'bookId',
      select: 'title author publisher description coverImage rating ratingCount mainCategory subCategory exam paper subject tags viewCount createdAt'
    });
  }
  next();
});

// Pre-remove middleware
MyBookSchema.pre('remove', async function(next) {
  try {
    const Book = mongoose.model('Book');
    await Book.findByIdAndUpdate(
      this.bookId,
      { $set: { isAddedToMyBooks: false } }
    );
    console.log(`Updated Book ${this.bookId} isAddedToMyBooks to false`);
  } catch (error) {
    console.error('Error updating Book isAddedToMyBooks on remove:', error);
  }
  next();
});

module.exports = mongoose.model('MyBook', MyBookSchema);
// routes/mobileBooks.js
const express = require('express');
const router = express.Router();
const Book = require('../models/Book');
const { authenticateMobileUser, checkClientAccess } = require('../middleware/mobileAuth');

// Validation helpers
const validateBookData = (title, description, category, customCategory, tags) => {
  const errors = [];
  
  if (!title || title.trim().length === 0) {
    errors.push('Title is required.');
  }
  
  if (title && title.length > 100) {
    errors.push('Title cannot be more than 100 characters.');
  }
  
  if (!description || description.trim().length === 0) {
    errors.push('Description is required.');
  }
  
  if (description && description.length > 1000) {
    errors.push('Description cannot be more than 1000 characters.');
  }
  
  if (!category) {
    errors.push('Category is required.');
  }
  
  if (category === 'Other' && (!customCategory || customCategory.trim().length === 0)) {
    errors.push('Custom category is required when category is "Other".');
  }
  
  if (customCategory && customCategory.length > 50) {
    errors.push('Custom category cannot be more than 50 characters.');
  }
  
  if (tags && Array.isArray(tags)) {
    const invalidTags = tags.filter(tag => tag && tag.length > 30);
    if (invalidTags.length > 0) {
      errors.push('Tags cannot be more than 30 characters each.');
    }
  }
  
  return errors;
};

// Route: Create a new book
// POST /api/mobile-books/:client/create
router.post('/:client/create', checkClientAccess(['kitabai', 'ailisher']), authenticateMobileUser, async (req, res) => {
  try {
    const { title, description, category, customCategory, tags, coverImage, isPublic } = req.body;
    const client = req.clientName;
    const userId = req.user.id;

    // Validation
    const errors = validateBookData(title, description, category, customCategory, tags);
    
    if (errors.length > 0) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed.',
        errors
      });
    }

    // Create new book
    const bookData = {
      title: title.trim(),
      description: description.trim(),
      category,
      client,
      user: userId,
      userType: 'MobileUser',
      isPublic: isPublic || false
    };

    // Add custom category if category is 'Other'
    if (category === 'Other' && customCategory) {
      bookData.customCategory = customCategory.trim();
    }

    // Add cover image if provided
    if (coverImage) {
      bookData.coverImage = coverImage;
    }

    // Add tags if provided
    if (tags && Array.isArray(tags) && tags.length > 0) {
      bookData.tags = tags.filter(tag => tag && tag.trim().length > 0).map(tag => tag.trim());
    }

    const book = new Book(bookData);
    await book.save();

    // Populate user info for response
    await book.populate('user', 'mobile client');

    res.status(201).json({
      success: true,
      message: 'Book created successfully.',
      book: {
        id: book._id,
        title: book.title,
        description: book.description,
        category: book.category,
        customCategory: book.customCategory,
        effectiveCategory: book.effectiveCategory,
        tags: book.tags,
        coverImage: book.coverImage,
        isPublic: book.isPublic,
        client: book.client,
        createdAt: book.createdAt,
        updatedAt: book.updatedAt
      }
    });

  } catch (error) {
    console.error('Create book error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error. Please try again later.'
    });
  }
});

// Route: Get user's books
// GET /api/mobile-books/:client/my-books
router.get('/:client/my-books', checkClientAccess(['kitabai', 'ailisher']), authenticateMobileUser, async (req, res) => {
  try {
    const client = req.clientName;
    const userId = req.user.id;
    const { category, tag, page = 1, limit = 10 } = req.query;

    // Build query
    const query = {
      client,
      user: userId,
      userType: 'MobileUser'
    };

    // Add category filter
    if (category) {
      if (category === 'Other') {
        query.category = 'Other';
      } else {
        query.$or = [
          { category: category },
          { category: 'Other', customCategory: category }
        ];
      }
    }

    // Add tag filter
    if (tag) {
      query.tags = { $in: [tag] };
    }

    // Calculate pagination
    const skip = (parseInt(page) - 1) * parseInt(limit);

    // Get books with pagination
    const books = await Book.find(query)
      .sort({ updatedAt: -1 })
      .skip(skip)
      .limit(parseInt(limit))
      .populate('user', 'mobile');

    // Get total count
    const totalBooks = await Book.countDocuments(query);

    // Format response
    const formattedBooks = books.map(book => ({
      id: book._id,
      title: book.title,
      description: book.description,
      category: book.category,
      customCategory: book.customCategory,
      effectiveCategory: book.effectiveCategory,
      tags: book.tags,
      coverImage: book.coverImage,
      isPublic: book.isPublic,
      createdAt: book.createdAt,
      updatedAt: book.updatedAt
    }));

    res.status(200).json({
      success: true,
      books: formattedBooks,
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(totalBooks / parseInt(limit)),
        totalBooks,
        hasNext: skip + books.length < totalBooks,
        hasPrev: parseInt(page) > 1
      }
    });

  } catch (error) {
    console.error('Get books error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error. Please try again later.'
    });
  }
});

// Route: Get all books for client (public and user's own books)
// GET /api/mobile-books/:client/all
router.get('/:client/all', checkClientAccess(['kitabai', 'ailisher']), authenticateMobileUser, async (req, res) => {
  try {
    const client = req.clientName;
    const userId = req.user.id;
    const { category, tag, page = 1, limit = 10 } = req.query;

    // Build query - show public books from same client + user's own books
    const query = {
      client,
      $or: [
        { isPublic: true },
        { user: userId, userType: 'MobileUser' }
      ]
    };

    // Add category filter
    if (category) {
      if (category === 'Other') {
        query.category = 'Other';
      } else {
        query.$and = query.$and || [];
        query.$and.push({
          $or: [
            { category: category },
            { category: 'Other', customCategory: category }
          ]
        });
      }
    }

    // Add tag filter
    if (tag) {
      query.tags = { $in: [tag] };
    }

    // Calculate pagination
    const skip = (parseInt(page) - 1) * parseInt(limit);

    // Get books with pagination
    const books = await Book.find(query)
      .sort({ updatedAt: -1 })
      .skip(skip)
      .limit(parseInt(limit))
      .populate('user', 'mobile');

    // Get total count
    const totalBooks = await Book.countDocuments(query);

    // Format response
    const formattedBooks = books.map(book => ({
      id: book._id,
      title: book.title,
      description: book.description,
      category: book.category,
      customCategory: book.customCategory,
      effectiveCategory: book.effectiveCategory,
      tags: book.tags,
      coverImage: book.coverImage,
      isPublic: book.isPublic,
      isOwnBook: book.user._id.toString() === userId.toString(),
      createdAt: book.createdAt,
      updatedAt: book.updatedAt
    }));

    res.status(200).json({
      success: true,
      books: formattedBooks,
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(totalBooks / parseInt(limit)),
        totalBooks,
        hasNext: skip + books.length < totalBooks,
        hasPrev: parseInt(page) > 1
      }
    });

  } catch (error) {
    console.error('Get all books error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error. Please try again later.'
    });
  }
});

// Route: Get single book details
// GET /api/mobile-books/:client/:bookId
router.get('/:client/:bookId', checkClientAccess(['kitabai', 'ailisher']), authenticateMobileUser, async (req, res) => {
  try {
    const { bookId } = req.params;
    const client = req.clientName;
    const userId = req.user.id;

    const book = await Book.findOne({
      _id: bookId,
      client,
      $or: [
        { isPublic: true },
        { user: userId, userType: 'MobileUser' }
      ]
    }).populate('user', 'mobile');

    if (!book) {
      return res.status(404).json({
        success: false,
        message: 'Book not found or access denied.'
      });
    }

    res.status(200).json({
      success: true,
      book: {
        id: book._id,
        title: book.title,
        description: book.description,
        category: book.category,
        customCategory: book.customCategory,
        effectiveCategory: book.effectiveCategory,
        tags: book.tags,
        coverImage: book.coverImage,
        isPublic: book.isPublic,
        isOwnBook: book.user._id.toString() === userId.toString(),
        owner: {
          mobile: book.user.mobile
        },
        createdAt: book.createdAt,
        updatedAt: book.updatedAt
      }
    });

  } catch (error) {
    console.error('Get book error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error. Please try again later.'
    });
  }
});

// Route: Update book
// PUT /api/mobile-books/:client/:bookId
router.put('/:client/:bookId', checkClientAccess(['kitabai', 'ailisher']), authenticateMobileUser, async (req, res) => {
  try {
    const { bookId } = req.params;
    const { title, description, category, customCategory, tags, coverImage, isPublic } = req.body;
    const client = req.clientName;
    const userId = req.user.id;

    // Find book that belongs to the user
    const book = await Book.findOne({
      _id: bookId,
      client,
      user: userId,
      userType: 'MobileUser'
    });

    if (!book) {
      return res.status(404).json({
        success: false,
        message: 'Book not found or you do not have permission to update it.'
      });
    }

    // Validation if fields are provided
    if (title !== undefined || description !== undefined || category !== undefined) {
      const errors = validateBookData(
        title || book.title,
        description || book.description,
        category || book.category,
        customCategory,
        tags
      );
      
      if (errors.length > 0) {
        return res.status(400).json({
          success: false,
          message: 'Validation failed.',
          errors
        });
      }
    }

    // Update fields
    if (title !== undefined) book.title = title.trim();
    if (description !== undefined) book.description = description.trim();
    if (category !== undefined) book.category = category;
    if (customCategory !== undefined) book.customCategory = customCategory ? customCategory.trim() : undefined;
    if (coverImage !== undefined) book.coverImage = coverImage;
    if (isPublic !== undefined) book.isPublic = isPublic;
    
    if (tags !== undefined && Array.isArray(tags)) {
      book.tags = tags.filter(tag => tag && tag.trim().length > 0).map(tag => tag.trim());
    }

    await book.save();

    res.status(200).json({
      success: true,
      message: 'Book updated successfully.',
      book: {
        id: book._id,
        title: book.title,
        description: book.description,
        category: book.category,
        customCategory: book.customCategory,
        effectiveCategory: book.effectiveCategory,
        tags: book.tags,
        coverImage: book.coverImage,
        isPublic: book.isPublic,
        updatedAt: book.updatedAt
      }
    });

  } catch (error) {
    console.error('Update book error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error. Please try again later.'
    });
  }
});

// Route: Delete book
// DELETE /api/mobile-books/:client/:bookId
router.delete('/:client/:bookId', checkClientAccess(['kitabai', 'ailisher']), authenticateMobileUser, async (req, res) => {
  try {
    const { bookId } = req.params;
    const client = req.clientName;
    const userId = req.user.id;

    // Find and delete book that belongs to the user
    const book = await Book.findOneAndDelete({
      _id: bookId,
      client,
      user: userId,
      userType: 'MobileUser'
    });

    if (!book) {
      return res.status(404).json({
        success: false,
        message: 'Book not found or you do not have permission to delete it.'
      });
    }

    res.status(200).json({
      success: true,
      message: 'Book deleted successfully.'
    });

  } catch (error) {
    console.error('Delete book error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error. Please try again later.'
    });
  }
});

// Route: Get available categories
// GET /api/mobile-books/:client/categories
router.get('/:client/categories', checkClientAccess(['kitabai', 'ailisher']), authenticateMobileUser, async (req, res) => {
  try {
    const client = req.clientName;

    // Get predefined categories
    const predefinedCategories = ['UPSC', 'CA', 'CMA', 'CS', 'ACCA', 'CFA', 'FRM', 'NEET', 'JEE', 'GATE', 'CAT', 'GMAT', 'GRE', 'IELTS', 'TOEFL', 'Other'];

    // Get custom categories from books in this client
    const customCategories = await Book.distinct('customCategory', {
      client,
      category: 'Other',
      customCategory: { $exists: true, $ne: null, $ne: '' }
    });

    // Get category usage statistics
    const categoryStats = await Book.aggregate([
      { $match: { client } },
      {
        $group: {
          _id: {
            $cond: {
              if: { $eq: ['$category', 'Other'] },
              then: '$customCategory',
              else: '$category'
            }
          },
          count: { $sum: 1 }
        }
      },
      { $sort: { count: -1 } }
    ]);

    res.status(200).json({
      success: true,
      categories: {
        predefined: predefinedCategories,
        custom: customCategories,
        usage: categoryStats.map(stat => ({
          category: stat._id,
          count: stat.count
        }))
      }
    });

  } catch (error) {
    console.error('Get categories error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error. Please try again later.'
    });
  }
});

// Route: Get popular tags
// GET /api/mobile-books/:client/tags
router.get('/:client/tags', checkClientAccess(['kitabai', 'ailisher']), authenticateMobileUser, async (req, res) => {
  try {
    const client = req.clientName;

    // Get all tags with usage count
    const tagStats = await Book.aggregate([
      { $match: { client, tags: { $exists: true, $not: { $size: 0 } } } },
      { $unwind: '$tags' },
      {
        $group: {
          _id: '$tags',
          count: { $sum: 1 }
        }
      },
      { $sort: { count: -1 } },
      { $limit: 50 } // Limit to top 50 tags
    ]);

    res.status(200).json({
      success: true,
      tags: tagStats.map(stat => ({
        tag: stat._id,
        count: stat.count
      }))
    });

  } catch (error) {
    console.error('Get tags error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error. Please try again later.'
    });
  }
});

module.exports = router;
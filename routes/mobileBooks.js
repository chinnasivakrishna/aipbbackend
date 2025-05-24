// routes/mobileBooks.js - Updated with RESTful URLs and additional book fields
const express = require('express');
const router = express.Router();
const Book = require('../models/Book');
const { authenticateMobileUser, checkClientAccess } = require('../middleware/mobileAuth');

// Validation helpers
const validateBookData = (title, description, author, publisher, language, category, customCategory, tags, rating) => {
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

  if (!author || author.trim().length === 0) {
    errors.push('Author is required.');
  }

  if (author && author.length > 100) {
    errors.push('Author name cannot be more than 100 characters.');
  }

  if (!publisher || publisher.trim().length === 0) {
    errors.push('Publisher is required.');
  }

  if (publisher && publisher.length > 100) {
    errors.push('Publisher name cannot be more than 100 characters.');
  }

  if (!language) {
    errors.push('Language is required.');
  }

  const validLanguages = ['Hindi', 'English', 'Bengali', 'Telugu', 'Marathi', 'Tamil', 'Gujarati', 'Urdu', 'Kannada', 'Odia', 'Malayalam', 'Punjabi', 'Assamese', 'Other'];
  if (language && !validLanguages.includes(language)) {
    errors.push('Please select a valid language.');
  }

  if (rating !== undefined && (isNaN(rating) || rating < 0 || rating > 5)) {
    errors.push('Rating must be between 0 and 5.');
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
// POST /api/clients/:clientId/mobile/books
router.post('/', checkClientAccess(), authenticateMobileUser, async (req, res) => {
  try {
    const { title, description, author, publisher, language, category, customCategory, tags, coverImage, isPublic, rating } = req.body;
    const clientId = req.params.clientId;
    const userId = req.user.id;

    // Validation
    const errors = validateBookData(title, description, author, publisher, language, category, customCategory, tags, rating);
    
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
      author: author.trim(),
      publisher: publisher.trim(),
      language,
      category,
      clientId,
      user: userId,
      userType: 'MobileUser',
      isPublic: isPublic || false,
      rating: rating || 0
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
    await book.populate('user', 'mobile clientId');

    res.status(201).json({
      success: true,
      message: 'Book created successfully.',
      data: {
        book: {
          id: book._id,
          title: book.title,
          description: book.description,
          author: book.author,
          publisher: book.publisher,
          language: book.language,
          rating: book.rating,
          ratingCount: book.ratingCount,
          category: book.category,
          customCategory: book.customCategory,
          effectiveCategory: book.effectiveCategory,
          tags: book.tags,
          coverImage: book.coverImage,
          isPublic: book.isPublic,
          clientId: book.clientId,
          createdAt: book.createdAt,
          updatedAt: book.updatedAt
        }
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

// Route: Get current user's books
// GET /api/clients/:clientId/mobile/users/me/books
router.get('/users/me/books', checkClientAccess(), authenticateMobileUser, async (req, res) => {
  try {
    const clientId = req.params.clientId;
    const userId = req.user.id;
    const { category, tag, author, language, rating_min, rating_max, page = 1, limit = 10, sort = 'updated_desc' } = req.query;

    // Build query
    const query = {
      clientId,
      user: userId,
      userType: 'MobileUser'
    };

    // Add filters
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

    if (tag) {
      query.tags = { $in: [tag] };
    }

    if (author) {
      query.author = { $regex: author, $options: 'i' };
    }

    if (language) {
      query.language = language;
    }

    if (rating_min || rating_max) {
      query.rating = {};
      if (rating_min) query.rating.$gte = parseFloat(rating_min);
      if (rating_max) query.rating.$lte = parseFloat(rating_max);
    }

    // Build sort
    let sortQuery = {};
    switch (sort) {
      case 'title_asc':
        sortQuery = { title: 1 };
        break;
      case 'title_desc':
        sortQuery = { title: -1 };
        break;
      case 'rating_asc':
        sortQuery = { rating: 1 };
        break;
      case 'rating_desc':
        sortQuery = { rating: -1 };
        break;
      case 'created_asc':
        sortQuery = { createdAt: 1 };
        break;
      case 'created_desc':
        sortQuery = { createdAt: -1 };
        break;
      case 'updated_asc':
        sortQuery = { updatedAt: 1 };
        break;
      default:
        sortQuery = { updatedAt: -1 };
    }

    // Calculate pagination
    const skip = (parseInt(page) - 1) * parseInt(limit);

    // Get books with pagination
    const books = await Book.find(query)
      .sort(sortQuery)
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
      author: book.author,
      publisher: book.publisher,
      language: book.language,
      rating: book.rating,
      ratingCount: book.ratingCount,
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
      data: {
        books: formattedBooks,
        pagination: {
          currentPage: parseInt(page),
          totalPages: Math.ceil(totalBooks / parseInt(limit)),
          totalBooks,
          hasNext: skip + books.length < totalBooks,
          hasPrev: parseInt(page) > 1
        }
      }
    });

  } catch (error) {
    console.error('Get user books error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error. Please try again later.'
    });
  }
});

// Route: Get all books for client (public and user's own books)
// GET /api/clients/:clientId/mobile/books
router.get('/', checkClientAccess(), authenticateMobileUser, async (req, res) => {
  try {
    const clientId = req.params.clientId;
    const userId = req.user.id;
    const { category, tag, author, language, rating_min, rating_max, page = 1, limit = 10, sort = 'updated_desc' } = req.query;

    // Build query - show public books from same client + user's own books
    const query = {
      clientId,
      $or: [
        { isPublic: true },
        { user: userId, userType: 'MobileUser' }
      ]
    };

    // Add filters
    if (category || tag || author || language || rating_min || rating_max) {
      const filters = [];
      
      if (category) {
        if (category === 'Other') {
          filters.push({ category: 'Other' });
        } else {
          filters.push({
            $or: [
              { category: category },
              { category: 'Other', customCategory: category }
            ]
          });
        }
      }

      if (tag) {
        filters.push({ tags: { $in: [tag] } });
      }

      if (author) {
        filters.push({ author: { $regex: author, $options: 'i' } });
      }

      if (language) {
        filters.push({ language: language });
      }

      if (rating_min || rating_max) {
        const ratingFilter = {};
        if (rating_min) ratingFilter.$gte = parseFloat(rating_min);
        if (rating_max) ratingFilter.$lte = parseFloat(rating_max);
        filters.push({ rating: ratingFilter });
      }

      if (filters.length > 0) {
        query.$and = filters;
      }
    }

    // Build sort
    let sortQuery = {};
    switch (sort) {
      case 'title_asc':
        sortQuery = { title: 1 };
        break;
      case 'title_desc':
        sortQuery = { title: -1 };
        break;
      case 'rating_asc':
        sortQuery = { rating: 1 };
        break;
      case 'rating_desc':
        sortQuery = { rating: -1 };
        break;
      case 'created_asc':
        sortQuery = { createdAt: 1 };
        break;
      case 'created_desc':
        sortQuery = { createdAt: -1 };
        break;
      case 'updated_asc':
        sortQuery = { updatedAt: 1 };
        break;
      default:
        sortQuery = { updatedAt: -1 };
    }

    // Calculate pagination
    const skip = (parseInt(page) - 1) * parseInt(limit);

    // Get books with pagination
    const books = await Book.find(query)
      .sort(sortQuery)
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
      author: book.author,
      publisher: book.publisher,
      language: book.language,
      rating: book.rating,
      ratingCount: book.ratingCount,
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
      data: {
        books: formattedBooks,
        pagination: {
          currentPage: parseInt(page),
          totalPages: Math.ceil(totalBooks / parseInt(limit)),
          totalBooks,
          hasNext: skip + books.length < totalBooks,
          hasPrev: parseInt(page) > 1
        }
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
// GET /api/clients/:clientId/mobile/books/:bookId
router.get('/:bookId', checkClientAccess(), authenticateMobileUser, async (req, res) => {
  try {
    const { bookId } = req.params;
    const clientId = req.params.clientId;
    const userId = req.user.id;

    const book = await Book.findOne({
      _id: bookId,
      clientId,
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
      data: {
        book: {
          id: book._id,
          title: book.title,
          description: book.description,
          author: book.author,
          publisher: book.publisher,
          language: book.language,
          rating: book.rating,
          ratingCount: book.ratingCount,
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
// PUT /api/clients/:clientId/mobile/books/:bookId
router.put('/:bookId', checkClientAccess(), authenticateMobileUser, async (req, res) => {
  try {
    const { bookId } = req.params;
    const { title, description, author, publisher, language, category, customCategory, tags, coverImage, isPublic, rating } = req.body;
    const clientId = req.params.clientId;
    const userId = req.user.id;

    // Find book that belongs to the user
    const book = await Book.findOne({
      _id: bookId,
      clientId,
      user: userId,
      userType: 'MobileUser'
    });

    if (!book) {
      return res.status(404).json({
        success: false,
        message: 'Book not found or you do not have permission to update it.'
      });
    }

    // Validation if critical fields are provided
    if (title !== undefined || description !== undefined || author !== undefined || publisher !== undefined || language !== undefined || category !== undefined) {
      const errors = validateBookData(
        title || book.title,
        description || book.description,
        author || book.author,
        publisher || book.publisher,
        language || book.language,
        category || book.category,
        customCategory,
        tags,
        rating
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
    if (author !== undefined) book.author = author.trim();
    if (publisher !== undefined) book.publisher = publisher.trim();
    if (language !== undefined) book.language = language;
    if (category !== undefined) book.category = category;
    if (customCategory !== undefined) book.customCategory = customCategory ? customCategory.trim() : undefined;
    if (coverImage !== undefined) book.coverImage = coverImage;
    if (isPublic !== undefined) book.isPublic = isPublic;
    if (rating !== undefined) book.rating = rating;
    
    if (tags !== undefined && Array.isArray(tags)) {
      book.tags = tags.filter(tag => tag && tag.trim().length > 0).map(tag => tag.trim());
    }

    await book.save();

    res.status(200).json({
      success: true,
      message: 'Book updated successfully.',
      data: {
        book: {
          id: book._id,
          title: book.title,
          description: book.description,
          author: book.author,
          publisher: book.publisher,
          language: book.language,
          rating: book.rating,
          ratingCount: book.ratingCount,
          category: book.category,
          customCategory: book.customCategory,
          effectiveCategory: book.effectiveCategory,
          tags: book.tags,
          coverImage: book.coverImage,
          isPublic: book.isPublic,
          updatedAt: book.updatedAt
        }
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
// DELETE /api/clients/:clientId/mobile/books/:bookId
router.delete('/:bookId', checkClientAccess(), authenticateMobileUser, async (req, res) => {
  try {
    const { bookId } = req.params;
    const clientId = req.params.clientId;
    const userId = req.user.id;

    // Find and delete book that belongs to the user
    const book = await Book.findOneAndDelete({
      _id: bookId,
      clientId,
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

// Route: Rate a book
// POST /api/clients/:clientId/mobile/books/:bookId/rating
router.post('/:bookId/rating', checkClientAccess(), authenticateMobileUser, async (req, res) => {
  try {
    const { bookId } = req.params;
    const { rating } = req.body;
    const clientId = req.params.clientId;
    const userId = req.user.id;

    if (!rating || isNaN(rating) || rating < 1 || rating > 5) {
      return res.status(400).json({
        success: false,
        message: 'Rating must be between 1 and 5.'
      });
    }

    const book = await Book.findOne({
      _id: bookId,
      clientId,
      $or: [
        { isPublic: true },
        { user: userId, userType: 'MobileUser' }
      ]
    });

    if (!book) {
      return res.status(404).json({
        success: false,
        message: 'Book not found or access denied.'
      });
    }

    // Update rating using the model method
    await book.updateRating(parseFloat(rating));

    res.status(200).json({
      success: true,
      message: 'Rating submitted successfully.',
      data: {
        book: {
          id: book._id,
          rating: book.rating,
          ratingCount: book.ratingCount
        }
      }
    });

  } catch (error) {
    console.error('Rate book error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error. Please try again later.'
    });
  }
});

// Route: Get available categories
// GET /api/clients/:clientId/mobile/books/metadata/categories
router.get('/metadata/categories', checkClientAccess(), authenticateMobileUser, async (req, res) => {
  try {
    const clientId = req.params.clientId;

    // Get predefined categories
    const predefinedCategories = ['UPSC', 'CA', 'CMA', 'CS', 'ACCA', 'CFA', 'FRM', 'NEET', 'JEE', 'GATE', 'CAT', 'GMAT', 'GRE', 'IELTS', 'TOEFL', 'Other'];

    // Get custom categories from books in this client
    const customCategories = await Book.distinct('customCategory', {
      clientId,
      category: 'Other',
      customCategory: { $exists: true, $ne: null, $ne: '' }
    });

    // Get category usage statistics
    const categoryStats = await Book.aggregate([
      { $match: { clientId } },
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
      data: {
        categories: {
          predefined: predefinedCategories,
          custom: customCategories,
          usage: categoryStats.map(stat => ({
            category: stat._id,
            count: stat.count
          }))
        }
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
// GET /api/clients/:clientId/mobile/books/metadata/tags
router.get('/metadata/tags', checkClientAccess(), authenticateMobileUser, async (req, res) => {
  try {
    const clientId = req.params.clientId;

    // Get all tags with usage count
    const tagStats = await Book.aggregate([
      { $match: { clientId, tags: { $exists: true, $not: { $size: 0 } } } },
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
      data: {
        tags: tagStats.map(stat => ({
          tag: stat._id,
          count: stat.count
        }))
      }
    });

  } catch (error) {
    console.error('Get tags error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error. Please try again later.'
    });
  }
});

// Route: Get available languages
// GET /api/clients/:clientId/mobile/books/metadata/languages
router.get('/metadata/languages', checkClientAccess(), authenticateMobileUser, async (req, res) => {
  try {
    const clientId = req.params.clientId;

    // Get all languages with usage count
    const languageStats = await Book.aggregate([
      { $match: { clientId } },
      {
        $group: {
          _id: '$language',
          count: { $sum: 1 }
        }
      },
      { $sort: { count: -1 } }
    ]);

    res.status(200).json({
      success: true,
      data: {
        languages: languageStats.map(stat => ({
          language: stat._id,
          count: stat.count
        }))
      }
    });

  } catch (error) {
    console.error('Get languages error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error. Please try again later.'
    });
  }
});

// Route: Get popular authors
// GET /api/clients/:clientId/mobile/books/metadata/authors
router.get('/metadata/authors', checkClientAccess(), authenticateMobileUser, async (req, res) => {
  try {
    const clientId = req.params.clientId;

    // Get all authors with usage count
    const authorStats = await Book.aggregate([
      { $match: { clientId } },
      {
        $group: {
          _id: '$author',
          count: { $sum: 1 }
        }
      },
      { $sort: { count: -1 } },
      { $limit: 50 } // Limit to top 50 authors
    ]);

    res.status(200).json({
      success: true,
      data: {
        authors: authorStats.map(stat => ({
          author: stat._id,
          count: stat.count
        }))
      }
    });

  } catch (error) {
    console.error('Get authors error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error. Please try again later.'
    });
  }
});

module.exports = router;
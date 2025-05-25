// routes/mobileBooks.js - Debug version with enhanced error logging
const express = require('express');
const router = express.Router({ mergeParams: true }); // Added mergeParams
const Book = require('../models/Book');
const { authenticateMobileUser, checkClientAccess } = require('../middleware/mobileAuth');

// Validation helpers
const validateBookData = (title, description, author, publisher, language, mainCategory, subCategory, customSubCategory, tags, rating) => {
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
  
  if (!mainCategory) {
    errors.push('Main category is required.');
  }

  const validMainCategories = ['Competitive Exams', 'Professional Courses', 'Language Tests', 'Academic', 'Other'];
  if (mainCategory && !validMainCategories.includes(mainCategory)) {
    errors.push('Please select a valid main category.');
  }
  
  if (!subCategory) {
    errors.push('Subcategory is required.');
  }

  const validSubCategories = ['UPSC', 'NEET', 'JEE', 'GATE', 'CAT', 'CA', 'CMA', 'CS', 'ACCA', 'CFA', 'FRM', 'IELTS', 'TOEFL', 'GRE', 'GMAT', 'Engineering', 'Medical', 'Management', 'Science', 'Arts', 'Commerce', 'Other'];
  if (subCategory && !validSubCategories.includes(subCategory)) {
    errors.push('Please select a valid subcategory.');
  }
  
  if (subCategory === 'Other' && (!customSubCategory || customSubCategory.trim().length === 0)) {
    errors.push('Custom subcategory is required when subcategory is "Other".');
  }
  
  if (customSubCategory && customSubCategory.length > 50) {
    errors.push('Custom subcategory cannot be more than 50 characters.');
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
    console.log('=== CREATE BOOK DEBUG ===');
    console.log('Request params:', req.params);
    console.log('Request body:', req.body);
    console.log('Request user:', req.user);
    console.log('Request clientId:', req.clientId);
    
    const { title, description, author, publisher, language, mainCategory, subCategory, customSubCategory, tags, coverImage, isPublic, rating } = req.body;
    const clientId = req.params.clientId || req.clientId;
    
    console.log('Extracted clientId:', clientId);
    
    if (!req.user) {
      console.log('ERROR: No user found in request');
      return res.status(401).json({
        success: false,
        message: 'User authentication failed.'
      });
    }
    
    const userId = req.user.id;
    console.log('User ID:', userId);

    // Validation
    const errors = validateBookData(title, description, author, publisher, language, mainCategory, subCategory, customSubCategory, tags, rating);
    
    if (errors.length > 0) {
      console.log('Validation errors:', errors);
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
      mainCategory,
      subCategory,
      clientId,
      user: userId,
      userType: 'MobileUser',
      isPublic: isPublic || false,
      rating: rating || 0
    };

    // Add custom subcategory if subCategory is 'Other'
    if (subCategory === 'Other' && customSubCategory) {
      bookData.customSubCategory = customSubCategory.trim();
    }

    // Add cover image if provided
    if (coverImage) {
      bookData.coverImage = coverImage;
    }

    // Add tags if provided
    if (tags && Array.isArray(tags) && tags.length > 0) {
      bookData.tags = tags.filter(tag => tag && tag.trim().length > 0).map(tag => tag.trim());
    }

    console.log('Book data to save:', bookData);

    // Check if Book model is loaded correctly
    console.log('Book model:', Book);
    console.log('Book schema paths:', Object.keys(Book.schema.paths));

    const book = new Book(bookData);
    console.log('Created book instance:', book);
    
    // Validate before saving
    const validationError = book.validateSync();
    if (validationError) {
      console.log('Mongoose validation error:', validationError);
      return res.status(400).json({
        success: false,
        message: 'Book validation failed.',
        errors: Object.values(validationError.errors).map(err => err.message)
      });
    }
    
    await book.save();
    console.log('Book saved successfully:', book._id);

    // Populate user info for response
    await book.populate('user', 'mobile clientId');
    console.log('Book populated with user info');

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
          mainCategory: book.mainCategory,
          subCategory: book.subCategory,
          customSubCategory: book.customSubCategory,
          effectiveSubCategory: book.effectiveSubCategory,
          fullCategory: book.fullCategory,
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
    console.error('=== CREATE BOOK ERROR ===');
    console.error('Error name:', error.name);
    console.error('Error message:', error.message);
    console.error('Error stack:', error.stack);
    console.error('Full error:', error);
    
    // Check if it's a MongoDB/Mongoose error
    if (error.name === 'ValidationError') {
      console.log('Mongoose validation error details:', error.errors);
      return res.status(400).json({
        success: false,
        message: 'Validation failed.',
        errors: Object.values(error.errors).map(err => err.message)
      });
    }
    
    if (error.name === 'MongoError' || error.name === 'MongoServerError') {
      console.log('MongoDB error:', error);
      return res.status(500).json({
        success: false,
        message: 'Database error. Please try again later.'
      });
    }
    
    res.status(500).json({
      success: false,
      message: 'Internal server error. Please try again later.',
      debug: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// Route: Get category mappings and metadata
// GET /api/clients/:clientId/mobile/books/metadata/categories
router.get('/metadata/categories', checkClientAccess(), authenticateMobileUser, async (req, res) => {
  try {
    const clientId = req.params.clientId || req.clientId;

    // Get category mappings from the Book model
    const categoryMappings = Book.getCategoryMappings();

    // Get main category usage statistics
    const mainCategoryStats = await Book.aggregate([
      { $match: { clientId } },
      {
        $group: {
          _id: '$mainCategory',
          count: { $sum: 1 }
        }
      },
      { $sort: { count: -1 } }
    ]);

    // Get subcategory usage statistics
    const subCategoryStats = await Book.aggregate([
      { $match: { clientId } },
      {
        $group: {
          _id: {
            mainCategory: '$mainCategory',
            subCategory: {
              $cond: {
                if: { $eq: ['$subCategory', 'Other'] },
                then: '$customSubCategory',
                else: '$subCategory'
              }
            }
          },
          count: { $sum: 1 }
        }
      },
      { $sort: { count: -1 } }
    ]);

    // Get custom subcategories
    const customSubCategories = await Book.distinct('customSubCategory', {
      clientId,
      subCategory: 'Other',
      customSubCategory: { $exists: true, $ne: null, $ne: '' }
    });

    // Format subcategory stats by main category
    const subcategoriesByMain = {};
    subCategoryStats.forEach(stat => {
      const mainCat = stat._id.mainCategory;
      if (!subcategoriesByMain[mainCat]) {
        subcategoriesByMain[mainCat] = [];
      }
      subcategoriesByMain[mainCat].push({
        subCategory: stat._id.subCategory,
        count: stat.count
      });
    });

    res.status(200).json({
      success: true,
      data: {
        categoryMappings,
        mainCategories: Object.keys(categoryMappings),
        mainCategoryStats: mainCategoryStats.map(stat => ({
          category: stat._id,
          count: stat.count
        })),
        subcategoriesByMainCategory: subcategoriesByMain,
        customSubCategories,
        usage: {
          mainCategories: mainCategoryStats,
          subCategories: subCategoryStats
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

// Route: Get valid subcategories for a main category
// GET /api/clients/:clientId/mobile/books/metadata/subcategories/:mainCategory
router.get('/metadata/subcategories/:mainCategory', checkClientAccess(), authenticateMobileUser, async (req, res) => {
  try {
    const { mainCategory } = req.params;
    const clientId = req.params.clientId;

    // Get valid subcategories for the main category
    const validSubCategories = Book.getValidSubCategories(mainCategory);

    // Get usage statistics for subcategories in this main category
    const subCategoryStats = await Book.aggregate([
      { 
        $match: { 
          clientId,
          mainCategory: mainCategory
        } 
      },
      {
        $group: {
          _id: {
            $cond: {
              if: { $eq: ['$subCategory', 'Other'] },
              then: '$customSubCategory',
              else: '$subCategory'
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
        mainCategory,
        validSubCategories,
        usage: subCategoryStats.map(stat => ({
          subCategory: stat._id,
          count: stat.count
        }))
      }
    });

  } catch (error) {
    console.error('Get subcategories error:', error);
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
    const { mainCategory, subCategory } = req.query;

    // Build match query
    const matchQuery = { clientId, tags: { $exists: true, $not: { $size: 0 } } };
    
    if (mainCategory) {
      matchQuery.mainCategory = mainCategory;
    }
    
    if (subCategory) {
      if (subCategory === 'Other') {
        matchQuery.subCategory = 'Other';
      } else {
        matchQuery.$or = [
          { subCategory: subCategory },
          { subCategory: 'Other', customSubCategory: subCategory }
        ];
      }
    }

    // Get all tags with usage count
    const tagStats = await Book.aggregate([
      { $match: matchQuery },
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
        })),
        filters: {
          mainCategory,
          subCategory
        }
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

// Route: Get current user's books
// GET /api/clients/:clientId/mobile/users/me/books
router.get('/users/me/books', checkClientAccess(), authenticateMobileUser, async (req, res) => {
  try {
    const clientId = req.params.clientId;
    const userId = req.user.id;
    const { mainCategory, subCategory, tag, author, language, rating_min, rating_max, page = 1, limit = 10, sort = 'updated_desc' } = req.query;

    // Build query
    const query = {
      clientId,
      user: userId,
      userType: 'MobileUser'
    };

    // Add filters
    if (mainCategory) {
      query.mainCategory = mainCategory;
    }

    if (subCategory) {
      if (subCategory === 'Other') {
        query.subCategory = 'Other';
      } else {
        query.$or = [
          { subCategory: subCategory },
          { subCategory: 'Other', customSubCategory: subCategory }
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
      mainCategory: book.mainCategory,
      subCategory: book.subCategory,
      customSubCategory: book.customSubCategory,
      effectiveSubCategory: book.effectiveSubCategory,
      fullCategory: book.fullCategory,
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
    const { mainCategory, subCategory, tag, author, language, rating_min, rating_max, page = 1, limit = 10, sort = 'updated_desc' } = req.query;

    // Build query - show public books from same client + user's own books
    const query = {
      clientId,
      $or: [
        { isPublic: true },
        { user: userId, userType: 'MobileUser' }
      ]
    };

    // Add filters
    if (mainCategory || subCategory || tag || author || language || rating_min || rating_max) {
      const filters = [];
      
      if (mainCategory) {
        filters.push({ mainCategory: mainCategory });
      }

      if (subCategory) {
        if (subCategory === 'Other') {
          filters.push({ subCategory: 'Other' });
        } else {
          filters.push({
            $or: [
              { subCategory: subCategory },
              { subCategory: 'Other', customSubCategory: subCategory }
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
      mainCategory: book.mainCategory,
      subCategory: book.subCategory,
      customSubCategory: book.customSubCategory,
      effectiveSubCategory: book.effectiveSubCategory,
      fullCategory: book.fullCategory,
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
          mainCategory: book.mainCategory,
          subCategory: book.subCategory,
          customSubCategory: book.customSubCategory,
          effectiveSubCategory: book.effectiveSubCategory,
          fullCategory: book.fullCategory,
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
    const { title, description, author, publisher, language, mainCategory, subCategory, customSubCategory, tags, coverImage, isPublic, rating } = req.body;
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
    if (title !== undefined || description !== undefined || author !== undefined || publisher !== undefined || language !== undefined || mainCategory !== undefined || subCategory !== undefined) {
      const errors = validateBookData(
        title || book.title,
        description || book.description,
        author || book.author,
        publisher || book.publisher,
        language || book.language,
        mainCategory || book.mainCategory,
        subCategory || book.subCategory,
        customSubCategory,
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
    if (mainCategory !== undefined) book.mainCategory = mainCategory;
    if (subCategory !== undefined) book.subCategory = subCategory;
    if (customSubCategory !== undefined) book.customSubCategory = customSubCategory ? customSubCategory.trim() : undefined;
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
          mainCategory: book.mainCategory,
          subCategory: book.subCategory,
          customSubCategory: book.customSubCategory,
          effectiveSubCategory: book.effectiveSubCategory,
          fullCategory: book.fullCategory,
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

module.exports = router;
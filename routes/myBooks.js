// routes/myBooks.js - Mobile MyBooks API Routes
// This file handles the My Books functionality for mobile users
// Routes are accessible at /api/clients/:clientId/mobile/mybooks/*
const express = require('express');
const router = express.Router();
const MyBook = require('../models/MyBook');
const Book = require('../models/Book');
const MobileUser = require('../models/MobileUser');
const { authenticateMobileUser, ensureUserBelongsToClient } = require('../middleware/mobileAuth');
const { generateGetPresignedUrl } = require('../utils/s3');

// Apply authentication middleware to all routes
router.use(authenticateMobileUser);
router.use(ensureUserBelongsToClient);

// 1. Add Book to My Books
// POST /api/clients/:clientId/mobile/mybooks/add
router.post('/add', async (req, res) => {
  try {
    const { book_id } = req.body;
    const userId = req.user.id;
    const clientId = req.user.clientId;

    // Validate required fields
    if (!book_id) {
      return res.status(400).json({
        success: false,
        message: 'Missing required parameters.',
        error: {
          code: 'MISSING_PARAMETERS',
          details: 'book_id is required'
        }
      });
    }

    // Validate book_id format (MongoDB ObjectId)
    if (!book_id.match(/^[0-9a-fA-F]{24}$/)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid book ID format.',
        error: {
          code: 'INVALID_BOOK_ID',
          details: 'book_id must be a valid MongoDB ObjectId'
        }
      });
    }

    // Check if book exists and belongs to the same client
    const book = await Book.findOne({ 
      _id: book_id, 
      clientId: clientId 
    });

    if (!book) {
      return res.status(404).json({
        success: false,
        message: 'Book not found or does not belong to your client.',
        error: {
          code: 'BOOK_NOT_FOUND',
          details: `Book with ID ${book_id} not found for client ${clientId}`
        }
      });
    }

    // Check if book is already in user's My Books
    const existingMyBook = await MyBook.findOne({
      userId: userId,
      bookId: book_id
    });

    if (existingMyBook) {
      return res.status(409).json({
        success: false,
        message: 'Book is already in your My Books list.',
        error: {
          code: 'BOOK_ALREADY_EXISTS',
          details: 'This book has already been added to your My Books collection'
        }
      });
    }

    // Add book to My Books
    const myBook = new MyBook({
      userId: userId,
      bookId: book_id,
      clientId: clientId
    });

    await myBook.save();

    // Populate book details for response
    await myBook.populate({
      path: 'bookId',
      select: 'title author publisher description coverImage coverImageUrl rating ratingCount mainCategory subCategory exam paper subject tags viewCount createdAt'
    });

    console.log(`Book ${book_id} added to My Books for user ${userId}`);

    res.status(200).json({
      success: true,
      message: 'Book successfully added to My Books.',
      data: {
        myBookId: myBook._id,
        bookId: myBook.bookId._id,
        title: myBook.bookId.title,
        author: myBook.bookId.author,
        coverImage: myBook.bookId.coverImage,
        coverImageUrl: myBook.bookId.coverImageUrl,
        addedAt: myBook.addedAt,
        isAddedToMyBooks: myBook.isIASBookAdded
      }
    });

  } catch (error) {
    console.error('Add to My Books error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error while adding book to My Books.',
      error: {
        code: 'SERVER_ERROR',
        details: error.message
      }
    });
  }
});

// 2. View My Books List
// GET /api/clients/:clientId/mobile/mybooks/list
router.get('/list', async (req, res) => {
  try {
    const userId = req.user.id;
    const clientId = req.user.clientId;
    
    // Query parameters for pagination and filtering
    const {
      page = 1,
      limit = 20,
      sortBy = 'addedAt',
      sortOrder = 'desc',
      category = null,
      search = null
    } = req.query;

    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const skip = (pageNum - 1) * limitNum;
    
    // Build query
    let query = MyBook.find({ userId, clientId });

    // Apply search filter if provided
    if (search) {
      const bookQuery = {
        clientId: clientId,
        $or: [
          { title: { $regex: search, $options: 'i' } },
          { author: { $regex: search, $options: 'i' } },
          { description: { $regex: search, $options: 'i' } }
        ]
      };
      
      const matchingBooks = await Book.find(bookQuery).select('_id');
      const bookIds = matchingBooks.map(book => book._id);
      
      query = query.where('bookId').in(bookIds);
    }

    // Apply category filter if provided
    if (category) {
      const categoryBooks = await Book.find({ 
        clientId: clientId, 
        mainCategory: category 
      }).select('_id');
      const categoryBookIds = categoryBooks.map(book => book._id);
      
      query = query.where('bookId').in(categoryBookIds);
    }

    // Apply sorting
    const sortDirection = sortOrder === 'desc' ? -1 : 1;
    const sortObj = {};
    sortObj[sortBy] = sortDirection;
    query = query.sort(sortObj);

    // Apply pagination
    query = query.skip(skip).limit(limitNum);

    // Populate book details
    query = query.populate({
      path: 'bookId',
      select: 'title author publisher description coverImage coverImageUrl rating ratingCount mainCategory subCategory exam paper subject tags viewCount createdAt',
      populate: {
        path: 'user',
        select: 'name email userId'
      }
    });

    // Execute query
    const myBooks = await query;

    // Get total count for pagination
    const totalCount = await MyBook.countDocuments({ userId, clientId });

    if (myBooks.length === 0) {
      return res.status(200).json({
        success: true,
        message: 'No books found in your My Books collection.',
        error: {
          code: 'NO_BOOKS_FOUND',
          details: 'Your My Books list is empty'
        }
      });
    }

    // Format response and generate cover image URLs
    const formattedBooks = await Promise.all(myBooks.map(async myBook => {
      let coverImageUrl = myBook.bookId.coverImageUrl;
      
      // Generate new presigned URL if we have a cover image
      if (myBook.bookId.coverImage) {
        try {
          coverImageUrl = await generateGetPresignedUrl(myBook.bookId.coverImage, 31536000); // 1 year expiry
          
          // Update the book with the new URL if it's different
          if (myBook.bookId.coverImageUrl !== coverImageUrl) {
            await Book.findByIdAndUpdate(myBook.bookId._id, { coverImageUrl });
          }
        } catch (error) {
          console.error('Error generating presigned URL for cover image:', error);
          coverImageUrl = null;
        }
      }

      return {
        mybook_id: myBook._id,
        book_id: myBook.bookId._id,
        title: myBook.bookId.title,
        author: myBook.bookId.author,
        publisher: myBook.bookId.publisher,
        description: myBook.bookId.description,
        cover_image: myBook.bookId.coverImage || '',
        cover_image_url: coverImageUrl || '',
        rating: myBook.bookId.rating,
        rating_count: myBook.bookId.ratingCount || '',
        conversations:myBook.bookId.conversations || '',
        users:myBook.bookId.users || '',
        summary:myBook.bookId.summary || '',
        main_category: myBook.bookId.mainCategory,
        sub_category: myBook.bookId.subCategory,
        exam: myBook.bookId.exam,
        paper: myBook.bookId.paper,
        subject: myBook.bookId.subject,
        tags: myBook.bookId.tags,
        view_count: myBook.bookId.viewCount,
        added_at: myBook.addedAt,
        last_accessed_at: myBook.lastAccessedAt,
        personal_note: myBook.personalNote,
        priority: myBook.priority,
        is_added_to_my_books: myBook.bookId.isAddedToMyBooks
      };
    }));

    console.log(`Retrieved ${myBooks.length} books from My Books for user ${userId}`);

    res.status(200).json({
      success: true,
      message: 'My Books retrieved successfully.',
      data: {
        books: formattedBooks,
        pagination: {
          current_page: pageNum,
          total_pages: Math.ceil(totalCount / limitNum),
          total_books: totalCount,
          books_per_page: limitNum,
          has_next: pageNum < Math.ceil(totalCount / limitNum),
          has_prev: pageNum > 1
        }
      }
    });

  } catch (error) {
    console.error('Get My Books list error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error while retrieving My Books.',
      error: {
        code: 'SERVER_ERROR',
        details: error.message
      }
    });
  }
});

// 3. Remove Book from My Books
// POST /api/clients/:clientId/mobile/mybooks/remove
router.post('/remove', async (req, res) => {
  try {
    const { book_id } = req.body;
    const userId = req.user.id;
    const clientId = req.user.clientId;

    // Validate required fields
    if (!book_id) {
      return res.status(400).json({
        success: false,
        message: 'Missing required parameters.',
        error: {
          code: 'MISSING_PARAMETERS',
          details: 'book_id is required'
        }
      });
    }

    // Validate book_id format
    if (!book_id.match(/^[0-9a-fA-F]{24}$/)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid book ID format.',
        error: {
          code: 'INVALID_BOOK_ID',
          details: 'book_id must be a valid MongoDB ObjectId'
        }
      });
    }

    // Find and remove the book from My Books
    const removedMyBook = await MyBook.findOneAndDelete({
      userId: userId,
      bookId: book_id
    }).populate({
      path: 'bookId',
      select: 'title author coverImage'
    });

    if (!removedMyBook) {
      return res.status(404).json({
        success: false,
        message: 'Book not found in your My Books list.',
        error: {
          code: 'BOOK_NOT_IN_MYBOOKS',
          details: `Book with ID ${book_id} is not in your My Books collection`
        }
      });
    }

    // Update the book's isAddedToMyBooks field to false
    await Book.findByIdAndUpdate(book_id, {
      $set: { isAddedToMyBooks: false }
    });

    console.log(`Book ${book_id} removed from My Books for user ${userId}`);

    res.status(200).json({
      success: true,
      message: 'Book removed successfully from My Books.',
      data: {
        removedBookId: book_id,
        title: removedMyBook.bookId?.title || 'Unknown',
        author: removedMyBook.bookId?.author || 'Unknown',
        removedAt: new Date(),
        isAddedToMyBooks: false
      }
    });

  } catch (error) {
    console.error('Remove from My Books error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error while removing book from My Books.',
      error: {
        code: 'SERVER_ERROR',
        details: error.message
      }
    });
  }
});

// 4. Check if book is in My Books (Utility endpoint)
// GET /api/clients/:clientId/mobile/mybooks/check/:bookId
router.get('/check/:bookId', async (req, res) => {
  try {
    const { bookId } = req.params;
    const userId = req.user.id;

    if (!bookId.match(/^[0-9a-fA-F]{24}$/)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid book ID format.',
        error: {
          code: 'INVALID_BOOK_ID',
          details: 'bookId must be a valid MongoDB ObjectId'
        }
      });
    }

    const isSaved = await MyBook.isBookSavedByUser(userId, bookId);

    res.status(200).json({
      success: true,
      data: {
        book_id: bookId,
        is_saved: isSaved
      }
    });

  } catch (error) {
    console.error('Check My Books status error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error while checking book status.',
      error: {
        code: 'SERVER_ERROR',
        details: error.message
      }
    });
  }
});

// 5. Update personal note for a saved book
// POST /api/clients/:clientId/mobile/mybooks/note
router.post('/note', async (req, res) => {
  try {
    const { book_id, personal_note } = req.body;
    const userId = req.user.id;

    if (!book_id) {
      return res.status(400).json({
        success: false,
        message: 'Missing required parameters.',
        error: {
          code: 'MISSING_PARAMETERS',
          details: 'book_id is required'
        }
      });
    }

    const myBook = await MyBook.findOne({
      userId: userId,
      bookId: book_id
    });

    if (!myBook) {
      return res.status(404).json({
        success: false,
        message: 'Book not found in your My Books list.',
        error: {
          code: 'BOOK_NOT_IN_MYBOOKS',
          details: 'You can only add notes to books in your My Books collection'
        }
      });
    }

    await myBook.updatePersonalNote(personal_note || '');

    res.status(200).json({
      success: true,
      message: 'Personal note updated successfully.',
      data: {
        book_id: book_id,
        personal_note: myBook.personalNote,
        updated_at: myBook.updatedAt
      }
    });

  } catch (error) {
    console.error('Update personal note error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error while updating personal note.',
      error: {
        code: 'SERVER_ERROR',
        details: error.message
      }
    });
  }
});

// 6. Get My Books statistics
// GET /api/clients/:clientId/mobile/mybooks/stats
router.get('/stats', async (req, res) => {
  try {
    const userId = req.user.id;
    const clientId = req.user.clientId;

    const totalBooks = await MyBook.countDocuments({ userId, clientId });
    
    // Get category-wise distribution
    const myBooks = await MyBook.find({ userId, clientId })
      .populate({
        path: 'bookId',
        select: 'mainCategory subCategory exam'
      });

    const categoryStats = {};
    const examStats = {};
    
    myBooks.forEach(myBook => {
      if (myBook.bookId) {
        // Category stats
        const category = myBook.bookId.mainCategory;
        categoryStats[category] = (categoryStats[category] || 0) + 1;
        
        // Exam stats
        if (myBook.bookId.exam) {
          const exam = myBook.bookId.exam;
          examStats[exam] = (examStats[exam] || 0) + 1;
        }
      }
    });

    // Recent additions (last 7 days)
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const recentAdditions = await MyBook.countDocuments({
      userId,
      clientId,
      addedAt: { $gte: sevenDaysAgo }
    });

    res.status(200).json({
      success: true,
      data: {
        total_books: totalBooks,
        recent_additions: recentAdditions,
        category_distribution: categoryStats,
        exam_distribution: examStats,
        last_updated: new Date()
      }
    });

  } catch (error) {
    console.error('Get My Books stats error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error while retrieving statistics.',
      error: {
        code: 'SERVER_ERROR',
        details: error.message
      }
    });
  }
});

module.exports = router;
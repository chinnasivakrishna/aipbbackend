// routes/mainBookstore.js - Main Bookstore APIs for Homepage and Book Details
const express = require('express');
const router = express.Router();
const Book = require('../models/Book');
const Chapter = require('../models/Chapter');
const Topic = require('../models/Topic');
const { checkClientAccess, authenticateMobileUser } = require('../middleware/mobileAuth');

// 1. HOME PAGE API
// Endpoint: /api/clients/:clientId/homepage
// Method: GET (to fetch homepage content) or POST (to update homepage content)

// GET Homepage Content
router.get('/', async (req, res) => {
  try {
    // Use req.clientId (set by middleware) or fallback to req.params.clientId
    const clientId = req.clientId || req.params.clientId;
    const { limit = 10, category, sub_category } = req.query;

    console.log('Fetching homepage content for client:', clientId);

    // Build filter for homepage content
    const filter = { clientId };
    if (category) filter.mainCategory = category;
    if (sub_category) filter.subCategory = sub_category;

    // Get highlighted books
    const highlightedBooks = await Book.find({
      ...filter,
      isHighlighted: true
    })
    .populate('user', 'name email userId')
    .populate('highlightedBy', 'name email userId')
    .sort({ highlightOrder: 1, highlightedAt: -1 })
    .limit(parseInt(limit));

    // Get trending books
    const now = new Date();
    const trendingBooks = await Book.find({
      ...filter,
      isTrending: true,
      trendingStartDate: { $lte: now },
      $or: [
        { trendingEndDate: { $gte: now } },
        { trendingEndDate: null }
      ]
    })
    .populate('user', 'name email userId')
    .populate('trendingBy', 'name email userId')
    .sort({ trendingScore: -1, viewCount: -1 })
    .limit(parseInt(limit));

    // Get recent books (general content)
    const recentBooks = await Book.find(filter)
      .populate('user', 'name email userId')
      .sort({ createdAt: -1 })
      .limit(parseInt(limit));

    // Get all available books
    const allBooks = await Book.find(filter)
      .populate('user', 'name email userId')
      .sort({ createdAt: -1 });

    // Format response for homepage
    const formatBookForHomepage = (book) => ({
      book_id: book._id.toString(),
      title: book.title,
      category: book.mainCategory,
      sub_category: book.effectiveSubCategory,
      image: book.coverImage || '',
      image_url: book.coverImageUrl || '',
      highlight: book.isHighlighted,
      trending: book.isCurrentlyTrending,
      author: book.author,
      publisher: book.publisher,
      description: book.description,
      rating: book.rating,
      viewCount: book.viewCount,
      exam_name: book.exam || '',
      paper_name: book.paper || '',
      subject_name: book.subject || ''
    });

    // Group books by category and subcategory
    const booksByCategory = {};
    allBooks.forEach(book => {
      const category = book.mainCategory;
      const subCategory = book.effectiveSubCategory;
      
      if (!booksByCategory[category]) {
        booksByCategory[category] = {};
      }
      if (!booksByCategory[category][subCategory]) {
        booksByCategory[category][subCategory] = [];
      }
      booksByCategory[category][subCategory].push(formatBookForHomepage(book));
    });

    // Get categories with their books
    const categories = await getAvailableCategories(clientId);
    const categoriesWithBooks = categories.map(cat => ({
      category: cat.category,
      sub_categories: cat.sub_categories.map(sub => ({
        name: sub.name,
        count: sub.count,
        books: booksByCategory[cat.category]?.[sub.name] || []
      })),
      total_books: cat.total_books
    }));

    const homepageContent = {
      success: true,
      data: {
        highlighted: highlightedBooks.map(formatBookForHomepage),
        trending: trendingBooks.map(formatBookForHomepage),
        recent: recentBooks.map(formatBookForHomepage),
        categories: categoriesWithBooks,
        totalBooks: await Book.countDocuments({ clientId })
      },
      meta: {
        clientId,
        timestamp: new Date().toISOString(),
        filters_applied: { category, sub_category }
      }
    };

    res.status(200).json(homepageContent);

  } catch (error) {
    console.error('Homepage API error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error while fetching homepage content',
      error: {
        code: 'HOMEPAGE_ERROR',
        details: error.message
      }
    });
  }
});

// POST Homepage Content (Update highlight/trending status)
router.post('/', authenticateMobileUser, async (req, res) => {
  try {
    // Use req.clientId (set by middleware) or fallback to req.params.clientId
    const clientId = req.clientId || req.params.clientId;
    const { 
      book_id, 
      title, 
      category, 
      sub_category, 
      image, 
      highlight, 
      trending,
      highlight_order,
      trending_score,
      trending_end_date
    } = req.body;

    console.log('Updating homepage content for client:', clientId);

    // Validate required fields
    if (!book_id) {
      return res.status(400).json({
        success: false,
        message: 'book_id is required',
        error: {
          code: 'MISSING_BOOK_ID',
          details: 'book_id parameter is required for homepage updates'
        }
      });
    }

    // Find the book
    const book = await Book.findOne({ _id: book_id, clientId });
    if (!book) {
      return res.status(404).json({
        success: false,
        message: 'Book not found',
        error: {
          code: 'BOOK_NOT_FOUND',
          details: `Book with ID ${book_id} not found for client ${clientId}`
        }
      });
    }

    // Update book properties if provided
    if (title) book.title = title;
    if (category) book.mainCategory = category;
    if (sub_category) book.subCategory = sub_category;
    if (image) book.coverImage = image;

    // Handle highlight status - Updated to handle true/false
    if (highlight !== undefined) {
      const shouldHighlight = highlight === true || highlight === 'true';
      if (shouldHighlight !== book.isHighlighted) {
        await book.toggleHighlight(
          req.user.id, 
          'MobileUser', 
          '', 
          highlight_order || 0
        );
      } else if (shouldHighlight && highlight_order !== undefined) {
        book.highlightOrder = highlight_order;
      }
    }

    // Handle trending status - Updated to handle true/false
    if (trending !== undefined) {
      const shouldTrend = trending === true || trending === 'true';
      if (shouldTrend !== book.isTrending) {
        const endDate = trending_end_date ? new Date(trending_end_date) : null;
        await book.toggleTrending(
          req.user.id, 
          'MobileUser', 
          trending_score || 0, 
          endDate
        );
      } else if (shouldTrend && trending_score !== undefined) {
        book.trendingScore = trending_score;
      }
    }

    await book.save();

    res.status(200).json({
      success: true,
      message: 'Homepage content updated successfully',
      data: {
        book_id: book._id.toString(),
        title: book.title,
        category: book.mainCategory,
        sub_category: book.effectiveSubCategory,
        image: book.coverImage,
        highlight: book.isHighlighted, // Changed from 'yes'/'no' to true/false
        trending: book.isCurrentlyTrending // Changed from 'yes'/'no' to true/false
      }
    });

  } catch (error) {
    console.error('Homepage update error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error while updating homepage content',
      error: {
        code: 'HOMEPAGE_UPDATE_ERROR',
        details: error.message
      }
    });
  }
});

// 2. BOOK DETAILS API
// Endpoint: /api/clients/:clientId/book/details
// Method: GET

router.get('/book/details', async (req, res) => {
  try {
    // FIXED: Use req.clientId (set by middleware) or fallback to req.params.clientId
    const clientId = req.clientId || req.params.clientId;
    const { book_id } = req.query;
    
    console.log('Fetching book details for:', { clientId, book_id });
    console.log('req.params:', req.params);
    console.log('req.clientId:', req.clientId);

    // Validate that we have a clientId
    if (!clientId) {
      return res.status(400).json({
        success: false,
        message: 'Client ID is required',
        error: {
          code: 'MISSING_CLIENT_ID',
          details: 'Client ID not found in request parameters or middleware'
        }
      });
    }

    // Validate required parameter
    if (!book_id) {
      return res.status(400).json({
        success: false,
        message: 'book_id parameter is required',
        error: {
          code: 'MISSING_BOOK_ID',
          details: 'book_id query parameter is required'
        }
      });
    }

    // Find the book with populated user info
    const book = await Book.findOne({ _id: book_id, clientId })
      .populate('user', 'name email userId');

    if (!book) {
      return res.status(404).json({
        success: false,
        message: 'Book not found',
        error: {
          code: 'BOOK_NOT_FOUND',
          details: `Book with ID ${book_id} not found for client ${clientId}`
        }
      });
    }

    // Get book's chapters and topics to build index
    const chapters = await Chapter.find({ 
      book: book._id,
      parentType: 'book'
    }).sort({ order: 1, createdAt: 1 });

    const bookIndex = [];
    for (const chapter of chapters) {
      const topics = await Topic.find({ chapter: chapter._id })
        .sort({ order: 1, createdAt: 1 })
        .select('title');
      
      bookIndex.push({
        chapter_name: chapter.title,
        topics: topics.map(topic => topic.title)
      });
    }

    // Increment view count
    await book.incrementView();

    // Build the response according to the specified format
    const bookDetails = {
      success: true,
      data: {
        book_id: book._id.toString(),
        title: book.title,
        author: book.author,
        publisher: book.publisher,
        description: book.description,
        category: book.mainCategory,
        sub_category: book.effectiveSubCategory,
        tag: book.tags ? book.tags.join(', ') : '',
        highlight: book.isHighlighted, // Changed from 'yes'/'no' to true/false
        trending: book.isCurrentlyTrending, // Changed from 'yes'/'no' to true/false
        cover_image: book.coverImage || '',
        cover_image_url: book.coverImageUrl || '',
        index: bookIndex,
        exam_name: book.exam || '',
        paper_name: book.paper || '',
        subject_name: book.subject || '',
        // Additional useful information
        language: book.language,
        rating: book.rating,
        rating_count: book.ratingCount,
        view_count: book.viewCount,
        created_at: book.createdAt,
        updated_at: book.updatedAt
      },
      meta: {
        clientId,
        total_chapters: chapters.length,
        total_topics: bookIndex.reduce((sum, chapter) => sum + chapter.topics.length, 0),
        timestamp: new Date().toISOString()
      }
    };

    res.status(200).json(bookDetails);

  } catch (error) {
    console.error('Book details API error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error while fetching book details',
      error: {
        code: 'BOOK_DETAILS_ERROR',
        details: error.message
      }
    });
  }
});

// Helper function to get available categories for a client
async function getAvailableCategories(clientId) {
  try {
    const categories = await Book.aggregate([
      { $match: { clientId } },
      {
        $group: {
          _id: {
            mainCategory: '$mainCategory',
            subCategory: '$subCategory'
          },
          count: { $sum: 1 }
        }
      },
      {
        $group: {
          _id: '$_id.mainCategory',
          subCategories: {
            $push: {
              name: '$_id.subCategory',
              count: '$count'
            }
          },
          totalCount: { $sum: '$count' }
        }
      },
      { $sort: { totalCount: -1 } }, // Sort by total count in descending order
      { $limit: 5 } // Limit to top 5 categories
    ]);

    return categories.map(cat => ({
      category: cat._id,
      sub_categories: cat.subCategories,
      total_books: cat.totalCount
    }));
  } catch (error) {
    console.error('Error fetching categories:', error);
    return [];
  }
}

// Export router
module.exports = router;
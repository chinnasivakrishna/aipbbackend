const express = require('express');
const router = express.Router();
const Book = require('../models/Book');
const Chapter = require('../models/Chapter');

/**
 * @route   GET /api/book-chapters/:bookId
 * @desc    Get book and its chapters by bookId for QR code scanning (public endpoint)
 * @access  Public
 */
router.get('/:bookId', async (req, res) => {
  try {
    const { bookId } = req.params;
    
    // Validate bookId
    if (!bookId.match(/^[0-9a-fA-F]{24}$/)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid book ID format'
      });
    }

    // Fetch book details
    const book = await Book.findById(bookId)
      .select('title description coverImage createdAt');
    
    if (!book) {
      return res.status(404).json({
        success: false,
        message: 'Book not found'
      });
    }

    // Fetch chapters for the book
    const chapters = await Chapter.find({ book: bookId })
      .select('title description order createdAt')
      .sort('order');

    return res.status(200).json({
      success: true,
      book,
      chapters
    });
  } catch (err) {
    console.error('Error in QR code book-chapters view:', err);
    return res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
});

module.exports = router;
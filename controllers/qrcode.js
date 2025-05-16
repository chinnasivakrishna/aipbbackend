const Book = require('../models/Book');
const Chapter = require('../models/Chapter');

// Controller for QR code functionality

// Get book and its chapters by book ID (public endpoint)
exports.getBookWithChapters = async (req, res) => {
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
    console.error('Error in QR code book view:', err);
    return res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
};

// Get just the book details by ID (public endpoint)
exports.getBookDetails = async (req, res) => {
  try {
    const { bookId } = req.params;
    
    // Validate bookId
    if (!bookId.match(/^[0-9a-fA-F]{24}$/)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid book ID format'
      });
    }

    const book = await Book.findById(bookId)
      .select('title description coverImage createdAt');
    
    if (!book) {
      return res.status(404).json({
        success: false,
        message: 'Book not found'
      });
    }

    return res.status(200).json({
      success: true,
      book
    });
  } catch (err) {
    console.error('Error fetching book details:', err);
    return res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
};

// Get just the chapters by book ID (public endpoint)
exports.getBookChapters = async (req, res) => {
  try {
    const { bookId } = req.params;
    
    // Validate bookId
    if (!bookId.match(/^[0-9a-fA-F]{24}$/)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid book ID format'
      });
    }

    // Check if book exists
    const bookExists = await Book.exists({ _id: bookId });
    
    if (!bookExists) {
      return res.status(404).json({
        success: false,
        message: 'Book not found'
      });
    }

    const chapters = await Chapter.find({ book: bookId })
      .select('title description order createdAt')
      .sort('order');

    return res.status(200).json({
      success: true,
      chapters
    });
  } catch (err) {
    console.error('Error fetching book chapters:', err);
    return res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
};
const Chapter = require('../models/Chapter');
const Book = require('../models/Book');
const Topic = require('../models/Topic');

// @desc    Get all chapters for a book
// @route   GET /api/books/:bookId/chapters
// @access  Private
exports.getChapters = async (req, res) => {
  try {
    const book = await Book.findById(req.params.bookId);
    
    if (!book) {
      return res.status(404).json({
        success: false,
        message: 'Book not found'
      });
    }
    
    // Check if book belongs to user
    if (book.user.toString() !== req.user.id) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to access this book'
      });
    }
    
    const chapters = await Chapter.find({ book: req.params.bookId }).sort('order');
    
    return res.status(200).json({
      success: true,
      count: chapters.length,
      chapters
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({
      success: false,
      message: 'Server Error'
    });
  }
};

// @desc    Get single chapter
// @route   GET /api/books/:bookId/chapters/:id
// @access  Private
exports.getChapter = async (req, res) => {
  try {
    const book = await Book.findById(req.params.bookId);
    
    if (!book) {
      return res.status(404).json({
        success: false,
        message: 'Book not found'
      });
    }
    
    // Check if book belongs to user
    if (book.user.toString() !== req.user.id) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to access this book'
      });
    }
    
    const chapter = await Chapter.findOne({ 
      _id: req.params.id,
      book: req.params.bookId
    });
    
    if (!chapter) {
      return res.status(404).json({
        success: false,
        message: 'Chapter not found'
      });
    }
    
    return res.status(200).json({
      success: true,
      chapter
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({
      success: false,
      message: 'Server Error'
    });
  }
};

// @desc    Create new chapter
// @route   POST /api/books/:bookId/chapters
// @access  Private
exports.createChapter = async (req, res) => {
  try {
    const book = await Book.findById(req.params.bookId);
    
    if (!book) {
      return res.status(404).json({
        success: false,
        message: 'Book not found'
      });
    }
    
    // Check if book belongs to user
    if (book.user.toString() !== req.user.id) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to access this book'
      });
    }
    
    const { title, description, order, parentType } = req.body;
    
    // Get the current maximum order value
    let maxOrder = 0;
    if (!order) {
      const lastChapter = await Chapter.findOne({ book: req.params.bookId })
        .sort('-order')
        .limit(1);
      
      if (lastChapter) {
        maxOrder = lastChapter.order + 1;
      }
    }
    
    // Create chapter
    const chapter = await Chapter.create({
      title,
      description,
      book: req.params.bookId,
      parentType: parentType || 'book', // Set default to 'book' if not provided
      order: order || maxOrder
    });
    
    return res.status(201).json({
      success: true,
      chapter
    });
  } catch (error) {
    console.error(error);
    if (error.name === 'ValidationError') {
      const messages = Object.values(error.errors).map(val => val.message);
      return res.status(400).json({
        success: false,
        message: messages
      });
    } else {
      return res.status(500).json({
        success: false,
        message: 'Server Error'
      });
    }
  }
};

// @desc    Update chapter
// @route   PUT /api/books/:bookId/chapters/:id
// @access  Private
exports.updateChapter = async (req, res) => {
  try {
    const book = await Book.findById(req.params.bookId);
    
    if (!book) {
      return res.status(404).json({
        success: false,
        message: 'Book not found'
      });
    }
    
    // Check if book belongs to user
    if (book.user.toString() !== req.user.id) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to access this book'
      });
    }
    
    let chapter = await Chapter.findOne({
      _id: req.params.id,
      book: req.params.bookId
    });
    
    if (!chapter) {
      return res.status(404).json({
        success: false,
        message: 'Chapter not found'
      });
    }
    
    // Update fields
    chapter = await Chapter.findByIdAndUpdate(req.params.id, req.body, {
      new: true,
      runValidators: true
    });
    
    return res.status(200).json({
      success: true,
      chapter
    });
  } catch (error) {
    console.error(error);
    if (error.name === 'ValidationError') {
      const messages = Object.values(error.errors).map(val => val.message);
      return res.status(400).json({
        success: false,
        message: messages
      });
    } else {
      return res.status(500).json({
        success: false,
        message: 'Server Error'
      });
    }
  }
};

// @desc    Delete chapter
// @route   DELETE /api/books/:bookId/chapters/:id
// @access  Private
exports.deleteChapter = async (req, res) => {
  try {
    const book = await Book.findById(req.params.bookId);
    
    if (!book) {
      return res.status(404).json({
        success: false,
        message: 'Book not found'
      });
    }
    
    // Check if book belongs to user
    if (book.user.toString() !== req.user.id) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to access this book'
      });
    }
    
    const chapter = await Chapter.findOne({
      _id: req.params.id,
      book: req.params.bookId
    });
    
    if (!chapter) {
      return res.status(404).json({
        success: false,
        message: 'Chapter not found'
      });
    }
    
    // Delete all topics in the chapter
    await Topic.deleteMany({ chapter: chapter._id });
    
    // Delete the chapter
    await Chapter.deleteOne({ _id: req.params.id });
    
    return res.status(200).json({
      success: true,
      message: 'Chapter deleted successfully'
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({
      success: false,
      message: 'Server Error'
    });
  }
};
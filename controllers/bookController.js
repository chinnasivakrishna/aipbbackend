// controllers/bookController.js - Updated to properly handle userId
const Book = require('../models/Book');
const Chapter = require('../models/Chapter');
const Topic = require('../models/Topic');
const SubTopic = require('../models/SubTopic');
const User = require('../models/User');
const path = require('path');
const fs = require('fs');
const multer = require('multer');

// Configure multer storage
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = 'uploads/covers';
    
    // Create directory if it doesn't exist
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    // Create unique filename with timestamp and original extension
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const ext = path.extname(file.originalname);
    cb(null, `cover-${uniqueSuffix}${ext}`);
  }
});

// File filter
const fileFilter = (req, file, cb) => {
  // Accept only image files
  if (file.mimetype.startsWith('image/')) {
    cb(null, true);
  } else {
    cb(new Error('Not an image! Please upload only images.'), false);
  }
};

// Initialize upload
const upload = multer({
  storage: storage,
  limits: {
    fileSize: 5 * 1024 * 1024 // 5MB max size
  },
  fileFilter: fileFilter
});

// Multer upload middleware
exports.uploadCoverImage = upload.single('coverImage');

// @desc    Get all books
// @route   GET /api/books
// @access  Private
exports.getBooks = async (req, res) => {
  try {
    // Get the current user to check their role and get userId
    const currentUser = await User.findById(req.user.id);
    if (!currentUser) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    let books;
    
    // If user is a client, get books by their userId
    // If user is a regular user, get books by user ID
    if (currentUser.role === 'client' && currentUser.userId) {
      // For clients, get books by clientId (which stores their userId)
      books = await Book.find({ clientId: currentUser.userId })
        .populate('user', 'name email userId')
        .sort({ createdAt: -1 });
    } else {
      // For regular users, get books they created
      books = await Book.find({ user: req.user.id })
        .populate('user', 'name email userId')
        .sort({ createdAt: -1 });
    }
    
    // Add user information to each book
    const booksWithUserInfo = books.map(book => {
      const bookObj = book.toObject();
      return {
        ...bookObj,
        createdBy: book.user ? {
          id: book.user._id,
          name: book.user.name,
          email: book.user.email,
          userId: book.user.userId || book.user._id.toString()
        } : null
      };
    });
    
    return res.status(200).json({
      success: true,
      count: books.length,
      books: booksWithUserInfo,
      currentUser: {
        id: currentUser._id,
        name: currentUser.name,
        email: currentUser.email,
        role: currentUser.role,
        userId: currentUser.userId || currentUser._id.toString()
      }
    });
  } catch (error) {
    console.error('Get books error:', error);
    return res.status(500).json({
      success: false,
      message: 'Server Error'
    });
  }
};

// @desc    Get single book
// @route   GET /api/books/:id
// @access  Private
exports.getBook = async (req, res) => {
  try {
    const book = await Book.findById(req.params.id).populate('user', 'name email userId');
    
    if (!book) {
      return res.status(404).json({
        success: false,
        message: 'Book not found'
      });
    }
    
    // Get current user to check access
    const currentUser = await User.findById(req.user.id);
    if (!currentUser) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }
    
    // Check access permissions
    let hasAccess = false;
    
    if (currentUser.role === 'client' && currentUser.userId) {
      // Client can access books with their clientId
      hasAccess = book.clientId === currentUser.userId;
    } else {
      // Regular user can access their own books
      hasAccess = book.user._id.toString() === req.user.id;
    }
    
    // Also allow access if book is public
    if (!hasAccess && book.isPublic) {
      hasAccess = true;
    }
    
    if (!hasAccess) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to access this book'
      });
    }
    
    // Add user information to book
    const bookWithUserInfo = {
      ...book.toObject(),
      createdBy: book.user ? {
        id: book.user._id,
        name: book.user.name,
        email: book.user.email,
        userId: book.user.userId || book.user._id.toString()
      } : null
    };
    
    return res.status(200).json({
      success: true,
      book: bookWithUserInfo
    });
  } catch (error) {
    console.error('Get book error:', error);
    return res.status(500).json({
      success: false,
      message: 'Server Error'
    });
  }
};

// @desc    Create new book
// @route   POST /api/books
// @access  Private
exports.createBook = async (req, res) => {
  try {
    const { 
      title, 
      description, 
      author, 
      publisher, 
      language, 
      mainCategory, 
      subCategory, 
      customSubCategory,
      tags,
      clientId, // This can be passed from frontend
      isPublic 
    } = req.body;
    
    // Get the current user to extract userId
    const currentUser = await User.findById(req.user.id);
    if (!currentUser) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }
    
    // Parse tags if it's a JSON string from FormData
    let parsedTags = [];
    if (tags) {
      try {
        parsedTags = typeof tags === 'string' ? JSON.parse(tags) : tags;
      } catch (e) {
        // If JSON parsing fails, treat as comma-separated string
        parsedTags = tags.split(',').map(tag => tag.trim()).filter(tag => tag.length > 0);
      }
    }
    
    // Determine the clientId to use
    let effectiveClientId;
    
    if (currentUser.role === 'client' && currentUser.userId) {
      // For clients, use their userId as clientId
      effectiveClientId = currentUser.userId;
    } else if (clientId && clientId.trim()) {
      // Use provided clientId if available
      effectiveClientId = clientId.trim();
    } else {
      // Fallback to user's _id as string
      effectiveClientId = currentUser._id.toString();
    }
    
    // Prepare book data with all required fields
    const bookData = {
      title: title.trim(),
      description: description.trim(),
      author: author.trim(),
      publisher: publisher.trim(),
      language: language || 'English',
      mainCategory: mainCategory || 'Other',
      subCategory: subCategory || 'Other',
      clientId: effectiveClientId,
      user: req.user.id,
      userType: 'User', // Assuming web users are 'User' type
      isPublic: isPublic === 'true' || isPublic === true || false,
      tags: parsedTags
    };
    
    // Add customSubCategory only if subCategory is 'Other' and customSubCategory is provided
    if (subCategory === 'Other' && customSubCategory && customSubCategory.trim()) {
      bookData.customSubCategory = customSubCategory.trim();
    }
    
    // If a file was uploaded, add the path to bookData
    if (req.file) {
      bookData.coverImage = req.file.path;
    }
    
    // Create book
    const book = await Book.create(bookData);
    
    // Populate user information
    await book.populate('user', 'name email userId');
    
    // Add user information to response
    const bookWithUserInfo = {
      ...book.toObject(),
      createdBy: book.user ? {
        id: book.user._id,
        name: book.user.name,
        email: book.user.email,
        userId: book.user.userId || book.user._id.toString()
      } : null
    };
    
    return res.status(201).json({
      success: true,
      book: bookWithUserInfo,
      message: 'Book created successfully'
    });
  } catch (error) {
    // If there was an error and a file was uploaded, remove it
    if (req.file) {
      fs.unlink(req.file.path, err => {
        if (err) console.error('Error deleting file:', err);
      });
    }
    
    console.error('Create book error:', error);
    
    if (error.name === 'ValidationError') {
      const messages = Object.values(error.errors).map(val => val.message);
      return res.status(400).json({
        success: false,
        message: messages
      });
    } else if (error.code === 11000) {
      // Handle duplicate key error
      return res.status(400).json({
        success: false,
        message: 'A book with this title already exists for this user'
      });
    } else {
      return res.status(500).json({
        success: false,
        message: 'Server Error'
      });
    }
  }
};

// @desc    Update book
// @route   PUT /api/books/:id
// @access  Private
exports.updateBook = async (req, res) => {
  try {
    let book = await Book.findById(req.params.id).populate('user', 'name email userId');
    
    if (!book) {
      return res.status(404).json({
        success: false,
        message: 'Book not found'
      });
    }
    
    // Get current user to check permissions
    const currentUser = await User.findById(req.user.id);
    if (!currentUser) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }
    
    // Check permissions
    let canUpdate = false;
    
    if (currentUser.role === 'client' && currentUser.userId) {
      // Client can update books with their clientId
      canUpdate = book.clientId === currentUser.userId;
    } else {
      // Regular user can update their own books
      canUpdate = book.user._id.toString() === req.user.id;
    }
    
    if (!canUpdate) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to update this book'
      });
    }
    
    // Prepare update data
    const updateData = { ...req.body };
    
    // Parse tags if it's a JSON string from FormData
    if (updateData.tags) {
      try {
        updateData.tags = typeof updateData.tags === 'string' ? JSON.parse(updateData.tags) : updateData.tags;
      } catch (e) {
        // If JSON parsing fails, treat as comma-separated string
        updateData.tags = updateData.tags.split(',').map(tag => tag.trim()).filter(tag => tag.length > 0);
      }
    }
    
    // If a new cover image was uploaded
    if (req.file) {
      // Delete the old image if it exists
      if (book.coverImage && fs.existsSync(book.coverImage)) {
        fs.unlinkSync(book.coverImage);
      }
      
      // Add new image path
      updateData.coverImage = req.file.path;
    }
    
    // Update fields
    book = await Book.findByIdAndUpdate(req.params.id, updateData, {
      new: true,
      runValidators: true
    }).populate('user', 'name email userId');
    
    // Add user information to response
    const bookWithUserInfo = {
      ...book.toObject(),
      createdBy: book.user ? {
        id: book.user._id,
        name: book.user.name,
        email: book.user.email,
        userId: book.user.userId || book.user._id.toString()
      } : null
    };
    
    return res.status(200).json({
      success: true,
      book: bookWithUserInfo
    });
  } catch (error) {
    // If there was an error and a file was uploaded, remove it
    if (req.file) {
      fs.unlink(req.file.path, err => {
        if (err) console.error('Error deleting file:', err);
      });
    }
    
    console.error('Update book error:', error);
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

// @desc    Delete book
// @route   DELETE /api/books/:id
// @access  Private
exports.deleteBook = async (req, res) => {
  try {
    const book = await Book.findById(req.params.id);
    
    if (!book) {
      return res.status(404).json({
        success: false,
        message: 'Book not found'
      });
    }
    
    // Get current user to check permissions
    const currentUser = await User.findById(req.user.id);
    if (!currentUser) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }
    
    // Check permissions
    let canDelete = false;
    
    if (currentUser.role === 'client' && currentUser.userId) {
      // Client can delete books with their clientId
      canDelete = book.clientId === currentUser.userId;
    } else {
      // Regular user can delete their own books
      canDelete = book.user.toString() === req.user.id;
    }
    
    if (!canDelete) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to delete this book'
      });
    }
    
    // Delete the cover image if it exists
    if (book.coverImage && fs.existsSync(book.coverImage)) {
      fs.unlinkSync(book.coverImage);
    }
    
    // Delete all related chapters, topics, and subtopics
    const chapters = await Chapter.find({ book: req.params.id });
    
    // Delete all topics and subtopics in each chapter
    for (const chapter of chapters) {
      const topics = await Topic.find({ chapter: chapter._id });
      
      // Delete subtopics for each topic
      for (const topic of topics) {
        await SubTopic.deleteMany({ topic: topic._id });
      }
      
      // Delete topics
      await Topic.deleteMany({ chapter: chapter._id });
    }
    
    // Delete all chapters
    await Chapter.deleteMany({ book: req.params.id });
    
    // Delete the book
    await Book.deleteOne({ _id: req.params.id });
    
    return res.status(200).json({
      success: true,
      message: 'Book deleted successfully'
    });
  } catch (error) {
    console.error('Delete book error:', error);
    return res.status(500).json({
      success: false,
      message: 'Server Error'
    });
  }
};

exports.getCurrentUser = async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select('-password');
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }
    res.status(200).json({ success: true, user });
  } catch (error) {
    console.error('Get user error:', error);
    res.status(500).json({ success: false, message: 'Server Error' });
  }
};
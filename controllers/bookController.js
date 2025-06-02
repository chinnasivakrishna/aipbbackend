const Book = require('../models/Book');
const Chapter = require('../models/Chapter');
const Topic = require('../models/Topic');
const SubTopic = require('../models/SubTopic');
const User = require('../models/User');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = 'uploads/covers';
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const ext = path.extname(file.originalname);
    cb(null, `cover-${uniqueSuffix}${ext}`);
  }
});
const fileFilter = (req, file, cb) => {
  if (file.mimetype.startsWith('image/')) {
    cb(null, true);
  } else {
    cb(new Error('Not an image! Please upload only images.'), false);
  }
};
const upload = multer({
  storage: storage,
  limits: {
    fileSize: 5 * 1024 * 1024 // 5MB max size
  },
  fileFilter: fileFilter
});
exports.uploadCoverImage = upload.single('coverImage');
exports.getBooks = async (req, res) => {
  try {
    const currentUser = await User.findById(req.user.id);
    if (!currentUser) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }
    let books;
    if (currentUser.role === 'client' && currentUser.userId) {
      books = await Book.find({ clientId: currentUser.userId })
        .populate('user', 'name email userId')
        .populate('highlightedBy', 'name email userId')
        .sort({ createdAt: -1 });
    } else {
      books = await Book.find({ user: req.user.id })
        .populate('user', 'name email userId')
        .populate('highlightedBy', 'name email userId')
        .sort({ createdAt: -1 });
    }
    const booksWithUserInfo = books.map(book => {
      const bookObj = book.toObject();
      return {
        ...bookObj,
        createdBy: book.user ? {
          id: book.user._id,
          name: book.user.name,
          email: book.user.email,
          userId: book.user.userId || book.user._id.toString()
        } : null,
        highlightedByUser: book.highlightedBy ? {
          id: book.highlightedBy._id,
          name: book.highlightedBy.name,
          email: book.highlightedBy.email,
          userId: book.highlightedBy.userId || book.highlightedBy._id.toString()
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
exports.getHighlightedBooks = async (req, res) => {
  try {
    const currentUser = await User.findById(req.user.id);
    if (!currentUser) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }
    let clientId;
    if (currentUser.role === 'client' && currentUser.userId) {
      clientId = currentUser.userId;
    } else {
      clientId = currentUser._id.toString();
    }
    const highlightedBooks = await Book.getHighlightedBooks(clientId, req.query.limit ? parseInt(req.query.limit) : null);
    const booksWithUserInfo = highlightedBooks.map(book => {
      const bookObj = book.toObject();
      return {
        ...bookObj,
        createdBy: book.user ? {
          id: book.user._id,
          name: book.user.name,
          email: book.user.email,
          userId: book.user.userId || book.user._id.toString()
        } : null,
        highlightedByUser: book.highlightedBy ? {
          id: book.highlightedBy._id,
          name: book.highlightedBy.name,
          email: book.highlightedBy.email,
          userId: book.highlightedBy.userId || book.highlightedBy._id.toString()
        } : null
      };
    });
    return res.status(200).json({
      success: true,
      count: highlightedBooks.length,
      books: booksWithUserInfo
    });
  } catch (error) {
    console.error('Get highlighted books error:', error);
    return res.status(500).json({
      success: false,
      message: 'Server Error'
    });
  }
};
exports.addBookToHighlights = async (req, res) => {
  try {
    const { note, order } = req.body;
    const book = await Book.findById(req.params.id).populate('user', 'name email userId');
    if (!book) {
      return res.status(404).json({
        success: false,
        message: 'Book not found'
      });
    }
    const currentUser = await User.findById(req.user.id);
    if (!currentUser) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }
    let canHighlight = false;
    
    if (currentUser.role === 'client' && currentUser.userId) {
      canHighlight = book.clientId === currentUser.userId;
    } else {
      canHighlight = book.clientId === currentUser._id.toString() || book.user._id.toString() === req.user.id;
    }
    if (!canHighlight) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to highlight this book'
      });
    }
    if (book.isHighlighted) {
      return res.status(400).json({
        success: false,
        message: 'Book is already highlighted'
      });
    }
    if (order && order > 0) {
      let clientId = currentUser.role === 'client' && currentUser.userId ? 
                    currentUser.userId : 
                    currentUser._id.toString();
      
      const existingBookWithOrder = await Book.findOne({ 
        clientId: clientId, 
        isHighlighted: true, 
        highlightOrder: order,
        _id: { $ne: req.params.id }
      });
      if (existingBookWithOrder) {
        return res.status(400).json({
          success: false,
          message: `Highlight order ${order} is already taken by another book`
        });
      }
    }
    const userType = currentUser.role === 'client' ? 'User' : 'User'; // Adjust based on your user types
    await book.toggleHighlight(
      currentUser._id, 
      userType, 
      note || '', 
      order || 0
    );
    await book.populate('highlightedBy', 'name email userId');
    const bookWithUserInfo = {
      ...book.toObject(),
      createdBy: book.user ? {
        id: book.user._id,
        name: book.user.name,
        email: book.user.email,
        userId: book.user.userId || book.user._id.toString()
      } : null,
      highlightedByUser: book.highlightedBy ? {
        id: book.highlightedBy._id,
        name: book.highlightedBy.name,
        email: book.highlightedBy.email,
        userId: book.highlightedBy.userId || book.highlightedBy._id.toString()
      } : null
    };
    return res.status(200).json({
      success: true,
      message: 'Book added to highlights successfully',
      book: bookWithUserInfo
    });
  } catch (error) {
    console.error('Add book to highlights error:', error);
    return res.status(500).json({
      success: false,
      message: 'Server Error'
    });
  }
};
exports.removeBookFromHighlights = async (req, res) => {
  try {
    const book = await Book.findById(req.params.id).populate('user', 'name email userId');
    if (!book) {
      return res.status(404).json({
        success: false,
        message: 'Book not found'
      });
    }
    const currentUser = await User.findById(req.user.id);
    if (!currentUser) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }
    let canRemoveHighlight = false;
    if (currentUser.role === 'client' && currentUser.userId) {
      canRemoveHighlight = book.clientId === currentUser.userId;
    } else {
      canRemoveHighlight = book.clientId === currentUser._id.toString() || book.user._id.toString() === req.user.id;
    }
    if (!canRemoveHighlight) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to remove highlight from this book'
      });
    }
    if (!book.isHighlighted) {
      return res.status(400).json({
        success: false,
        message: 'Book is not highlighted'
      });
    }
    const userType = currentUser.role === 'client' ? 'User' : 'User'; // Adjust based on your user types
    await book.toggleHighlight(currentUser._id, userType);
    const bookWithUserInfo = {
      ...book.toObject(),
      createdBy: book.user ? {
        id: book.user._id,
        name: book.user.name,
        email: book.user.email,
        userId: book.user.userId || book.user._id.toString()
      } : null,
      highlightedByUser: null
    };
    return res.status(200).json({
      success: true,
      message: 'Book removed from highlights successfully',
      book: bookWithUserInfo
    });
  } catch (error) {
    console.error('Remove book from highlights error:', error);
    return res.status(500).json({
      success: false,
      message: 'Server Error'
    });
  }
};
exports.updateHighlightDetails = async (req, res) => {
  try {
    const { note, order } = req.body;
    const book = await Book.findById(req.params.id)
      .populate('user', 'name email userId')
      .populate('highlightedBy', 'name email userId');
    if (!book) {
      return res.status(404).json({
        success: false,
        message: 'Book not found'
      });
    }
    const currentUser = await User.findById(req.user.id);
    if (!currentUser) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }
    let canUpdate = false;
    if (currentUser.role === 'client' && currentUser.userId) {
      canUpdate = book.clientId === currentUser.userId;
    } else {
      canUpdate = book.clientId === currentUser._id.toString() || book.user._id.toString() === req.user.id;
    }
    if (!canUpdate) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to update highlight for this book'
      });
    }
    if (!book.isHighlighted) {
      return res.status(400).json({
        success: false,
        message: 'Book is not highlighted'
      });
    }
    if (order && order !== book.highlightOrder && order > 0) {
      let clientId = currentUser.role === 'client' && currentUser.userId ? 
                    currentUser.userId : 
                    currentUser._id.toString();
      
      const existingBookWithOrder = await Book.findOne({ 
        clientId: clientId, 
        isHighlighted: true, 
        highlightOrder: order,
        _id: { $ne: req.params.id }
      });
      
      if (existingBookWithOrder) {
        return res.status(400).json({
          success: false,
          message: `Highlight order ${order} is already taken by another book`
        });
      }
    }
    const updateData = {};
    if (note !== undefined) updateData.highlightNote = note;
    if (order !== undefined) updateData.highlightOrder = order;
    const updatedBook = await Book.findByIdAndUpdate(
      req.params.id,
      updateData,
      { new: true, runValidators: true }
    )
    .populate('user', 'name email userId')
    .populate('highlightedBy', 'name email userId');
    const bookWithUserInfo = {
      ...updatedBook.toObject(),
      createdBy: updatedBook.user ? {
        id: updatedBook.user._id,
        name: updatedBook.user.name,
        email: updatedBook.user.email,
        userId: updatedBook.user.userId || updatedBook.user._id.toString()
      } : null,
      highlightedByUser: updatedBook.highlightedBy ? {
        id: updatedBook.highlightedBy._id,
        name: updatedBook.highlightedBy.name,
        email: updatedBook.highlightedBy.email,
        userId: updatedBook.highlightedBy.userId || updatedBook.highlightedBy._id.toString()
      } : null
    };
    return res.status(200).json({
      success: true,
      message: 'Highlight details updated successfully',
      book: bookWithUserInfo
    });
  } catch (error) {
    console.error('Update highlight details error:', error);
    return res.status(500).json({
      success: false,
      message: 'Server Error'
    });
  }
};
exports.getBook = async (req, res) => {
  try {
    const book = await Book.findById(req.params.id)
      .populate('user', 'name email userId')
      .populate('highlightedBy', 'name email userId');
    if (!book) {
      return res.status(404).json({
        success: false,
        message: 'Book not found'
      });
    }
    const currentUser = await User.findById(req.user.id);
    if (!currentUser) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }
    let hasAccess = false;
    if (currentUser.role === 'client' && currentUser.userId) {
      hasAccess = book.clientId === currentUser.userId;
    } else {
      hasAccess = book.user._id.toString() === req.user.id;
    }
    if (!hasAccess && book.isPublic) {
      hasAccess = true;
    }
    if (!hasAccess) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to access this book'
      });
    }
    const bookWithUserInfo = {
      ...book.toObject(),
      createdBy: book.user ? {
        id: book.user._id,
        name: book.user.name,
        email: book.user.email,
        userId: book.user.userId || book.user._id.toString()
      } : null,
      highlightedByUser: book.highlightedBy ? {
        id: book.highlightedBy._id,
        name: book.highlightedBy.name,
        email: book.highlightedBy.email,
        userId: book.highlightedBy.userId || book.highlightedBy._id.toString()
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
    const currentUser = await User.findById(req.user.id);
    if (!currentUser) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }
    let parsedTags = [];
    if (tags) {
      try {
        parsedTags = typeof tags === 'string' ? JSON.parse(tags) : tags;
      } catch (e) {
        parsedTags = tags.split(',').map(tag => tag.trim()).filter(tag => tag.length > 0);
      }
    }
    let effectiveClientId;
    if (currentUser.role === 'client' && currentUser.userId) {
      effectiveClientId = currentUser.userId;
    } else if (clientId && clientId.trim()) {
      effectiveClientId = clientId.trim();
    } else {
      effectiveClientId = currentUser._id.toString();
    }
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
    if (subCategory === 'Other' && customSubCategory && customSubCategory.trim()) {
      bookData.customSubCategory = customSubCategory.trim();
    }
    if (req.file) {
      bookData.coverImage = req.file.path;
    }
    const book = await Book.create(bookData);
    await book.populate('user', 'name email userId');
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
    if (req.file) {
      fs.unlink(req.file.path, err => {
        if (err) console.error('Error deleting file:', err);
      });
    }
    if (error.name === 'ValidationError') {
      const messages = Object.values(error.errors).map(val => val.message);
      return res.status(400).json({
        success: false,
        message: messages
      });
    } else if (error.code === 11000) {
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
exports.updateBook = async (req, res) => {
  try {
    let book = await Book.findById(req.params.id).populate('user', 'name email userId');
    
    if (!book) {
      return res.status(404).json({
        success: false,
        message: 'Book not found'
      });
    }
    const currentUser = await User.findById(req.user.id);
    if (!currentUser) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }
    let canUpdate = false;
    if (currentUser.role === 'client' && currentUser.userId) {
      canUpdate = book.clientId === currentUser.userId;
    } else {
      canUpdate = book.user._id.toString() === req.user.id;
    }
    if (!canUpdate) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to update this book'
      });
    }
    const updateData = { ...req.body };
    if (updateData.tags) {
      try {
        updateData.tags = typeof updateData.tags === 'string' ? JSON.parse(updateData.tags) : updateData.tags;
      } catch (e) {
        updateData.tags = updateData.tags.split(',').map(tag => tag.trim()).filter(tag => tag.length > 0);
      }
    }
    if (req.file) {
      if (book.coverImage && fs.existsSync(book.coverImage)) {
        fs.unlinkSync(book.coverImage);
      }
      updateData.coverImage = req.file.path;
    }
    book = await Book.findByIdAndUpdate(req.params.id, updateData, {
      new: true,
      runValidators: true
    })
    .populate('user', 'name email userId')
    .populate('highlightedBy', 'name email userId');
    const bookWithUserInfo = {
      ...book.toObject(),
      createdBy: book.user ? {
        id: book.user._id,
        name: book.user.name,
        email: book.user.email,
        userId: book.user.userId || book.user._id.toString()
      } : null,
      highlightedByUser: book.highlightedBy ? {
        id: book.highlightedBy._id,
        name: book.highlightedBy.name,
        email: book.highlightedBy.email,
        userId: book.highlightedBy.userId || book.highlightedBy._id.toString()
      } : null
    };
    return res.status(200).json({
      success: true,
      book: bookWithUserInfo
    });
  } catch (error) {
    if (req.file) {
      fs.unlink(req.file.path, err => {
        if (err) console.error('Error deleting file:', err);
      });
    }
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
exports.deleteBook = async (req, res) => {
  try {
    const book = await Book.findById(req.params.id);
    if (!book) {
      return res.status(404).json({
        success: false,
        message: 'Book not found'
      });
    }
    const currentUser = await User.findById(req.user.id);
    if (!currentUser) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }
    let canDelete = false;
    if (currentUser.role === 'client' && currentUser.userId) {
      canDelete = book.clientId === currentUser.userId;
    } else {
      canDelete = book.user.toString() === req.user.id;
    }
    if (!canDelete) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to delete this book'
      });
    }
    if (book.coverImage && fs.existsSync(book.coverImage)) {
      fs.unlinkSync(book.coverImage);
    }
    const chapters = await Chapter.find({ book: req.params.id });
    for (const chapter of chapters) {
      const topics = await Topic.find({ chapter: chapter._id });
      for (const topic of topics) {
        await SubTopic.deleteMany({ topic: topic._id });
      }
      await Topic.deleteMany({ chapter: chapter._id });
    }
    await Chapter.deleteMany({ book: req.params.id });
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
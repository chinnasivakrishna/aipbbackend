const Book = require('../models/Book');
const Chapter = require('../models/Chapter');
const Topic = require('../models/Topic');
const SubTopic = require('../models/SubTopic');
const User = require('../models/User');
const path = require('path');
const fs = require('fs');
const multer = require('multer');

// Multer configuration
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
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB max size
  fileFilter: fileFilter
});

exports.uploadCoverImage = upload.single('coverImage');

// Helper function to format book with user info
const formatBookWithUserInfo = (book) => ({
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
  } : null,
  trendingByUser: book.trendingBy ? {
    id: book.trendingBy._id,
    name: book.trendingBy.name,
    email: book.trendingBy.email,
    userId: book.trendingBy.userId || book.trendingBy._id.toString()
  } : null,
  categoryOrderByUser: book.categoryOrderBy ? {
    id: book.categoryOrderBy._id,
    name: book.categoryOrderBy.name,
    email: book.categoryOrderBy.email,
    userId: book.categoryOrderBy.userId || book.categoryOrderBy._id.toString()
  } : null
});

// Helper function to get client ID
const getClientId = (user) => {
  return user.role === 'client' && user.userId ? user.userId : user._id.toString();
};

// ==================== BASIC BOOK OPERATIONS ====================

exports.getBooks = async (req, res) => {
  try {
    const currentUser = await User.findById(req.user.id);
    if (!currentUser) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    const clientId = getClientId(currentUser);
    const { category, subcategory, trending, highlighted, search, limit, page = 1 } = req.query;
    
    let filter = { clientId };
    
    // Apply filters
    if (category) filter.mainCategory = category;
    if (subcategory) filter.subCategory = subcategory;
    if (trending === 'true') {
      filter.isTrending = true;
      filter.trendingStartDate = { $lte: new Date() };
      filter.$or = [
        { trendingEndDate: { $gte: new Date() } },
        { trendingEndDate: null }
      ];
    }
    if (highlighted === 'true') filter.isHighlighted = true;
    if (search) {
      filter.$or = [
        { title: { $regex: search, $options: 'i' } },
        { author: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } },
        { tags: { $regex: search, $options: 'i' } }
      ];
    }

    // Build query
    let query = Book.find(filter)
      .populate('user', 'name email userId')
      .populate('highlightedBy', 'name email userId')
      .populate('trendingBy', 'name email userId')
      .populate('categoryOrderBy', 'name email userId');

    // Apply sorting
    if (trending === 'true') {
      query = query.sort({ trendingScore: -1, viewCount: -1 });
    } else if (highlighted === 'true') {
      query = query.sort({ highlightOrder: 1, highlightedAt: -1 });
    } else if (category) {
      query = query.sort({ categoryOrder: 1, createdAt: -1 });
    } else {
      query = query.sort({ createdAt: -1 });
    }

    // Apply pagination
    if (limit) {
      const skip = (parseInt(page) - 1) * parseInt(limit);
      query = query.skip(skip).limit(parseInt(limit));
    }

    const books = await query;
    const total = await Book.countDocuments(filter);

    const booksWithUserInfo = books.map(formatBookWithUserInfo);

    return res.status(200).json({
      success: true,
      count: books.length,
      total,
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
    return res.status(500).json({ success: false, message: 'Server Error' });
  }
};

exports.getBook = async (req, res) => {
  try {
    const book = await Book.findById(req.params.id)
      .populate('user', 'name email userId')
      .populate('highlightedBy', 'name email userId')
      .populate('trendingBy', 'name email userId')
      .populate('categoryOrderBy', 'name email userId');

    if (!book) {
      return res.status(404).json({ success: false, message: 'Book not found' });
    }

    const currentUser = await User.findById(req.user.id);
    if (!currentUser) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    const clientId = getClientId(currentUser);
    let hasAccess = book.clientId === clientId || book.user._id.toString() === req.user.id;
    
    if (!hasAccess && book.isPublic) {
      hasAccess = true;
    }

    if (!hasAccess) {
      return res.status(403).json({ success: false, message: 'Not authorized to access this book' });
    }

    // Increment view count
    await book.incrementView();

    const bookWithUserInfo = formatBookWithUserInfo(book);

    return res.status(200).json({ success: true, book: bookWithUserInfo });
  } catch (error) {
    console.error('Get book error:', error);
    return res.status(500).json({ success: false, message: 'Server Error' });
  }
};

exports.createBook = async (req, res) => {
  try {
    const { 
      title, description, author, publisher, language, mainCategory, subCategory, 
      customSubCategory, tags, clientId, isPublic 
    } = req.body;

    const currentUser = await User.findById(req.user.id);
    if (!currentUser) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    let parsedTags = [];
    if (tags) {
      try {
        parsedTags = typeof tags === 'string' ? JSON.parse(tags) : tags;
      } catch (e) {
        parsedTags = tags.split(',').map(tag => tag.trim()).filter(tag => tag.length > 0);
      }
    }

    const effectiveClientId = clientId?.trim() || getClientId(currentUser);

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
      userType: 'User',
      isPublic: isPublic === 'true' || isPublic === true || false,
      tags: parsedTags
    };

    if (subCategory === 'Other' && customSubCategory?.trim()) {
      bookData.customSubCategory = customSubCategory.trim();
    }

    if (req.file) {
      bookData.coverImage = req.file.path;
    }

    const book = await Book.create(bookData);
    await book.populate('user', 'name email userId');

    const bookWithUserInfo = formatBookWithUserInfo(book);

    return res.status(201).json({
      success: true,
      book: bookWithUserInfo,
      message: 'Book created successfully'
    });
  } catch (error) {
    if (req.file && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }

    if (error.name === 'ValidationError') {
      const messages = Object.values(error.errors).map(val => val.message);
      return res.status(400).json({ success: false, message: messages });
    } else if (error.code === 11000) {
      return res.status(400).json({ success: false, message: 'A book with this title already exists for this user' });
    } else {
      console.error('Create book error:', error);
      return res.status(500).json({ success: false, message: 'Server Error' });
    }
  }
};

exports.updateBook = async (req, res) => {
  try {
    let book = await Book.findById(req.params.id).populate('user', 'name email userId');
    
    if (!book) {
      return res.status(404).json({ success: false, message: 'Book not found' });
    }

    const currentUser = await User.findById(req.user.id);
    if (!currentUser) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    const clientId = getClientId(currentUser);
    const canUpdate = book.clientId === clientId || book.user._id.toString() === req.user.id;

    if (!canUpdate) {
      return res.status(403).json({ success: false, message: 'Not authorized to update this book' });
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
    .populate('highlightedBy', 'name email userId')
    .populate('trendingBy', 'name email userId')
    .populate('categoryOrderBy', 'name email userId');

    const bookWithUserInfo = formatBookWithUserInfo(book);

    return res.status(200).json({ success: true, book: bookWithUserInfo });
  } catch (error) {
    if (req.file && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }

    if (error.name === 'ValidationError') {
      const messages = Object.values(error.errors).map(val => val.message);
      return res.status(400).json({ success: false, message: messages });
    } else {
      console.error('Update book error:', error);
      return res.status(500).json({ success: false, message: 'Server Error' });
    }
  }
};

exports.deleteBook = async (req, res) => {
  try {
    const book = await Book.findById(req.params.id);
    if (!book) {
      return res.status(404).json({ success: false, message: 'Book not found' });
    }

    const currentUser = await User.findById(req.user.id);
    if (!currentUser) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    const clientId = getClientId(currentUser);
    const canDelete = book.clientId === clientId || book.user.toString() === req.user.id;

    if (!canDelete) {
      return res.status(403).json({ success: false, message: 'Not authorized to delete this book' });
    }

    // Delete cover image if exists
    if (book.coverImage && fs.existsSync(book.coverImage)) {
      fs.unlinkSync(book.coverImage);
    }

    // Delete all related content
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

    return res.status(200).json({ success: true, message: 'Book deleted successfully' });
  } catch (error) {
    console.error('Delete book error:', error);
    return res.status(500).json({ success: false, message: 'Server Error' });
  }
};

// ==================== HIGHLIGHT FUNCTIONALITY ====================

exports.getHighlightedBooks = async (req, res) => {
  try {
    const currentUser = await User.findById(req.user.id);
    if (!currentUser) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    const clientId = getClientId(currentUser);
    const { limit } = req.query;

    const highlightedBooks = await Book.getHighlightedBooks(clientId, limit ? parseInt(limit) : null);
    const booksWithUserInfo = highlightedBooks.map(formatBookWithUserInfo);

    return res.status(200).json({
      success: true,
      count: highlightedBooks.length,
      books: booksWithUserInfo
    });
  } catch (error) {
    console.error('Get highlighted books error:', error);
    return res.status(500).json({ success: false, message: 'Server Error' });
  }
};

exports.addBookToHighlights = async (req, res) => {
  try {
    const { note, order } = req.body;
    const book = await Book.findById(req.params.id).populate('user', 'name email userId');
    
    if (!book) {
      return res.status(404).json({ success: false, message: 'Book not found' });
    }

    const currentUser = await User.findById(req.user.id);
    if (!currentUser) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    const clientId = getClientId(currentUser);
    const canHighlight = book.clientId === clientId || book.user._id.toString() === req.user.id;

    if (!canHighlight) {
      return res.status(403).json({ success: false, message: 'Not authorized to highlight this book' });
    }

    if (book.isHighlighted) {
      return res.status(400).json({ success: false, message: 'Book is already highlighted' });
    }

    if (order && order > 0) {
      const existingBookWithOrder = await Book.findOne({ 
        clientId, 
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

    const userType = 'User'; // Assuming web users are 'User' type
    await book.toggleHighlight(currentUser._id, userType, note || '', order || 0);
    await book.populate('highlightedBy', 'name email userId');

    const bookWithUserInfo = formatBookWithUserInfo(book);

    return res.status(200).json({
      success: true,
      message: 'Book added to highlights successfully',
      book: bookWithUserInfo
    });
  } catch (error) {
    console.error('Add book to highlights error:', error);
    return res.status(500).json({ success: false, message: 'Server Error' });
  }
};

exports.removeBookFromHighlights = async (req, res) => {
  try {
    const book = await Book.findById(req.params.id).populate('user', 'name email userId');
    
    if (!book) {
      return res.status(404).json({ success: false, message: 'Book not found' });
    }

    const currentUser = await User.findById(req.user.id);
    if (!currentUser) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    const clientId = getClientId(currentUser);
    const canRemoveHighlight = book.clientId === clientId || book.user._id.toString() === req.user.id;

    if (!canRemoveHighlight) {
      return res.status(403).json({ success: false, message: 'Not authorized to remove highlight from this book' });
    }

    if (!book.isHighlighted) {
      return res.status(400).json({ success: false, message: 'Book is not highlighted' });
    }

    const userType = 'User'; // Assuming web users are 'User' type
    await book.toggleHighlight(currentUser._id, userType);
    
    const bookWithUserInfo = formatBookWithUserInfo(book);

    return res.status(200).json({
      success: true,
      message: 'Book removed from highlights successfully',
      book: bookWithUserInfo
    });
  } catch (error) {
    console.error('Remove book from highlights error:', error);
    return res.status(500).json({ success: false, message: 'Server Error' });
  }
};

exports.updateHighlightDetails = async (req, res) => {
  try {
    const { note, order } = req.body;
    const book = await Book.findById(req.params.id)
      .populate('user', 'name email userId')
      .populate('highlightedBy', 'name email userId');
    
    if (!book) {
      return res.status(404).json({ success: false, message: 'Book not found' });
    }

    const currentUser = await User.findById(req.user.id);
    if (!currentUser) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    const clientId = getClientId(currentUser);
    const canUpdate = book.clientId === clientId || book.user._id.toString() === req.user.id;

    if (!canUpdate) {
      return res.status(403).json({ success: false, message: 'Not authorized to update highlight for this book' });
    }

    if (!book.isHighlighted) {
      return res.status(400).json({ success: false, message: 'Book is not highlighted' });
    }

    if (order && order !== book.highlightOrder && order > 0) {
      const existingBookWithOrder = await Book.findOne({ 
        clientId, 
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

    const bookWithUserInfo = formatBookWithUserInfo(updatedBook);

    return res.status(200).json({
      success: true,
      message: 'Highlight details updated successfully',
      book: bookWithUserInfo
    });
  } catch (error) {
    console.error('Update highlight details error:', error);
    return res.status(500).json({ success: false, message: 'Server Error' });
  }
};

// ==================== TRENDING FUNCTIONALITY ====================

exports.getTrendingBooks = async (req, res) => {
  try {
    const currentUser = await User.findById(req.user.id);
    if (!currentUser) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    const clientId = getClientId(currentUser);
    const { limit } = req.query;

    const trendingBooks = await Book.getTrendingBooks(clientId, limit ? parseInt(limit) : null);
    const booksWithUserInfo = trendingBooks.map(formatBookWithUserInfo);

    return res.status(200).json({
      success: true,
      count: trendingBooks.length,
      books: booksWithUserInfo
    });
  } catch (error) {
    console.error('Get trending books error:', error);
    return res.status(500).json({ success: false, message: 'Server Error' });
  }
};

exports.addBookToTrending = async (req, res) => {
  try {
    const { score, endDate } = req.body;
    const book = await Book.findById(req.params.id).populate('user', 'name email userId');
    
    if (!book) {
      return res.status(404).json({ success: false, message: 'Book not found' });
    }

    const currentUser = await User.findById(req.user.id);
    if (!currentUser) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    const clientId = getClientId(currentUser);
    const canMakeTrending = book.clientId === clientId || book.user._id.toString() === req.user.id;

    if (!canMakeTrending) {
      return res.status(403).json({ success: false, message: 'Not authorized to make this book trending' });
    }

    if (book.isTrending) {
      return res.status(400).json({ success: false, message: 'Book is already trending' });
    }

    const userType = 'User'; // Assuming web users are 'User' type
    const parsedScore = score ? parseInt(score) : 0;
    const parsedEndDate = endDate ? new Date(endDate) : null;

    await book.toggleTrending(currentUser._id, userType, parsedScore, parsedEndDate);
    await book.populate('trendingBy', 'name email userId');

    const bookWithUserInfo = formatBookWithUserInfo(book);

    return res.status(200).json({
      success: true,
      message: 'Book added to trending successfully',
      book: bookWithUserInfo
    });
  } catch (error) {
    console.error('Add book to trending error:', error);
    return res.status(500).json({ success: false, message: 'Server Error' });
  }
};

exports.removeBookFromTrending = async (req, res) => {
  try {
    const book = await Book.findById(req.params.id).populate('user', 'name email userId');
    
    if (!book) {
      return res.status(404).json({ success: false, message: 'Book not found' });
    }

    const currentUser = await User.findById(req.user.id);
    if (!currentUser) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    const clientId = getClientId(currentUser);
    const canRemoveTrending = book.clientId === clientId || book.user._id.toString() === req.user.id;

    if (!canRemoveTrending) {
      return res.status(403).json({ success: false, message: 'Not authorized to remove trending from this book' });
    }

    if (!book.isTrending) {
      return res.status(400).json({ success: false, message: 'Book is not trending' });
    }

    const userType = 'User'; // Assuming web users are 'User' type
    await book.toggleTrending(currentUser._id, userType);
    
    const bookWithUserInfo = formatBookWithUserInfo(book);

    return res.status(200).json({
      success: true,
      message: 'Book removed from trending successfully',
      book: bookWithUserInfo
    });
  } catch (error) {
    console.error('Remove book from trending error:', error);
    return res.status(500).json({ success: false, message: 'Server Error' });
  }
};

exports.updateTrendingDetails = async (req, res) => {
  try {
    const { score, endDate } = req.body;
    const book = await Book.findById(req.params.id)
      .populate('user', 'name email userId')
      .populate('trendingBy', 'name email userId');
    
    if (!book) {
      return res.status(404).json({ success: false, message: 'Book not found' });
    }

    const currentUser = await User.findById(req.user.id);
    if (!currentUser) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    const clientId = getClientId(currentUser);
    const canUpdate = book.clientId === clientId || book.user._id.toString() === req.user.id;

    if (!canUpdate) {
      return res.status(403).json({ success: false, message: 'Not authorized to update trending for this book' });
    }

    if (!book.isTrending) {
      return res.status(400).json({ success: false, message: 'Book is not trending' });
    }

    const updateData = {};
    if (score !== undefined) updateData.trendingScore = parseInt(score);
    if (endDate !== undefined) updateData.trendingEndDate = endDate ? new Date(endDate) : null;

    const updatedBook = await Book.findByIdAndUpdate(
      req.params.id,
      updateData,
      { new: true, runValidators: true }
    )
    .populate('user', 'name email userId')
    .populate('trendingBy', 'name email userId');

    const bookWithUserInfo = formatBookWithUserInfo(updatedBook);

    return res.status(200).json({
      success: true,
      message: 'Trending details updated successfully',
      book: bookWithUserInfo
    });
  } catch (error) {
    console.error('Update trending details error:', error);
    return res.status(500).json({ success: false, message: 'Server Error' });
  }
};

// ==================== CATEGORY ORDER FUNCTIONALITY ====================

exports.updateCategoryOrder = async (req, res) => {
  try {
    const { order } = req.body;
    const book = await Book.findById(req.params.id).populate('user', 'name email userId');
    
    if (!book) {
      return res.status(404).json({ success: false, message: 'Book not found' });
    }

    const currentUser = await User.findById(req.user.id);
    if (!currentUser) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    const clientId = getClientId(currentUser);
    const canUpdateOrder = book.clientId === clientId || book.user._id.toString() === req.user.id;

    if (!canUpdateOrder) {
      return res.status(403).json({ success: false, message: 'Not authorized to update category order for this book' });
    }

    if (order && order > 0) {
      const existingBookWithOrder = await Book.findOne({ 
        clientId, 
        mainCategory: book.mainCategory,
        subCategory: book.subCategory,
        categoryOrder: order,
        _id: { $ne: req.params.id }
      });

      if (existingBookWithOrder) {
        return res.status(400).json({
          success: false,
          message: `Category order ${order} is already taken by another book in this category`
        });
      }
    }

    const userType = 'User'; // Assuming web users are 'User' type
    await book.setCategoryOrder(currentUser._id, userType, order || 0);
    await book.populate('categoryOrderBy', 'name email userId');

    const bookWithUserInfo = formatBookWithUserInfo(book);

    return res.status(200).json({
      success: true,
      message: 'Category order updated successfully',
      book: bookWithUserInfo
    });
  } catch (error) {
    console.error('Update category order error:', error);
    return res.status(500).json({ success: false, message: 'Server Error' });
  }
};

exports.resetCategoryOrder = async (req, res) => {
  try {
    const book = await Book.findById(req.params.id).populate('user', 'name email userId');
    
    if (!book) {
      return res.status(404).json({ success: false, message: 'Book not found' });
    }

    const currentUser = await User.findById(req.user.id);
    if (!currentUser) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    const clientId = getClientId(currentUser);
    const canResetOrder = book.clientId === clientId || book.user._id.toString() === req.user.id;

    if (!canResetOrder) {
      return res.status(403).json({ success: false, message: 'Not authorized to reset category order for this book' });
    }

    const userType = 'User'; // Assuming web users are 'User' type
    await book.setCategoryOrder(currentUser._id, userType, 0);
    
    const bookWithUserInfo = formatBookWithUserInfo(book);

    return res.status(200).json({
      success: true,
      message: 'Category order reset successfully',
      book: bookWithUserInfo
    });
  } catch (error) {
    console.error('Reset category order error:', error);
    return res.status(500).json({ success: false, message: 'Server Error' });
  }
};

// ==================== UTILITY FUNCTIONS ====================

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

exports.getCategoryMappings = async (req, res) => {
  try {
    const mappings = Book.getCategoryMappings();
    return res.status(200).json({ success: true, mappings });
  } catch (error) {
    console.error('Get category mappings error:', error);
    return res.status(500).json({ success: false, message: 'Server Error' });
  }
};

exports.getValidSubCategories = async (req, res) => {
  try {
    const { mainCategory } = req.params;
    const subCategories = Book.getValidSubCategories(mainCategory);
    return res.status(200).json({ success: true, subCategories });
  } catch (error) {
    console.error('Get valid subcategories error:', error);
    return res.status(500).json({ success: false, message: 'Server Error' });
  }
};
const Book = require('../models/Book');
const User = require('../models/User');
const { generatePresignedUrl, generateGetPresignedUrl } = require('../utils/s3');
const path = require('path');

// Helper function to format book with user info and S3 URLs
const formatBookWithUserInfo = async (book) => {
  const formattedBook = {
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
  };

  // Always try to generate a new presigned URL if we have a cover image
  if (book.coverImage) {
    try {
      const coverImageUrl = await generateGetPresignedUrl(book.coverImage, 31536000);
      formattedBook.coverImageUrl = coverImageUrl;
      console.log(coverImageUrl)
      // Update the book with the new URL if it's different
      if (book.coverImageUrl !== coverImageUrl) {
        await Book.findByIdAndUpdate(book._id, { coverImageUrl });
        console.log('Updated book with new presigned URL:', coverImageUrl); // Debug log
      }
    } catch (error) {
      console.error('Error generating presigned URL for cover image:', error);
      formattedBook.coverImageUrl = null;
    }
  }

  return formattedBook;
};

// Helper function to get client ID
const getClientId = (user) => {
  return user.role === 'client' && user.userId ? user.userId : user._id.toString();
};

// Get presigned URL for cover image upload
exports.getCoverImageUploadUrl = async (req, res) => {
  try {
    const { fileName, contentType } = req.body;
    
    if (!fileName || !contentType) {
      return res.status(400).json({ 
        success: false, 
        message: 'File name and content type are required' 
      });
    }

    // Create unique filename with timestamp
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const ext = path.extname(fileName);
    const key = `covers/cover-${uniqueSuffix}${ext}`;

    // Generate presigned URL
    const uploadUrl = await generatePresignedUrl(key, contentType);

    return res.status(200).json({
      success: true,
      uploadUrl,
      key
    });
  } catch (error) {
    console.error('Get cover image upload URL error:', error);
    return res.status(500).json({ success: false, message: 'Server Error' });
  }
};

// Create book with S3 cover image
exports.createBook = async (req, res) => {
  try {
    const { 
      title, description, author, publisher, language, mainCategory, subCategory, 
      customSubCategory, exam, paper, subject, tags, clientId, isPublic, categoryOrder,
      coverImageKey, rating, ratingCount, conversations, users, summary
    } = req.body;

    console.log('Received book data:', { 
      coverImageKey,
      title,
      author,
      publisher,
      rating,
      ratingCount,
      conversations,
      users,
      summary
    }); // Debug log

    const currentUser = await User.findById(req.user.id);
    if (!currentUser) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    // Validate rating
    if (rating && (isNaN(rating) || rating < 0 || rating > 5)) {
      return res.status(400).json({ 
        success: false, 
        message: 'Rating must be a number between 0 and 5' 
      });
    }

    // Validate rating count
    if (ratingCount && (isNaN(ratingCount) || ratingCount < 0)) {
      return res.status(400).json({ 
        success: false, 
        message: 'Rating count must be a non-negative number' 
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

    // Parse conversations and users arrays
    let parsedConversations = [];
    if (conversations) {
      try {
        parsedConversations = typeof conversations === 'string' ? JSON.parse(conversations) : conversations;
      } catch (e) {
        parsedConversations = conversations.split(',').map(conv => conv.trim()).filter(conv => conv.length > 0);
      }
    }

    let parsedUsers = [];
    if (users) {
      try {
        parsedUsers = typeof users === 'string' ? JSON.parse(users) : users;
      } catch (e) {
        parsedUsers = users.split(',').map(user => user.trim()).filter(user => user.length > 0);
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
      tags: parsedTags,
      categoryOrder: categoryOrder ? parseInt(categoryOrder) : 0,
      categoryOrderBy: req.user.id,
      categoryOrderByType: 'User',
      categoryOrderedAt: new Date(),
      rating: rating ? parseFloat(rating) : 0,
      ratingCount: ratingCount ? parseInt(ratingCount) : 0,
      conversations: parsedConversations,
      users: parsedUsers,
      summary: summary ? summary.trim() : ''
    };

    // Handle the new fields: exam, paper, subject
    if (exam && exam.trim()) {
      bookData.exam = exam.trim();
    }
    
    if (paper && paper.trim()) {
      bookData.paper = paper.trim();
    }
    
    if (subject && subject.trim()) {
      bookData.subject = subject.trim();
    }

    // Handle custom subcategory
    if (customSubCategory && customSubCategory.trim()) {
      bookData.customSubCategory = customSubCategory.trim();
    }

    // Handle cover image key from S3 and generate presigned URL
    if (coverImageKey) {
      console.log('Processing cover image with key:', coverImageKey);
      bookData.coverImage = coverImageKey;
      bookData.coverImageKey = coverImageKey;
      
      try {
        // Generate a presigned URL that expires in 7 days (maximum allowed)
        console.log('Attempting to generate presigned URL for key:', coverImageKey);
        const coverImageUrl = await generateGetPresignedUrl(coverImageKey, 604800); // 7 days in seconds
        console.log('Successfully generated presigned URL:', coverImageUrl);
        
        if (!coverImageUrl) {
          throw new Error('Failed to generate presigned URL - URL is null or undefined');
        }
        
        bookData.coverImageUrl = coverImageUrl;
      } catch (error) {
        console.error('Error generating presigned URL for cover image:', {
          error: error.message,
          code: error.code,
          key: coverImageKey,
          stack: error.stack
        });
        return res.status(500).json({ 
          success: false, 
          message: `Failed to generate image URL: ${error.message}` 
        });
      }
    }

    console.log('Creating book with data:', {
      ...bookData,
      coverImageUrl: bookData.coverImageUrl ? 'URL generated' : 'No URL'
    }); // Debug log

    const book = await Book.create(bookData);
    await book.populate('user', 'name email userId');

    // Double check if we have the URL, if not try one more time
    if (!book.coverImageUrl && book.coverImage) {
      try {
        console.log('Attempting to generate presigned URL after book creation for key:', book.coverImage);
        const coverImageUrl = await generateGetPresignedUrl(book.coverImage, 604800); // 7 days in seconds
        console.log('Successfully generated presigned URL after creation:', coverImageUrl);
        
        if (!coverImageUrl) {
          throw new Error('Failed to generate presigned URL after creation - URL is null or undefined');
        }
        
        // Update the book with the new URL
        await Book.findByIdAndUpdate(book._id, { coverImageUrl });
        book.coverImageUrl = coverImageUrl;
      } catch (error) {
        console.error('Error generating presigned URL after creation:', {
          error: error.message,
          code: error.code,
          key: book.coverImage,
          stack: error.stack
        });
        return res.status(500).json({ 
          success: false, 
          message: `Failed to generate image URL after book creation: ${error.message}` 
        });
      }
    }

    // Format the book with user info to ensure we have all the necessary fields
    const formattedBook = await formatBookWithUserInfo(book);

    // Return the book with the URL
    return res.status(201).json({
      success: true,
      message: 'Book created successfully',
      book: formattedBook
    });
  } catch (error) {
    console.error('Create book error:', {
      error: error.message,
      code: error.code,
      stack: error.stack
    });
    return res.status(500).json({ 
      success: false, 
      message: error.message || 'Failed to create book' 
    });
  }
};

// Get books with S3 URLs
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

    // Apply sorting based on different conditions
    if (trending === 'true') {
      query = query.sort({ trendingScore: -1, viewCount: -1 });
    } else if (highlighted === 'true') {
      query = query.sort({ highlightOrder: 1, highlightedAt: -1 });
    } else {
      // First sort by categoryOrder, then by createdAt
      query = query.sort({ categoryOrder: 1, createdAt: -1 });
    }

    // Apply pagination
    if (limit) {
      const skip = (parseInt(page) - 1) * parseInt(limit);
      query = query.skip(skip).limit(parseInt(limit));
    }

    const books = await query;
    const total = await Book.countDocuments(filter);

    // Format books with user info and S3 URLs
    const booksWithUserInfo = await Promise.all(books.map(formatBookWithUserInfo));

    // Group books by category and get max order for each category
    const categoryOrders = {};
    books.forEach(book => {
      if (!categoryOrders[book.mainCategory] || book.categoryOrder > categoryOrders[book.mainCategory]) {
        categoryOrders[book.mainCategory] = book.categoryOrder || 0;
      }
    });

    return res.status(200).json({
      success: true,
      count: books.length,
      total,
      books: booksWithUserInfo,
      categoryOrders,
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

// Get single book with S3 URL
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

    const bookWithUserInfo = await formatBookWithUserInfo(book);

    return res.status(200).json({ success: true, book: bookWithUserInfo });
  } catch (error) {
    console.error('Get book error:', error);
    return res.status(500).json({ success: false, message: 'Server Error' });
  }
};

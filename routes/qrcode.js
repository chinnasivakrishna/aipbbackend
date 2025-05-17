const express = require('express');
const router = express.Router();
const QRCode = require('qrcode');
const Book = require('../models/Book');
const Chapter = require('../models/Chapter');
const Topic = require('../models/Topic');
const SubTopic = require('../models/SubTopic');
const DataStore = require('../models/DatastoreItems');

// Helper function to generate colored QR code
const generateColoredQRCode = async (url, qrColor, size = 300) => {
  // Generate QR code with custom color
  return await QRCode.toDataURL(url, {
    errorCorrectionLevel: 'H',
    margin: 1,
    width: size,
    color: {
      dark: qrColor,
      light: '#FFFFFF' // white background
    }
  });
};

// Generate QR code data for a book
router.get('/books/:bookId', async (req, res) => {
  try {
    const { bookId } = req.params;
    
    // Get book details
    const book = await Book.findById(bookId);
    if (!book) {
      return res.status(404).json({ 
        success: false, 
        message: 'Book not found' 
      });
    }
    
    // Get all chapters for the book
    const chapters = await Chapter.find({ book: bookId })
      .select('_id title description order')
      .sort('order');
    
    // Get all datastore items for the book
    const datastoreItems = await DataStore.find({ book: bookId })
      .select('_id name url fileType');
    
    // Create data object for QR code metadata (not used in QR code itself)
    const qrMetadata = {
      book: {
        id: book._id,
        title: book.title,
        description: book.description
      },
      chapters: chapters.map(chapter => ({
        id: chapter._id,
        title: chapter.title,
        description: chapter.description,
        order: chapter.order
      })),
      datastoreItems: datastoreItems.map(item => ({
        id: item._id,
        name: item.name,
        fileType: item.fileType
      }))
    };
    
    // Use direct URL string instead of JSON object for the QR code
    const bookUrl = `https://aipbfrontend.vercel.app/book-viewer/${bookId}`;
    
    // Generate QR code as data URL with blue color for books
    const qrCodeDataURL = await generateColoredQRCode(bookUrl, '#0047AB');
    
    res.json({
      success: true,
      qrCodeDataURL,
      qrCodeType: 'book',
      qrCodeColor: '#0047AB', // Blue
      book: qrMetadata.book,
      chaptersCount: chapters.length,
      datastoreItemsCount: datastoreItems.length
    });
    
  } catch (error) {
    console.error('Error generating QR code:', error);
    res.status(500).json({
      success: false,
      message: 'Server error generating QR code'
    });
  }
});

// Get book data when scanned from QR code
router.get('/book-data/:bookId', async (req, res) => {
  try {
    const { bookId } = req.params;
    
    // Get book details
    const book = await Book.findById(bookId);
    if (!book) {
      return res.status(404).json({ 
        success: false, 
        message: 'Book not found' 
      });
    }
    
    // Get all chapters for the book
    const chapters = await Chapter.find({ book: bookId })
      .select('_id title description order')
      .sort('order');
    
    // Get all datastore items for the book
    const datastoreItems = await DataStore.find({ book: bookId })
      .select('_id name url fileType');
    
    // Return book data
    res.json({
      success: true,
      qrCodeType: 'book',
      book: {
        id: book._id,
        title: book.title,
        description: book.description,
        coverImage: book.coverImage
      },
      chapters: chapters,
      datastoreItems: datastoreItems
    });
    
  } catch (error) {
    console.error('Error fetching book data:', error);
    res.status(500).json({
      success: false,
      message: 'Server error fetching book data'
    });
  }
});

router.get('/books/:bookId/chapters/:chapterId', async (req, res) => {
  try {
    const { bookId, chapterId } = req.params;
    
    // Get book details
    const book = await Book.findById(bookId);
    if (!book) {
      return res.status(404).json({ 
        success: false, 
        message: 'Book not found' 
      });
    }
    
    // Get chapter details
    const chapter = await Chapter.findOne({ _id: chapterId, book: bookId });
    if (!chapter) {
      return res.status(404).json({ 
        success: false, 
        message: 'Chapter not found' 
      });
    }
    
    // Get all topics for the chapter
    const topics = await Topic.find({ chapter: chapterId })
      .select('_id title description order')
      .sort('order');
    
    // Get all datastore items for the chapter
    const datastoreItems = await DataStore.find({ chapter: chapterId })
      .select('_id name url fileType');
    
    // Create data object for QR code metadata
    const qrMetadata = {
      book: {
        id: book._id,
        title: book.title
      },
      chapter: {
        id: chapter._id,
        title: chapter.title,
        description: chapter.description
      },
      topics: topics.map(topic => ({
        id: topic._id,
        title: topic.title,
        description: topic.description,
        order: topic.order
      })),
      datastoreItems: datastoreItems.map(item => ({
        id: item._id,
        name: item.name,
        fileType: item.fileType
      }))
    };
    
    // Use direct URL string for the QR code - updated to use the new chapter viewer route
    const chapterUrl = `https://aipbfrontend.vercel.app/book-viewer/${bookId}/chapters/${chapterId}`;
    
    // Generate QR code as data URL with green color for chapters
    const qrCodeDataURL = await generateColoredQRCode(chapterUrl, '#009933');
    
    res.json({
      success: true,
      qrCodeDataURL,
      qrCodeType: 'chapter',
      qrCodeColor: '#009933', // Green
      book: qrMetadata.book,
      chapter: qrMetadata.chapter,
      topicsCount: topics.length,
      datastoreItemsCount: datastoreItems.length
    });
    
  } catch (error) {
    console.error('Error generating QR code:', error);
    res.status(500).json({
      success: false,
      message: 'Server error generating QR code'
    });
  }
});

router.get('/book-data/:bookId/chapters/:chapterId', async (req, res) => {
  try {
    const { bookId, chapterId } = req.params;
    
    // Get book details
    const book = await Book.findById(bookId);
    if (!book) {
      return res.status(404).json({ 
        success: false, 
        message: 'Book not found' 
      });
    }
    
    // Get chapter details
    const chapter = await Chapter.findOne({ _id: chapterId, book: bookId });
    if (!chapter) {
      return res.status(404).json({ 
        success: false, 
        message: 'Chapter not found' 
      });
    }
    
    // Get all topics for the chapter
    const topics = await Topic.find({ chapter: chapterId })
      .select('_id title description order content')
      .sort('order');
    
    // Get all datastore items for the chapter
    const datastoreItems = await DataStore.find({ chapter: chapterId })
      .select('_id name url fileType');
    
    res.json({
      success: true,
      qrCodeType: 'chapter',
      book: {
        id: book._id,
        title: book.title,
        coverImage: book.coverImage
      },
      chapter: {
        id: chapter._id,
        title: chapter.title,
        description: chapter.description,
        order: chapter.order
      },
      topics: topics,
      datastoreItems: datastoreItems
    });
    
  } catch (error) {
    console.error('Error fetching chapter data:', error);
    res.status(500).json({
      success: false,
      message: 'Server error fetching chapter data'
    });
  }
});

// Generate QR code for a topic
router.get('/books/:bookId/chapters/:chapterId/topics/:topicId', async (req, res) => {
  try {
    const { bookId, chapterId, topicId } = req.params;
    
    // Get book details
    const book = await Book.findById(bookId);
    if (!book) {
      return res.status(404).json({ 
        success: false, 
        message: 'Book not found' 
      });
    }
    
    // Get chapter details
    const chapter = await Chapter.findOne({ _id: chapterId, book: bookId });
    if (!chapter) {
      return res.status(404).json({ 
        success: false, 
        message: 'Chapter not found' 
      });
    }
    
    // Get topic details
    const topic = await Topic.findOne({ _id: topicId, chapter: chapterId });
    if (!topic) {
      return res.status(404).json({ 
        success: false, 
        message: 'Topic not found' 
      });
    }
    
    // Get all subtopics for the topic
    const subtopics = await SubTopic.find({ topic: topicId })
      .select('_id title description order')
      .sort('order');
    
    // Get all datastore items for the topic
    const datastoreItems = await DataStore.find({ topic: topicId })
      .select('_id name url fileType');
    
    // Create data object for QR code metadata
    const qrMetadata = {
      book: {
        id: book._id,
        title: book.title
      },
      chapter: {
        id: chapter._id,
        title: chapter.title
      },
      topic: {
        id: topic._id,
        title: topic.title,
        description: topic.description
      },
      subtopics: subtopics.map(subtopic => ({
        id: subtopic._id,
        title: subtopic.title,
        description: subtopic.description,
        order: subtopic.order
      })),
      datastoreItems: datastoreItems.map(item => ({
        id: item._id,
        name: item.name,
        fileType: item.fileType
      }))
    };
    
    // Use direct URL string for the QR code
    const topicUrl = `https://aipbfrontend.vercel.app/book-viewer/${bookId}/chapters/${chapterId}/topics/${topicId}`;
    
    // Generate QR code as data URL with purple color for topics
    const qrCodeDataURL = await generateColoredQRCode(topicUrl, '#7B68EE');
    
    res.json({
      success: true,
      qrCodeDataURL,
      qrCodeType: 'topic',
      qrCodeColor: '#7B68EE', // Purple
      book: qrMetadata.book,
      chapter: qrMetadata.chapter,
      topic: qrMetadata.topic,
      subtopicsCount: subtopics.length,
      datastoreItemsCount: datastoreItems.length
    });
    
  } catch (error) {
    console.error('Error generating QR code:', error);
    res.status(500).json({
      success: false,
      message: 'Server error generating QR code'
    });
  }
});

// Get topic data when scanned from QR code
router.get('/book-data/:bookId/chapters/:chapterId/topics/:topicId', async (req, res) => {
  try {
    const { bookId, chapterId, topicId } = req.params;
    
    // Get book details
    const book = await Book.findById(bookId);
    if (!book) {
      return res.status(404).json({ 
        success: false, 
        message: 'Book not found' 
      });
    }
    
    // Get chapter details
    const chapter = await Chapter.findOne({ _id: chapterId, book: bookId });
    if (!chapter) {
      return res.status(404).json({ 
        success: false, 
        message: 'Chapter not found' 
      });
    }
    
    // Get topic details
    const topic = await Topic.findOne({ _id: topicId, chapter: chapterId });
    if (!topic) {
      return res.status(404).json({ 
        success: false, 
        message: 'Topic not found' 
      });
    }
    
    // Get all subtopics for the topic
    const subtopics = await SubTopic.find({ topic: topicId })
      .select('_id title description order content')
      .sort('order');
    
    // Get all datastore items for the topic
    const datastoreItems = await DataStore.find({ topic: topicId })
      .select('_id name url fileType');
    
    res.json({
      success: true,
      qrCodeType: 'topic',
      book: {
        id: book._id,
        title: book.title,
        coverImage: book.coverImage
      },
      chapter: {
        id: chapter._id,
        title: chapter.title
      },
      topic: {
        id: topic._id,
        title: topic.title,
        description: topic.description,
        content: topic.content,
        order: topic.order
      },
      subtopics: subtopics,
      datastoreItems: datastoreItems
    });
    
  } catch (error) {
    console.error('Error fetching topic data:', error);
    res.status(500).json({
      success: false,
      message: 'Server error fetching topic data'
    });
  }
});

// Generate QR code for a subtopic
router.get('/books/:bookId/chapters/:chapterId/topics/:topicId/subtopics/:subtopicId', async (req, res) => {
  try {
    const { bookId, chapterId, topicId, subtopicId } = req.params;
    
    // Get book details
    const book = await Book.findById(bookId);
    if (!book) {
      return res.status(404).json({ 
        success: false, 
        message: 'Book not found' 
      });
    }
    
    // Get chapter details
    const chapter = await Chapter.findOne({ _id: chapterId, book: bookId });
    if (!chapter) {
      return res.status(404).json({ 
        success: false, 
        message: 'Chapter not found' 
      });
    }
    
    // Get topic details
    const topic = await Topic.findOne({ _id: topicId, chapter: chapterId });
    if (!topic) {
      return res.status(404).json({ 
        success: false, 
        message: 'Topic not found' 
      });
    }
    
    // Get subtopic details
    const subtopic = await SubTopic.findOne({ _id: subtopicId, topic: topicId });
    if (!subtopic) {
      return res.status(404).json({ 
        success: false, 
        message: 'Sub-topic not found' 
      });
    }
    
    // Get all datastore items for the subtopic
    const datastoreItems = await DataStore.find({ subtopic: subtopicId })
      .select('_id name url fileType');
    
    // Create data object for QR code metadata
    const qrMetadata = {
      book: {
        id: book._id,
        title: book.title
      },
      chapter: {
        id: chapter._id,
        title: chapter.title
      },
      topic: {
        id: topic._id,
        title: topic.title
      },
      subtopic: {
        id: subtopic._id,
        title: subtopic.title,
        description: subtopic.description
      },
      datastoreItems: datastoreItems.map(item => ({
        id: item._id,
        name: item.name,
        fileType: item.fileType
      }))
    };
    
    // Use direct URL string for the QR code
    const subtopicUrl = `https://aipbfrontend.vercel.app/book-viewer/${bookId}/chapters/${chapterId}/topics/${topicId}/subtopics/${subtopicId}`;
    
    // Generate QR code as data URL with orange color for subtopics
    const qrCodeDataURL = await generateColoredQRCode(subtopicUrl, '#FF8C00');
    
    res.json({
      success: true,
      qrCodeDataURL,
      qrCodeType: 'subtopic',
      qrCodeColor: '#FF8C00', // Orange
      book: qrMetadata.book,
      chapter: qrMetadata.chapter,
      topic: qrMetadata.topic,
      subtopic: qrMetadata.subtopic,
      datastoreItemsCount: datastoreItems.length
    });
    
  } catch (error) {
    console.error('Error generating QR code:', error);
    res.status(500).json({
      success: false,
      message: 'Server error generating QR code'
    });
  }
});

// Get subtopic data when scanned from QR code
router.get('/book-data/:bookId/chapters/:chapterId/topics/:topicId/subtopics/:subtopicId', async (req, res) => {
  try {
    const { bookId, chapterId, topicId, subtopicId } = req.params;
    
    // Get book details
    const book = await Book.findById(bookId);
    if (!book) {
      return res.status(404).json({ 
        success: false, 
        message: 'Book not found' 
      });
    }
    
    // Get chapter details
    const chapter = await Chapter.findOne({ _id: chapterId, book: bookId });
    if (!chapter) {
      return res.status(404).json({ 
        success: false, 
        message: 'Chapter not found' 
      });
    }
    
    // Get topic details
    const topic = await Topic.findOne({ _id: topicId, chapter: chapterId });
    if (!topic) {
      return res.status(404).json({ 
        success: false, 
        message: 'Topic not found' 
      });
    }
    
    // Get subtopic details
    const subtopic = await SubTopic.findOne({ _id: subtopicId, topic: topicId });
    if (!subtopic) {
      return res.status(404).json({ 
        success: false, 
        message: 'Sub-topic not found' 
      });
    }
    
    // Get all datastore items for the subtopic
    const datastoreItems = await DataStore.find({ subtopic: subtopicId })
      .select('_id name url fileType');
    
    res.json({
      success: true,
      qrCodeType: 'subtopic',
      book: {
        id: book._id,
        title: book.title,
        coverImage: book.coverImage
      },
      chapter: {
        id: chapter._id,
        title: chapter.title
      },
      topic: {
        id: topic._id,
        title: topic.title
      },
      subtopic: {
        id: subtopic._id,
        title: subtopic.title,
        description: subtopic.description,
        content: subtopic.content,
        order: subtopic.order
      },
      datastoreItems: datastoreItems
    });
    
  } catch (error) {
    console.error('Error fetching subtopic data:', error);
    res.status(500).json({
      success: false,
      message: 'Server error fetching subtopic data'
    });
  }
});

module.exports = router;
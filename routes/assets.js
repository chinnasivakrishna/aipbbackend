const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const Summary = require('../models/Summary');
const Book = require('../models/Book');
const Chapter = require('../models/Chapter');
const Topic = require('../models/Topic');
const Subtopic = require('../models/SubTopic');
const Workbook = require('../models/Workbook');
const {verifyToken} = require('../middleware/auth');

// Helper function to get model based on item type
const getModel = (itemType) => {
  switch (itemType) {
    case 'book': return Book;
    case 'chapter': return Chapter;
    case 'topic': return Topic;
    case 'subtopic': return Subtopic;
    default: throw new Error('Invalid item type');
  }
};

// Helper function to validate item exists
const validateItemExists = async (itemType, itemId, isWorkbook = false) => {
  let Model;
  if (itemType === 'book') {
    Model = isWorkbook ? Workbook : Book;
  } else {
    Model = getModel(itemType);
  }
  
  const item = await Model.findById(itemId);
  if (!item) {
    throw new Error(`${itemType} not found`);
  }
  return item;
};

// ==================== BOOK LEVEL ROUTES ====================

// Get book details
router.get('/:bookId',  verifyToken, async (req, res) => {
  try {
    const { bookId } = req.params;
    const book = await Book.findById(bookId);
    
    if (!book) {
      return res.status(404).json({ success: false, message: 'Book not found' });
    }
    
    res.json({ success: true, book });
  } catch (error) {
    console.error('Error fetching book:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// Get book summaries
router.get('/:bookId/summaries',  verifyToken, async (req, res) => {
  try {
    const { bookId } = req.params;
    
    // Validate book exists
    await validateItemExists('book', bookId);
    
    const summaries = await Summary.find({
      itemType: 'book',
      itemId: bookId
    }).sort({ createdAt: -1 });
    
    res.json(summaries);
  } catch (error) {
    console.error('Error fetching book summaries:', error);
    res.status(500).json({ success: false, message: error.message || 'Server error' });
  }
});

// Add book summary
router.post('/:bookId/summaries',  verifyToken, async (req, res) => {
  try {
    const { bookId } = req.params;
    const { content } = req.body;
    
    if (!content || !content.trim()) {
      return res.status(400).json({ success: false, message: 'Summary content is required' });
    }
    
    // Validate book exists
    await validateItemExists('book', bookId);
    
    const summary = new Summary({
      content: content.trim(),
      itemType: 'book',
      itemId: bookId,
      createdBy: req.user.id,
      isWorkbook: false
    });
    
    const savedSummary = await summary.save();
    res.status(201).json(savedSummary);
  } catch (error) {
    console.error('Error creating book summary:', error);
    res.status(500).json({ success: false, message: error.message || 'Server error' });
  }
});

// Get other book assets (placeholder routes)
router.get('/:bookId/objective-sets',  verifyToken, async (req, res) => {
  res.json([]); // Placeholder - implement when ObjectiveSet model is ready
});

router.get('/:bookId/question-sets',  verifyToken, async (req, res) => {
  res.json([]); // Placeholder - implement when QuestionSet model is ready
});

router.get('/:bookId/videos',  verifyToken, async (req, res) => {
  res.json([]); // Placeholder - implement when Video model is ready
});

router.get('/:bookId/pyqs',  verifyToken, async (req, res) => {
  res.json([]); // Placeholder - implement when PYQ model is ready
});

// ==================== CHAPTER LEVEL ROUTES ====================

// Get chapter details
router.get('/:bookId/chapters/:chapterId',  verifyToken, async (req, res) => {
  try {
    const { chapterId } = req.params;
    const chapter = await Chapter.findById(chapterId);
    
    if (!chapter) {
      return res.status(404).json({ success: false, message: 'Chapter not found' });
    }
    
    res.json({ success: true, chapter });
  } catch (error) {
    console.error('Error fetching chapter:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// Get chapter summaries
router.get('/:bookId/chapters/:chapterId/summaries',  verifyToken, async (req, res) => {
  try {
    const { chapterId } = req.params;
    
    await validateItemExists('chapter', chapterId);
    
    const summaries = await Summary.find({
      itemType: 'chapter',
      itemId: chapterId
    }).sort({ createdAt: -1 });
    
    res.json(summaries);
  } catch (error) {
    console.error('Error fetching chapter summaries:', error);
    res.status(500).json({ success: false, message: error.message || 'Server error' });
  }
});

// Add chapter summary
router.post('/:bookId/chapters/:chapterId/summaries',  verifyToken, async (req, res) => {
  try {
    const { chapterId } = req.params;
    const { content } = req.body;
    
    if (!content || !content.trim()) {
      return res.status(400).json({ success: false, message: 'Summary content is required' });
    }
    
    await validateItemExists('chapter', chapterId);
    
    const summary = new Summary({
      content: content.trim(),
      itemType: 'chapter',
      itemId: chapterId,
      createdBy: req.user.id,
      isWorkbook: false
    });
    
    const savedSummary = await summary.save();
    res.status(201).json(savedSummary);
  } catch (error) {
    console.error('Error creating chapter summary:', error);
    res.status(500).json({ success: false, message: error.message || 'Server error' });
  }
});

// Chapter asset placeholders
router.get('/:bookId/chapters/:chapterId/objective-sets',  verifyToken, async (req, res) => {
  res.json([]);
});

router.get('/:bookId/chapters/:chapterId/question-sets',  verifyToken, async (req, res) => {
  res.json([]);
});

router.get('/:bookId/chapters/:chapterId/videos',  verifyToken, async (req, res) => {
  res.json([]);
});

router.get('/:bookId/chapters/:chapterId/pyqs',  verifyToken, async (req, res) => {
  res.json([]);
});

// ==================== TOPIC LEVEL ROUTES ====================

// Get topic details
router.get('/:bookId/chapters/:chapterId/topics/:topicId',  verifyToken, async (req, res) => {
  try {
    const { topicId } = req.params;
    const topic = await Topic.findById(topicId);
    
    if (!topic) {
      return res.status(404).json({ success: false, message: 'Topic not found' });
    }
    
    res.json({ success: true, topic });
  } catch (error) {
    console.error('Error fetching topic:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// Get topic summaries
router.get('/:bookId/chapters/:chapterId/topics/:topicId/summaries',  verifyToken, async (req, res) => {
  try {
    const { topicId } = req.params;
    
    await validateItemExists('topic', topicId);
    
    const summaries = await Summary.find({
      itemType: 'topic',
      itemId: topicId
    }).sort({ createdAt: -1 });
    
    res.json(summaries);
  } catch (error) {
    console.error('Error fetching topic summaries:', error);
    res.status(500).json({ success: false, message: error.message || 'Server error' });
  }
});

// Add topic summary
router.post('/:bookId/chapters/:chapterId/topics/:topicId/summaries',  verifyToken, async (req, res) => {
  try {
    const { topicId } = req.params;
    const { content } = req.body;
    
    if (!content || !content.trim()) {
      return res.status(400).json({ success: false, message: 'Summary content is required' });
    }
    
    await validateItemExists('topic', topicId);
    
    const summary = new Summary({
      content: content.trim(),
      itemType: 'topic',
      itemId: topicId,
      createdBy: req.user.id,
      isWorkbook: false
    });
    
    const savedSummary = await summary.save();
    res.status(201).json(savedSummary);
  } catch (error) {
    console.error('Error creating topic summary:', error);
    res.status(500).json({ success: false, message: error.message || 'Server error' });
  }
});

// Topic asset placeholders
router.get('/:bookId/chapters/:chapterId/topics/:topicId/objective-sets',  verifyToken, async (req, res) => {
  res.json([]);
});

router.get('/:bookId/chapters/:chapterId/topics/:topicId/question-sets',  verifyToken, async (req, res) => {
  res.json([]);
});

router.get('/:bookId/chapters/:chapterId/topics/:topicId/videos',  verifyToken, async (req, res) => {
  res.json([]);
});

router.get('/:bookId/chapters/:chapterId/topics/:topicId/pyqs',  verifyToken, async (req, res) => {
  res.json([]);
});

// ==================== SUBTOPIC LEVEL ROUTES ====================

// Get subtopic details
router.get('/:bookId/chapters/:chapterId/topics/:topicId/subtopics/:subtopicId',  verifyToken, async (req, res) => {
  try {
    const { subtopicId } = req.params;
    const subtopic = await Subtopic.findById(subtopicId);
    
    if (!subtopic) {
      return res.status(404).json({ success: false, message: 'Subtopic not found' });
    }
    
    res.json({ success: true, subtopic });
  } catch (error) {
    console.error('Error fetching subtopic:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// Get subtopic summaries
router.get('/:bookId/chapters/:chapterId/topics/:topicId/subtopics/:subtopicId/summaries',  verifyToken, async (req, res) => {
  try {
    const { subtopicId } = req.params;
    
    await validateItemExists('subtopic', subtopicId);
    
    const summaries = await Summary.find({
      itemType: 'subtopic',
      itemId: subtopicId
    }).sort({ createdAt: -1 });
    
    res.json(summaries);
  } catch (error) {
    console.error('Error fetching subtopic summaries:', error);
    res.status(500).json({ success: false, message: error.message || 'Server error' });
  }
});

// Add subtopic summary
router.post('/:bookId/chapters/:chapterId/topics/:topicId/subtopics/:subtopicId/summaries',  verifyToken, async (req, res) => {
  try {
    const { subtopicId } = req.params;
    const { content } = req.body;
    
    if (!content || !content.trim()) {
      return res.status(400).json({ success: false, message: 'Summary content is required' });
    }
    
    await validateItemExists('subtopic', subtopicId);
    
    const summary = new Summary({
      content: content.trim(),
      itemType: 'subtopic',
      itemId: subtopicId,
      createdBy: req.user.id,
      isWorkbook: false
    });
    
    const savedSummary = await summary.save();
    res.status(201).json(savedSummary);
  } catch (error) {
    console.error('Error creating subtopic summary:', error);
    res.status(500).json({ success: false, message: error.message || 'Server error' });
  }
});

// Subtopic asset placeholders
router.get('/:bookId/chapters/:chapterId/topics/:topicId/subtopics/:subtopicId/objective-sets',  verifyToken, async (req, res) => {
  res.json([]);
});

router.get('/:bookId/chapters/:chapterId/topics/:topicId/subtopics/:subtopicId/question-sets',  verifyToken, async (req, res) => {
  res.json([]);
});

router.get('/:bookId/chapters/:chapterId/topics/:topicId/subtopics/:subtopicId/videos',  verifyToken, async (req, res) => {
  res.json([]);
});

router.get('/:bookId/chapters/:chapterId/topics/:topicId/subtopics/:subtopicId/pyqs',  verifyToken, async (req, res) => {
  res.json([]);
});

// ==================== WORKBOOK ROUTES ====================

// Workbook routes (similar structure but for workbooks)
router.get('/workbooks/:workbookId',  verifyToken, async (req, res) => {
  try {
    const { workbookId } = req.params;
    const workbook = await Workbook.findById(workbookId);
    
    if (!workbook) {
      return res.status(404).json({ success: false, message: 'Workbook not found' });
    }
    
    res.json({ success: true, workbook });
  } catch (error) {
    console.error('Error fetching workbook:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// Workbook summaries
router.get('/workbooks/:workbookId/summaries',  verifyToken, async (req, res) => {
  try {
    const { workbookId } = req.params;
    
    await validateItemExists('book', workbookId, true);
    
    const summaries = await Summary.find({
      itemType: 'book',
      itemId: workbookId,
      isWorkbook: true
    }).sort({ createdAt: -1 });
    
    res.json(summaries);
  } catch (error) {
    console.error('Error fetching workbook summaries:', error);
    res.status(500).json({ success: false, message: error.message || 'Server error' });
  }
});

router.post('/workbooks/:workbookId/summaries',  verifyToken, async (req, res) => {
  try {
    const { workbookId } = req.params;
    const { content } = req.body;
    
    if (!content || !content.trim()) {
      return res.status(400).json({ success: false, message: 'Summary content is required' });
    }
    
    await validateItemExists('book', workbookId, true);
    
    const summary = new Summary({
      content: content.trim(),
      itemType: 'book',
      itemId: workbookId,
      createdBy: req.user.id,
      isWorkbook: true
    });
    
    const savedSummary = await summary.save();
    res.status(201).json(savedSummary);
  } catch (error) {
    console.error('Error creating workbook summary:', error);
    res.status(500).json({ success: false, message: error.message || 'Server error' });
  }
});

// Workbook chapter routes
router.get('/workbooks/:workbookId/chapters/:chapterId',  verifyToken, async (req, res) => {
  try {
    const { chapterId } = req.params;
    const chapter = await Chapter.findById(chapterId);
    
    if (!chapter) {
      return res.status(404).json({ success: false, message: 'Chapter not found' });
    }
    
    res.json({ success: true, chapter });
  } catch (error) {
    console.error('Error fetching chapter:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

router.get('/workbooks/:workbookId/chapters/:chapterId/summaries',  verifyToken, async (req, res) => {
  try {
    const { chapterId } = req.params;
    
    await validateItemExists('chapter', chapterId);
    
    const summaries = await Summary.find({
      itemType: 'chapter',
      itemId: chapterId,
      isWorkbook: true
    }).sort({ createdAt: -1 });
    
    res.json(summaries);
  } catch (error) {
    console.error('Error fetching workbook chapter summaries:', error);
    res.status(500).json({ success: false, message: error.message || 'Server error' });
  }
});

router.post('/workbooks/:workbookId/chapters/:chapterId/summaries',  verifyToken, async (req, res) => {
  try {
    const { chapterId } = req.params;
    const { content } = req.body;
    
    if (!content || !content.trim()) {
      return res.status(400).json({ success: false, message: 'Summary content is required' });
    }
    
    await validateItemExists('chapter', chapterId);
    
    const summary = new Summary({
      content: content.trim(),
      itemType: 'chapter',
      itemId: chapterId,
      createdBy: req.user.id,
      isWorkbook: true
    });
    
    const savedSummary = await summary.save();
    res.status(201).json(savedSummary);
  } catch (error) {
    console.error('Error creating workbook chapter summary:', error);
    res.status(500).json({ success: false, message: error.message || 'Server error' });
  }
});

// Additional workbook routes for topics and subtopics would follow the same pattern...

module.exports = router;
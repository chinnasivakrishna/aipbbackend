const express = require('express');
const router = express.Router();
const DataStoreItem = require('../models/DatastoreItems');
const Book = require('../models/Book');
const Topic = require('../models/Topic');
const Chapter = require('../models/Chapter');
const SubTopic = require('../models/SubTopic');
const { verifyToken } = require('../middleware/auth');

// Get all book items
router.get('/book/:bookId',verifyToken, async (req, res) => {
  try {
    const { bookId } = req.params;

    // Check if book exists and belongs to user
    const book = await Book.findOne({ _id: bookId, user: req.user.id });
    if (!book) {
      return res.status(404).json({ success: false, message: 'Book not found' });
    }

    const items = await DataStoreItem.find({ book: bookId })
      .sort({ createdAt: -1 });

    return res.json({ success: true, items });
  } catch (error) {
    console.error('Error getting book items:', error);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
});

// Get all chapter items
router.get('/chapter/:chapterId',verifyToken, async (req, res) => {
  try {
    const { chapterId } = req.params;

    // Check if chapter exists and belongs to user
    const chapter = await Chapter.findById(chapterId).populate('book');
    if (!chapter) {
      return res.status(404).json({ success: false, message: 'Chapter not found' });
    }

    // Verify user owns the book that contains this chapter
    const book = await Book.findOne({ _id: chapter.book, user: req.user.id });
    if (!book) {
      return res.status(403).json({ success: false, message: 'Unauthorized' });
    }

    const items = await DataStoreItem.find({ chapter: chapterId })
      .sort({ createdAt: -1 });

    return res.json({ success: true, items });
  } catch (error) {
    console.error('Error getting chapter items:', error);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
});

// Upload files to book data store
router.post('/book/:bookId',verifyToken, async (req, res) => {
  try {
    const { bookId } = req.params;
    const { items } = req.body;

    if (!items || !Array.isArray(items)) {
      return res.status(400).json({ success: false, message: 'No items provided' });
    }

    // Check if book exists and belongs to user
    const book = await Book.findOne({ _id: bookId, user: req.user.id });
    if (!book) {
      return res.status(404).json({ success: false, message: 'Book not found' });
    }

    const savedItems = [];
    for (const item of items) {
      const newItem = new DataStoreItem({
        name: item.name,
        url: item.url,
        fileType: item.fileType || 'application/octet-stream',
        book: bookId,
        user: req.user.id
      });

      await newItem.save();
      savedItems.push(newItem);
    }

    return res.json({ success: true, message: 'Files uploaded successfully', items: savedItems });
  } catch (error) {
    console.error('Error uploading to book data store:', error);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
});

// Upload files to chapter data store
router.post('/chapter/:chapterId',verifyToken, async (req, res) => {
  try {
    const { chapterId } = req.params;
    const { items } = req.body;

    if (!items || !Array.isArray(items)) {
      return res.status(400).json({ success: false, message: 'No items provided' });
    }

    // Check if chapter exists
    const chapter = await Chapter.findById(chapterId).populate('book');
    if (!chapter) {
      return res.status(404).json({ success: false, message: 'Chapter not found' });
    }

    // Verify user owns the book that contains this chapter
    const book = await Book.findOne({ _id: chapter.book, user: req.user.id });
    if (!book) {
      return res.status(403).json({ success: false, message: 'Unauthorized' });
    }

    const savedItems = [];
    for (const item of items) {
      const newItem = new DataStoreItem({
        name: item.name,
        url: item.url,
        fileType: item.fileType || 'application/octet-stream',
        chapter: chapterId,
        user: req.user.id
      });

      await newItem.save();
      savedItems.push(newItem);
    }

    return res.json({ success: true, message: 'Files uploaded successfully', items: savedItems });
  } catch (error) {
    console.error('Error uploading to chapter data store:', error);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
});

// Delete an item
router.delete('/book/:bookId/:itemId',verifyToken, async (req, res) => {
  try {
    const { bookId, itemId } = req.params;

    const item = await DataStoreItem.findById(itemId);
    if (!item) {
      return res.status(404).json({ success: false, message: 'Item not found' });
    }

    // Verify that the item belongs to a book owned by this user
    if (item.book && item.book.toString() !== bookId) {
      return res.status(403).json({ success: false, message: 'Unauthorized' });
    }

    const book = await Book.findOne({ _id: bookId, user: req.user.id });
    if (!book) {
      return res.status(403).json({ success: false, message: 'Unauthorized' });
    }

    await item.remove();
    return res.json({ success: true, message: 'Item deleted successfully' });
  } catch (error) {
    console.error('Error deleting item:', error);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
});

router.delete('/chapter/:chapterId/:itemId',verifyToken, async (req, res) => {
  try {
    const { chapterId, itemId } = req.params;

    const item = await DataStoreItem.findById(itemId);
    if (!item) {
      return res.status(404).json({ success: false, message: 'Item not found' });
    }

    // Verify that the item belongs to a chapter owned by this user
    if (item.chapter && item.chapter.toString() !== chapterId) {
      return res.status(403).json({ success: false, message: 'Unauthorized' });
    }

    const chapter = await Chapter.findById(chapterId).populate('book');
    if (!chapter) {
      return res.status(404).json({ success: false, message: 'Chapter not found' });
    }

    const book = await Book.findOne({ _id: chapter.book, user: req.user.id });
    if (!book) {
      return res.status(403).json({ success: false, message: 'Unauthorized' });
    }

    await item.remove();
    return res.json({ success: true, message: 'Item deleted successfully' });
  } catch (error) {
    console.error('Error deleting item:', error);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
});

// Get all topic items
router.get('/topic/:topicId', verifyToken, async (req, res) => {
  try {
    const { topicId } = req.params;

    // Check if topic exists and belongs to user
    const topic = await Topic.findById(topicId).populate('chapter');
    if (!topic) {
      return res.status(404).json({ success: false, message: 'Topic not found' });
    }

    // Verify user owns the book that contains this topic
    const chapter = await Chapter.findById(topic.chapter).populate('book');
    const book = await Book.findOne({ _id: chapter.book, user: req.user.id });
    if (!book) {
      return res.status(403).json({ success: false, message: 'Unauthorized' });
    }

    const items = await DataStoreItem.find({ topic: topicId })
      .sort({ createdAt: -1 });

    return res.json({ success: true, items });
  } catch (error) {
    console.error('Error getting topic items:', error);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
});

// Upload files to topic data store
router.post('/topic/:topicId', verifyToken, async (req, res) => {
  try {
    const { topicId } = req.params;
    const { items } = req.body;

    if (!items || !Array.isArray(items)) {
      return res.status(400).json({ success: false, message: 'No items provided' });
    }

    // Check if topic exists
    const topic = await Topic.findById(topicId).populate('chapter');
    if (!topic) {
      return res.status(404).json({ success: false, message: 'Topic not found' });
    }

    // Verify user owns the book that contains this topic
    const chapter = await Chapter.findById(topic.chapter).populate('book');
    const book = await Book.findOne({ _id: chapter.book, user: req.user.id });
    if (!book) {
      return res.status(403).json({ success: false, message: 'Unauthorized' });
    }

    const savedItems = [];
    for (const item of items) {
      const newItem = new DataStoreItem({
        name: item.name,
        url: item.url,
        fileType: item.fileType || 'application/octet-stream',
        topic: topicId,
        user: req.user.id
      });

      await newItem.save();
      savedItems.push(newItem);
    }

    return res.json({ success: true, message: 'Files uploaded successfully', items: savedItems });
  } catch (error) {
    console.error('Error uploading to topic data store:', error);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
});

// Delete a topic item
router.delete('/topic/:topicId/:itemId', verifyToken, async (req, res) => {
  try {
    const { topicId, itemId } = req.params;

    const item = await DataStoreItem.findById(itemId);
    if (!item) {
      return res.status(404).json({ success: false, message: 'Item not found' });
    }

    // Verify that the item belongs to a topic owned by this user
    if (item.topic && item.topic.toString() !== topicId) {
      return res.status(403).json({ success: false, message: 'Unauthorized' });
    }

    const topic = await Topic.findById(topicId).populate('chapter');
    if (!topic) {
      return res.status(404).json({ success: false, message: 'Topic not found' });
    }

    const chapter = await Chapter.findById(topic.chapter).populate('book');
    const book = await Book.findOne({ _id: chapter.book, user: req.user.id });
    if (!book) {
      return res.status(403).json({ success: false, message: 'Unauthorized' });
    }

    await item.remove();
    return res.json({ success: true, message: 'Item deleted successfully' });
  } catch (error) {
    console.error('Error deleting item:', error);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
});

// --- NEW CODE FOR SUBTOPICS ---

// Get all subtopic items
router.get('/subtopic/:subtopicId', verifyToken, async (req, res) => {
  try {
    const { subtopicId } = req.params;

    // Check if subtopic exists
    const subtopic = await SubTopic.findById(subtopicId).populate('topic');
    if (!subtopic) {
      return res.status(404).json({ success: false, message: 'Subtopic not found' });
    }

    // Verify user owns the book that contains this subtopic
    const topic = await Topic.findById(subtopic.topic).populate('chapter');
    const chapter = await Chapter.findById(topic.chapter).populate('book');
    const book = await Book.findOne({ _id: chapter.book, user: req.user.id });
    if (!book) {
      return res.status(403).json({ success: false, message: 'Unauthorized' });
    }

    const items = await DataStoreItem.find({ subtopic: subtopicId })
      .sort({ createdAt: -1 });

    return res.json({ success: true, items });
  } catch (error) {
    console.error('Error getting subtopic items:', error);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
});

// Upload files to subtopic data store
router.post('/subtopic/:subtopicId', verifyToken, async (req, res) => {
  try {
    const { subtopicId } = req.params;
    const { items } = req.body;

    if (!items || !Array.isArray(items)) {
      return res.status(400).json({ success: false, message: 'No items provided' });
    }

    // Check if subtopic exists
    const subtopic = await SubTopic.findById(subtopicId).populate('topic');
    if (!subtopic) {
      return res.status(404).json({ success: false, message: 'Subtopic not found' });
    }

    // Verify user owns the book that contains this subtopic
    const topic = await Topic.findById(subtopic.topic).populate('chapter');
    const chapter = await Chapter.findById(topic.chapter).populate('book');
    const book = await Book.findOne({ _id: chapter.book, user: req.user.id });
    if (!book) {
      return res.status(403).json({ success: false, message: 'Unauthorized' });
    }

    const savedItems = [];
    for (const item of items) {
      const newItem = new DataStoreItem({
        name: item.name,
        url: item.url,
        fileType: item.fileType || 'application/octet-stream',
        subtopic: subtopicId,
        user: req.user.id
      });

      await newItem.save();
      savedItems.push(newItem);
    }

    return res.json({ success: true, message: 'Files uploaded successfully', items: savedItems });
  } catch (error) {
    console.error('Error uploading to subtopic data store:', error);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
});

// Delete a subtopic item
router.delete('/subtopic/:subtopicId/:itemId', verifyToken, async (req, res) => {
  try {
    const { subtopicId, itemId } = req.params;

    const item = await DataStoreItem.findById(itemId);
    if (!item) {
      return res.status(404).json({ success: false, message: 'Item not found' });
    }

    // Verify that the item belongs to a subtopic owned by this user
    if (item.subtopic && item.subtopic.toString() !== subtopicId) {
      return res.status(403).json({ success: false, message: 'Unauthorized' });
    }

    const subtopic = await SubTopic.findById(subtopicId).populate('topic');
    if (!subtopic) {
      return res.status(404).json({ success: false, message: 'Subtopic not found' });
    }

    const topic = await Topic.findById(subtopic.topic).populate('chapter');
    const chapter = await Chapter.findById(topic.chapter).populate('book');
    const book = await Book.findOne({ _id: chapter.book, user: req.user.id });
    if (!book) {
      return res.status(403).json({ success: false, message: 'Unauthorized' });
    }

    await item.remove();
    return res.json({ success: true, message: 'Item deleted successfully' });
  } catch (error) {
    console.error('Error deleting item:', error);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
});

module.exports = router;
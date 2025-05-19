const express = require('express');
const router = express.Router();
const { verifyToken } = require('../middleware/auth');
const SubTopic = require('../models/SubTopic');
const Topic = require('../models/Topic');
const Book = require('../models/Book');
const Chapter = require('../models/Chapter');

// Get sub-topics for a specific topic
router.get('/:topicId/subtopics', verifyToken, async (req, res) => {
  try {
    const { topicId } = req.params;

    // Verify topic exists and belongs to user's book
    const topic = await Topic.findById(topicId).populate('chapter');
    if (!topic) {
      return res.status(404).json({ success: false, message: 'Topic not found' });
    }

    const chapter = await Chapter.findById(topic.chapter).populate('book');
    const book = await Book.findOne({ _id: chapter.book, user: req.user.id });
    if (!book) {
      return res.status(403).json({ success: false, message: 'Unauthorized' });
    }

    const subtopics = await SubTopic.find({ topic: topicId }).sort({ order: 1 });
    return res.json({ success: true, subtopics });
  } catch (error) {
    console.error('Error getting subtopics:', error);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
});

// Create a new sub-topic
router.post('/:topicId/subtopics', verifyToken, async (req, res) => {
  try {
    const { topicId } = req.params;
    const { title, description, content, order } = req.body;

    // Verify topic exists and belongs to user's book
    const topic = await Topic.findById(topicId).populate('chapter');
    if (!topic) {
      return res.status(404).json({ success: false, message: 'Topic not found' });
    }

    const chapter = await Chapter.findById(topic.chapter).populate('book');
    const book = await Book.findOne({ _id: chapter.book, user: req.user.id });
    if (!book) {
      return res.status(403).json({ success: false, message: 'Unauthorized' });
    }

    // Create new sub-topic
    const subtopic = new SubTopic({
      title,
      description,
      content: content || '',
      topic: topicId,
      order: order || 0
    });

    await subtopic.save();
    return res.status(201).json({ success: true, subtopic });
  } catch (error) {
    console.error('Error creating subtopic:', error);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
});

// Get a specific sub-topic
router.get('/:topicId/subtopics/:subtopicId', verifyToken, async (req, res) => {
  try {
    const { topicId, subtopicId } = req.params;

    // Verify topic exists and belongs to user's book
    const topic = await Topic.findById(topicId).populate('chapter');
    if (!topic) {
      return res.status(404).json({ success: false, message: 'Topic not found' });
    }

    const chapter = await Chapter.findById(topic.chapter).populate('book');
    const book = await Book.findOne({ _id: chapter.book, user: req.user.id });
    if (!book) {
      return res.status(403).json({ success: false, message: 'Unauthorized' });
    }

    const subtopic = await SubTopic.findOne({ _id: subtopicId, topic: topicId });
    if (!subtopic) {
      return res.status(404).json({ success: false, message: 'Sub-topic not found' });
    }

    return res.json({ success: true, subtopic });
  } catch (error) {
    console.error('Error getting subtopic:', error);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
});

// Update a sub-topic
router.put('/:topicId/subtopics/:subtopicId', verifyToken, async (req, res) => {
  try {
    const { topicId, subtopicId } = req.params;
    const { title, description, content, order } = req.body;

    // Verify topic exists and belongs to user's book
    const topic = await Topic.findById(topicId).populate('chapter');
    if (!topic) {
      return res.status(404).json({ success: false, message: 'Topic not found' });
    }

    const chapter = await Chapter.findById(topic.chapter).populate('book');
    const book = await Book.findOne({ _id: chapter.book, user: req.user.id });
    if (!book) {
      return res.status(403).json({ success: false, message: 'Unauthorized' });
    }

    // Find and update sub-topic
    const subtopic = await SubTopic.findOne({ _id: subtopicId, topic: topicId });
    if (!subtopic) {
      return res.status(404).json({ success: false, message: 'Sub-topic not found' });
    }

    // Update fields
    if (title) subtopic.title = title;
    if (description) subtopic.description = description;
    if (content !== undefined) subtopic.content = content;
    if (order !== undefined) subtopic.order = order;
    subtopic.updatedAt = Date.now();

    await subtopic.save();
    return res.json({ success: true, subtopic });
  } catch (error) {
    console.error('Error updating subtopic:', error);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
});

// Delete a sub-topic
router.delete('/:topicId/subtopics/:subtopicId', verifyToken, async (req, res) => {
  try {
    const { topicId, subtopicId } = req.params;

    // Verify topic exists and belongs to user's book
    const topic = await Topic.findById(topicId).populate('chapter');
    if (!topic) {
      return res.status(404).json({ success: false, message: 'Topic not found' });
    }

    const chapter = await Chapter.findById(topic.chapter).populate('book');
    const book = await Book.findOne({ _id: chapter.book, user: req.user.id });
    if (!book) {
      return res.status(403).json({ success: false, message: 'Unauthorized' });
    }

    // Find and delete sub-topic
    const subtopic = await SubTopic.findOne({ _id: subtopicId, topic: topicId });
    if (!subtopic) {
      return res.status(404).json({ success: false, message: 'Sub-topic not found' });
    }

    await subtopic.remove();
    return res.json({ success: true, message: 'Sub-topic deleted successfully' });
  } catch (error) {
    console.error('Error deleting subtopic:', error);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
});

module.exports = router;
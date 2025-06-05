// controllers/subtopicController.js
const SubTopic = require('../models/SubTopic');
const Topic = require('../models/Topic');
const Chapter = require('../models/Chapter');
const Book = require('../models/Book');

// @desc    Get all subtopics for a topic
// @route   GET /api/books/:bookId/chapters/:chapterId/topics/:topicId/subtopics
// @access  Private
exports.getSubTopics = async (req, res) => {
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
};

// @desc    Get a single subtopic
// @route   GET /api/books/:bookId/chapters/:chapterId/topics/:topicId/subtopics/:id
// @access  Private
exports.getSubTopic = async (req, res) => {
  try {
    const { topicId, id: subtopicId } = req.params;

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
};

// @desc    Create a new subtopic
// @route   POST /api/books/:bookId/chapters/:chapterId/topics/:topicId/subtopics
// @access  Private
exports.createSubTopic = async (req, res) => {
  try {
    const { topicId } = req.params;
    const { title, description, content, order } = req.body;

    // Validate required fields
    if (!title) {
      return res.status(400).json({ success: false, message: 'Title is required' });
    }

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
      description: description || '',
      content: content || '',
      topic: topicId,
      order: order !== undefined ? order : 0
    });

    await subtopic.save();
    return res.status(201).json({ success: true, subtopic });
  } catch (error) {
    console.error('Error creating subtopic:', error);
    if (error.name === 'ValidationError') {
      const messages = Object.values(error.errors).map(val => val.message);
      return res.status(400).json({ success: false, message: messages.join(', ') });
    }
    return res.status(500).json({ success: false, message: 'Server error' });
  }
};

// @desc    Update a subtopic
// @route   PUT /api/books/:bookId/chapters/:chapterId/topics/:topicId/subtopics/:id
// @access  Private
exports.updateSubTopic = async (req, res) => {
  try {
    const { topicId, id: subtopicId } = req.params;
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
    if (title !== undefined) subtopic.title = title;
    if (description !== undefined) subtopic.description = description;
    if (content !== undefined) subtopic.content = content;
    if (order !== undefined) subtopic.order = order;
    subtopic.updatedAt = Date.now();

    await subtopic.save();
    return res.json({ success: true, subtopic });
  } catch (error) {
    console.error('Error updating subtopic:', error);
    if (error.name === 'ValidationError') {
      const messages = Object.values(error.errors).map(val => val.message);
      return res.status(400).json({ success: false, message: messages.join(', ') });
    }
    return res.status(500).json({ success: false, message: 'Server error' });
  }
};

// @desc    Delete a subtopic
// @route   DELETE /api/books/:bookId/chapters/:chapterId/topics/:topicId/subtopics/:id
// @access  Private
exports.deleteSubTopic = async (req, res) => {
  try {
    const { topicId, id: subtopicId } = req.params;

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
    const subtopic = await SubTopic.findOneAndDelete({ _id: subtopicId, topic: topicId });
    if (!subtopic) {
      return res.status(404).json({ success: false, message: 'Sub-topic not found' });
    }

    return res.json({ success: true, message: 'Sub-topic deleted successfully' });
  } catch (error) {
    console.error('Error deleting subtopic:', error);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
};
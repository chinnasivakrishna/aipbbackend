// controllers/workbookSubtopicController.js
const SubTopic = require('../models/SubTopic');
const Topic = require('../models/Topic');
const Chapter = require('../models/Chapter');
const Workbook = require('../models/Workbook');

// @desc    Get all subtopics for a topic
// @route   GET /api/workbooks/:workbookId/chapters/:chapterId/topics/:topicId/subtopics
// @access  Private
exports.getSubTopics = async (req, res) => {
  try {
    const { topicId } = req.params;

    // Verify topic exists and belongs to user's workbook
    const topic = await Topic.findById(topicId).populate({
      path: 'chapter',
      match: { parentType: 'workbook' }
    });
    
    if (!topic || !topic.chapter) {
      return res.status(404).json({ success: false, message: 'Topic not found' });
    }

    const chapter = await Chapter.findById(topic.chapter._id);
    if (!chapter || chapter.parentType !== 'workbook') {
      return res.status(404).json({ success: false, message: 'Chapter not found or not part of a workbook' });
    }

    const workbook = await Workbook.findOne({ 
      _id: chapter.workbook, 
      user: req.user.id 
    });
    
    if (!workbook) {
      return res.status(403).json({ success: false, message: 'Not authorized to access this workbook' });
    }

    const subtopics = await SubTopic.find({ topic: topicId }).sort({ order: 1 });
    return res.json({ success: true, count: subtopics.length, subtopics });
  } catch (error) {
    console.error('Error getting subtopics:', error);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
};

// @desc    Get a single subtopic
// @route   GET /api/workbooks/:workbookId/chapters/:chapterId/topics/:topicId/subtopics/:subtopicId
// @access  Private
exports.getSubTopic = async (req, res) => {
  try {
    const { topicId, subtopicId } = req.params;

    // Verify topic exists and belongs to user's workbook
    const topic = await Topic.findById(topicId).populate({
      path: 'chapter',
      match: { parentType: 'workbook' }
    });
    
    if (!topic || !topic.chapter) {
      return res.status(404).json({ success: false, message: 'Topic not found' });
    }

    const chapter = await Chapter.findById(topic.chapter._id);
    if (!chapter || chapter.parentType !== 'workbook') {
      return res.status(404).json({ success: false, message: 'Chapter not found or not part of a workbook' });
    }

    const workbook = await Workbook.findOne({ 
      _id: chapter.workbook, 
      user: req.user.id 
    });
    
    if (!workbook) {
      return res.status(403).json({ success: false, message: 'Not authorized to access this workbook' });
    }

    const subtopic = await SubTopic.findOne({ _id: subtopicId, topic: topicId });
    if (!subtopic) {
      return res.status(404).json({ success: false, message: 'Subtopic not found' });
    }

    return res.json({ success: true, subtopic });
  } catch (error) {
    console.error('Error getting subtopic:', error);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
};

// @desc    Create a new subtopic
// @route   POST /api/workbooks/:workbookId/chapters/:chapterId/topics/:topicId/subtopics
// @access  Private
exports.createSubTopic = async (req, res) => {
  try {
    const { topicId } = req.params;
    const { title, description, content, order } = req.body;

    // Validate required fields
    if (!title) {
      return res.status(400).json({ success: false, message: 'Title is required' });
    }

    // Verify topic exists and belongs to user's workbook
    const topic = await Topic.findById(topicId).populate({
      path: 'chapter',
      match: { parentType: 'workbook' }
    });
    
    if (!topic || !topic.chapter) {
      return res.status(404).json({ success: false, message: 'Topic not found' });
    }

    const chapter = await Chapter.findById(topic.chapter._id);
    if (!chapter || chapter.parentType !== 'workbook') {
      return res.status(404).json({ success: false, message: 'Chapter not found or not part of a workbook' });
    }

    const workbook = await Workbook.findOne({ 
      _id: chapter.workbook, 
      user: req.user.id 
    });
    
    if (!workbook) {
      return res.status(403).json({ success: false, message: 'Not authorized to access this workbook' });
    }

    // Find max order if not specified
    let maxOrder = 0;
    if (order === undefined) {
      const lastSubtopic = await SubTopic.findOne({ topic: topicId })
        .sort('-order')
        .limit(1);
      
      if (lastSubtopic) {
        maxOrder = lastSubtopic.order + 1;
      }
    }

    // Create new subtopic
    const subtopic = new SubTopic({
      title,
      description: description || '',
      content: content || '',
      topic: topicId,
      order: order !== undefined ? order : maxOrder
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
// @route   PUT /api/workbooks/:workbookId/chapters/:chapterId/topics/:topicId/subtopics/:subtopicId
// @access  Private
exports.updateSubTopic = async (req, res) => {
  try {
    const { topicId, subtopicId } = req.params;
    const { title, description, content, order } = req.body;

    // Verify topic exists and belongs to user's workbook
    const topic = await Topic.findById(topicId).populate({
      path: 'chapter',
      match: { parentType: 'workbook' }
    });
    
    if (!topic || !topic.chapter) {
      return res.status(404).json({ success: false, message: 'Topic not found' });
    }

    const chapter = await Chapter.findById(topic.chapter._id);
    if (!chapter || chapter.parentType !== 'workbook') {
      return res.status(404).json({ success: false, message: 'Chapter not found or not part of a workbook' });
    }

    const workbook = await Workbook.findOne({ 
      _id: chapter.workbook, 
      user: req.user.id 
    });
    
    if (!workbook) {
      return res.status(403).json({ success: false, message: 'Not authorized to access this workbook' });
    }

    const subtopic = await SubTopic.findOne({ _id: subtopicId, topic: topicId });
    if (!subtopic) {
      return res.status(404).json({ success: false, message: 'Subtopic not found' });
    }

    // Update fields
    subtopic.title = title || subtopic.title;
    subtopic.description = description !== undefined ? description : subtopic.description;
    subtopic.content = content !== undefined ? content : subtopic.content;
    subtopic.order = order !== undefined ? order : subtopic.order;
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
// @route   DELETE /api/workbooks/:workbookId/chapters/:chapterId/topics/:topicId/subtopics/:subtopicId
// @access  Private
exports.deleteSubTopic = async (req, res) => {
  try {
    const { topicId, subtopicId } = req.params;

    // Verify topic exists and belongs to user's workbook
    const topic = await Topic.findById(topicId).populate({
      path: 'chapter',
      match: { parentType: 'workbook' }
    });
    
    if (!topic || !topic.chapter) {
      return res.status(404).json({ success: false, message: 'Topic not found' });
    }

    const chapter = await Chapter.findById(topic.chapter._id);
    if (!chapter || chapter.parentType !== 'workbook') {
      return res.status(404).json({ success: false, message: 'Chapter not found or not part of a workbook' });
    }

    const workbook = await Workbook.findOne({ 
      _id: chapter.workbook, 
      user: req.user.id 
    });
    
    if (!workbook) {
      return res.status(403).json({ success: false, message: 'Not authorized to access this workbook' });
    }

    const subtopic = await SubTopic.findOne({ _id: subtopicId, topic: topicId });
    if (!subtopic) {
      return res.status(404).json({ success: false, message: 'Subtopic not found' });
    }

    await SubTopic.deleteOne({ _id: subtopicId });
    return res.json({ success: true, message: 'Subtopic deleted successfully' });
  } catch (error) {
    console.error('Error deleting subtopic:', error);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
}; 
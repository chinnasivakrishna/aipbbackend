const Topic = require('../models/Topic');
const Chapter = require('../models/Chapter');
const Workbook = require('../models/Workbook');

// @desc    Get all topics for a chapter
// @route   GET /api/workbooks/:workbookId/chapters/:chapterId/topics
// @access  Private
exports.getTopics = async (req, res) => {
  try {
    const workbook = await Workbook.findById(req.params.workbookId);
    
    if (!workbook) {
      return res.status(404).json({
        success: false,
        message: 'Workbook not found'
      });
    }
    
    // Check if workbook belongs to user
    if (workbook.user.toString() !== req.user.id) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to access this workbook'
      });
    }
    
    const chapter = await Chapter.findOne({
      _id: req.params.chapterId,
      workbook: req.params.workbookId,
      parentType: 'workbook'
    });
    
    if (!chapter) {
      return res.status(404).json({
        success: false,
        message: 'Chapter not found'
      });
    }
    
    const topics = await Topic.find({ chapter: req.params.chapterId }).sort('order');
    
    return res.status(200).json({
      success: true,
      count: topics.length,
      topics
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({
      success: false,
      message: 'Server Error'
    });
  }
};

// @desc    Get single topic
// @route   GET /api/workbooks/:workbookId/chapters/:chapterId/topics/:topicId
// @access  Private
exports.getTopic = async (req, res) => {
  try {
    const workbook = await Workbook.findById(req.params.workbookId);
    
    if (!workbook) {
      return res.status(404).json({
        success: false,
        message: 'Workbook not found'
      });
    }
    
    // Check if workbook belongs to user
    if (workbook.user.toString() !== req.user.id) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to access this workbook'
      });
    }
    
    const chapter = await Chapter.findOne({
      _id: req.params.chapterId,
      workbook: req.params.workbookId,
      parentType: 'workbook'
    });
    
    if (!chapter) {
      return res.status(404).json({
        success: false,
        message: 'Chapter not found'
      });
    }
    
    const topic = await Topic.findOne({
      _id: req.params.topicId,
      chapter: req.params.chapterId
    });
    
    if (!topic) {
      return res.status(404).json({
        success: false,
        message: 'Topic not found'
      });
    }
    
    return res.status(200).json({
      success: true,
      topic
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({
      success: false,
      message: 'Server Error'
    });
  }
};

// @desc    Create new topic
// @route   POST /api/workbooks/:workbookId/chapters/:chapterId/topics
// @access  Private
exports.createTopic = async (req, res) => {
  try {
    const workbook = await Workbook.findById(req.params.workbookId);
    
    if (!workbook) {
      return res.status(404).json({
        success: false,
        message: 'Workbook not found'
      });
    }
    
    // Check if workbook belongs to user
    if (workbook.user.toString() !== req.user.id) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to access this workbook'
      });
    }
    
    const chapter = await Chapter.findOne({
      _id: req.params.chapterId,
      workbook: req.params.workbookId,
      parentType: 'workbook'
    });
    
    if (!chapter) {
      return res.status(404).json({
        success: false,
        message: 'Chapter not found'
      });
    }
    
    const { title, description, content, order } = req.body;
    
    // Get the current maximum order value
    let maxOrder = 0;
    if (!order) {
      const lastTopic = await Topic.findOne({ chapter: req.params.chapterId })
        .sort('-order')
        .limit(1);
      
      if (lastTopic) {
        maxOrder = lastTopic.order + 1;
      }
    }
    
    // Create topic
    const topic = await Topic.create({
      title,
      description,
      content,
      chapter: req.params.chapterId,
      order: order || maxOrder
    });
    
    return res.status(201).json({
      success: true,
      topic
    });
  } catch (error) {
    console.error(error);
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

// @desc    Update topic
// @route   PUT /api/workbooks/:workbookId/chapters/:chapterId/topics/:topicId
// @access  Private
exports.updateTopic = async (req, res) => {
  try {
    const workbook = await Workbook.findById(req.params.workbookId);
    
    if (!workbook) {
      return res.status(404).json({
        success: false,
        message: 'Workbook not found'
      });
    }
    
    // Check if workbook belongs to user
    if (workbook.user.toString() !== req.user.id) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to access this workbook'
      });
    }
    
    const chapter = await Chapter.findOne({
      _id: req.params.chapterId,
      workbook: req.params.workbookId,
      parentType: 'workbook'
    });
    
    if (!chapter) {
      return res.status(404).json({
        success: false,
        message: 'Chapter not found'
      });
    }
    
    let topic = await Topic.findOne({
      _id: req.params.topicId,
      chapter: req.params.chapterId
    });
    
    if (!topic) {
      return res.status(404).json({
        success: false,
        message: 'Topic not found'
      });
    }
    
    // Update fields
    topic = await Topic.findByIdAndUpdate(req.params.topicId, req.body, {
      new: true,
      runValidators: true
    });
    
    return res.status(200).json({
      success: true,
      topic
    });
  } catch (error) {
    console.error(error);
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

// @desc    Delete topic
// @route   DELETE /api/workbooks/:workbookId/chapters/:chapterId/topics/:topicId
// @access  Private
exports.deleteTopic = async (req, res) => {
  try {
    const workbook = await Workbook.findById(req.params.workbookId);
    
    if (!workbook) {
      return res.status(404).json({
        success: false,
        message: 'Workbook not found'
      });
    }
    
    // Check if workbook belongs to user
    if (workbook.user.toString() !== req.user.id) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to access this workbook'
      });
    }
    
    const chapter = await Chapter.findOne({
      _id: req.params.chapterId,
      workbook: req.params.workbookId,
      parentType: 'workbook'
    });
    
    if (!chapter) {
      return res.status(404).json({
        success: false,
        message: 'Chapter not found'
      });
    }
    
    const topic = await Topic.findOne({
      _id: req.params.topicId,
      chapter: req.params.chapterId
    });
    
    if (!topic) {
      return res.status(404).json({
        success: false,
        message: 'Topic not found'
      });
    }
    
    // Delete the topic
    await Topic.deleteOne({ _id: req.params.topicId });
    
    return res.status(200).json({
      success: true,
      message: 'Topic deleted successfully'
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({
      success: false,
      message: 'Server Error'
    });
  }
};

const Chapter = require('../models/Chapter');
const Workbook = require('../models/Workbook');
const Topic = require('../models/Topic');
const SubTopic = require('../models/SubTopic');

// @desc    Get all chapters for a workbook
// @route   GET /api/workbooks/:workbookId/chapters
// @access  Private
exports.getChapters = async (req, res) => {
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
    
    // Find chapters where workbook field matches the workbookId
    const chapters = await Chapter.find({ 
      workbook: req.params.workbookId,
      parentType: 'workbook' 
    }).sort('order');
    
    return res.status(200).json({
      success: true,
      count: chapters.length,
      chapters
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({
      success: false,
      message: 'Server Error'
    });
  }
};

// @desc    Get single chapter
// @route   GET /api/workbooks/:workbookId/chapters/:chapterId
// @access  Private
exports.getChapter = async (req, res) => {
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
    
    return res.status(200).json({
      success: true,
      chapter
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({
      success: false,
      message: 'Server Error'
    });
  }
};

// @desc    Create new chapter
// @route   POST /api/workbooks/:workbookId/chapters
// @access  Private
exports.createChapter = async (req, res) => {
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
    
    const { title, description, order } = req.body;
    
    // Get the current maximum order value
    let maxOrder = 0;
    if (!order) {
      const lastChapter = await Chapter.findOne({ 
        workbook: req.params.workbookId,
        parentType: 'workbook' 
      })
        .sort('-order')
        .limit(1);
      
      if (lastChapter) {
        maxOrder = lastChapter.order + 1;
      }
    }
    
    // Create chapter
    const chapter = await Chapter.create({
      title,
      description,
      workbook: req.params.workbookId,
      parentType: 'workbook',
      order: order || maxOrder
    });
    
    return res.status(201).json({
      success: true,
      chapter
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

// @desc    Update chapter
// @route   PUT /api/workbooks/:workbookId/chapters/:chapterId
// @access  Private
exports.updateChapter = async (req, res) => {
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
    
    let chapter = await Chapter.findOne({
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
    
    // Update fields
    chapter = await Chapter.findByIdAndUpdate(req.params.chapterId, req.body, {
      new: true,
      runValidators: true
    });
    
    return res.status(200).json({
      success: true,
      chapter
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

// @desc    Delete chapter
// @route   DELETE /api/workbooks/:workbookId/chapters/:chapterId
// @access  Private
exports.deleteChapter = async (req, res) => {
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
        message: 'Not authorized to delete this workbook'
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
    
    // Find all topics in this chapter to delete associated subtopics
    const topics = await Topic.find({ chapter: chapter._id });
    
    // Delete all topics and subtopics in this chapter
    for (const topic of topics) {
      // Delete all subtopics in this topic
      await SubTopic.deleteMany({ topic: topic._id });
      // Delete the topic
      await Topic.deleteOne({ _id: topic._id });
    }
    
    // Delete the chapter
    await Chapter.deleteOne({ _id: chapter._id });
    
    return res.status(200).json({
      success: true,
      message: 'Chapter deleted successfully'
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({
      success: false,
      message: 'Server Error'
    });
  }
}; 
const Workbook = require('../models/Workbook');
const Chapter = require('../models/Chapter');
const Topic = require('../models/Topic');
const SubTopic = require('../models/SubTopic');
const path = require('path');
const fs = require('fs');
const multer = require('multer');

// Configure multer storage
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = 'uploads/workbook-covers';
    
    // Create directory if it doesn't exist
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    // Create unique filename with timestamp and original extension
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const ext = path.extname(file.originalname);
    cb(null, `workbook-cover-${uniqueSuffix}${ext}`);
  }
});

// File filter
const fileFilter = (req, file, cb) => {
  // Accept only image files
  if (file.mimetype.startsWith('image/')) {
    cb(null, true);
  } else {
    cb(new Error('Not an image! Please upload only images.'), false);
  }
};

// Initialize upload
const upload = multer({
  storage: storage,
  limits: {
    fileSize: 5 * 1024 * 1024 // 5MB max size
  },
  fileFilter: fileFilter
});

// Multer upload middleware
exports.uploadCoverImage = upload.single('coverImage');

// @desc    Get all workbooks
// @route   GET /api/workbooks
// @access  Private
exports.getWorkbooks = async (req, res) => {
  try {
    // Get all workbooks that belong to the requesting user
    const workbooks = await Workbook.find({ user: req.user.id });
    
    return res.status(200).json({
      success: true,
      count: workbooks.length,
      workbooks
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({
      success: false,
      message: 'Server Error'
    });
  }
};

// @desc    Get single workbook
// @route   GET /api/workbooks/:id
// @access  Private
exports.getWorkbook = async (req, res) => {
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
    
    return res.status(200).json({
      success: true,
      workbook
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({
      success: false,
      message: 'Server Error'
    });
  }
};

// @desc    Create new workbook
// @route   POST /api/workbooks
// @access  Private
exports.createWorkbook = async (req, res) => {
  try {
    const { title, description } = req.body;
    
    // Prepare workbook data
    const workbookData = {
      title,
      description,
      user: req.user.id
    };
    
    // If a file was uploaded, add the path to workbookData
    if (req.file) {
      workbookData.coverImage = req.file.path;
    }
    
    // Create workbook
    const workbook = await Workbook.create(workbookData);
    
    return res.status(201).json({
      success: true,
      workbook
    });
  } catch (error) {
    // If there was an error and a file was uploaded, remove it
    if (req.file) {
      fs.unlink(req.file.path, err => {
        if (err) console.error('Error deleting file:', err);
      });
    }
    
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

// @desc    Update workbook
// @route   PUT /api/workbooks/:id
// @access  Private
exports.updateWorkbook = async (req, res) => {
  try {
    let workbook = await Workbook.findById(req.params.workbookId);
    
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
        message: 'Not authorized to update this workbook'
      });
    }
    
    // Prepare update data
    const updateData = { ...req.body };
    
    // If a new cover image was uploaded
    if (req.file) {
      // Delete the old image if it exists
      if (workbook.coverImage && fs.existsSync(workbook.coverImage)) {
        fs.unlinkSync(workbook.coverImage);
      }
      
      // Add new image path
      updateData.coverImage = req.file.path;
    }
    
    // Update fields
    workbook = await Workbook.findByIdAndUpdate(req.params.workbookId, updateData, {
      new: true,
      runValidators: true
    });
    
    return res.status(200).json({
      success: true,
      workbook
    });
  } catch (error) {
    // If there was an error and a file was uploaded, remove it
    if (req.file) {
      fs.unlink(req.file.path, err => {
        if (err) console.error('Error deleting file:', err);
      });
    }
    
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

// @desc    Delete workbook
// @route   DELETE /api/workbooks/:id
// @access  Private
exports.deleteWorkbook = async (req, res) => {
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
    
    // Delete the cover image if it exists
    if (workbook.coverImage && fs.existsSync(workbook.coverImage)) {
      fs.unlinkSync(workbook.coverImage);
    }
    
    // Find all chapters to delete associated topics/subtopics
    const chapters = await Chapter.find({ workbook: workbook._id });
    
    // Delete all chapters, topics, and subtopics in this workbook
    for (const chapter of chapters) {
      // Find and delete all topics in this chapter
      const topics = await Topic.find({ chapter: chapter._id });
      
      for (const topic of topics) {
        // Delete all subtopics in this topic
        await SubTopic.deleteMany({ topic: topic._id });
        // Delete the topic
        await Topic.deleteOne({ _id: topic._id });
      }
      
      // Delete the chapter
      await Chapter.deleteOne({ _id: chapter._id });
    }
    
    // Delete the workbook
    await Workbook.deleteOne({ _id: workbook._id });
    
    return res.status(200).json({
      success: true,
      message: 'Workbook deleted successfully'
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({
      success: false,
      message: 'Server Error'
    });
  }
}; 
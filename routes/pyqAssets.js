const express = require('express');
const router = express.Router();
const PYQ = require('../models/PYQ');
const {verifyToken} = require('../middleware/auth');

// Helper function to get model name from item type
const getModelName = (itemType) => {
  const modelMap = {
    'book': 'Book',
    'chapter': 'Chapter', 
    'topic': 'Topic',
    'subtopic': 'Subtopic'
  };
  return modelMap[itemType];
};

// Helper function to validate item existence
const validateItemExists = async (itemType, itemId, isWorkbook) => {
  const modelName = getModelName(itemType);
  if (!modelName) {
    throw new Error('Invalid item type');
  }

  const Model = require(`../models/${modelName}`);
  const item = await Model.findById(itemId);
  
  if (!item) {
    throw new Error(`${itemType} not found`);
  }

  return item;
};

// GET /api/pyq-assets/:itemType/:itemId/pyqs - Get all PYQs for an item
router.get('/:itemType/:itemId/pyqs',  verifyToken, async (req, res) => {
  try {
    const { itemType, itemId } = req.params;
    const { isWorkbook } = req.query;
    
    // Validate item type
    if (!['book', 'chapter', 'topic', 'subtopic'].includes(itemType)) {
      return res.status(400).json({ 
        success: false, 
        message: 'Invalid item type' 
      });
    }

    // Validate item exists
    await validateItemExists(itemType, itemId, isWorkbook === 'true');

    // Fetch PYQs
    const pyqs = await PYQ.find({
      itemType,
      itemId,
      isWorkbook: isWorkbook === 'true'
    }).sort({ createdAt: -1 });

    res.json({
      success: true,
      pyqs
    });
  } catch (error) {
    console.error('Error fetching PYQs:', error);
    res.status(500).json({ 
      success: false, 
      message: error.message || 'Error fetching PYQs' 
    });
  }
});

// POST /api/pyq-assets/:itemType/:itemId/pyqs - Create a new PYQ
router.post('/:itemType/:itemId/pyqs',  verifyToken, async (req, res) => {
  try {
    const { itemType, itemId } = req.params;
    const { isWorkbook } = req.query;
    const { year, question, answer, difficulty, source } = req.body;

    // Validate required fields
    if (!year || !question) {
      return res.status(400).json({
        success: false,
        message: 'Year and question are required'
      });
    }

    // Validate item type
    if (!['book', 'chapter', 'topic', 'subtopic'].includes(itemType)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid item type'
      });
    }

    // Validate item exists
    await validateItemExists(itemType, itemId, isWorkbook === 'true');

    // Create new PYQ
    const newPYQ = new PYQ({
      year: year.toString(),
      question: question.trim(),
      answer: answer?.trim() || '',
      difficulty: difficulty || 'medium',
      source: source?.trim() || '',
      itemType,
      itemId,
      itemModel: getModelName(itemType),
      isWorkbook: isWorkbook === 'true',
      createdBy: req.user.id
    });

    await newPYQ.save();

    res.status(201).json({
      success: true,
      message: 'PYQ created successfully',
      pyq: newPYQ
    });
  } catch (error) {
    console.error('Error creating PYQ:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Error creating PYQ'
    });
  }
});

// PUT /api/pyq-assets/pyqs/:pyqId - Update a PYQ
router.put('/pyqs/:pyqId',  verifyToken, async (req, res) => {
  try {
    const { pyqId } = req.params;
    const { year, question, answer, difficulty, source } = req.body;

    // Find the PYQ
    const pyq = await PYQ.findById(pyqId);
    if (!pyq) {
      return res.status(404).json({
        success: false,
        message: 'PYQ not found'
      });
    }

    // Check if user owns this PYQ or is admin
    if (pyq.createdBy.toString() !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Not verifyTokenorized to update this PYQ'
      });
    }

    // Update fields
    if (year) pyq.year = year.toString();
    if (question) pyq.question = question.trim();
    if (answer !== undefined) pyq.answer = answer.trim();
    if (difficulty) pyq.difficulty = difficulty;
    if (source !== undefined) pyq.source = source.trim();

    await pyq.save();

    res.json({
      success: true,
      message: 'PYQ updated successfully',
      pyq
    });
  } catch (error) {
    console.error('Error updating PYQ:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Error updating PYQ'
    });
  }
});

// DELETE /api/pyq-assets/pyqs/:pyqId - Delete a PYQ
router.delete('/pyqs/:pyqId',  verifyToken, async (req, res) => {
  try {
    const { pyqId } = req.params;

    // Find the PYQ
    const pyq = await PYQ.findById(pyqId);
    if (!pyq) {
      return res.status(404).json({
        success: false,
        message: 'PYQ not found'
      });
    }

    // Check if user owns this PYQ or is admin
    if (pyq.createdBy.toString() !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Not verifyTokenorized to delete this PYQ'
      });
    }

    await PYQ.findByIdAndDelete(pyqId);

    res.json({
      success: true,
      message: 'PYQ deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting PYQ:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Error deleting PYQ'
    });
  }
});

// GET /api/pyq-assets/pyqs/search - Search PYQs
router.get('/pyqs/search',  verifyToken, async (req, res) => {
  try {
    const { query, year, difficulty, source, itemType, page = 1, limit = 10 } = req.query;
    
    // Build search criteria
    const searchCriteria = {};
    
    if (query) {
      searchCriteria.$or = [
        { question: { $regex: query, $options: 'i' } },
        { answer: { $regex: query, $options: 'i' } }
      ];
    }
    
    if (year) searchCriteria.year = year;
    if (difficulty) searchCriteria.difficulty = difficulty;
    if (source) searchCriteria.source = { $regex: source, $options: 'i' };
    if (itemType) searchCriteria.itemType = itemType;

    // Execute search with pagination
    const skip = (parseInt(page) - 1) * parseInt(limit);
    const pyqs = await PYQ.find(searchCriteria)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit))
      .populate('itemId', 'title')
      .populate('createdBy', 'username');

    const total = await PYQ.countDocuments(searchCriteria);

    res.json({
      success: true,
      pyqs,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / parseInt(limit))
      }
    });
  } catch (error) {
    console.error('Error searching PYQs:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Error searching PYQs'
    });
  }
});

// GET /api/pyq-assets/pyqs/stats - Get PYQ statistics
router.get('/pyqs/stats',  verifyToken, async (req, res) => {
  try {
    const { itemType, itemId, isWorkbook } = req.query;
    
    const matchCriteria = {};
    if (itemType && itemId) {
      matchCriteria.itemType = itemType;
      matchCriteria.itemId = itemId;
      matchCriteria.isWorkbook = isWorkbook === 'true';
    }

    const stats = await PYQ.aggregate([
      { $match: matchCriteria },
      {
        $group: {
          _id: null,
          total: { $sum: 1 },
          byDifficulty: {
            $push: {
              difficulty: '$difficulty',
              count: 1
            }
          },
          byYear: {
            $push: {
              year: '$year',
              count: 1
            }
          },
          bySources: {
            $push: {
              source: '$source',
              count: 1
            }
          }
        }
      },
      {
        $project: {
          total: 1,
          difficultyStats: {
            $reduce: {
              input: '$byDifficulty',
              initialValue: { easy: 0, medium: 0, hard: 0 },
              in: {
                $mergeObjects: [
                  '$$value',
                  {
                    $switch: {
                      branches: [
                        { case: { $eq: ['$$this.difficulty', 'easy'] }, then: { easy: { $add: ['$$value.easy', 1] } } },
                        { case: { $eq: ['$$this.difficulty', 'medium'] }, then: { medium: { $add: ['$$value.medium', 1] } } },
                        { case: { $eq: ['$$this.difficulty', 'hard'] }, then: { hard: { $add: ['$$value.hard', 1] } } }
                      ],
                      default: {}
                    }
                  }
                ]
              }
            }
          }
        }
      }
    ]);

    res.json({
      success: true,
      stats: stats[0] || { total: 0, difficultyStats: { easy: 0, medium: 0, hard: 0 } }
    });
  } catch (error) {
    console.error('Error fetching PYQ stats:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Error fetching PYQ statistics'
    });
  }
});

module.exports = router;
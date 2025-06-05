// routes/evaluators.js
const express = require('express');
const router = express.Router();
const Evaluator = require('../models/Evaluator');
const { verifyAdminToken } = require('../middleware/auth');

// Apply admin authentication to all routes
router.use(verifyAdminToken);

// 1. GET ALL EVALUATORS
router.get('/', async (req, res) => {
  try {
    const evaluators = await Evaluator.find().sort({ createdAt: -1 });
    
    res.json({
      success: true,
      evaluators
    });
  } catch (error) {
    console.error('Get all evaluators error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

// 2. GET SINGLE EVALUATOR
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    const evaluator = await Evaluator.findById(id);
    
    if (!evaluator) {
      return res.status(404).json({
        success: false,
        message: 'Evaluator not found'
      });
    }
    
    res.json({
      success: true,
      evaluator
    });
  } catch (error) {
    console.error('Get single evaluator error:', error);
    
    // Handle invalid ObjectId
    if (error.name === 'CastError') {
      return res.status(404).json({
        success: false,
        message: 'Evaluator not found'
      });
    }
    
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

// 3. CREATE EVALUATOR
router.post('/', async (req, res) => {
  try {
    const {
      name,
      email,
      phoneNumber,
      subjectMatterExpert,
      examFocus,
      experience,
      grade,
      clientAccess
    } = req.body;
    
    // Create new evaluator
    const evaluator = new Evaluator({
      name,
      email,
      phoneNumber,
      subjectMatterExpert,
      examFocus,
      experience,
      grade,
      clientAccess: clientAccess || []
    });
    
    await evaluator.save();
    
    res.status(201).json({
      success: true,
      message: 'Evaluator created successfully',
      evaluator
    });
  } catch (error) {
    console.error('Create evaluator error:', error);
    
    // Handle validation errors
    if (error.name === 'ValidationError') {
      const errors = Object.keys(error.errors).map(key => ({
        field: key,
        message: error.errors[key].message
      }));
      
      return res.status(400).json({
        success: false,
        message: 'Validation error',
        errors
      });
    }
    
    // Handle duplicate key errors
    if (error.code === 11000) {
      const field = Object.keys(error.keyPattern)[0];
      const message = field === 'email' ? 'Email already exists' : 'Phone number already exists';
      
      return res.status(400).json({
        success: false,
        message: 'Validation error',
        errors: [{
          field,
          message
        }]
      });
    }
    
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

// 4. UPDATE EVALUATOR
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const updateData = req.body;
    
    // Remove undefined fields
    Object.keys(updateData).forEach(key => {
      if (updateData[key] === undefined) {
        delete updateData[key];
      }
    });
    
    const evaluator = await Evaluator.findByIdAndUpdate(
      id,
      updateData,
      { 
        new: true, 
        runValidators: true 
      }
    );
    
    if (!evaluator) {
      return res.status(404).json({
        success: false,
        message: 'Evaluator not found'
      });
    }
    
    res.json({
      success: true,
      message: 'Evaluator updated successfully',
      evaluator
    });
  } catch (error) {
    console.error('Update evaluator error:', error);
    
    // Handle validation errors
    if (error.name === 'ValidationError') {
      const errors = Object.keys(error.errors).map(key => ({
        field: key,
        message: error.errors[key].message
      }));
      
      return res.status(400).json({
        success: false,
        message: 'Validation error',
        errors
      });
    }
    
    // Handle duplicate key errors
    if (error.code === 11000) {
      const field = Object.keys(error.keyPattern)[0];
      const message = field === 'email' ? 'Email already exists' : 'Phone number already exists';
      
      return res.status(400).json({
        success: false,
        message: 'Validation error',
        errors: [{
          field,
          message
        }]
      });
    }
    
    // Handle invalid ObjectId
    if (error.name === 'CastError') {
      return res.status(404).json({
        success: false,
        message: 'Evaluator not found'
      });
    }
    
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

// 5. DELETE EVALUATOR
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    const evaluator = await Evaluator.findByIdAndDelete(id);
    
    if (!evaluator) {
      return res.status(404).json({
        success: false,
        message: 'Evaluator not found'
      });
    }
    
    res.json({
      success: true,
      message: 'Evaluator deleted successfully'
    });
  } catch (error) {
    console.error('Delete evaluator error:', error);
    
    // Handle invalid ObjectId
    if (error.name === 'CastError') {
      return res.status(404).json({
        success: false,
        message: 'Evaluator not found'
      });
    }
    
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

module.exports = router;
// routes/evaluators.js
const express = require('express');
const router = express.Router();
const Evaluator = require('../models/Evaluator');
const UserProfile = require('../models/UserProfile');
const MobileUser = require('../models/MobileUser');
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

// 6. APPROVE EVALUATOR
router.post('/:id/approve', async (req, res) => {
  try {
    const { id } = req.params;
    
    // Find the evaluator
    const evaluator = await Evaluator.findById(id);
    if (!evaluator) {
      return res.status(404).json({
        success: false,
        message: 'Evaluator not found'
      });
    }

    // Find the user profile by name
    const userProfile = await UserProfile.findOne({ name: evaluator.name });
    if (!userProfile) {
      return res.status(400).json({
        success: false,
        message: 'User does not exist. Please ask them to sign up first.'
      });
    }

    // Update the isEvaluator field
    userProfile.isEvaluator = true;
    await userProfile.save();

    res.json({
      success: true,
      message: 'Evaluator approved successfully',
      data: {
        profile: {
          id: userProfile._id,
          name: userProfile.name,
          isEvaluator: userProfile.isEvaluator
        }
      }
    });

  } catch (error) {
    console.error('Approve evaluator error:', error);
    
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

// APPROVE EVALUATOR BY MOBILE AND NAME
router.post('/approve', async (req, res) => {
  try {
    const { mobile, name } = req.body;

    if (!mobile || !/^\d{10}$/.test(mobile)) {
      return res.status(400).json({
        success: false,
        message: 'Please provide a valid 10-digit mobile number'
      });
    }

    if (!name || name.trim().length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Please provide the user\'s name'
      });
    }

    // Find the mobile user
    const mobileUser = await MobileUser.findOne({ mobile });
    if (!mobileUser) {
      return res.status(400).json({
        success: false,
        message: 'User does not exist. Please ask them to sign up first.'
      });
    }

    // Find the user profile
    const userProfile = await UserProfile.findOne({ 
      userId: mobileUser._id,
      name: { $regex: new RegExp(`^${name.trim()}$`, 'i') } // Case-insensitive exact match
    });

    if (!userProfile) {
      return res.status(400).json({
        success: false,
        message: 'User profile not found or name does not match. Please verify the details.'
      });
    }

    // Check if user is already an evaluator
    if (userProfile.isEvaluator) {
      return res.status(400).json({
        success: false,
        message: 'User is already an evaluator'
      });
    }

    // Update the isEvaluator field
    userProfile.isEvaluator = true;
    await userProfile.save();

    res.json({
      success: true,
      message: 'Evaluator approved successfully',
      data: {
        profile: {
          id: userProfile._id,
          name: userProfile.name,
          mobile: mobile,
          isEvaluator: userProfile.isEvaluator
        }
      }
    });

  } catch (error) {
    console.error('Approve evaluator error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

module.exports = router;
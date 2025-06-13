const Evaluator = require('../models/Evaluator');
const User = require('../models/User');
const { validationResult } = require('express-validator');

// Get all evaluators
exports.getAllEvaluators = async (req, res) => {
  try {
    const evaluators = await Evaluator.find().select('-__v');
    res.status(200).json({
      success: true,
      count: evaluators.length,
      data: evaluators
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Server Error'
    });
  }
};

// Get single evaluator
exports.getEvaluator = async (req, res) => {
  try {
    const evaluator = await Evaluator.findById(req.params.id).select('-__v');
    
    if (!evaluator) {
      return res.status(404).json({
        success: false,
        error: 'Evaluator not found'
      });
    }

    res.status(200).json({
      success: true,
      data: evaluator
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Server Error'
    });
  }
};

// Create new evaluator
exports.createEvaluator = async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      errors: errors.array()
    });
  }

  try {
    // Check if user exists
    const user = await User.findOne({ email: req.body.email });
    if (!user) {
      return res.status(400).json({
        success: false,
        error: 'User not found. Please register first.'
      });
    }

    // Check if evaluator already exists
    const existingEvaluator = await Evaluator.findOne({
      $or: [
        { email: req.body.email },
        { phoneNumber: req.body.phoneNumber }
      ]
    });

    if (existingEvaluator) {
      return res.status(400).json({
        success: false,
        error: 'Evaluator with this email or phone number already exists'
      });
    }

    const evaluator = await Evaluator.create(req.body);
    res.status(201).json({
      success: true,
      data: evaluator
    });
  } catch (error) {
    if (error.name === 'ValidationError') {
      const messages = Object.values(error.errors).map(val => val.message);
      return res.status(400).json({
        success: false,
        error: messages
      });
    }
    res.status(500).json({
      success: false,
      error: 'Server Error'
    });
  }
};

// Update evaluator
exports.updateEvaluator = async (req, res) => {
  try {
    const evaluator = await Evaluator.findByIdAndUpdate(
      req.params.id,
      req.body,
      {
        new: true,
        runValidators: true
      }
    );

    if (!evaluator) {
      return res.status(404).json({
        success: false,
        error: 'Evaluator not found'
      });
    }

    res.status(200).json({
      success: true,
      data: evaluator
    });
  } catch (error) {
    if (error.name === 'ValidationError') {
      const messages = Object.values(error.errors).map(val => val.message);
      return res.status(400).json({
        success: false,
        error: messages
      });
    }
    res.status(500).json({
      success: false,
      error: 'Server Error'
    });
  }
};

// Delete evaluator
exports.deleteEvaluator = async (req, res) => {
  try {
    const evaluator = await Evaluator.findByIdAndDelete(req.params.id);

    if (!evaluator) {
      return res.status(404).json({
        success: false,
        error: 'Evaluator not found'
      });
    }

    res.status(200).json({
      success: true,
      data: {}
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Server Error'
    });
  }
};

// Verify evaluator
exports.verifyEvaluator = async (req, res) => {
  try {
    const evaluator = await Evaluator.findById(req.params.id);

    if (!evaluator) {
      return res.status(404).json({
        success: false,
        error: 'Evaluator not found'
      });
    }

    evaluator.status = 'VERIFIED';
    evaluator.verifiedAt = new Date();
    await evaluator.save();

    res.status(200).json({
      success: true,
      data: evaluator
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Server Error'
    });
  }
};

// Suspend evaluator
exports.suspendEvaluator = async (req, res) => {
  try {
    const { reason } = req.body;
    
    if (!reason) {
      return res.status(400).json({
        success: false,
        error: 'Suspension reason is required'
      });
    }

    const evaluator = await Evaluator.findById(req.params.id);

    if (!evaluator) {
      return res.status(404).json({
        success: false,
        error: 'Evaluator not found'
      });
    }

    evaluator.status = 'SUSPENDED';
    evaluator.suspendedAt = new Date();
    evaluator.suspensionReason = reason;
    await evaluator.save();

    res.status(200).json({
      success: true,
      data: evaluator
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Server Error'
    });
  }
};

// Reactivate evaluator
exports.reactivateEvaluator = async (req, res) => {
  try {
    const evaluator = await Evaluator.findById(req.params.id);

    if (!evaluator) {
      return res.status(404).json({
        success: false,
        error: 'Evaluator not found'
      });
    }

    evaluator.status = 'VERIFIED';
    evaluator.suspendedAt = undefined;
    evaluator.suspensionReason = undefined;
    await evaluator.save();

    res.status(200).json({
      success: true,
      data: evaluator
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Server Error'
    });
  }
};

// Toggle evaluator enabled status
exports.toggleEvaluatorStatus = async (req, res) => {
  try {
    const evaluator = await Evaluator.findById(req.params.id);

    if (!evaluator) {
      return res.status(404).json({
        success: false,
        error: 'Evaluator not found'
      });
    }

    // Toggle the enabled status
    evaluator.enabled = !evaluator.enabled;
    await evaluator.save();

    res.status(200).json({
      success: true,
      data: evaluator,
      message: evaluator.enabled ? 'Evaluator enabled successfully' : 'Evaluator disabled successfully'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Server Error'
    });
  }
}; 
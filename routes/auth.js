
// routes/auth.js - Authentication routes
const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const { verifyToken } = require('../middleware/auth');
const User = require('../models/User')
// Register new user
router.post('/register', authController.register);

// Login user
router.post('/login', authController.login);

// Update user role (protected route)
router.post('/update-role', verifyToken, authController.updateRole);

// Validate token
router.get('/validate', authController.validate);
router.get('/profile', verifyToken, async (req, res) => {
    try {
      const user = await User.findById(req.user.id).select('-password');
      res.json({ success: true, user });
    } catch (error) {
      res.status(500).json({ success: false, message: 'Server error' });
    }
  });

module.exports = router;

// routes/auth.js - Authentication routes
const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const { verifyToken } = require('../middleware/auth');

// Register new user
router.post('/register', authController.register);

// Login user
router.post('/login', authController.login);

// Update user role (protected route)
router.post('/update-role', verifyToken, authController.updateRole);

// Validate token
router.get('/validate', authController.validate);

module.exports = router;
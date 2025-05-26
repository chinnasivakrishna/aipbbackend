
// routes/user.js - User routes
const express = require('express');
const router = express.Router();
const userController = require('../controllers/userController');
const { verifyToken, isUser } = require('../middleware/auth');

// All routes require valid token and user role
router.use(verifyToken, isUser);
router.get('/me', userController.getCurrentUser);

// Get user home data
router.get('/home', userController.getHomeData);

// Additional routes would go here
// Such as routes for accessing AI books, tests, lectures, etc.

module.exports = router;
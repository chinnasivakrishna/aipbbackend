
// routes/admin.js - Admin routes
const express = require('express');
const router = express.Router();
const adminController = require('../controllers/adminController');
const { verifyAdminToken } = require('../middleware/auth');

// Register new admin
router.post('/register', adminController.register);

// Login admin
router.post('/login', adminController.login);

// Protected routes
// Example: router.get('/dashboard', verifyAdminToken, adminController.getDashboard);

module.exports = router;
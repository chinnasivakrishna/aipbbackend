
// routes/client.js - Client routes
const express = require('express');
const router = express.Router();
const clientController = require('../controllers/clientController');
const { verifyToken, isClient } = require('../middleware/auth');

// All routes require valid token and client role
router.use(verifyToken, isClient);

// Get client dashboard data
router.get('/dashboard', clientController.getDashboard);

//get all users
router.get('/users', clientController.getAllUsers);

// POST /api/clients/:clientId/mobile/auth/profile
router.get('/userprofile', clientController.getuserprofile);


// Additional routes would go here
// Such as routes for managing AI books, workbooks, agents, users, etc.

module.exports = router;
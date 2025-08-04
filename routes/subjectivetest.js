const express = require('express');
const router = express.Router();
const testController = require('../controllers/subjectivetestcontroller');
const { verifyToken } = require('../middleware/auth');
const { authenticateMobileUser } = require('../middleware/mobileAuth');

router.get('/get-test',authenticateMobileUser,testController.getAllTestsForMobile);

// Get presigned URL for image upload
router.post('/upload-image',verifyToken, testController.uploadImage);

// Create a new test
router.post('/', verifyToken, testController.createTest);

// Get all tests
router.get('/', verifyToken, testController.getAllTests);

// Get a specific test by ID
router.get('/get-test/:id', authenticateMobileUser, testController.getTest);

// Update a test
router.put('/:id', verifyToken, testController.updateTest);

// Delete a test
router.delete('/:id', verifyToken, testController.deleteTest);

// // Get a specific test by ID
router.get('/:id', verifyToken, testController.getTest);

// In your routes
router.post('/tests/:testId/start', authenticateMobileUser, testController.startTest);

router.post('/tests/:testId/submit', authenticateMobileUser, testController.submitTest);

module.exports = router;


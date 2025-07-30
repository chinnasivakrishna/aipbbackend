const express = require('express');
const router = express.Router();
const testController = require('../controllers/objectivetestcontroller');
const { verifyToken } = require('../middleware/auth');
const { authenticateMobileUser } = require('../middleware/mobileAuth');

router.get('/get-test',authenticateMobileUser,testController.getAllTestsForMobile);
// Apply authentication middleware to all routes
router.use(verifyToken);

// Get presigned URL for image upload
router.post('/upload-image', testController.uploadImage);

// Create a new test
router.post('/', testController.createTest);

// Get all tests
router.get('/', testController.getAllTests);

// Get a specific test by ID
router.get('/:id', testController.getTest);

// Update a test
router.put('/:id', testController.updateTest);

// Delete a test
router.delete('/:id', testController.deleteTest);

module.exports = router; 
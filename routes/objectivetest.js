const express = require('express');
const router = express.Router();
const testController = require('../controllers/objectivetestcontroller');
const { verifyToken } = require('../middleware/auth');
const { authenticateMobileUser } = require('../middleware/mobileAuth');

// Mobile route (no auth required)
router.get('/get-test', authenticateMobileUser, testController.getAllTestsForMobile);

// Start test (mobile route)
router.post('/:testId/start', authenticateMobileUser, testController.startTest);

// Submit test with all answers
router.post('/:testId/submit', authenticateMobileUser, testController.submitTest);


// Apply authentication middleware to all routes
router.use(verifyToken);

// Start test (authenticated route)
router.post('/:testId/start', testController.startTest);

// Get presigned URL for image upload
router.post('/upload-image', testController.uploadImage);

// Create a new test
router.post('/', testController.createTest);

// Get all tests
router.get('/', testController.getAllTests);

// Get user's test results (specific routes first)
// router.get('/results', testController.getUserTestResults);
router.get('/results/:testId', testController.getUserTestResults);

// Get user's test results with completion time
router.get('/results-with-time', testController.getUserTestResultsWithTime);

// Get specific test completion time
router.get('/completion-time/:testResultId', testController.getTestCompletionTime);

// Get test analytics (for admin/client)
router.get('/:testId/analytics', testController.getTestAnalytics);

// Get a specific test by ID
router.get('/:id', testController.getTest);

// Update a test
router.put('/:id', testController.updateTest);

// Delete a test
router.delete('/:id', testController.deleteTest);

module.exports = router; 
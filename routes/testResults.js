const express = require('express');
const router = express.Router();
const TestResult = require('../models/TestResult');
const { verifyToken } = require('../middleware/auth');

// Get all test results for a user
router.get('/user', verifyToken, async (req, res) => {
    try {
        const userId = req.user.id;
        
        const results = await TestResult.find({ userId })
            .populate('testId', 'name category')
            .sort({ submittedAt: -1 });

        res.json({
            success: true,
            data: results
        });
    } catch (error) {
        console.error('Error fetching user test results:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch test results'
        });
    }
});

// Get test result by ID
router.get('/:resultId', verifyToken, async (req, res) => {
    try {
        const { resultId } = req.params;
        const userId = req.user.id;

        const result = await TestResult.findOne({ 
            _id: resultId, 
            userId 
        }).populate('testId', 'name category');

        if (!result) {
            return res.status(404).json({
                success: false,
                message: 'Test result not found'
            });
        }

        res.json({
            success: true,
            data: result
        });
    } catch (error) {
        console.error('Error fetching test result:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch test result'
        });
    }
});

// Delete test result (optional - for user privacy)
router.delete('/:resultId', verifyToken, async (req, res) => {
    try {
        const { resultId } = req.params;
        const userId = req.user.id;

        const result = await TestResult.findOneAndDelete({ 
            _id: resultId, 
            userId 
        });

        if (!result) {
            return res.status(404).json({
                success: false,
                message: 'Test result not found'
            });
        }

        res.json({
            success: true,
            message: 'Test result deleted successfully'
        });
    } catch (error) {
        console.error('Error deleting test result:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to delete test result'
        });
    }
});

module.exports = router; 
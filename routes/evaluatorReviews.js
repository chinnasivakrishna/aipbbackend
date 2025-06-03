// routes/evaluatorReviews.js
const express = require('express');
const router = express.Router();
const ReviewRequest = require('../models/ReviewRequest');
const UserAnswer = require('../models/UserAnswer');
const Evaluator = require('../models/Evaluator');
const { verifyToken } = require('../middleware/auth'); // Assuming evaluators use regular auth

// Get pending review requests for evaluator
router.get('/pending', verifyToken, async (req, res) => {
  try {
    const evaluatorId = req.user.id;
    
    // Find evaluator to get client access
    const evaluator = await Evaluator.findById(evaluatorId);
    if (!evaluator) {
      return res.status(404).json({
        success: false,
        message: 'Evaluator not found'
      });
    }

    const clientIds = evaluator.clientAccess.map(client => client.id);
    const { page = 1, limit = 10, priority } = req.query;

    const filter = {
      clientId: { $in: clientIds },
      requestStatus: { $in: ['pending', 'assigned'] },
      $or: [
        { assignedEvaluator: null },
        { assignedEvaluator: evaluatorId }
      ]
    };

    if (priority) {
      filter.priority = priority;
    }

    const skip = (page - 1) * limit;

    const requests = await ReviewRequest.find(filter)
      .populate('userId', 'mobile')
      .populate('questionId', 'question metadata difficultyLevel')
      .populate('answerId', 'answerImages submittedAt attemptNumber evaluation')
      .sort({ requestedAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    const total = await ReviewRequest.countDocuments(filter);

    res.json({
      success: true,
      data: {
        requests,
        pagination: {
          currentPage: parseInt(page),
          totalPages: Math.ceil(total / limit),
          totalRequests: total,
          hasMore: skip + requests.length < total
        }
      }
    });

  } catch (error) {
    console.error('Error fetching pending requests:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: error.message
    });
  }
});

// Accept review request
router.post('/:requestId/accept', verifyToken, async (req, res) => {
  try {
    const { requestId } = req.params;
    const evaluatorId = req.user.id;

    const request = await ReviewRequest.findById(requestId);
    if (!request) {
      return res.status(404).json({
        success: false,
        message: 'Review request not found'
      });
    }

    // Check if evaluator has access to this client
    const evaluator = await Evaluator.findById(evaluatorId);
    const hasAccess = evaluator.clientAccess.some(client => client.id === request.clientId);
    
    if (!hasAccess) {
      return res.status(403).json({
        success: false,
        message: 'Access denied for this client'
      });
    }

    // Check if request is available
    if (!['pending', 'assigned'].includes(request.requestStatus)) {
      return res.status(400).json({
        success: false,
        message: 'Request is not available for acceptance'
      });
    }

    // If already assigned to another evaluator, deny
    if (request.assignedEvaluator && request.assignedEvaluator.toString() !== evaluatorId) {
      return res.status(400).json({
        success: false,
        message: 'Request is already assigned to another evaluator'
      });
    }

    // Assign to evaluator
    await request.assignEvaluator(evaluatorId);

    res.json({
      success: true,
      message: 'Review request accepted successfully',
      data: {
        requestId: request._id,
        status: request.requestStatus,
        assignedAt: request.assignedAt
      }
    });

  } catch (error) {
    console.error('Error accepting review request:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: error.message
    });
  }
});

// Start review (mark as in progress)
router.post('/:requestId/start', verifyToken, async (req, res) => {
  try {
    const { requestId } = req.params;
    const evaluatorId = req.user.id;

    const request = await ReviewRequest.findById(requestId);
    if (!request) {
      return res.status(404).json({
        success: false,
        message: 'Review request not found'
      });
    }

    // Verify evaluator is assigned
    if (!request.assignedEvaluator || request.assignedEvaluator.toString() !== evaluatorId) {
      return res.status(403).json({
        success: false,
        message: 'You are not assigned to this request'
      });
    }

    // Check status
    if (request.requestStatus !== 'assigned') {
      return res.status(400).json({
        success: false,
        message: 'Request is not in assigned status'
      });
    }

    // Mark as in progress
    await request.markInProgress();

    res.json({
      success: true,
      message: 'Review started successfully',
      data: {
        requestId: request._id,
        status: request.requestStatus
      }
    });

  } catch (error) {
    console.error('Error starting review:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: error.message
    });
  }
});

// Submit review
router.post('/:requestId/submit', verifyToken, async (req, res) => {
  try {
    const { requestId } = req.params;
    const evaluatorId = req.user.id;
    const { score, remarks, strengths = [], improvements = [], suggestions = [] } = req.body;

    // Validation
    if (score === undefined || score < 0 || score > 100) {
      return res.status(400).json({
        success: false,
        message: 'Score must be between 0 and 100'
      });
    }

    if (!remarks || !remarks.trim()) {
      return res.status(400).json({
        success: false,
        message: 'Remarks are required'
      });
    }

    const request = await ReviewRequest.findById(requestId);
    if (!request) {
      return res.status(404).json({
        success: false,
        message: 'Review request not found'
      });
    }

    // Verify evaluator is assigned
    if (!request.assignedEvaluator || request.assignedEvaluator.toString() !== evaluatorId) {
      return res.status(403).json({
        success: false,
        message: 'You are not assigned to this request'
      });
    }

    // Check status
    if (!['assigned', 'in_progress'].includes(request.requestStatus)) {
      return res.status(400).json({
        success: false,
        message: 'Request is not available for review submission'
      });
    }

    // Complete the review
    const reviewData = {
      score: parseFloat(score),
      remarks: remarks.trim(),
      strengths: strengths.filter(s => s && s.trim()),
      improvements: improvements.filter(i => i && i.trim()),
      suggestions: suggestions.filter(s => s && s.trim())
    };

    await request.completeReview(reviewData);

    // Update the original answer with expert review
    await UserAnswer.findByIdAndUpdate(request.answerId, {
      reviewStatus: 'review_completed',
      'evaluation.expertReview': {
        score: reviewData.score,
        remarks: reviewData.remarks,
        strengths: reviewData.strengths,
        improvements: reviewData.improvements,
        suggestions: reviewData.suggestions,
        reviewedBy: evaluatorId,
        reviewedAt: new Date()
      }
    });

    res.json({
      success: true,
      message: 'Review submitted successfully',
      data: {
        requestId: request._id,
        status: request.requestStatus,
        completedAt: request.completedAt,
        score: reviewData.score
      }
    });

  } catch (error) {
    console.error('Error submitting review:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: error.message
    });
  }
});

// Get evaluator's assigned requests
router.get('/my-assignments', verifyToken, async (req, res) => {
  try {
    const evaluatorId = req.user.id;
    const { status, page = 1, limit = 10 } = req.query;

    const filter = { assignedEvaluator: evaluatorId };
    if (status) {
      filter.requestStatus = status;
    }

    const skip = (page - 1) * limit;

    const requests = await ReviewRequest.find(filter)
      .populate('userId', 'mobile')
      .populate('questionId', 'question metadata')
      .populate('answerId', 'answerImages submittedAt attemptNumber')
      .sort({ assignedAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    const total = await ReviewRequest.countDocuments(filter);

    res.json({
      success: true,
      data: {
        requests,
        pagination: {
          currentPage: parseInt(page),
          totalPages: Math.ceil(total / limit),
          totalRequests: total,
          hasMore: skip + requests.length < total
        }
      }
    });

  } catch (error) {
    console.error('Error fetching assignments:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: error.message
    });
  }
});

// Get detailed request for review
router.get('/:requestId/details', verifyToken, async (req, res) => {
  try {
    const { requestId } = req.params;
    const evaluatorId = req.user.id;

    const request = await ReviewRequest.findById(requestId)
      .populate('userId', 'mobile')
      .populate('questionId')
      .populate('answerId');

    if (!request) {
      return res.status(404).json({
        success: false,
        message: 'Review request not found'
      });
    }

    // Verify evaluator has access
    const evaluator = await Evaluator.findById(evaluatorId);
    const hasAccess = evaluator.clientAccess.some(client => client.id === request.clientId);
    
    if (!hasAccess) {
      return res.status(403).json({
        success: false,
        message: 'Access denied for this client'
      });
    }

    res.json({
      success: true,
      data: request
    });

  } catch (error) {
    console.error('Error fetching request details:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: error.message
    });
  }
});

module.exports = router;
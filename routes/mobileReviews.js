// routes/mobileReviews.js
const express = require('express');
const router = express.Router();
const ReviewRequest = require('../models/ReviewRequest');
const UserAnswer = require('../models/UserAnswer');
const { authenticateMobileUser } = require('../middleware/mobileAuth');

// Apply authentication middleware to all routes
router.use(authenticateMobileUser);

// Get pending review requests
router.get('/pending', async (req, res) => {
  try {
    const { page = 1, limit = 10, priority } = req.query;
    const clientId = req.user.clientId;

    const filter = {
      clientId: clientId,
      requestStatus: { $in: ['pending', 'assigned'] }
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
router.post('/:requestId/accept', async (req, res) => {
  try {
    const { requestId } = req.params;
    const clientId = req.user.clientId;

    const request = await ReviewRequest.findById(requestId);
    if (!request) {
      return res.status(404).json({
        success: false,
        message: 'Review request not found'
      });
    }

    // Check if request belongs to client
    if (request.clientId !== clientId) {
      return res.status(403).json({
        success: false,
        message: 'Access denied for this request'
      });
    }

    // Check if request is available
    if (!['pending', 'assigned'].includes(request.requestStatus)) {
      return res.status(400).json({
        success: false,
        message: 'Request is not available for acceptance'
      });
    }

    // Mark as assigned
    request.requestStatus = 'accepted';
    request.assignedAt = new Date();
    await request.save();

    // Update answer status
    const answer = await UserAnswer.findById(request.answerId);
    if (answer) {
      answer.reviewStatus = 'review_accepted';
      answer.reviewAssignedAt = request.assignedAt;
      await answer.save();
    }

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
// router.post('/:requestId/start', async (req, res) => {
//   try {
//     const { requestId } = req.params;
//     const userId = req.user.id;
//     const clientId = req.user.clientId;

//     const request = await ReviewRequest.findById(requestId);
//     if (!request) {
//       return res.status(404).json({
//         success: false,
//         message: 'Review request not found'
//       });
//     }

//     // Check if request belongs to client
//     if (request.clientId !== clientId) {
//       return res.status(403).json({
//         success: false,
//         message: 'Access denied for this request'
//       });
//     }

//     // Verify user is assigned
//     if (!request.assignedEvaluator || request.assignedEvaluator.toString() !== userId) {
//       return res.status(403).json({
//         success: false,
//         message: 'You are not assigned to this request'
//       });
//     }

//     // Check status
//     if (request.requestStatus !== 'assigned') {
//       return res.status(400).json({
//         success: false,
//         message: 'Request is not in assigned status'
//       });
//     }

//     // Mark as in progress
//     request.requestStatus = 'in_progress';
//     await request.save();

//     res.json({
//       success: true,
//       message: 'Review started successfully',
//       data: {
//         requestId: request._id,
//         status: request.requestStatus
//       }
//     });

//   } catch (error) {
//     console.error('Error starting review:', error);
//     res.status(500).json({
//       success: false,
//       message: 'Internal server error',
//       error: error.message
//     });
//   }
// });

// Submit review
router.post('/:requestId/submit', async (req, res) => {
  try {
    const { requestId } = req.params;
    const clientId = req.user.clientId;
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

    // Check if request belongs to client
    if (request.clientId !== clientId) {
      return res.status(403).json({
        success: false,
        message: 'Access denied for this request'
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

    request.requestStatus = 'completed';
    request.completedAt = new Date();
    request.reviewData = {
      ...reviewData,
      reviewedAt: new Date()
    };
    await request.save();

    // Update the original answer with expert review
    const answerToUpdate = await UserAnswer.findById(request.answerId);
    if (answerToUpdate) {
      answerToUpdate.reviewStatus = 'review_completed';
      answerToUpdate.reviewCompletedAt = request.completedAt;
      answerToUpdate.evaluation = {
        ...answerToUpdate.evaluation,
        expertReview: {
          ...reviewData,
          reviewedAt: new Date()
        }
      };
      await answerToUpdate.save();
    }

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


// Get user's assigned requests
// router.get('/my-assignments', async (req, res) => {
//   try {
//     const userId = req.user.id;
//     const clientId = req.user.clientId;
//     const { status, page = 1, limit = 10 } = req.query;

//     const filter = { 
//       assignedEvaluator: userId,
//       clientId: clientId
//     };
//     if (status) {
//       filter.requestStatus = status;
//     }

//     const skip = (page - 1) * limit;

//     const requests = await ReviewRequest.find(filter)
//       .populate('userId', 'mobile')
//       .populate('questionId', 'question metadata')
//       .populate('answerId', 'answerImages submittedAt attemptNumber')
//       .sort({ assignedAt: -1 })
//       .skip(skip)
//       .limit(parseInt(limit));

//     const total = await ReviewRequest.countDocuments(filter);

//     res.json({
//       success: true,
//       data: {
//         requests,
//         pagination: {
//           currentPage: parseInt(page),
//           totalPages: Math.ceil(total / limit),
//           totalRequests: total,
//           hasMore: skip + requests.length < total
//         }
//       }
//     });

//   } catch (error) {
//     console.error('Error fetching assignments:', error);
//     res.status(500).json({
//       success: false,
//       message: 'Internal server error',
//       error: error.message
//     });
//   }
// });

// Get detailed request for review
router.get('/:requestId/details', async (req, res) => {
  try {
    const { requestId } = req.params;
    const clientId = req.user.clientId;

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

    // Check if request belongs to client
    if (request.clientId !== clientId) {
      return res.status(403).json({
        success: false,
        message: 'Access denied for this request'
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

// Get review request by submission ID
router.get('/by-submission/:submissionId', async (req, res) => {
  try {
    const { submissionId } = req.params;
    const clientId = req.user.clientId;

    // Find the review request using the submission ID
    const reviewRequest = await ReviewRequest.findOne({ 
      answerId: submissionId,
      clientId: clientId 
    });

    if (!reviewRequest) {
      return res.status(404).json({
        success: false,
        message: 'Review request not found for this submission'
      });
    }

    res.json({
      success: true,
      data: {
        requestId: reviewRequest._id,
        status: reviewRequest.requestStatus,
        reviewData: reviewRequest.reviewData
      }
    });

  } catch (error) {
    console.error('Error fetching review request:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: error.message
    });
  }
});

module.exports = router; 
// routes/reviewRequests.js
const express = require('express');
const router = express.Router();
const ReviewRequest = require('../models/ReviewRequest');
const UserAnswer = require('../models/UserAnswer');
const { authenticateMobileUser, ensureUserBelongsToClient } = require('../middleware/mobileAuth');

// Student raises manual review request
router.post('/request/:answerId', authenticateMobileUser, ensureUserBelongsToClient, async (req, res) => {
  try {
    const { answerId } = req.params;
    const { notes, priority = 'medium' } = req.body;
    const userId = req.user.id;
    const clientId = req.user.clientId;

    // Find the answer
    const answer = await UserAnswer.findById(answerId).populate('questionId');
    if (!answer) {
      return res.status(404).json({
        success: false,
        message: 'Answer not found'
      });
    }

    // Verify the answer belongs to the requesting user
    if (answer.userId.toString() !== userId.toString()) {
      return res.status(403).json({
        success: false,
        message: 'Access denied. This answer does not belong to you.'
      });
    }

    // Check if review request already exists for this answer
    const existingRequest = await ReviewRequest.findOne({ answerId });
    if (existingRequest) {
      return res.status(400).json({
        success: false,
        message: 'Review request already exists for this answer',
        data: {
          requestId: existingRequest._id,
          status: existingRequest.requestStatus
        }
      });
    }

    // Debug log for submissionStatus
    console.log('Review request attempt for answer', answer._id, 'with submissionStatus:', answer.submissionStatus);

    // Check if answer is evaluated
    if (answer.submissionStatus !== 'evaluated') {
      return res.status(200).json({
        success: true,
        message: `Review can only be requested for evaluated answers. Current status: ${answer.submissionStatus}`
      });
    }
    // Create new review request
    const reviewRequest = new ReviewRequest({
      userId,
      questionId: answer.questionId._id,
      answerId,
      clientId,
      notes,
      priority,
      requestStatus: 'pending'
    });

    await reviewRequest.save();

    // Update answer status to indicate review requested
    answer.reviewStatus = 'review_pending';
    answer.requestID = reviewRequest._id;
    answer.requestnote=reviewRequest.notes;
    
    await answer.save();

    res.status(200).json({
      success: true,
      message: 'Review request submitted successfully',
      data: {
        requestId: reviewRequest._id,
        status: reviewRequest.requestStatus,
        answerId: answer._id,
        reviewStatus: answer.reviewStatus
      }
    });

  } catch (error) {
    console.error('Error submitting review request:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: error.message
    });
  }
});

// Get user's review requests
router.get('/my-requests', authenticateMobileUser, ensureUserBelongsToClient, async (req, res) => {
  try {
    const userId = req.user.id;
    const { status, page = 1, limit = 10 } = req.query;

    const filter = { userId };
    if (status) {
      filter.requestStatus = status;
    }

    const skip = (page - 1) * limit;

    const requests = await ReviewRequest.find(filter)
      .populate('questionId', 'question metadata')
      .populate('answerId', 'answerImages submittedAt attemptNumber')
      .populate('assignedEvaluator', 'name subjectMatterExpert')
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
    console.error('Error fetching review requests:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: error.message
    });
  }
});

// Get specific review request details
router.get('/:requestId', authenticateMobileUser, ensureUserBelongsToClient, async (req, res) => {
  try {
    const { requestId } = req.params;
    const userId = req.user.id;

    const request = await ReviewRequest.findById(requestId)
      .populate('questionId')
      .populate('answerId')
      .populate('assignedEvaluator', 'name subjectMatterExpert examFocus experience grade');

    if (!request) {
      return res.status(404).json({
        success: false,
        message: 'Review request not found'
      });
    }

    // Verify the request belongs to the user
    if (request.userId.toString() !== userId.toString()) {
      return res.status(403).json({
        success: false,
        message: 'Access denied'
      });
    }

    res.json({
      success: true,
      data: request
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

// Cancel review request (only if pending or assigned)
router.delete('/:requestId', authenticateMobileUser, ensureUserBelongsToClient, async (req, res) => {
  try {
    const { requestId } = req.params;
    const userId = req.user.id;

    const request = await ReviewRequest.findById(requestId);
    if (!request) {
      return res.status(404).json({
        success: false,
        message: 'Review request not found'
      });
    }

    // Verify ownership
    if (request.userId.toString() !== userId.toString()) {
      return res.status(403).json({
        success: false,
        message: 'Access denied'
      });
    }

    // Check if cancellation is allowed
    if (!['pending', 'assigned'].includes(request.requestStatus)) {
      return res.status(400).json({
        success: false,
        message: 'Cannot cancel request in current status',
        currentStatus: request.requestStatus
      });
    }

    // Update status to cancelled
    request.requestStatus = 'cancelled';
    await request.save();

    // Update answer review status
    await UserAnswer.findByIdAndUpdate(request.answerId, {
      reviewStatus: null
    });

    res.json({
      success: true,
      message: 'Review request cancelled successfully'
    });

  } catch (error) {
    console.error('Error cancelling review request:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: error.message
    });
  }
});

// Submit feedback on completed review
router.post('/:requestId/feedback', authenticateMobileUser, ensureUserBelongsToClient, async (req, res) => {
  try {
    const { requestId } = req.params;
    const { message } = req.body;
    const userId = req.user.id;

    console.log('Feedback request:', {
      requestId,
      userId,
      message
    });

    if (!message || !message.trim()) {
      return res.status(400).json({
        success: false,
        message: 'Feedback message is required'
      });
    }

    const request = await ReviewRequest.findById(requestId);
    if (!request) {
      return res.status(404).json({
        success: false,
        message: 'Review request not found'
      });
    }

    console.log('Found request:', {
      requestId: request._id,
      requestUserId: request.userId,
      currentUserId: userId
    });

    // Verify ownership - check if the user is either the student or the expert
    if (request.userId.toString() !== userId.toString() && request.expertId?.toString() !== userId.toString()) {
      return res.status(403).json({
        success: false,
        message: 'Access denied - you must be either the student or the expert who reviewed this answer'
      });
    }

    // Check if review is completed
    if (request.requestStatus !== 'completed') {
      return res.status(400).json({
        success: false,
        message: 'Feedback can only be submitted for completed reviews'
      });
    }

    // Find the answer
    const answer = await UserAnswer.findById(request.answerId);
    if (!answer) {
      return res.status(404).json({
        success: false,
        message: 'Answer not found'
      });
    }

    // Check if feedback already exists
    if (!answer.feedback.feedbackStatus) {
      return res.status(400).json({
        success: false,
        message: 'Feedback has already been submitted for this review'
      });
    }

    // Add feedback to the answer
    answer.feedback.userFeedbackReview = {
      message: message.trim(),
      submittedAt: new Date()
    };
    answer.feedback.feedbackStatus = false;

    await answer.save();

    res.json({
      success: true,
      message: 'Feedback submitted successfully',
      data: {
        requestId: request._id,
        answerId: answer._id,
        feedbackStatus: answer.feedback.feedbackStatus,
        feedback: answer.feedback.userFeedbackReview
      }
    });

  } catch (error) {
    console.error('Error submitting feedback:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: error.message
    });
  }
});

module.exports = router;
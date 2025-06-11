// routes/expertReview.js
const express = require('express');
const router = express.Router();
const UserAnswer = require('../models/UserAnswer');
const ReviewRequest = require('../models/ReviewRequest');
const AiswbQuestion = require('../models/AiswbQuestion');
const MobileUser = require('../models/MobileUser');
const { authenticateMobileUser } = require('../middleware/mobileAuth');

// 0. 📝 Create Review Request
router.post('/request', async (req, res) => {
  try {
    const { answer_id, question_id, priority = 'medium', notes } = req.body;

    // Validate required fields
    if (!answer_id || !question_id) {
      return res.status(400).json({
        success: false,
        message: 'answer_id and question_id are required'
      });
    }

    // Find the answer
    const answer = await UserAnswer.findById(answer_id);
    if (!answer) {
      return res.status(404).json({
        success: false,
        message: 'Answer not found'
      });
    }

    // Check if review request already exists
    const existingRequest = await ReviewRequest.findOne({ answerId: answer_id });
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

    // Create new review request
    const reviewRequest = new ReviewRequest({
      userId: answer.userId,
      questionId: question_id,
      answerId: answer_id,
      clientId: answer.clientId,
      notes,
      priority,
      requestStatus: 'pending'
    });

    await reviewRequest.save();

    // Update answer status
    answer.reviewStatus = 'review_pending';
    await answer.save();

    res.status(200).json({
      success: true,
      message: 'Review request created successfully',
      data: {
        requestId: reviewRequest._id,
        status: reviewRequest.requestStatus,
        answerId: answer._id,
        reviewStatus: answer.reviewStatus
      }
    });

  } catch (error) {
    console.error('Error creating review request:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: error.message
    });
  }
});

// 1. 📋 Get Pending Review Requests
router.get('/pending', async (req, res) => {
  try {
    const { page = 1, limit = 10, priority } = req.query;

    const filter = {
      requestStatus: { $in: ['pending', 'accepted'] }
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

// 2. ✅ Accept Review Request
router.post('/:requestId/accept', async (req, res) => {
  try {
    const { requestId } = req.params;

    const request = await ReviewRequest.findById(requestId);
    if (!request) {
      return res.status(404).json({
        success: false,
        message: 'Review request not found'
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
    request.requestStatus = 'assigned';
    request.assignedAt = new Date();
    await request.save();

    // Update answer status
    const answer = await UserAnswer.findById(request.answerId);
    if (answer) {
      answer.reviewStatus = 'review_accepted';
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

// 3. ✅ Submit Review
router.post('/:requestId/submit', async (req, res) => {
  try {
    const { requestId } = req.params;
    const { review_result, annotated_images = [], expert_score, expert_remarks } = req.body;

    // Validate required fields
    if (!review_result) {
      return res.status(400).json({
        success: false,
        message: 'Review result is required'
      });
    }

    // Find and validate request
    const request = await ReviewRequest.findById(requestId);
    if (!request) {
      return res.status(404).json({
        success: false,
        message: 'Review request not found'
      });
    }

    // Find and validate answer
    const answer = await UserAnswer.findById(request.answerId);
    if (!answer) {
      return res.status(404).json({
        success: false,
        message: 'Answer not found'
      });
    }

    // Check if answer is in correct status
    if (answer.reviewStatus !== 'review_accepted') {
      return res.status(400).json({
        success: false,
        message: `Answer is not in correct status. Current status: ${answer.reviewStatus}`,
        expectedStatus: 'review_accepted'
      });
    }

    // Update answer with review data
    answer.reviewStatus = 'review_completed';
    answer.feedback = {
      ...answer.feedback,
      expertReview: {
        result: review_result,
        score: expert_score,
        remarks: expert_remarks,
        annotatedImages: annotated_images,
        reviewedAt: new Date()
      }
    };
    await answer.save();

    // Update request status
    request.requestStatus = 'completed';
    request.completedAt = new Date();
    request.reviewData = {
      score: expert_score,
      remarks: expert_remarks,
      result: review_result,
      annotatedImages: annotated_images
    };
    await request.save();

    res.json({
      success: true,
      message: 'Review submitted successfully',
      data: {
        requestId: request._id,
        status: request.requestStatus,
        completedAt: request.completedAt,
        review: {
          result: review_result,
          score: expert_score,
          remarks: expert_remarks,
          annotatedImages: annotated_images
        }
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


// 5. 🌟 Get List of Questions in "Popular"
router.get('/popular', async (req, res) => {
  try {
    const { clientId, page = 1, limit = 20 } = req.query;

    // Build query filter for popular answers
    const filter = {
      popularityStatus: 'popular',
      publishStatus: 'published',
      submissionStatus: { $in: ['submitted', 'evaluated'] }
    };

    if (clientId) {
      filter.clientId = clientId;
    }

    // Get popular answers with pagination
    const skip = (parseInt(page) - 1) * parseInt(limit);
    
    const popularAnswers = await UserAnswer.find(filter)
      .select('_id questionId userId submittedAt feedback.score evaluation.marks')
      .populate('questionId', 'question metadata.difficultyLevel metadata.keywords')
      .populate('userId', 'mobile')
      .sort({ submittedAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    // Get total count for pagination
    const totalCount = await UserAnswer.countDocuments(filter);

    // Format response data
    const formattedData = popularAnswers.map(answer => ({
      question_id: answer.questionId._id.toString(),
      answer_id: answer._id.toString(),
      user_mobile: answer.userId?.mobile,
      question_text: answer.questionId?.question,
      difficulty_level: answer.questionId?.metadata?.difficultyLevel,
      keywords: answer.questionId?.metadata?.keywords || [],
      score: answer.feedback?.score || answer.evaluation?.marks || 0,
      submitted_at: answer.submittedAt
    }));

    res.json({
      status: 'success',
      data: formattedData,
      pagination: {
        current_page: parseInt(page),
        total_pages: Math.ceil(totalCount / parseInt(limit)),
        total_count: totalCount,
        per_page: parseInt(limit)
      }
    });

  } catch (error) {
    console.error('Error fetching popular questions:', error);
    res.status(500).json({
      status: 'error',
      message: 'Internal server error',
      details: error.message
    });
  }
});

module.exports = router;
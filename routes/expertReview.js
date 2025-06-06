// routes/expertReview.js
const express = require('express');
const router = express.Router();
const UserAnswer = require('../models/UserAnswer');
const AiswbQuestion = require('../models/AiswbQuestion');
const MobileUser = require('../models/MobileUser');
const { authenticateMobileUser } = require('../middleware/mobileAuth');

// 1. ✅ Submit Expert Review Request
router.post('/request', authenticateMobileUser, async (req, res) => {
  try {
    const { question_id, answer_id, review_message } = req.body;
    const userId = req.user.id;

    // Validate required fields
    if (!question_id || !answer_id || !review_message) {
      return res.status(400).json({
        status: 'error',
        message: 'question_id, answer_id, and review_message are required'
      });
    }

    // Find the user answer
    const userAnswer = await UserAnswer.findOne({
      _id: answer_id,
      questionId: question_id,
      userId: userId,
      clientId: req.user.clientId
    });

    if (!userAnswer) {
      return res.status(404).json({
        status: 'error',
        message: 'Answer not found or you do not have permission to access it'
      });
    }

    // Check if already under review
    if (userAnswer.reviewStatus === 'review_pending') {
      return res.status(400).json({
        status: 'error',
        message: 'This answer is already under expert review'
      });
    }

    // Update the answer to request review
    userAnswer.reviewStatus = 'review_pending';
    userAnswer.metadata = {
      ...userAnswer.metadata,
      reviewRequestedAt: new Date(),
      reviewMessage: review_message
    };

    await userAnswer.save();

    console.log(`Expert review requested for answer ${answer_id} by user ${userId}`);

    res.json({
      status: 'success',
      message: review_message || 'Review my answer I am not satisfied with the result'
    });

  } catch (error) {
    console.error('Error submitting expert review request:', error);
    res.status(500).json({
      status: 'error',
      message: 'Internal server error',
      details: error.message
    });
  }
});

// 2. 📋 Get List of Questions/Answers in Review
router.get('/list', async (req, res) => {
  try {
    const { clientId, page = 1, limit = 20 } = req.query;

    // Build query filter
    const filter = {
      reviewStatus: 'review_pending',
      submissionStatus: { $in: ['submitted', 'evaluated'] }
    };

    if (clientId) {
      filter.clientId = clientId;
    }

    // Get answers under review with pagination
    const skip = (parseInt(page) - 1) * parseInt(limit);
    
    const answersUnderReview = await UserAnswer.find(filter)
      .select('_id questionId userId submittedAt metadata.reviewMessage metadata.reviewRequestedAt')
      .populate('questionId', 'question metadata.difficultyLevel')
      .populate('userId', 'mobile')
      .sort({ 'metadata.reviewRequestedAt': -1 })
      .skip(skip)
      .limit(parseInt(limit));

    // Get total count for pagination
    const totalCount = await UserAnswer.countDocuments(filter);

    // Format response data
    const formattedData = answersUnderReview.map(answer => ({
      question_id: answer.questionId._id.toString(),
      answer_id: answer._id.toString(),
      user_mobile: answer.userId?.mobile,
      question_text: answer.questionId?.question,
      difficulty_level: answer.questionId?.metadata?.difficultyLevel,
      submitted_at: answer.submittedAt,
      review_requested_at: answer.metadata?.reviewRequestedAt,
      review_message: answer.metadata?.reviewMessage
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
    console.error('Error fetching review list:', error);
    res.status(500).json({
      status: 'error',
      message: 'Internal server error',
      details: error.message
    });
  }
});

// 3. 🧪 Submit Review Result
router.post('/result', async (req, res) => {
  try {
    const { question_id, answer_id, review_result, annotated_images, expert_score, expert_remarks } = req.body;

    // Validate required fields
    if (!question_id || !answer_id || !review_result) {
      return res.status(400).json({
        status: 'error',
        message: 'question_id, answer_id, and review_result are required'
      });
    }

    // Find the user answer
    const userAnswer = await UserAnswer.findOne({
      _id: answer_id,
      questionId: question_id,
      reviewStatus: 'review_pending'
    });

    if (!userAnswer) {
      return res.status(404).json({
        status: 'error',
        message: 'Answer not found or not under review'
      });
    }

    // Update answer with expert review results
    userAnswer.reviewStatus = 'review_completed';
    userAnswer.reviewedAt = new Date();
    
    // Store expert review data
    userAnswer.feedback = {
      ...userAnswer.feedback,
      expertReview: {
        result: review_result,
        score: expert_score || null,
        remarks: expert_remarks || '',
        annotatedImages: annotated_images || [],
        reviewedAt: new Date()
      }
    };

    // If expert provided a score, update the main score
    if (expert_score !== undefined && expert_score !== null) {
      userAnswer.feedback.score = expert_score;
    }

    await userAnswer.save();

    console.log(`Expert review completed for answer ${answer_id}`);

    // Prepare response data
    const responseData = {
      annotated_images: annotated_images || [],
      expert_score: expert_score || null,
      expert_remarks: expert_remarks || ''
    };

    res.json({
      status: 'success',
      message: 'Review result submitted',
      data: responseData
    });

  } catch (error) {
    console.error('Error submitting review result:', error);
    res.status(500).json({
      status: 'error',
      message: 'Internal server error',
      details: error.message
    });
  }
});

// 4. 💬 Submit Feedback on Review Result
router.post('/feedback', authenticateMobileUser, async (req, res) => {
  try {
    const { question_id, answer_id, feedback_message } = req.body;
    const userId = req.user.id;

    // Validate required fields
    if (!question_id || !answer_id || !feedback_message) {
      return res.status(400).json({
        status: 'error',
        message: 'question_id, answer_id, and feedback_message are required'
      });
    }

    // Find the user answer
    const userAnswer = await UserAnswer.findOne({
      _id: answer_id,
      questionId: question_id,
      userId: userId,
      clientId: req.user.clientId,
      reviewStatus: 'review_completed'
    });

    if (!userAnswer) {
      return res.status(404).json({
        status: 'error',
        message: 'Answer not found, not reviewed yet, or you do not have permission to access it'
      });
    }

    // Add user feedback to the answer
    if (!userAnswer.feedback.userFeedback) {
      userAnswer.feedback.userFeedback = [];
    }

    userAnswer.feedback.userFeedback.push({
      message: feedback_message,
      submittedAt: new Date()
    });

    await userAnswer.save();

    console.log(`User feedback submitted for answer ${answer_id} by user ${userId}`);

    res.json({
      status: 'success',
      message: 'Feedback submitted successfully'
    });

  } catch (error) {
    console.error('Error submitting feedback:', error);
    res.status(500).json({
      status: 'error',
      message: 'Internal server error',
      details: error.message
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
const express = require('express');
const router = express.Router();
const { validationResult, param, body } = require('express-validator');
const UserAnswer = require('../models/UserAnswer');
const AiswbQuestion = require('../models/AiswbQuestion');
const AISWBSet = require('../models/AISWBSet');
const { authenticateMobileUser } = require('../middleware/mobileAuth');
const mongoose = require('mongoose');

// Validation middlewares
const validateAnswerId = [
  param('answerId')
    .isMongoId()
    .withMessage('Answer ID must be a valid MongoDB ObjectId')
];

const validateStatusUpdate = [
  body('status')
    .isString()
    .trim()
    .notEmpty()
    .withMessage('Status is required'),
  body('reason')
    .optional()
    .isString()
    .trim()
    .isLength({ max: 500 })
    .withMessage('Reason must be less than 500 characters')
];

const validateEvaluationData = [
  body('accuracy')
    .isInt({ min: 0, max: 100 })
    .withMessage('Accuracy must be between 0 and 100'),
  body('marks')
    .isInt({ min: 0 })
    .withMessage('Marks must be a positive integer'),
  body('feedback')
    .isString()
    .trim()
    .notEmpty()
    .isLength({ max: 2000 })
    .withMessage('Feedback is required and must be less than 2000 characters'),
  body('strengths')
    .isArray()
    .withMessage('Strengths must be an array')
    .custom((arr) => arr.length <= 5)
    .withMessage('Maximum 5 strengths allowed'),
  body('strengths.*')
    .isString()
    .trim()
    .isLength({ max: 200 })
    .withMessage('Each strength must be less than 200 characters'),
  body('weaknesses')
    .isArray()
    .withMessage('Weaknesses must be an array')
    .custom((arr) => arr.length <= 5)
    .withMessage('Maximum 5 weaknesses allowed'),
  body('weaknesses.*')
    .isString()
    .trim()
    .isLength({ max: 200 })
    .withMessage('Each weakness must be less than 200 characters'),
  body('suggestions')
    .isArray()
    .withMessage('Suggestions must be an array')
    .custom((arr) => arr.length <= 5)
    .withMessage('Maximum 5 suggestions allowed'),
  body('suggestions.*')
    .isString()
    .trim()
    .isLength({ max: 200 })
    .withMessage('Each suggestion must be less than 200 characters'),
  body('reason')
    .optional()
    .isString()
    .trim()
    .isLength({ max: 500 })
    .withMessage('Reason must be less than 500 characters')
];

// Helper function to check if user can access the answer
const checkAnswerAccess = async (answerId, userId) => {
  const answer = await UserAnswer.findById(answerId)
    .populate('questionId', 'question metadata')
    .populate('setId', 'name itemType');
  
  if (!answer) {
    const error = new Error('Answer not found');
    error.code = 'ANSWER_NOT_FOUND';
    throw error;
  }
  
  if (answer.userId.toString() !== userId.toString()) {
    const error = new Error('Access denied');
    error.code = 'ACCESS_DENIED';
    throw error;
  }
  
  return answer;
};

// 1. Get answer details for manual evaluation
router.get('/answers/:answerId/details',
  authenticateMobileUser,
  validateAnswerId,
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          message: "Invalid input data",
          error: {
            code: "INVALID_INPUT",
            details: errors.array()
          }
        });
      }

      const { answerId } = req.params;
      const userId = req.user.id;

      const answer = await checkAnswerAccess(answerId, userId);

      res.status(200).json({
        success: true,
        message: "Answer details retrieved successfully",
        data: {
          answerId: answer._id,
          attemptNumber: answer.attemptNumber,
          userId: answer.userId,
          questionId: answer.questionId._id,
          setId: answer.setId?._id,
          answerImages: answer.answerImages,
          textAnswer: answer.textAnswer,
          extractedTexts: answer.extractedTexts,
          submissionStatus: answer.submissionStatus,
          submittedAt: answer.submittedAt,
          status: answer.status,
          reviewStatus: answer.reviewStatus,
          evaluationStatus: answer.evaluationStatus,
          evaluationMode: answer.evaluationMode,
          popularityStatus: answer.popularityStatus,
          evaluation: answer.evaluation,
          evaluatedAt: answer.evaluatedAt,
          statusHistory: answer.statusHistory,
          question: {
            id: answer.questionId._id,
            question: answer.questionId.question,
            metadata: answer.questionId.metadata
          },
          ...(answer.setId && {
            set: {
              id: answer.setId._id,
              name: answer.setId.name,
              itemType: answer.setId.itemType
            }
          }),
          metadata: answer.metadata,
          isFinalAttempt: answer.isFinalAttempt(),
          canEvaluate: answer.evaluationStatus === 'not_evaluated' || answer.evaluationStatus === 'evaluation_failed',
          canPublish: answer.status === 'pending' && answer.evaluationStatus === 'manual_evaluated',
          canReview: answer.reviewStatus === 'review_pending'
        }
      });

    } catch (error) {
      console.error('Get answer details error:', error);
      
      if (error.code === 'ANSWER_NOT_FOUND') {
        return res.status(404).json({
          success: false,
          message: error.message,
          error: {
            code: error.code,
            details: "The specified answer does not exist"
          }
        });
      }
      
      if (error.code === 'ACCESS_DENIED') {
        return res.status(403).json({
          success: false,
          message: error.message,
          error: {
            code: error.code,
            details: "You don't have permission to access this answer"
          }
        });
      }

      res.status(500).json({
        success: false,
        message: "Internal server error",
        error: {
          code: "SERVER_ERROR",
          details: process.env.NODE_ENV === 'development' ? error.message : 'An unexpected error occurred'
        }
      });
    }
  }
);

// 2. Manual evaluation of answer
router.post('/answers/:answerId/evaluate',
  authenticateMobileUser,
  validateAnswerId,
  validateEvaluationData,
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          message: "Invalid input data",
          error: {
            code: "INVALID_INPUT",
            details: errors.array()
          }
        });
      }

      const { answerId } = req.params;
      const userId = req.user.id;
      const { accuracy, marks, feedback, strengths, weaknesses, suggestions, reason } = req.body;

      const answer = await checkAnswerAccess(answerId, userId);

      // Check if answer can be evaluated
      if (answer.evaluationStatus === 'manual_evaluated') {
        return res.status(400).json({
          success: false,
          message: "Answer has already been manually evaluated",
          error: {
            code: "ALREADY_EVALUATED",
            details: "This answer has already been manually evaluated"
          }
        });
      }

      // Update evaluation data
      answer.evaluation = {
        accuracy: accuracy,
        marks: marks,
        feedback: feedback,
        strengths: strengths,
        weaknesses: weaknesses,
        suggestions: suggestions
      };
      answer.evaluatedAt = new Date();
      answer.evaluationMode = 'manual';

      // Update evaluation status
      await answer.updateStatus('evaluation', 'manual_evaluated', reason || 'Manual evaluation completed');

      await answer.save();

      res.status(200).json({
        success: true,
        message: "Answer evaluated successfully",
        data: {
          answerId: answer._id,
          evaluationStatus: answer.evaluationStatus,
          evaluationMode: answer.evaluationMode,
          evaluatedAt: answer.evaluatedAt,
          evaluation: answer.evaluation,
          canPublish: answer.status === 'pending'
        }
      });

    } catch (error) {
      console.error('Manual evaluation error:', error);
      
      if (error.code === 'ANSWER_NOT_FOUND') {
        return res.status(404).json({
          success: false,
          message: error.message,
          error: { code: error.code, details: "The specified answer does not exist" }
        });
      }
      
      if (error.code === 'ACCESS_DENIED') {
        return res.status(403).json({
          success: false,
          message: error.message,
          error: { code: error.code, details: "You don't have permission to access this answer" }
        });
      }

      res.status(500).json({
        success: false,
        message: "Internal server error",
        error: {
          code: "SERVER_ERROR",
          details: process.env.NODE_ENV === 'development' ? error.message : 'An unexpected error occurred'
        }
      });
    }
  }
);

// 3. Update main status (pending, rejected, published, not_published)
router.post('/answers/:answerId/status/main',
  authenticateMobileUser,
  validateAnswerId,
  [
    body('status')
      .isIn(['pending', 'rejected', 'published', 'not_published'])
      .withMessage('Status must be one of: pending, rejected, published, not_published'),
    body('reason')
      .optional()
      .isString()
      .trim()
      .isLength({ max: 500 })
      .withMessage('Reason must be less than 500 characters')
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          message: "Invalid input data",
          error: {
            code: "INVALID_INPUT",
            details: errors.array()
          }
        });
      }

      const { answerId } = req.params;
      const userId = req.user.id;
      const { status, reason } = req.body;

      const answer = await checkAnswerAccess(answerId, userId);

      // Validation based on current state
      if (status === 'published' && answer.evaluationStatus === 'not_evaluated') {
        return res.status(400).json({
          success: false,
          message: "Cannot publish answer that hasn't been evaluated",
          error: {
            code: "EVALUATION_REQUIRED",
            details: "Answer must be evaluated before it can be published"
          }
        });
      }

      await answer.updateStatus('main', status, reason || `Status updated to ${status}`);

      res.status(200).json({
        success: true,
        message: `Main status updated to ${status} successfully`,
        data: {
          answerId: answer._id,
          status: answer.status,
          previousStatus: answer.statusHistory[answer.statusHistory.length - 1]?.previousStatus,
          updatedAt: new Date(),
          reason: reason || `Status updated to ${status}`
        }
      });

    } catch (error) {
      console.error('Update main status error:', error);
      
      if (error.code === 'ANSWER_NOT_FOUND') {
        return res.status(404).json({
          success: false,
          message: error.message,
          error: { code: error.code, details: "The specified answer does not exist" }
        });
      }
      
      if (error.code === 'ACCESS_DENIED') {
        return res.status(403).json({
          success: false,
          message: error.message,
          error: { code: error.code, details: "You don't have permission to access this answer" }
        });
      }

      res.status(500).json({
        success: false,
        message: "Internal server error",
        error: {
          code: "SERVER_ERROR",
          details: process.env.NODE_ENV === 'development' ? error.message : 'An unexpected error occurred'
        }
      });
    }
  }
);

// 4. Update review status (review_pending, review_accepted, review_completed)
router.post('/answers/:answerId/status/review',
  authenticateMobileUser,
  validateAnswerId,
  [
    body('status')
      .isIn(['review_pending', 'review_accepted', 'review_completed'])
      .withMessage('Status must be one of: review_pending, review_accepted, review_completed'),
    body('reason')
      .optional()
      .isString()
      .trim()
      .isLength({ max: 500 })
      .withMessage('Reason must be less than 500 characters')
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          message: "Invalid input data",
          error: {
            code: "INVALID_INPUT",
            details: errors.array()
          }
        });
      }

      const { answerId } = req.params;
      const userId = req.user.id;
      const { status, reason } = req.body;

      const answer = await checkAnswerAccess(answerId, userId);

      await answer.updateStatus('review', status, reason || `Review status updated to ${status}`);

      res.status(200).json({
        success: true,
        message: `Review status updated to ${status} successfully`,
        data: {
          answerId: answer._id,
          reviewStatus: answer.reviewStatus,
          previousStatus: answer.statusHistory[answer.statusHistory.length - 1]?.previousStatus,
          updatedAt: new Date(),
          reason: reason || `Review status updated to ${status}`
        }
      });

    } catch (error) {
      console.error('Update review status error:', error);
      
      if (error.code === 'ANSWER_NOT_FOUND') {
        return res.status(404).json({
          success: false,
          message: error.message,
          error: { code: error.code, details: "The specified answer does not exist" }
        });
      }
      
      if (error.code === 'ACCESS_DENIED') {
        return res.status(403).json({
          success: false,
          message: error.message,
          error: { code: error.code, details: "You don't have permission to access this answer" }
        });
      }

      res.status(500).json({
        success: false,
        message: "Internal server error",
        error: {
          code: "SERVER_ERROR",
          details: process.env.NODE_ENV === 'development' ? error.message : 'An unexpected error occurred'
        }
      });
    }
  }
);

// 5. Update evaluation status (not_evaluated, auto_evaluated, manual_evaluated, evaluation_failed)
router.post('/answers/:answerId/status/evaluation',
  authenticateMobileUser,
  validateAnswerId,
  [
    body('status')
      .isIn(['not_evaluated', 'auto_evaluated', 'manual_evaluated', 'evaluation_failed'])
      .withMessage('Status must be one of: not_evaluated, auto_evaluated, manual_evaluated, evaluation_failed'),
    body('reason')
      .optional()
      .isString()
      .trim()
      .isLength({ max: 500 })
      .withMessage('Reason must be less than 500 characters')
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          message: "Invalid input data",
          error: {
            code: "INVALID_INPUT",
            details: errors.array()
          }
        });
      }

      const { answerId } = req.params;
      const userId = req.user.id;
      const { status, reason } = req.body;

      const answer = await checkAnswerAccess(answerId, userId);

      await answer.updateStatus('evaluation', status, reason || `Evaluation status updated to ${status}`);

      // Update evaluatedAt timestamp if status indicates evaluation completion
      if (status === 'auto_evaluated' || status === 'manual_evaluated') {
        answer.evaluatedAt = new Date();
        await answer.save();
      }

      res.status(200).json({
        success: true,
        message: `Evaluation status updated to ${status} successfully`,
        data: {
          answerId: answer._id,
          evaluationStatus: answer.evaluationStatus,
          evaluatedAt: answer.evaluatedAt,
          previousStatus: answer.statusHistory[answer.statusHistory.length - 1]?.previousStatus,
          updatedAt: new Date(),
          reason: reason || `Evaluation status updated to ${status}`
        }
      });

    } catch (error) {
      console.error('Update evaluation status error:', error);
      
      if (error.code === 'ANSWER_NOT_FOUND') {
        return res.status(404).json({
          success: false,
          message: error.message,
          error: { code: error.code, details: "The specified answer does not exist" }
        });
      }
      
      if (error.code === 'ACCESS_DENIED') {
        return res.status(403).json({
          success: false,
          message: error.message,
          error: { code: error.code, details: "You don't have permission to access this answer" }
        });
      }

      res.status(500).json({
        success: false,
        message: "Internal server error",
        error: {
          code: "SERVER_ERROR",
          details: process.env.NODE_ENV === 'development' ? error.message : 'An unexpected error occurred'
        }
      });
    }
  }
);

// 6. Update popularity status (popular, not_popular)
router.post('/answers/:answerId/status/popularity',
  authenticateMobileUser,
  validateAnswerId,
  [
    body('status')
      .isIn(['popular', 'not_popular'])
      .withMessage('Status must be one of: popular, not_popular'),
    body('reason')
      .optional()
      .isString()
      .trim()
      .isLength({ max: 500 })
      .withMessage('Reason must be less than 500 characters')
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          message: "Invalid input data",
          error: {
            code: "INVALID_INPUT",
            details: errors.array()
          }
        });
      }

      const { answerId } = req.params;
      const userId = req.user.id;
      const { status, reason } = req.body;

      const answer = await checkAnswerAccess(answerId, userId);

      await answer.updateStatus('popularity', status, reason || `Popularity status updated to ${status}`);

      res.status(200).json({
        success: true,
        message: `Popularity status updated to ${status} successfully`,
        data: {
          answerId: answer._id,
          popularityStatus: answer.popularityStatus,
          previousStatus: answer.statusHistory[answer.statusHistory.length - 1]?.previousStatus,
          updatedAt: new Date(),
          reason: reason || `Popularity status updated to ${status}`
        }
      });

    } catch (error) {
      console.error('Update popularity status error:', error);
      
      if (error.code === 'ANSWER_NOT_FOUND') {
        return res.status(404).json({
          success: false,
          message: error.message,
          error: { code: error.code, details: "The specified answer does not exist" }
        });
      }
      
      if (error.code === 'ACCESS_DENIED') {
        return res.status(403).json({
          success: false,
          message: error.message,
          error: { code: error.code, details: "You don't have permission to access this answer" }
        });
      }

      res.status(500).json({
        success: false,
        message: "Internal server error",
        error: {
          code: "SERVER_ERROR",
          details: process.env.NODE_ENV === 'development' ? error.message : 'An unexpected error occurred'
        }
      });
    }
  }
);

// 7. Get all answers by user for manual operations
router.get('/answers/user/:userId',
  authenticateMobileUser,
  [
    param('userId')
      .isMongoId()
      .withMessage('User ID must be a valid MongoDB ObjectId'),
    body('page')
      .optional()
      .isInt({ min: 1 })
      .withMessage('Page must be a positive integer'),
    body('limit')
      .optional()
      .isInt({ min: 1, max: 100 })
      .withMessage('Limit must be between 1 and 100'),
    body('status')
      .optional()
      .isIn(['pending', 'rejected', 'published', 'not_published'])
      .withMessage('Invalid status filter'),
    body('evaluationStatus')
      .optional()
      .isIn(['not_evaluated', 'auto_evaluated', 'manual_evaluated', 'evaluation_failed'])
      .withMessage('Invalid evaluation status filter')
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          message: "Invalid input data",
          error: {
            code: "INVALID_INPUT",
            details: errors.array()
          }
        });
      }

      const { userId } = req.params;
      const requestingUserId = req.user.id;
      
      // Check if user can access these answers
      if (userId !== requestingUserId.toString()) {
        return res.status(403).json({
          success: false,
          message: "Access denied",
          error: {
            code: "ACCESS_DENIED",
            details: "You can only access your own answers"
          }
        });
      }

      const page = parseInt(req.query.page) || 1;
      const limit = parseInt(req.query.limit) || 20;
      const skip = (page - 1) * limit;

      // Build filter
      const filter = { userId: userId };
      if (req.query.status) filter.status = req.query.status;
      if (req.query.evaluationStatus) filter.evaluationStatus = req.query.evaluationStatus;

      const [answers, totalCount] = await Promise.all([
        UserAnswer.find(filter)
          .populate('questionId', 'question metadata')
          .populate('setId', 'name itemType')
          .sort({ createdAt: -1 })
          .skip(skip)
          .limit(limit),
        UserAnswer.countDocuments(filter)
      ]);

      const totalPages = Math.ceil(totalCount / limit);

      res.status(200).json({
        success: true,
        message: "Answers retrieved successfully",
        data: {
          answers: answers.map(answer => ({
            answerId: answer._id,
            attemptNumber: answer.attemptNumber,
            questionId: answer.questionId._id,
            setId: answer.setId?._id,
            status: answer.status,
            reviewStatus: answer.reviewStatus,
            evaluationStatus: answer.evaluationStatus,
            evaluationMode: answer.evaluationMode,
            popularityStatus: answer.popularityStatus,
            submittedAt: answer.submittedAt,
            evaluatedAt: answer.evaluatedAt,
            hasImages: answer.answerImages.length > 0,
            hasTextAnswer: !!answer.textAnswer,
            question: {
              id: answer.questionId._id,
              question: answer.questionId.question.substring(0, 100) + '...',
              metadata: answer.questionId.metadata
            },
            ...(answer.setId && {
              set: {
                id: answer.setId._id,
                name: answer.setId.name,
                itemType: answer.setId.itemType
              }
            }),
            canEvaluate: answer.evaluationStatus === 'not_evaluated' || answer.evaluationStatus === 'evaluation_failed',
            canPublish: answer.status === 'pending' && (answer.evaluationStatus === 'manual_evaluated' || answer.evaluationStatus === 'auto_evaluated'),
            canReview: answer.reviewStatus === 'review_pending'
          })),
          pagination: {
            currentPage: page,
            totalPages: totalPages,
            totalCount: totalCount,
            hasNext: page < totalPages,
            hasPrev: page > 1
          }
        }
      });

    } catch (error) {
      console.error('Get user answers error:', error);
      
      res.status(500).json({
        success: false,
        message: "Internal server error",
        error: {
          code: "SERVER_ERROR",
          details: process.env.NODE_ENV === 'development' ? error.message : 'An unexpected error occurred'
        }
      });
    }
  }
);

// 8. Bulk status update for multiple answers
router.post('/answers/bulk-update',
  authenticateMobileUser,
  [
    body('answerIds')
      .isArray({ min: 1, max: 50 })
      .withMessage('Answer IDs must be an array with 1-50 items'),
    body('answerIds.*')
      .isMongoId()
      .withMessage('Each answer ID must be a valid MongoDB ObjectId'),
    body('statusType')
      .isIn(['main', 'review', 'evaluation', 'popularity'])
      .withMessage('Status type must be one of: main, review, evaluation, popularity'),
    body('status')
      .isString()
      .trim()
      .notEmpty()
      .withMessage('Status is required'),
    body('reason')
      .optional()
      .isString()
      .trim()
      .isLength({ max: 500 })
      .withMessage('Reason must be less than 500 characters')
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          message: "Invalid input data",
          error: {
            code: "INVALID_INPUT",
            details: errors.array()
          }
        });
      }

      const { answerIds, statusType, status, reason } = req.body;
      const userId = req.user.id;

      // Validate status based on type
      const validStatuses = {
        main: ['pending', 'rejected', 'published', 'not_published'],
        review: ['review_pending', 'review_accepted', 'review_completed'],
        evaluation: ['not_evaluated', 'auto_evaluated', 'manual_evaluated', 'evaluation_failed'],
        popularity: ['popular', 'not_popular']
      };

      if (!validStatuses[statusType].includes(status)) {
        return res.status(400).json({
          success: false,
          message: `Invalid status for ${statusType}`,
          error: {
            code: "INVALID_STATUS",
            details: `Status must be one of: ${validStatuses[statusType].join(', ')}`
          }
        });
      }

      // Find all answers and verify ownership
      const answers = await UserAnswer.find({
        _id: { $in: answerIds },
        userId: userId
      });

      if (answers.length !== answerIds.length) {
        return res.status(400).json({
          success: false,
          message: "Some answers not found or access denied",
          error: {
            code: "ANSWERS_NOT_FOUND",
            details: "Some answers were not found or you don't have permission to access them"
          }
        });
      }

      // Update all answers
      const updateResults = [];
      for (const answer of answers) {
        try {
          await answer.updateStatus(statusType, status, reason || `Bulk update: ${statusType} status to ${status}`);
          updateResults.push({
            answerId: answer._id,
            success: true,
            previousStatus: answer.statusHistory[answer.statusHistory.length - 2]?.[`${statusType}Status`] || answer.statusHistory[answer.statusHistory.length - 2]?.status
          });
        } catch (updateError) {
          updateResults.push({
            answerId: answer._id,
            success: false,
            error: updateError.message
          });
        }
      }

      const successCount = updateResults.filter(r => r.success).length;
      const failureCount = updateResults.filter(r => !r.success).length;

      res.status(200).json({
        success: true,
        message: `Bulk update completed. ${successCount} successful, ${failureCount} failed.`,
        data: {
          statusType: statusType,
          status: status,
          reason: reason,
          totalProcessed: answerIds.length,
          successCount: successCount,
          failureCount: failureCount,
          results: updateResults
        }
      });

    } catch (error) {
      console.error('Bulk update error:', error);
      
      res.status(500).json({
        success: false,
        message: "Internal server error",
        error: {
          code: "SERVER_ERROR",
          details: process.env.NODE_ENV === 'development' ? error.message : 'An unexpected error occurred'
        }
      });
    }
  }
);

module.exports = router;
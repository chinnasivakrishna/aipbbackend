const express = require('express');
const router = express.Router();
const UserAnswer = require('../models/UserAnswer');
const AiswbQuestion = require('../models/AiswbQuestion');
const MobileUser = require('../models/MobileUser');
const AISWBSet = require('../models/AISWBSet');
const { validationResult, param, body, query } = require('express-validator');
const mongoose = require('mongoose');

// Validation middleware
const validateQuestionId = [
  param('questionId')
    .isMongoId()
    .withMessage('Question ID must be a valid MongoDB ObjectId')
];

const validateAnswerId = [
  param('answerId')
    .isMongoId()
    .withMessage('Answer ID must be a valid MongoDB ObjectId')
];

const validateStatusUpdate = [
  body('status')
    .isIn(['pending', 'rejected', 'published', 'not_published'])
    .withMessage('Status must be one of: pending, rejected, published, not_published'),
  body('reason')
    .optional()
    .isString()
    .trim()
    .isLength({ max: 500 })
    .withMessage('Reason must be a string with maximum 500 characters')
];

const validateReviewStatusUpdate = [
  body('reviewStatus')
    .isIn(['review_pending', 'review_accepted', 'review_completed'])
    .withMessage('Review status must be one of: review_pending, review_accepted, review_completed'),
  body('reason')
    .optional()
    .isString()
    .trim()
    .isLength({ max: 500 })
    .withMessage('Reason must be a string with maximum 500 characters')
];

const validateEvaluationStatusUpdate = [
  body('evaluationStatus')
    .isIn(['evaluated', 'not_evaluated', 'auto_evaluated', 'manual_evaluated', 'evaluation_failed'])
    .withMessage('Evaluation status must be one of: evaluated, not_evaluated, auto_evaluated, manual_evaluated, evaluation_failed'),
  body('reason')
    .optional()
    .isString()
    .trim()
    .isLength({ max: 500 })
    .withMessage('Reason must be a string with maximum 500 characters')
];

const validateEvaluationData = [
  body('evaluation.accuracy')
    .optional()
    .isInt({ min: 0, max: 100 })
    .withMessage('Accuracy must be a number between 0 and 100'),
  body('evaluation.marks')
    .optional()
    .isInt({ min: 0 })
    .withMessage('Marks must be a positive number'),
  body('evaluation.strengths')
    .optional()
    .isArray()
    .withMessage('Strengths must be an array'),
  body('evaluation.weaknesses')
    .optional()
    .isArray()
    .withMessage('Weaknesses must be an array'),
  body('evaluation.suggestions')
    .optional()
    .isArray()
    .withMessage('Suggestions must be an array'),
  body('evaluation.feedback')
    .optional()
    .isString()
    .trim()
    .isLength({ max: 2000 })
    .withMessage('Feedback must be a string with maximum 2000 characters')
];

const validatePopularityStatusUpdate = [
  body('popularityStatus')
    .isIn(['popular', 'not_popular'])
    .withMessage('Popularity status must be either popular or not_popular'),
  body('reason')
    .optional()
    .isString()
    .trim()
    .isLength({ max: 500 })
    .withMessage('Reason must be a string with maximum 500 characters')
];

// GET: Get all user answers for a specific question with user and question details
router.get('/questions/:questionId/answers', 
  validateQuestionId,
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          message: "Invalid question ID",
          error: {
            code: "INVALID_INPUT",
            details: errors.array()
          }
        });
      }

      const { questionId } = req.params;
      const { 
        page = 1, 
        limit = 10, 
        status, 
        reviewStatus, 
        evaluationStatus, 
        evaluationMode,
        popularityStatus,
        sortBy = 'submittedAt',
        sortOrder = 'desc'
      } = req.query;

      // Build filter query
      const filter = { questionId };
      
      if (status) filter.status = status;
      if (reviewStatus) filter.reviewStatus = reviewStatus;
      if (evaluationStatus) filter.evaluationStatus = evaluationStatus;
      if (evaluationMode) filter.evaluationMode = evaluationMode;
      if (popularityStatus) filter.popularityStatus = popularityStatus;

      // Calculate pagination
      const pageNum = parseInt(page);
      const limitNum = parseInt(limit);
      const skip = (pageNum - 1) * limitNum;

      // Build sort object
      const sort = {};
      sort[sortBy] = sortOrder === 'asc' ? 1 : -1;

      // Get total count for pagination
      const totalCount = await UserAnswer.countDocuments(filter);

      // Fetch user answers with populated data
      const userAnswers = await UserAnswer.find(filter)
        .populate({
          path: 'userId',
          model: 'MobileUser',
          select: 'mobile clientId isVerified createdAt lastLoginAt',
          populate: {
            path: 'profile',
            model: 'UserProfile',
            select: 'name email dateOfBirth gender'
          }
        })
        .populate({
          path: 'questionId',
          model: 'AiswbQuestion',
          select: 'question detailedAnswer modalAnswer metadata languageMode setId'
        })
        .populate({
          path: 'setId',
          model: 'AISWBSet',
          select: 'name description itemType isActive'
        })
        .populate({
          path: 'reviewedBy',
          model: 'User',
          select: 'name email role'
        })
        .sort(sort)
        .skip(skip)
        .limit(limitNum)
        .lean();

      // Calculate pagination info
      const totalPages = Math.ceil(totalCount / limitNum);
      const hasNextPage = pageNum < totalPages;
      const hasPrevPage = pageNum > 1;

      res.status(200).json({
        success: true,
        message: "User answers retrieved successfully",
        data: {
          answers: userAnswers,
          pagination: {
            currentPage: pageNum,
            totalPages,
            totalCount,
            limit: limitNum,
            hasNextPage,
            hasPrevPage,
            nextPage: hasNextPage ? pageNum + 1 : null,
            prevPage: hasPrevPage ? pageNum - 1 : null
          },
          filters: {
            questionId,
            status,
            reviewStatus,
            evaluationStatus,
            evaluationMode,
            popularityStatus
          },
          sorting: {
            sortBy,
            sortOrder
          }
        }
      });

    } catch (error) {
      console.error('Error fetching user answers:', error);
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

// GET: Get specific user answer details by answer ID
router.get('/answers/:answerId',
  validateAnswerId,
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          message: "Invalid answer ID",
          error: {
            code: "INVALID_INPUT",
            details: errors.array()
          }
        });
      }

      const { answerId } = req.params;

      const userAnswer = await UserAnswer.findById(answerId)
        .populate({
          path: 'userId',
          model: 'MobileUser',
          select: 'mobile clientId isVerified createdAt lastLoginAt',
          populate: {
            path: 'profile',
            model: 'UserProfile',
            select: 'name email dateOfBirth gender'
          }
        })
        .populate({
          path: 'questionId',
          model: 'AiswbQuestion',
          select: 'question detailedAnswer modalAnswer metadata languageMode setId'
        })
        .populate({
          path: 'setId',
          model: 'AISWBSet',
          select: 'name description itemType isActive'
        })
        .populate({
          path: 'reviewedBy',
          model: 'User',
          select: 'name email role'
        })
        .lean();

      if (!userAnswer) {
        return res.status(404).json({
          success: false,
          message: "User answer not found",
          error: {
            code: "ANSWER_NOT_FOUND",
            details: "The specified answer does not exist"
          }
        });
      }

      res.status(200).json({
        success: true,
        message: "User answer retrieved successfully",
        data: userAnswer
      });

    } catch (error) {
      console.error('Error fetching user answer:', error);
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

// PUT: Update main status (pending, rejected, published, not_published)
router.put('/answers/:answerId/status',
  validateAnswerId,
  validateStatusUpdate,
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
      const { status, reason } = req.body;

      const userAnswer = await UserAnswer.findById(answerId);
      if (!userAnswer) {
        return res.status(404).json({
          success: false,
          message: "User answer not found",
          error: {
            code: "ANSWER_NOT_FOUND",
            details: "The specified answer does not exist"
          }
        });
      }

      // Update status using the model method
      await userAnswer.updateStatus('main', status, reason || `Status updated to ${status}`);

      // Get updated answer with populated data
      const updatedAnswer = await UserAnswer.findById(answerId)
        .populate('userId', 'mobile clientId')
        .populate('questionId', 'question metadata')
        .lean();

      res.status(200).json({
        success: true,
        message: `Status updated to ${status} successfully`,
        data: {
          answerId: updatedAnswer._id,
          previousStatus: userAnswer.statusHistory[userAnswer.statusHistory.length - 1]?.previousStatus,
          currentStatus: status,
          reason: reason || `Status updated to ${status}`,
          updatedAt: new Date(),
          answer: updatedAnswer
        }
      });

    } catch (error) {
      console.error('Error updating status:', error);
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

// PUT: Update review status (review_pending, review_accepted, review_completed)
router.put('/answers/:answerId/review-status',
  validateAnswerId,
  validateReviewStatusUpdate,
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
      const { reviewStatus, reason } = req.body;

      const userAnswer = await UserAnswer.findById(answerId);
      if (!userAnswer) {
        return res.status(404).json({
          success: false,
          message: "User answer not found",
          error: {
            code: "ANSWER_NOT_FOUND",
            details: "The specified answer does not exist"
          }
        });
      }

      // Update review status and reviewedAt timestamp
      if (reviewStatus === 'review_completed') {
        userAnswer.reviewedAt = new Date();
      }

      await userAnswer.updateStatus('review', reviewStatus, reason || `Review status updated to ${reviewStatus}`);

      // Get updated answer with populated data
      const updatedAnswer = await UserAnswer.findById(answerId)
        .populate('userId', 'mobile clientId')
        .populate('questionId', 'question metadata')
        .lean();

      res.status(200).json({
        success: true,
        message: `Review status updated to ${reviewStatus} successfully`,
        data: {
          answerId: updatedAnswer._id,
          previousReviewStatus: userAnswer.statusHistory[userAnswer.statusHistory.length - 1]?.previousStatus,
          currentReviewStatus: reviewStatus,
          reason: reason || `Review status updated to ${reviewStatus}`,
          reviewedAt: reviewStatus === 'review_completed' ? userAnswer.reviewedAt : null,
          updatedAt: new Date(),
          answer: updatedAnswer
        }
      });

    } catch (error) {
      console.error('Error updating review status:', error);
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

// PUT: Update evaluation status and evaluation data
router.put('/answers/:answerId/evaluation',
  validateAnswerId,
  validateEvaluationStatusUpdate,
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
      const { evaluationStatus, evaluation, reason } = req.body;

      const userAnswer = await UserAnswer.findById(answerId);
      if (!userAnswer) {
        return res.status(404).json({
          success: false,
          message: "User answer not found",
          error: {
            code: "ANSWER_NOT_FOUND",
            details: "The specified answer does not exist"
          }
        });
      }

      // Update evaluation data if provided
      if (evaluation) {
        if (!userAnswer.evaluation) {
          userAnswer.evaluation = {};
        }
        
        if (evaluation.accuracy !== undefined) userAnswer.evaluation.accuracy = evaluation.accuracy;
        if (evaluation.marks !== undefined) userAnswer.evaluation.marks = evaluation.marks;
        if (evaluation.strengths) userAnswer.evaluation.strengths = evaluation.strengths;
        if (evaluation.weaknesses) userAnswer.evaluation.weaknesses = evaluation.weaknesses;
        if (evaluation.suggestions) userAnswer.evaluation.suggestions = evaluation.suggestions;
        if (evaluation.feedback) userAnswer.evaluation.feedback = evaluation.feedback;
      }

      // Update evaluation status and timestamp
      if (evaluationStatus === 'manual_evaluated' || evaluationStatus === 'evaluated') {
        userAnswer.evaluatedAt = new Date();
      }

      await userAnswer.updateStatus('evaluation', evaluationStatus, reason || `Evaluation status updated to ${evaluationStatus}`);

      // Auto-progress for manual evaluation completion
      if (evaluationStatus === 'manual_evaluated' && userAnswer.evaluationMode === 'manual') {
        // After manual evaluation, auto-publish if evaluation is successful
        await userAnswer.updateStatus('main', 'published', 'Auto-published after successful manual evaluation');
        await userAnswer.updateStatus('review', 'review_completed', 'Auto-completed review after manual evaluation');
      }

      // Save the updated evaluation data
      await userAnswer.save();

      // Get updated answer with populated data
      const updatedAnswer = await UserAnswer.findById(answerId)
        .populate('userId', 'mobile clientId')
        .populate('questionId', 'question metadata')
        .lean();

      res.status(200).json({
        success: true,
        message: `Evaluation updated successfully`,
        data: {
          answerId: updatedAnswer._id,
          previousEvaluationStatus: userAnswer.statusHistory[userAnswer.statusHistory.length - 1]?.previousStatus,
          currentEvaluationStatus: evaluationStatus,
          reason: reason || `Evaluation status updated to ${evaluationStatus}`,
          evaluatedAt: userAnswer.evaluatedAt,
          evaluation: userAnswer.evaluation,
          updatedAt: new Date(),
          answer: updatedAnswer
        }
      });

    } catch (error) {
      console.error('Error updating evaluation:', error);
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

// PUT: Update popularity status (popular, not_popular)
router.put('/answers/:answerId/popularity',
  validateAnswerId,
  validatePopularityStatusUpdate,
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
      const { popularityStatus, reason } = req.body;

      const userAnswer = await UserAnswer.findById(answerId);
      if (!userAnswer) {
        return res.status(404).json({
          success: false,
          message: "User answer not found",
          error: {
            code: "ANSWER_NOT_FOUND",
            details: "The specified answer does not exist"
          }
        });
      }

      // Update popularity status
      await userAnswer.updateStatus('popularity', popularityStatus, reason || `Popularity status updated to ${popularityStatus}`);

      // Get updated answer with populated data
      const updatedAnswer = await UserAnswer.findById(answerId)
        .populate('userId', 'mobile clientId')
        .populate('questionId', 'question metadata')
        .lean();

      res.status(200).json({
        success: true,
        message: `Popularity status updated to ${popularityStatus} successfully`,
        data: {
          answerId: updatedAnswer._id,
          previousPopularityStatus: userAnswer.statusHistory[userAnswer.statusHistory.length - 1]?.previousStatus,
          currentPopularityStatus: popularityStatus,
          reason: reason || `Popularity status updated to ${popularityStatus}`,
          updatedAt: new Date(),
          answer: updatedAnswer
        }
      });

    } catch (error) {
      console.error('Error updating popularity status:', error);
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

// GET: Get status history for an answer
router.get('/answers/:answerId/status-history',
  validateAnswerId,
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          message: "Invalid answer ID",
          error: {
            code: "INVALID_INPUT",
            details: errors.array()
          }
        });
      }

      const { answerId } = req.params;

      const userAnswer = await UserAnswer.findById(answerId)
        .select('statusHistory')
        .lean();

      if (!userAnswer) {
        return res.status(404).json({
          success: false,
          message: "User answer not found",
          error: {
            code: "ANSWER_NOT_FOUND",
            details: "The specified answer does not exist"
          }
        });
      }

      // Sort status history by date (newest first)
      const sortedHistory = userAnswer.statusHistory.sort((a, b) => new Date(b.changedAt) - new Date(a.changedAt));

      res.status(200).json({
        success: true,
        message: "Status history retrieved successfully",
        data: {
          answerId,
          statusHistory: sortedHistory,
          totalChanges: sortedHistory.length
        }
      });

    } catch (error) {
      console.error('Error fetching status history:', error);
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

// GET: Get statistics for all answers of a question
router.get('/questions/:questionId/statistics',
  validateQuestionId,
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          message: "Invalid question ID",
          error: {
            code: "INVALID_INPUT",
            details: errors.array()
          }
        });
      }

      const { questionId } = req.params;

      // Aggregate statistics
      const stats = await UserAnswer.aggregate([
        { $match: { questionId: new mongoose.Types.ObjectId(questionId) } },
        {
          $group: {
            _id: null,
            totalAnswers: { $sum: 1 },
            statusCounts: {
              $push: {
                status: '$status',
                reviewStatus: '$reviewStatus',
                evaluationStatus: '$evaluationStatus',
                popularityStatus: '$popularityStatus',
                evaluationMode: '$evaluationMode'
              }
            },
            averageAccuracy: { $avg: '$evaluation.accuracy' },
            averageMarks: { $avg: '$evaluation.marks' },
            averageTimeSpent: { $avg: '$metadata.timeSpent' }
          }
        }
      ]);

      if (!stats || stats.length === 0) {
        return res.status(200).json({
          success: true,
          message: "No answers found for this question",
          data: {
            questionId,
            totalAnswers: 0,
            statusBreakdown: {},
            averages: {
              accuracy: 0,
              marks: 0,
              timeSpent: 0
            }
          }
        });
      }

      const data = stats[0];

      // Process status counts
      const statusBreakdown = {
        mainStatus: {},
        reviewStatus: {},
        evaluationStatus: {},
        popularityStatus: {},
        evaluationMode: {}
      };

      data.statusCounts.forEach(item => {
        // Count main status
        statusBreakdown.mainStatus[item.status] = (statusBreakdown.mainStatus[item.status] || 0) + 1;
        
        // Count review status
        statusBreakdown.reviewStatus[item.reviewStatus] = (statusBreakdown.reviewStatus[item.reviewStatus] || 0) + 1;
        
        // Count evaluation status
        statusBreakdown.evaluationStatus[item.evaluationStatus] = (statusBreakdown.evaluationStatus[item.evaluationStatus] || 0) + 1;
        
        // Count popularity status
        statusBreakdown.popularityStatus[item.popularityStatus] = (statusBreakdown.popularityStatus[item.popularityStatus] || 0) + 1;
        
        // Count evaluation mode
        statusBreakdown.evaluationMode[item.evaluationMode] = (statusBreakdown.evaluationMode[item.evaluationMode] || 0) + 1;
      });

      res.status(200).json({
        success: true,
        message: "Statistics retrieved successfully",
        data: {
          questionId,
          totalAnswers: data.totalAnswers,
          statusBreakdown,
          averages: {
            accuracy: Math.round(data.averageAccuracy || 0),
            marks: Math.round(data.averageMarks || 0),
            timeSpent: Math.round(data.averageTimeSpent || 0)
          }
        }
      });

    } catch (error) {
      console.error('Error fetching statistics:', error);
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

// POST: Bulk status update for multiple answers
router.post('/answers/bulk-status-update',
  [
    body('answerIds')
      .isArray({ min: 1 })
      .withMessage('Answer IDs must be a non-empty array'),
    body('answerIds.*')
      .isMongoId()
      .withMessage('Each answer ID must be a valid MongoDB ObjectId'),
    body('statusType')
      .isIn(['main', 'review', 'evaluation', 'popularity'])
      .withMessage('Status type must be one of: main, review, evaluation, popularity'),
    body('status')
      .isString()
      .withMessage('Status is required'),
    body('reason')
      .optional()
      .isString()
      .trim()
      .isLength({ max: 500 })
      .withMessage('Reason must be a string with maximum 500 characters')
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

      // Validate status based on statusType
      const validStatuses = {
        main: ['pending', 'rejected', 'published', 'not_published'],
        review: ['review_pending', 'review_accepted', 'review_completed'],
        evaluation: ['evaluated', 'not_evaluated', 'auto_evaluated', 'manual_evaluated', 'evaluation_failed'],
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

      const updateResults = [];
      const errors_encountered = [];

      // Process each answer
      for (const answerId of answerIds) {
        try {
          const userAnswer = await UserAnswer.findById(answerId);
          if (!userAnswer) {
            errors_encountered.push({
              answerId,
              error: 'Answer not found'
            });
            continue;
          }

          await userAnswer.updateStatus(statusType, status, reason || `Bulk update: ${statusType} status to ${status}`);
          
          updateResults.push({
            answerId,
            success: true,
            previousStatus: userAnswer.statusHistory[userAnswer.statusHistory.length - 2]?.status || 'unknown',
            newStatus: status
          });

        } catch (updateError) {
          errors_encountered.push({
            answerId,
            error: updateError.message
          });
        }
      }

      res.status(200).json({
        success: true,
        message: `Bulk status update completed`,
        data: {
          totalProcessed: answerIds.length,
          successful: updateResults.length,
          failed: errors_encountered.length,
          statusType,
          newStatus: status,
          reason: reason || `Bulk update: ${statusType} status to ${status}`,
          results: updateResults,
          errors: errors_encountered
        }
      });

    } catch (error) {
      console.error('Error in bulk status update:', error);
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
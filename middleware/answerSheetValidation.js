const { body, param, query, validationResult } = require('express-validator');
const mongoose = require('mongoose');

class AnswerSheetValidation {
  validateAnswerSubmission = [
    param('questionId')
      .isMongoId()
      .withMessage('Question ID must be a valid MongoDB ObjectId'),
    body('language')
      .optional()
      .isIn(['english', 'hindi'])
      .withMessage('Language must be english or hindi'),
    body('deviceInfo')
      .optional()
      .isJSON()
      .withMessage('Device info must be valid JSON'),
    body('location')
      .optional()
      .isJSON()
      .withMessage('Location must be valid JSON'),
    this.handleValidationErrors
  ];

  validateMySubmissionsQuery = [
    query('page')
      .optional()
      .isInt({ min: 1 })
      .withMessage('Page must be a positive integer'),
    query('limit')
      .optional()
      .isInt({ min: 1, max: 100 })
      .withMessage('Limit must be between 1 and 100'),
    query('status')
      .optional()
      .isIn(['submitted', 'reviewed', 'flagged', 'rejected'])
      .withMessage('Invalid status'),
    query('questionId')
      .optional()
      .isMongoId()
      .withMessage('Question ID must be a valid MongoDB ObjectId'),
    this.handleValidationErrors
  ];

  validateSubmissionId = [
    param('submissionId')
      .isMongoId()
      .withMessage('Submission ID must be a valid MongoDB ObjectId'),
    this.handleValidationErrors
  ];

  validateAdminSubmissionsQuery = [
    query('page')
      .optional()
      .isInt({ min: 1 })
      .withMessage('Page must be a positive integer'),
    query('limit')
      .optional()
      .isInt({ min: 1, max: 100 })
      .withMessage('Limit must be between 1 and 100'),
    query('status')
      .optional()
      .isIn(['submitted', 'reviewed', 'flagged', 'rejected'])
      .withMessage('Invalid status'),
    query('questionId')
      .optional()
      .isMongoId()
      .withMessage('Question ID must be a valid MongoDB ObjectId'),
    query('userId')
      .optional()
      .isMongoId()
      .withMessage('User ID must be a valid MongoDB ObjectId'),
    query('sortBy')
      .optional()
      .isIn(['createdAt', 'updatedAt', 'status'])
      .withMessage('Invalid sort field'),
    query('sortOrder')
      .optional()
      .isIn(['asc', 'desc'])
      .withMessage('Sort order must be asc or desc'),
    this.handleValidationErrors
  ];

  validateSubmissionReview = [
    param('submissionId')
      .isMongoId()
      .withMessage('Submission ID must be a valid MongoDB ObjectId'),
    body('status')
      .isIn(['submitted', 'reviewed', 'flagged', 'rejected'])
      .withMessage('Invalid status'),
    body('comments')
      .optional()
      .isLength({ max: 1000 })
      .withMessage('Comments cannot exceed 1000 characters'),
    body('rating')
      .optional()
      .isFloat({ min: 0, max: 10 })
      .withMessage('Rating must be between 0 and 10'),
    this.handleValidationErrors
  ];

  validateQuestionSubmissionsQuery = [
    param('questionId')
      .isMongoId()
      .withMessage('Question ID must be a valid MongoDB ObjectId'),
    query('page')
      .optional()
      .isInt({ min: 1 })
      .withMessage('Page must be a positive integer'),
    query('limit')
      .optional()
      .isInt({ min: 1, max: 100 })
      .withMessage('Limit must be between 1 and 100'),
    query('status')
      .optional()
      .isIn(['submitted', 'reviewed', 'flagged', 'rejected'])
      .withMessage('Invalid status'),
    this.handleValidationErrors
  ];

  validateAnalyticsQuery = [
    query('clientId')
      .optional()
      .isLength({ min: 1 })
      .withMessage('Client ID cannot be empty'),
    query('dateFrom')
      .optional()
      .isISO8601()
      .withMessage('Date from must be a valid ISO date'),
    query('dateTo')
      .optional()
      .isISO8601()
      .withMessage('Date to must be a valid ISO date'),
    this.handleValidationErrors
  ];

  validateImageAccess = [
    param('questionId')
      .isMongoId()
      .withMessage('Question ID must be a valid MongoDB ObjectId'),
    param('filename')
      .matches(/^[a-zA-Z0-9_-]+\.(jpg|jpeg|png|gif|webp)$/i)
      .withMessage('Invalid filename format'),
    this.handleValidationErrors
  ];

  handleValidationErrors = (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: "Invalid input data",
        error: {
          code: "VALIDATION_ERROR",
          details: errors.array()
        }
      });
    }
    next();
  };
}

module.exports = new AnswerSheetValidation();
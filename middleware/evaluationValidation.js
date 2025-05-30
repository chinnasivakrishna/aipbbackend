// middleware/evaluationValidation.js
const { body, param, query, validationResult } = require('express-validator');
const mongoose = require('mongoose');

// Validation error handler
const handleValidationErrors = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      message: 'Validation failed',
      error: {
        code: 'VALIDATION_ERROR',
        details: errors.array()
      }
    });
  }
  next();
};

// Validate ObjectId
const validateObjectId = (fieldName, location = 'param') => {
  const validator = location === 'param' ? param(fieldName) : body(fieldName);
  
  return validator
    .notEmpty()
    .withMessage(`${fieldName} is required`)
    .custom(value => {
      if (!mongoose.Types.ObjectId.isValid(value)) {
        throw new Error(`Invalid ${fieldName} format`);
      }
      return true;
    });
};

// Validate save evaluation request
const validateSaveEvaluation = [
  body('submissionId')
    .notEmpty()
    .withMessage('Submission ID is required')
    .custom(value => {
      if (!mongoose.Types.ObjectId.isValid(value)) {
        throw new Error('Invalid submission ID format');
      }
      return true;
    }),
    
  body('questionId')
    .notEmpty()
    .withMessage('Question ID is required')
    .custom(value => {
      if (!mongoose.Types.ObjectId.isValid(value)) {
        throw new Error('Invalid question ID format');
      }
      return true;
    }),
    
  body('userId')
    .notEmpty()
    .withMessage('User ID is required')
    .custom(value => {
      if (!mongoose.Types.ObjectId.isValid(value)) {
        throw new Error('Invalid user ID format');
      }
      return true;
    }),
    
  body('evaluation')
    .notEmpty()
    .withMessage('Evaluation data is required')
    .isObject()
    .withMessage('Evaluation must be an object'),
    
  body('evaluation.geminiAnalysis')
    .notEmpty()
    .withMessage('Gemini analysis is required')
    .isObject()
    .withMessage('Gemini analysis must be an object'),
    
  body('evaluation.geminiAnalysis.accuracy')
    .notEmpty()
    .withMessage('Accuracy is required')
    .isNumeric()
    .withMessage('Accuracy must be a number')
    .custom(value => {
      if (value < 0 || value > 100) {
        throw new Error('Accuracy must be between 0 and 100');
      }
      return true;
    }),
    
  body('evaluation.extractedTexts')
    .optional()
    .isArray()
    .withMessage('Extracted texts must be an array'),
    
  body('evaluation.geminiAnalysis.strengths')
    .optional()
    .isArray()
    .withMessage('Strengths must be an array'),
    
  body('evaluation.geminiAnalysis.weaknesses')
    .optional()
    .isArray()
    .withMessage('Weaknesses must be an array'),
    
  body('evaluation.geminiAnalysis.suggestions')
    .optional()
    .isArray()
    .withMessage('Suggestions must be an array'),
    
  body('evaluation.status')
    .optional()
    .isIn(['published', 'not_published'])
    .withMessage('Status must be either "published" or "not_published"'),
    
  handleValidationErrors
];

// Validate evaluation ID parameter
const validateEvaluationId = [
  validateObjectId('evaluationId'),
  handleValidationErrors
];

// Validate user ID parameter
const validateUserId = [
  validateObjectId('userId'),
  handleValidationErrors
];

// Validate status update request
const validateStatusUpdate = [
  body('status')
    .notEmpty()
    .withMessage('Status is required')
    .isIn(['published', 'not_published'])
    .withMessage('Status must be either "published" or "not_published"'),
    
  handleValidationErrors
];

// Validate query parameters for user evaluations
const validateUserEvaluationsQuery = [
  query('questionId')
    .optional()
    .custom(value => {
      if (value && !mongoose.Types.ObjectId.isValid(value)) {
        throw new Error('Invalid question ID format');
      }
      return true;
    }),
    
  query('status')
    .optional()
    .isIn(['published', 'not_published'])
    .withMessage('Status must be either "published" or "not_published"'),
    
  query('page')
    .optional()
    .isInt({ min: 1 })
    .withMessage('Page must be a positive integer'),
    
  query('limit')
    .optional()
    .isInt({ min: 1, max: 100 })
    .withMessage('Limit must be between 1 and 100'),
    
  handleValidationErrors
];

// NEW: Validate question evaluation query (for getting evaluation by questionId and count)
const validateQuestionEvaluationQuery = [
  param('questionId')
    .notEmpty()
    .withMessage('Question ID is required')
    .custom(value => {
      if (!mongoose.Types.ObjectId.isValid(value)) {
        throw new Error('Invalid question ID format');
      }
      return true;
    }),
    
  query('count')
    .optional()
    .isInt({ min: 1, max: 5 })
    .withMessage('Count must be an integer between 1 and 5')
    .toInt(), // Convert to integer
    
  query('userId')
    .optional()
    .custom(value => {
      if (value && !mongoose.Types.ObjectId.isValid(value)) {
        throw new Error('Invalid user ID format');
      }
      return true;
    }),
    
  handleValidationErrors
];

// Rate limiting validation (optional - for future use)
const validateRateLimit = (req, res, next) => {
  // Implementation depends on your rate limiting strategy
  // For example, using express-rate-limit or custom logic
  
  // Basic example:
  const userId = req.user?.id;
  const key = `evaluation_${userId}_${Date.now()}`;
  
  // You can implement Redis-based rate limiting here
  // For now, just pass through
  next();
};

module.exports = {
  validateSaveEvaluation,
  validateEvaluationId,
  validateUserId,
  validateStatusUpdate,
  validateUserEvaluationsQuery,
  validateQuestionEvaluationQuery, // NEW validation
  validateGetEvaluationsQuery: validateUserEvaluationsQuery, // Alias for compatibility
  validateRateLimit,
  handleValidationErrors
};
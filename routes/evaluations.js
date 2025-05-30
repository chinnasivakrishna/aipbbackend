// routes/evaluations.js
const express = require('express');
const router = express.Router();
const evaluationController = require('../controllers/evaluationController');
const {
  validateSaveEvaluation,
  validateUserId,
  validateEvaluationId,
  validateStatusUpdate,
  validateUserEvaluationsQuery,
  validateQuestionEvaluationQuery  // New validation for questionId and count
} = require('../middleware/evaluationValidation');

// Save Evaluated Answer API
// POST /api/aiswb/submissions/evaluate
router.post('/submissions/evaluate', 
  validateSaveEvaluation, 
  evaluationController.saveEvaluatedAnswer
);

// Get User's Evaluated Answers API
// GET /api/aiswb/submissions/evaluated/:userId
router.get('/submissions/evaluated/:userId', 
  validateUserId,
  validateUserEvaluationsQuery,
  evaluationController.getUserEvaluatedAnswers
);

// Update Evaluation Status API
// PATCH /api/aiswb/submissions/evaluation/:evaluationId/status
router.patch('/submissions/evaluation/:evaluationId/status', 
  validateEvaluationId,
  validateStatusUpdate,
  evaluationController.updateEvaluationStatus
);

// Get Single Evaluation Details API (Original - by evaluationId)
// GET /api/aiswb/submissions/evaluation/:evaluationId
router.get('/submissions/evaluation/:evaluationId', 
  validateEvaluationId,
  evaluationController.getEvaluationDetails
);

// NEW: Get Evaluation Details by Question ID and Count
// GET /api/aiswb/submissions/evaluation/question/:questionId?count=1
router.get('/submissions/evaluation/question/:questionId', 
  validateQuestionEvaluationQuery,
  evaluationController.getEvaluationDetailsByQuestion
);

// Get All Evaluations (Admin) API
// GET /api/aiswb/submissions/evaluations
router.get('/submissions/evaluations', 
  validateUserEvaluationsQuery,
  evaluationController.getAllEvaluations
);

// Client-specific routes (for mobile users)
// These routes will be used with the client middleware

// Get Client User's Evaluated Answers
// GET /api/clients/:clientId/mobile/evaluations/user/:userId
router.get('/user/:userId', 
  validateUserId,
  validateUserEvaluationsQuery,
  evaluationController.getUserEvaluatedAnswers
);

// Get Client Evaluation Details (Original - by evaluationId)
// GET /api/clients/:clientId/mobile/evaluations/:evaluationId
router.get('/:evaluationId', 
  validateEvaluationId,
  evaluationController.getEvaluationDetails
);

// NEW: Get Client Evaluation Details by Question ID and Count
// GET /api/clients/:clientId/mobile/evaluations/question/:questionId?count=1
router.get('/question/:questionId', 
  validateQuestionEvaluationQuery,
  evaluationController.getEvaluationDetailsByQuestion
);

// Save Evaluation for Client User
// POST /api/clients/:clientId/mobile/evaluations/evaluate
router.post('/evaluate', 
  validateSaveEvaluation,
  evaluationController.saveEvaluatedAnswer
);

// Update Evaluation Status for Client
// PATCH /api/clients/:clientId/mobile/evaluations/:evaluationId/status
router.patch('/:evaluationId/status', 
  validateEvaluationId,
  validateStatusUpdate,
  evaluationController.updateEvaluationStatus
);

module.exports = router;
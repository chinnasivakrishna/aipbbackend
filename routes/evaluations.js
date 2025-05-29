// routes/evaluations.js
const express = require('express');
const router = express.Router();
const evaluationController = require('../controllers/evaluationController');
const {
  validateSaveEvaluation,
  validateUserId,
  validateEvaluationId,
  validateStatusUpdate,
  validateUserEvaluationsQuery  // Fixed: was validateGetEvaluationsQuery
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
  validateUserEvaluationsQuery,  // Fixed: was validateGetEvaluationsQuery
  evaluationController.getUserEvaluatedAnswers
);

// Update Evaluation Status API
// PATCH /api/aiswb/submissions/evaluation/:evaluationId/status
router.patch('/submissions/evaluation/:evaluationId/status', 
  validateEvaluationId,
  validateStatusUpdate,
  evaluationController.updateEvaluationStatus
);

// Get Single Evaluation Details API
// GET /api/aiswb/submissions/evaluation/:evaluationId
router.get('/submissions/evaluation/:evaluationId', 
  validateEvaluationId,
  evaluationController.getEvaluationDetails
);

// Get All Evaluations (Admin) API
// GET /api/aiswb/submissions/evaluations
router.get('/submissions/evaluations', 
  validateUserEvaluationsQuery,  // Fixed: was validateGetEvaluationsQuery
  evaluationController.getAllEvaluations
);

// Client-specific routes (for mobile users)
// These routes will be used with the client middleware

// Get Client User's Evaluated Answers
// GET /api/clients/:clientId/mobile/evaluations/user/:userId
router.get('/user/:userId', 
  validateUserId,
  validateUserEvaluationsQuery,  // Fixed: was validateGetEvaluationsQuery
  evaluationController.getUserEvaluatedAnswers
);

// Get Client Evaluation Details
// GET /api/clients/:clientId/mobile/evaluations/:evaluationId
router.get('/:evaluationId', 
  validateEvaluationId,
  evaluationController.getEvaluationDetails
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
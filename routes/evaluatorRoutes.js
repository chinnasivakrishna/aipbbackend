const express = require('express');
const router = express.Router();
const {
  getAllEvaluators,
  getEvaluator,
  createEvaluator,
  updateEvaluator,
  deleteEvaluator,
  verifyEvaluator,
  suspendEvaluator,
  reactivateEvaluator,
  toggleEvaluatorStatus
} = require('../controllers/evaluatorController');
const { protect, authorize } = require('../middleware/auth');

// Protect all routes
router.use(protect);

// Routes accessible by admin only
router.route('/')
  .get(authorize('admin'), getAllEvaluators)
  .post(authorize('admin'), createEvaluator);

router.route('/:id')
  .get(authorize('admin'), getEvaluator)
  .put(authorize('admin'), updateEvaluator)
  .delete(authorize('admin'), deleteEvaluator);

// Status management routes
router.put('/:id/verify', authorize('admin'), verifyEvaluator);
router.put('/:id/suspend', authorize('admin'), suspendEvaluator);
router.put('/:id/reactivate', authorize('admin'), reactivateEvaluator);
router.put('/:id/toggle-status', authorize('admin'), toggleEvaluatorStatus);

module.exports = router; 
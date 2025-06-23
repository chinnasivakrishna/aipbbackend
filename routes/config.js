const express = require('express');
const router = express.Router();
const configController = require('../controllers/configController');
const auth = require('../middleware/auth');

// router.use(auth.verifyAdminToken)
// Add a new model to a sourcetype
router.post('/model', configController.addModel);

// Get all configs or by sourcetype (use ?sourcetype=LLM)
router.get('/', configController.getConfigs);

// Update a model by key within a sourcetype
router.put('/model/:sourcetype/:key', configController.updateModel);

// Delete a model by key within a sourcetype
router.delete('/model/:sourcetype/:key', configController.deleteModel);

module.exports = router; 
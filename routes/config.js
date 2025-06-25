const express = require('express');
const router = express.Router();
const configController = require('../controllers/configController');
const auth = require('../middleware/auth');


// Get all configs or by sourcetype (use ?sourcetype=LLM)
router.get('/clients/:id', configController.getConfigs);

// Check if config is expired
router.get('/clients/:id/config/:sourcetype/expire', configController.checkIsExpired);
// Set config expired flag
router.put('/clients/:id/config/:sourcetype/expire', configController.setIsExpired);

router.use(auth.verifyAdminToken)

// Add a new model to a sourcetype
router.post('/clients/:id/model', configController.addModel);

// Update a model by key within a sourcetype
router.put('/clients/:id/model/:sourcetype/:key', configController.updateModel);

// Delete a model by key within a sourcetype
router.delete('/clients/:id/model/:sourcetype/:key', configController.deleteModel);



module.exports = router; 
// routes/datastore.js
const express = require('express');
const router = express.Router();
const { verifyToken } = require('../middleware/auth');
const {
  getDatastoreItems,
  createDatastoreItem,
  getDatastoreItem,
  updateDatastoreItem,
  deleteDatastoreItem
} = require('../controllers/datastoreController');

// Protect all routes
router.use(verifyToken);

// Routes for /api/datastore
router.route('/')
  .get(getDatastoreItems)
  .post(createDatastoreItem);

// Routes for /api/datastore/:id
router.route('/:id')
  .get(getDatastoreItem)
  .put(updateDatastoreItem)
  .delete(deleteDatastoreItem);

module.exports = router;
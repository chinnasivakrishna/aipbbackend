const express = require('express');
const router = express.Router();
const { verifyToken } = require('../middleware/auth');
const datastoreController = require('../controllers/datastoreControllers');
router.route('/')
  .get(verifyToken, datastoreController.getDatastoreItems)
  .post(verifyToken, datastoreController.createDatastoreItem);
router.route('/:id')
  .get(verifyToken, datastoreController.getDatastoreItem)
  .put(verifyToken, datastoreController.updateDatastoreItem)
  .delete(verifyToken, datastoreController.deleteDatastoreItem);
router.get('/book/:bookId', verifyToken, datastoreController.getBookDatastoreItems);
router.get('/chapter/:chapterId', verifyToken, datastoreController.getChapterDatastoreItems);
router.get('/topic/:topicId', verifyToken, datastoreController.getTopicDatastoreItems);
router.put('/:id/assign', verifyToken, datastoreController.assignDatastoreItem);
module.exports = router;
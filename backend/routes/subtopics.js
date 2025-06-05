// routes/subtopics.js
const express = require('express');
const router = express.Router({ mergeParams: true });
const { verifyToken } = require('../middleware/auth');
const { 
  getSubTopics, 
  getSubTopic, 
  createSubTopic, 
  updateSubTopic, 
  deleteSubTopic 
} = require('../controllers/subtopicController');

// All routes in this file already include:
// /api/books/:bookId/chapters/:chapterId/topics/:topicId/...

// Get all subtopics for a topic & create new subtopic
router.route('/')
  .get(verifyToken, getSubTopics)
  .post(verifyToken, createSubTopic);

// Get, update and delete a specific subtopic
router.route('/:id')
  .get(verifyToken, getSubTopic)
  .put(verifyToken, updateSubTopic)
  .delete(verifyToken, deleteSubTopic);

module.exports = router;
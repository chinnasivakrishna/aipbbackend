// routes/workbooks.js with subtopics integration
const express = require('express');
const router = express.Router();
const { verifyToken } = require('../middleware/auth');
const { 
  getWorkbooks, 
  getWorkbook, 
  createWorkbook, 
  updateWorkbook, 
  deleteWorkbook,
  uploadCoverImage
} = require('../controllers/workbookController');
const { 
  getChapters, 
  getChapter, 
  createChapter, 
  updateChapter, 
  deleteChapter 
} = require('../controllers/workbookChapterController');
const { 
  getTopics, 
  getTopic, 
  createTopic, 
  updateTopic, 
  deleteTopic 
} = require('../controllers/workbookTopicController');
const {
  getSubTopics,
  getSubTopic,
  createSubTopic,
  updateSubTopic,
  deleteSubTopic
} = require('../controllers/workbookSubtopicController');

// Workbook routes
router.route('/')
  .get(verifyToken, getWorkbooks)
  .post(verifyToken, uploadCoverImage, createWorkbook);

router.route('/:workbookId')
  .get(verifyToken, getWorkbook)
  .put(verifyToken, updateWorkbook)
  .delete(verifyToken, deleteWorkbook);

// Chapter routes within workbooks
router.route('/:workbookId/chapters')
  .get(verifyToken, getChapters)
  .post(verifyToken, createChapter);

router.route('/:workbookId/chapters/:chapterId')
  .get(verifyToken, getChapter)
  .put(verifyToken, updateChapter)
  .delete(verifyToken, deleteChapter);

// Topic routes within chapters
router.route('/:workbookId/chapters/:chapterId/topics')
  .get(verifyToken, getTopics)
  .post(verifyToken, createTopic);

router.route('/:workbookId/chapters/:chapterId/topics/:topicId')
  .get(verifyToken, getTopic)
  .put(verifyToken, updateTopic)
  .delete(verifyToken, deleteTopic);

// Subtopic routes within topics
router.route('/:workbookId/chapters/:chapterId/topics/:topicId/subtopics')
  .get(verifyToken, getSubTopics)
  .post(verifyToken, createSubTopic);

router.route('/:workbookId/chapters/:chapterId/topics/:topicId/subtopics/:subtopicId')
  .get(verifyToken, getSubTopic)
  .put(verifyToken, updateSubTopic)
  .delete(verifyToken, deleteSubTopic);

module.exports = router; 
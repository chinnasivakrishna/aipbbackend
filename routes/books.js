// routes/books.js with trending functionality
const express = require('express');
const router = express.Router();
const { verifyToken } = require('../middleware/auth');
const { 
  getBooks, 
  getBook, 
  createBook, 
  updateBook, 
  deleteBook,
  uploadCoverImage,
  // Highlights functionality
  getHighlightedBooks,
  addBookToHighlights,
  removeBookFromHighlights,
  updateHighlightDetails,
  // NEW: Trending functionality
  getTrendingBooks,
  addBookToTrending,
  removeBookFromTrending,
  updateTrendingDetails
} = require('../controllers/bookController');
const { 
  getChapters, 
  getChapter, 
  createChapter, 
  updateChapter, 
  deleteChapter 
} = require('../controllers/chapterController');
const { 
  getTopics, 
  getTopic, 
  createTopic, 
  updateTopic, 
  deleteTopic 
} = require('../controllers/topicController');
const {
  getSubTopics,
  getSubTopic,
  createSubTopic,
  updateSubTopic,
  deleteSubTopic
} = require('../controllers/subtopicController');

// Book routes
router.route('/')
  .get(verifyToken, getBooks)
  .post(verifyToken, uploadCoverImage, createBook);

router.route('/:id')
  .get(verifyToken, getBook)
  .put(verifyToken, uploadCoverImage, updateBook)
  .delete(verifyToken, deleteBook);

// Highlights routes
router.route('/highlights')
  .get(verifyToken, getHighlightedBooks);

router.route('/:id/highlights')
  .post(verifyToken, addBookToHighlights)
  .delete(verifyToken, removeBookFromHighlights)
  .put(verifyToken, updateHighlightDetails);

// NEW: Trending routes
router.route('/trending')
  .get(verifyToken, getTrendingBooks);

router.route('/:id/trending')
  .post(verifyToken, addBookToTrending)
  .delete(verifyToken, removeBookFromTrending)
  .put(verifyToken, updateTrendingDetails);

// Chapter routes
router.route('/:bookId/chapters')
  .get(verifyToken, getChapters)
  .post(verifyToken, createChapter);

router.route('/:bookId/chapters/:id')
  .get(verifyToken, getChapter)
  .put(verifyToken, updateChapter)
  .delete(verifyToken, deleteChapter);

// Topic routes
router.route('/:bookId/chapters/:chapterId/topics')
  .get(verifyToken, getTopics)
  .post(verifyToken, createTopic);

router.route('/:bookId/chapters/:chapterId/topics/:id')
  .get(verifyToken, getTopic)
  .put(verifyToken, updateTopic)
  .delete(verifyToken, deleteTopic);

// Subtopic routes
router.route('/:bookId/chapters/:chapterId/topics/:topicId/subtopics')
  .get(verifyToken, getSubTopics)
  .post(verifyToken, createSubTopic);

router.route('/:bookId/chapters/:chapterId/topics/:topicId/subtopics/:id')
  .get(verifyToken, getSubTopic)
  .put(verifyToken, updateSubTopic)
  .delete(verifyToken, deleteSubTopic);

module.exports = router;
const express = require('express');
const router = express.Router({ mergeParams: true });
const Video = require('../models/Video');
const Book = require('../models/Book');
const Chapter = require('../models/Chapter');
const Topic = require('../models/Topic');
const SubTopic = require('../models/SubTopic');

// @desc    Add video to book
// @route   POST /api/books/:bookId/videos
// @access  Private
router.post('/',  async (req, res) => {
  try {
    const book = await Book.findById(req.params.bookId);
    if (!book) {
      return res.status(404).json({ success: false, message: 'Book not found' });
    }

    const video = await Video.create({
      title: req.body.title,
      url: req.body.url,
      description: req.body.description,
      book: req.params.bookId,
      user: req.user.id
    });

    res.status(201).json({ success: true, data: video });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'Server Error' });
  }
});

// @desc    Add video to book chapter
// @route   POST /api/books/:bookId/chapters/:chapterId/videos
// @access  Private
router.post('/chapters/:chapterId/videos',  async (req, res) => {
  try {
    const chapter = await Chapter.findOne({
      _id: req.params.chapterId,
      book: req.params.bookId
    });
    if (!chapter) {
      return res.status(404).json({ success: false, message: 'Chapter not found' });
    }

    const video = await Video.create({
      title: req.body.title,
      url: req.body.url,
      description: req.body.description,
      book: req.params.bookId,
      chapter: req.params.chapterId,
      user: req.user.id
    });

    res.status(201).json({ success: true, data: video });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'Server Error' });
  }
});

// @desc    Add video to book chapter topic
// @route   POST /api/books/:bookId/chapters/:chapterId/topics/:topicId/videos
// @access  Private
router.post('/chapters/:chapterId/topics/:topicId/videos',  async (req, res) => {
  try {
    const topic = await Topic.findOne({
      _id: req.params.topicId,
      chapter: req.params.chapterId
    });
    if (!topic) {
      return res.status(404).json({ success: false, message: 'Topic not found' });
    }

    const video = await Video.create({
      title: req.body.title,
      url: req.body.url,
      description: req.body.description,
      book: req.params.bookId,
      chapter: req.params.chapterId,
      topic: req.params.topicId,
      user: req.user.id
    });

    res.status(201).json({ success: true, data: video });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'Server Error' });
  }
});

// @desc    Add video to book chapter topic subtopic
// @route   POST /api/books/:bookId/chapters/:chapterId/topics/:topicId/subtopics/:subtopicId/videos
// @access  Private
router.post('/chapters/:chapterId/topics/:topicId/subtopics/:subtopicId/videos',  async (req, res) => {
  try {
    const subtopic = await SubTopic.findOne({
      _id: req.params.subtopicId,
      topic: req.params.topicId
    });
    if (!subtopic) {
      return res.status(404).json({ success: false, message: 'Subtopic not found' });
    }

    const video = await Video.create({
      title: req.body.title,
      url: req.body.url,
      description: req.body.description,
      book: req.params.bookId,
      chapter: req.params.chapterId,
      topic: req.params.topicId,
      subtopic: req.params.subtopicId,
      user: req.user.id
    });

    res.status(201).json({ success: true, data: video });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'Server Error' });
  }
});

// @desc    Get all videos for a book
// @route   GET /api/books/:bookId/videos
// @access  Public
router.get('/', async (req, res) => {
  try {
    const videos = await Video.find({ book: req.params.bookId })
      .sort({ createdAt: -1 })
      .populate('user', 'name');

    res.status(200).json({ success: true, count: videos.length, data: videos });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'Server Error' });
  }
});

module.exports = router;
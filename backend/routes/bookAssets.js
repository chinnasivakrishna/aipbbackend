// routes/bookAssets.js
const express = require('express');
const router = express.Router();
const { check, validationResult } = require('express-validator');
const auth = require('../middleware/auth');
const Asset = require('../models/Asset');
const Book = require('../models/Book');

// @route   GET api/books/:bookId/assets
// @desc    Get all assets for a book
// @access  Private
router.get('/:bookId/assets', auth, async (req, res) => {
  try {
    // Check if book exists
    const book = await Book.findById(req.params.bookId);
    if (!book) {
      return res.status(404).json({ msg: 'Book not found' });
    }

    // Find or create asset document
    let asset = await Asset.findOne({ book: req.params.bookId, assetType: 'book' });
    
    if (!asset) {
      // Create new asset document if not found
      asset = new Asset({
        book: req.params.bookId,
        assetType: 'book'
      });
      await asset.save();
    }

    res.json(asset);
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server Error');
  }
});

// @route   POST api/books/:bookId/assets/summaries
// @desc    Add a summary to book assets
// @access  Private
const validateSummary = [
  auth,
  check('content', 'Content is required').not().isEmpty()
];

router.post('/:bookId/assets/summaries', validateSummary, async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  try {
    // Check if book exists
    const book = await Book.findById(req.params.bookId);
    if (!book) {
      return res.status(404).json({ msg: 'Book not found' });
    }

    // Find or create asset document
    let asset = await Asset.findOne({ book: req.params.bookId, assetType: 'book' });
    
    if (!asset) {
      asset = new Asset({
        book: req.params.bookId,
        assetType: 'book'
      });
    }

    // Add new summary
    asset.summaries.unshift({
      content: req.body.content
    });

    await asset.save();
    res.json(asset.summaries[0]);
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server Error');
  }
});

// @route   POST api/books/:bookId/assets/objective-questions
// @desc    Add objective questions to book assets
// @access  Private
const validateObjectiveQuestion = [
  auth,
  check('question', 'Question is required').not().isEmpty(),
  check('options', 'Options array is required').isArray({ min: 2 }),
  check('correctAnswer', 'Correct answer index is required').isInt({ min: 0 })
];

router.post('/:bookId/assets/objective-questions', validateObjectiveQuestion, async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  try {
    // Check if book exists
    const book = await Book.findById(req.params.bookId);
    if (!book) {
      return res.status(404).json({ msg: 'Book not found' });
    }

    // Find or create asset document
    let asset = await Asset.findOne({ book: req.params.bookId, assetType: 'book' });
    
    if (!asset) {
      asset = new Asset({
        book: req.params.bookId,
        assetType: 'book'
      });
    }

    // Add new objective question
    asset.objectiveQuestions.unshift({
      question: req.body.question,
      options: req.body.options,
      correctAnswer: req.body.correctAnswer,
      difficulty: req.body.difficulty || 'medium'
    });

    await asset.save();
    res.json(asset.objectiveQuestions[0]);
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server Error');
  }
});

// @route   POST api/books/:bookId/assets/subjective-questions
// @desc    Add subjective questions to book assets
// @access  Private
const validateSubjectiveQuestion = [
  auth,
  check('question', 'Question is required').not().isEmpty()
];

router.post('/:bookId/assets/subjective-questions', validateSubjectiveQuestion, async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  try {
    // Check if book exists
    const book = await Book.findById(req.params.bookId);
    if (!book) {
      return res.status(404).json({ msg: 'Book not found' });
    }

    // Find or create asset document
    let asset = await Asset.findOne({ book: req.params.bookId, assetType: 'book' });
    
    if (!asset) {
      asset = new Asset({
        book: req.params.bookId,
        assetType: 'book'
      });
    }

    // Add new subjective question
    asset.subjectiveQuestions.unshift({
      question: req.body.question,
      answer: req.body.answer || '',
      keywords: req.body.keywords || '',
      difficulty: req.body.difficulty || 'L1'
    });

    await asset.save();
    res.json(asset.subjectiveQuestions[0]);
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server Error');
  }
});

// @route   POST api/books/:bookId/assets/videos
// @desc    Add videos to book assets
// @access  Private
const validateVideo = [
  auth,
  check('title', 'Title is required').not().isEmpty(),
  check('url', 'URL is required').not().isEmpty()
];

router.post('/:bookId/assets/videos', validateVideo, async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  try {
    // Check if book exists
    const book = await Book.findById(req.params.bookId);
    if (!book) {
      return res.status(404).json({ msg: 'Book not found' });
    }

    // Find or create asset document
    let asset = await Asset.findOne({ book: req.params.bookId, assetType: 'book' });
    
    if (!asset) {
      asset = new Asset({
        book: req.params.bookId,
        assetType: 'book'
      });
    }

    // Add new video
    asset.videos.unshift({
      title: req.body.title,
      url: req.body.url,
      description: req.body.description || ''
    });

    await asset.save();
    res.json(asset.videos[0]);
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server Error');
  }
});

// @route   POST api/books/:bookId/assets/pyqs
// @desc    Add PYQs to book assets
// @access  Private
const validatePYQ = [
  auth,
  check('year', 'Year is required').not().isEmpty(),
  check('question', 'Question is required').not().isEmpty()
];

router.post('/:bookId/assets/pyqs', validatePYQ, async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  try {
    // Check if book exists
    const book = await Book.findById(req.params.bookId);
    if (!book) {
      return res.status(404).json({ msg: 'Book not found' });
    }

    // Find or create asset document
    let asset = await Asset.findOne({ book: req.params.bookId, assetType: 'book' });
    
    if (!asset) {
      asset = new Asset({
        book: req.params.bookId,
        assetType: 'book'
      });
    }

    // Add new PYQ
    asset.pyqs.unshift({
      year: req.body.year,
      question: req.body.question,
      answer: req.body.answer || '',
      difficulty: req.body.difficulty || 'medium',
      source: req.body.source || ''
    });

    await asset.save();
    res.json(asset.pyqs[0]);
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server Error');
  }
});

// @route   DELETE api/books/:bookId/assets/summaries/:summaryId
// @desc    Delete a summary from book assets
// @access  Private
router.delete('/:bookId/assets/summaries/:summaryId', auth, async (req, res) => {
  try {
    // Check if book exists
    const book = await Book.findById(req.params.bookId);
    if (!book) {
      return res.status(404).json({ msg: 'Book not found' });
    }

    // Find asset document
    const asset = await Asset.findOne({ book: req.params.bookId, assetType: 'book' });
    if (!asset) {
      return res.status(404).json({ msg: 'Asset document not found' });
    }

    // Find the summary index
    const summaryIndex = asset.summaries.findIndex(
      summary => summary._id.toString() === req.params.summaryId
    );

    if (summaryIndex === -1) {
      return res.status(404).json({ msg: 'Summary not found' });
    }

    // Remove the summary
    asset.summaries.splice(summaryIndex, 1);
    await asset.save();

    res.json({ msg: 'Summary removed' });
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server Error');
  }
});

// @route   DELETE api/books/:bookId/assets/objective-questions/:questionId
// @desc    Delete an objective question from book assets
// @access  Private
router.delete('/:bookId/assets/objective-questions/:questionId', auth, async (req, res) => {
  try {
    // Check if book exists
    const book = await Book.findById(req.params.bookId);
    if (!book) {
      return res.status(404).json({ msg: 'Book not found' });
    }

    // Find asset document
    const asset = await Asset.findOne({ book: req.params.bookId, assetType: 'book' });
    if (!asset) {
      return res.status(404).json({ msg: 'Asset document not found' });
    }

    // Find the question index
    const questionIndex = asset.objectiveQuestions.findIndex(
      question => question._id.toString() === req.params.questionId
    );

    if (questionIndex === -1) {
      return res.status(404).json({ msg: 'Question not found' });
    }

    // Remove the question
    asset.objectiveQuestions.splice(questionIndex, 1);
    await asset.save();

    res.json({ msg: 'Question removed' });
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server Error');
  }
});

// @route   DELETE api/books/:bookId/assets/subjective-questions/:questionId
// @desc    Delete a subjective question from book assets
// @access  Private
router.delete('/:bookId/assets/subjective-questions/:questionId', auth, async (req, res) => {
  try {
    // Check if book exists
    const book = await Book.findById(req.params.bookId);
    if (!book) {
      return res.status(404).json({ msg: 'Book not found' });
    }

    // Find asset document
    const asset = await Asset.findOne({ book: req.params.bookId, assetType: 'book' });
    if (!asset) {
      return res.status(404).json({ msg: 'Asset document not found' });
    }

    // Find the question index
    const questionIndex = asset.subjectiveQuestions.findIndex(
      question => question._id.toString() === req.params.questionId
    );

    if (questionIndex === -1) {
      return res.status(404).json({ msg: 'Question not found' });
    }

    // Remove the question
    asset.subjectiveQuestions.splice(questionIndex, 1);
    await asset.save();

    res.json({ msg: 'Question removed' });
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server Error');
  }
});

// @route   DELETE api/books/:bookId/assets/videos/:videoId
// @desc    Delete a video from book assets
// @access  Private
router.delete('/:bookId/assets/videos/:videoId', auth, async (req, res) => {
  try {
    // Check if book exists
    const book = await Book.findById(req.params.bookId);
    if (!book) {
      return res.status(404).json({ msg: 'Book not found' });
    }

    // Find asset document
    const asset = await Asset.findOne({ book: req.params.bookId, assetType: 'book' });
    if (!asset) {
      return res.status(404).json({ msg: 'Asset document not found' });
    }

    // Find the video index
    const videoIndex = asset.videos.findIndex(
      video => video._id.toString() === req.params.videoId
    );

    if (videoIndex === -1) {
      return res.status(404).json({ msg: 'Video not found' });
    }

    // Remove the video
    asset.videos.splice(videoIndex, 1);
    await asset.save();

    res.json({ msg: 'Video removed' });
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server Error');
  }
});

// @route   DELETE api/books/:bookId/assets/pyqs/:pyqId
// @desc    Delete a PYQ from book assets
// @access  Private
router.delete('/:bookId/assets/pyqs/:pyqId', auth, async (req, res) => {
  try {
    // Check if book exists
    const book = await Book.findById(req.params.bookId);
    if (!book) {
      return res.status(404).json({ msg: 'Book not found' });
    }

    // Find asset document
    const asset = await Asset.findOne({ book: req.params.bookId, assetType: 'book' });
    if (!asset) {
      return res.status(404).json({ msg: 'Asset document not found' });
    }

    // Find the PYQ index
    const pyqIndex = asset.pyqs.findIndex(
      pyq => pyq._id.toString() === req.params.pyqId
    );

    if (pyqIndex === -1) {
      return res.status(404).json({ msg: 'PYQ not found' });
    }

    // Remove the PYQ
    asset.pyqs.splice(pyqIndex, 1);
    await asset.save();

    res.json({ msg: 'PYQ removed' });
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server Error');
  }
});

module.exports = router;
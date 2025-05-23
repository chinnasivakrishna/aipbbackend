// controllers/assets.js
const Summary = require('../models/Summary');
const Question = require('../models/Question');
const QuestionSet = require('../models/QuestionSet');
const Video = require('../models/Video');
const PYQ = require('../models/PYQ');

// Helper function to build query based on hierarchy
const buildQuery = (params, userId) => {
  const { bookId, chapterId, topicId, subtopicId } = params;
  let query = { user: userId };
  
  if (subtopicId) {
    query.subtopic = subtopicId;
  } else if (topicId) {
    query.topic = topicId;
  } else if (chapterId) {
    query.chapter = chapterId;
  } else if (bookId) {
    query.book = bookId;
  }
  
  return query;
};

// @desc    Get summaries
// @route   GET /api/books/:bookId/chapters/:chapterId/topics/:topicId/subtopics/:subtopicId/summaries
// @access  Private
exports.getSummaries = async (req, res, next) => {
  try {
    const query = buildQuery(req.params, req.user.id);
    const summaries = await Summary.find(query).sort({ createdAt: -1 });
    
    res.status(200).json({
      success: true,
      count: summaries.length,
      data: summaries
    });
  } catch (err) {
    next(err);
  }
};

// @desc    Create summary
// @route   POST /api/books/:bookId/chapters/:chapterId/topics/:topicId/subtopics/:subtopicId/summaries
// @access  Private
exports.createSummary = async (req, res, next) => {
  try {
    const { bookId, chapterId, topicId, subtopicId } = req.params;
    const { content } = req.body;
    
    const summary = await Summary.create({
      content,
      book: bookId,
      chapter: chapterId,
      topic: topicId,
      subtopic: subtopicId,
      user: req.user.id
    });
    
    res.status(201).json({
      success: true,
      data: summary
    });
  } catch (err) {
    next(err);
  }
};

// @desc    Get questions
// @route   GET /api/books/:bookId/chapters/:chapterId/topics/:topicId/subtopics/:subtopicId/questions
// @access  Private
exports.getQuestions = async (req, res, next) => {
  try {
    const query = buildQuery(req.params, req.user.id);
    const questions = await Question.find(query).sort({ createdAt: -1 });
    
    res.status(200).json({
      success: true,
      count: questions.length,
      data: questions
    });
  } catch (err) {
    next(err);
  }
};

// @desc    Create question
// @route   POST /api/books/:bookId/chapters/:chapterId/topics/:topicId/subtopics/:subtopicId/questions
// @access  Private
exports.createQuestion = async (req, res, next) => {
  try {
    const { bookId, chapterId, topicId, subtopicId } = req.params;
    const { question, answer, keywords, options, correctAnswer, difficulty, type, questionSet } = req.body;
    
    const newQuestion = await Question.create({
      question,
      answer,
      keywords: keywords ? keywords.split(',').map(k => k.trim()) : [],
      options,
      correctAnswer,
      difficulty: difficulty || 'L1',
      type,
      book: bookId,
      chapter: chapterId,
      topic: topicId,
      subtopic: subtopicId,
      user: req.user.id,
      questionSet
    });
    
    res.status(201).json({
      success: true,
      data: newQuestion
    });
  } catch (err) {
    next(err);
  }
};

// @desc    Get question sets
// @route   GET /api/books/:bookId/chapters/:chapterId/topics/:topicId/subtopics/:subtopicId/question-sets
// @access  Private
exports.getQuestionSets = async (req, res, next) => {
  try {
    const query = buildQuery(req.params, req.user.id);
    const questionSets = await QuestionSet.find(query).sort({ createdAt: -1 });
    
    res.status(200).json({
      success: true,
      count: questionSets.length,
      data: questionSets
    });
  } catch (err) {
    next(err);
  }
};

// @desc    Create question set
// @route   POST /api/books/:bookId/chapters/:chapterId/topics/:topicId/subtopics/:subtopicId/question-sets
// @access  Private
exports.createQuestionSet = async (req, res, next) => {
  try {
    const { bookId, chapterId, topicId, subtopicId } = req.params;
    const { name, description, level } = req.body;
    
    const questionSet = await QuestionSet.create({
      name,
      description,
      level: level || 'L1',
      book: bookId,
      chapter: chapterId,
      topic: topicId,
      subtopic: subtopicId,
      user: req.user.id
    });
    
    res.status(201).json({
      success: true,
      data: questionSet
    });
  } catch (err) {
    next(err);
  }
};

// @desc    Get videos
// @route   GET /api/books/:bookId/chapters/:chapterId/topics/:topicId/subtopics/:subtopicId/videos
// @access  Private
exports.getVideos = async (req, res, next) => {
  try {
    const query = buildQuery(req.params, req.user.id);
    const videos = await Video.find(query).sort({ createdAt: -1 });
    
    res.status(200).json({
      success: true,
      count: videos.length,
      data: videos
    });
  } catch (err) {
    next(err);
  }
};

// @desc    Create video
// @route   POST /api/books/:bookId/chapters/:chapterId/topics/:topicId/subtopics/:subtopicId/videos
// @access  Private
exports.createVideo = async (req, res, next) => {
  try {
    const { bookId, chapterId, topicId, subtopicId } = req.params;
    const { title, url, description } = req.body;
    
    const video = await Video.create({
      title,
      url,
      description,
      book: bookId,
      chapter: chapterId,
      topic: topicId,
      subtopic: subtopicId,
      user: req.user.id
    });
    
    res.status(201).json({
      success: true,
      data: video
    });
  } catch (err) {
    next(err);
  }
};

// @desc    Get PYQs
// @route   GET /api/books/:bookId/chapters/:chapterId/topics/:topicId/subtopics/:subtopicId/pyqs
// @access  Private
exports.getPYQs = async (req, res, next) => {
  try {
    const query = buildQuery(req.params, req.user.id);
    const pyqs = await PYQ.find(query).sort({ createdAt: -1 });
    
    res.status(200).json({
      success: true,
      count: pyqs.length,
      data: pyqs
    });
  } catch (err) {
    next(err);
  }
};

// @desc    Create PYQ
// @route   POST /api/books/:bookId/chapters/:chapterId/topics/:topicId/subtopics/:subtopicId/pyqs
// @access  Private
exports.createPYQ = async (req, res, next) => {
  try {
    const { bookId, chapterId, topicId, subtopicId } = req.params;
    const { year, question, answer, difficulty, source } = req.body;
    
    const pyq = await PYQ.create({
      year,
      question,
      answer,
      difficulty: difficulty || 'medium',
      source,
      book: bookId,
      chapter: chapterId,
      topic: topicId,
      subtopic: subtopicId,
      user: req.user.id
    });
    
    res.status(201).json({
      success: true,
      data: pyq
    });
  } catch (err) {
    next(err);
  }
};
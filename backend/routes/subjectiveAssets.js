const express = require('express');
const router = express.Router();
const {verifyToken} = require('../middleware/auth');
const QuestionSet = require('../models/QuestionSet');
const Question = require('../models/Question');

// Get all question sets for a specific item (book, chapter, topic, subtopic)
router.get('/:itemType/:itemId/question-sets',  verifyToken, async (req, res) => {
  try {
    const { itemType, itemId } = req.params;
    const { isWorkbook } = req.query;

    // Validate item type
    const validItemTypes = ['book', 'chapter', 'topic', 'subtopic'];
    if (!validItemTypes.includes(itemType)) {
      return res.status(400).json({ success: false, message: 'Invalid item type' });
    }

    // Build the query based on item type and workbook status
    let query = {
      [itemType]: itemId,
      type: 'subjective'
    };

    if (isWorkbook === 'true') {
      query.isWorkbook = true;
    } else {
      query.isWorkbook = { $ne: true };
    }

    const questionSets = await QuestionSet.find(query)
      .populate('questions')
      .sort({ createdAt: -1 });

    res.json({
      success: true,
      questionSets: questionSets || []
    });
  } catch (error) {
    console.error('Error fetching question sets:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch question sets' });
  }
});

// Create a new question set
router.post('/:itemType/:itemId/question-sets',  verifyToken, async (req, res) => {
  try {
    const { itemType, itemId } = req.params;
    const { name, description, level, isWorkbook } = req.body;

    // Validate required fields
    if (!name || !level) {
      return res.status(400).json({ success: false, message: 'Name and level are required' });
    }

    // Validate item type
    const validItemTypes = ['book', 'chapter', 'topic', 'subtopic'];
    if (!validItemTypes.includes(itemType)) {
      return res.status(400).json({ success: false, message: 'Invalid item type' });
    }

    // Validate level
    const validLevels = ['L1', 'L2', 'L3'];
    if (!validLevels.includes(level)) {
      return res.status(400).json({ success: false, message: 'Invalid level' });
    }

    // Create question set data
    const questionSetData = {
      name,
      description: description || '',
      level,
      type: 'subjective',
      [itemType]: itemId,
      createdBy: req.user.id,
      createdAt: new Date(),
      questions: []
    };

    if (isWorkbook) {
      questionSetData.isWorkbook = true;
    }

    const questionSet = new QuestionSet(questionSetData);
    await questionSet.save();

    res.status(201).json({
      success: true,
      message: 'Question set created successfully',
      questionSet
    });
  } catch (error) {
    console.error('Error creating question set:', error);
    res.status(500).json({ success: false, message: 'Failed to create question set' });
  }
});

// Get a specific question set with its questions
router.get('/question-sets/:setId',  verifyToken, async (req, res) => {
  try {
    const { setId } = req.params;

    const questionSet = await QuestionSet.findById(setId)
      .populate('questions');

    if (!questionSet) {
      return res.status(404).json({ success: false, message: 'Question set not found' });
    }

    res.json({
      success: true,
      questionSet
    });
  } catch (error) {
    console.error('Error fetching question set:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch question set' });
  }
});

// Update a question set
router.put('/question-sets/:setId',  verifyToken, async (req, res) => {
  try {
    const { setId } = req.params;
    const { name, description, level } = req.body;

    const questionSet = await QuestionSet.findById(setId);
    if (!questionSet) {
      return res.status(404).json({ success: false, message: 'Question set not found' });
    }

    // Update fields if provided
    if (name) questionSet.name = name;
    if (description !== undefined) questionSet.description = description;
    if (level) questionSet.level = level;

    questionSet.updatedAt = new Date();
    await questionSet.save();

    res.json({
      success: true,
      message: 'Question set updated successfully',
      questionSet
    });
  } catch (error) {
    console.error('Error updating question set:', error);
    res.status(500).json({ success: false, message: 'Failed to update question set' });
  }
});

// Delete a question set
router.delete('/question-sets/:setId',  verifyToken, async (req, res) => {
  try {
    const { setId } = req.params;

    const questionSet = await QuestionSet.findById(setId);
    if (!questionSet) {
      return res.status(404).json({ success: false, message: 'Question set not found' });
    }

    // Delete all questions in the set first
    await Question.deleteMany({ _id: { $in: questionSet.questions } });

    // Delete the question set
    await QuestionSet.findByIdAndDelete(setId);

    res.json({
      success: true,
      message: 'Question set deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting question set:', error);
    res.status(500).json({ success: false, message: 'Failed to delete question set' });
  }
});

// Add questions to a question set
router.post('/question-sets/:setId/questions',  verifyToken, async (req, res) => {
  try {
    const { setId } = req.params;
    const { questions } = req.body;

    if (!questions || !Array.isArray(questions) || questions.length === 0) {
      return res.status(400).json({ success: false, message: 'Questions array is required' });
    }

    const questionSet = await QuestionSet.findById(setId);
    if (!questionSet) {
      return res.status(404).json({ success: false, message: 'Question set not found' });
    }

    // Create question documents
    const questionDocs = questions.map(q => ({
      question: q.question,
      answer: q.answer || '',
      keywords: q.keywords || '',
      difficulty: q.difficulty || questionSet.level,
      type: 'subjective',
      questionSet: setId,
      createdBy: req.user.id,
      createdAt: new Date()
    }));

    const createdQuestions = await Question.insertMany(questionDocs);

    // Add question IDs to the question set
    questionSet.questions.push(...createdQuestions.map(q => q._id));
    questionSet.updatedAt = new Date();
    await questionSet.save();

    res.status(201).json({
      success: true,
      message: `${createdQuestions.length} question(s) added successfully`,
      questions: createdQuestions
    });
  } catch (error) {
    console.error('Error adding questions:', error);
    res.status(500).json({ success: false, message: 'Failed to add questions' });
  }
});

// Get a specific question
router.get('/questions/:questionId',  verifyToken, async (req, res) => {
  try {
    const { questionId } = req.params;

    const question = await Question.findById(questionId)
      .populate('questionSet', 'name level');

    if (!question) {
      return res.status(404).json({ success: false, message: 'Question not found' });
    }

    res.json({
      success: true,
      question
    });
  } catch (error) {
    console.error('Error fetching question:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch question' });
  }
});

// Update a specific question
router.put('/questions/:questionId',  verifyToken, async (req, res) => {
  try {
    const { questionId } = req.params;
    const { question: questionText, answer, keywords, difficulty } = req.body;

    const question = await Question.findById(questionId);
    if (!question) {
      return res.status(404).json({ success: false, message: 'Question not found' });
    }

    // Update fields if provided
    if (questionText) question.question = questionText;
    if (answer !== undefined) question.answer = answer;
    if (keywords !== undefined) question.keywords = keywords;
    if (difficulty) question.difficulty = difficulty;

    question.updatedAt = new Date();
    await question.save();

    res.json({
      success: true,
      message: 'Question updated successfully',
      question
    });
  } catch (error) {
    console.error('Error updating question:', error);
    res.status(500).json({ success: false, message: 'Failed to update question' });
  }
});

// Delete a specific question
router.delete('/questions/:questionId',  verifyToken, async (req, res) => {
  try {
    const { questionId } = req.params;

    const question = await Question.findById(questionId);
    if (!question) {
      return res.status(404).json({ success: false, message: 'Question not found' });
    }

    // Remove question from question set
    if (question.questionSet) {
      await QuestionSet.findByIdAndUpdate(
        question.questionSet,
        { $pull: { questions: questionId } }
      );
    }

    // Delete the question
    await Question.findByIdAndDelete(questionId);

    res.json({
      success: true,
      message: 'Question deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting question:', error);
    res.status(500).json({ success: false, message: 'Failed to delete question' });
  }
});

module.exports = router;
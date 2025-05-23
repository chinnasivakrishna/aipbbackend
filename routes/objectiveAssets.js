const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const QuestionSet = require('../models/QuestionSet');
const ObjectiveQuestion = require('../models/ObjectiveQuestion');
const Book = require('../models/Book');
const Chapter = require('../models/Chapter');
const Topic = require('../models/Topic');
const Subtopic = require('../models/SubTopic');
const {verifyToken} = require('../middleware/auth');

// Helper function to validate parent item
const validateParentItem = async (itemType, itemId, isWorkbook = false) => {
  let model;
  switch (itemType) {
    case 'book':
      model = Book;
      break;
    case 'chapter':
      model = Chapter;
      break;
    case 'topic':
      model = Topic;
      break;
    case 'subtopic':
      model = Subtopic;
      break;
    default:
      throw new Error('Invalid item type');
  }

  const item = await model.findById(itemId);
  if (!item) {
    throw new Error(`${itemType} not found`);
  }

  return item;
};

// Helper function to get parent hierarchy
const getParentHierarchy = async (itemType, itemId) => {
  const hierarchy = {};
  
  if (itemType === 'subtopic') {
    const subtopic = await Subtopic.findById(itemId).populate('topic');
    if (!subtopic) throw new Error('Subtopic not found');
    
    hierarchy.subtopic = itemId;
    hierarchy.topic = subtopic.topic._id;
    
    const topic = await Topic.findById(subtopic.topic._id).populate('chapter');
    hierarchy.chapter = topic.chapter._id;
    
    const chapter = await Chapter.findById(topic.chapter._id).populate('book');
    hierarchy.book = chapter.book._id;
  } else if (itemType === 'topic') {
    const topic = await Topic.findById(itemId).populate('chapter');
    if (!topic) throw new Error('Topic not found');
    
    hierarchy.topic = itemId;
    hierarchy.chapter = topic.chapter._id;
    
    const chapter = await Chapter.findById(topic.chapter._id).populate('book');
    hierarchy.book = chapter.book._id;
  } else if (itemType === 'chapter') {
    const chapter = await Chapter.findById(itemId).populate('book');
    if (!chapter) throw new Error('Chapter not found');
    
    hierarchy.chapter = itemId;
    hierarchy.book = chapter.book._id;
  } else if (itemType === 'book') {
    hierarchy.book = itemId;
  }
  
  return hierarchy;
};

// Get all question sets for a specific item
router.get('/:itemType/:itemId/question-sets',  verifyToken, async (req, res) => {
  try {
    const { itemType, itemId } = req.params;
    const { isWorkbook = false } = req.query;

    // Validate parent item
    await validateParentItem(itemType, itemId, isWorkbook);

    // Find question sets
    const questionSets = await QuestionSet.findByParent(itemType, itemId, { 
      type: 'objective',
      isWorkbook: isWorkbook === 'true'
    });

    // Populate questions for each set
    const populatedSets = await Promise.all(
      questionSets.map(async (set) => {
        const questions = await ObjectiveQuestion.findByQuestionSet(set._id);
        return {
          ...set.toObject(),
          questions: questions
        };
      })
    );

    res.json({
      success: true,
      questionSets: populatedSets
    });
  } catch (error) {
    console.error('Error fetching objective question sets:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to fetch question sets'
    });
  }
});

// Create a new question set
router.post('/:itemType/:itemId/question-sets',  verifyToken, async (req, res) => {
  try {
    const { itemType, itemId } = req.params;
    const { name, description, level, type = 'objective' } = req.body;
    const { isWorkbook = false } = req.query;

    // Validate required fields
    if (!name || !level) {
      return res.status(400).json({
        success: false,
        message: 'Name and level are required'
      });
    }

    // Validate parent item
    await validateParentItem(itemType, itemId, isWorkbook);

    // Get parent hierarchy
    const hierarchy = await getParentHierarchy(itemType, itemId);

    // Create question set
    const questionSet = new QuestionSet({
      name,
      description: description || '',
      level,
      type,
      ...hierarchy,
      isWorkbook: isWorkbook === 'true',
      createdBy: req.user.id
    });

    await questionSet.save();

    res.status(201).json({
      success: true,
      questionSet: questionSet
    });
  } catch (error) {
    console.error('Error creating objective question set:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to create question set'
    });
  }
});

// Get a specific question set with its questions
router.get('/question-sets/:setId',  verifyToken, async (req, res) => {
  try {
    const { setId } = req.params;

    const questionSet = await QuestionSet.findById(setId);
    if (!questionSet) {
      return res.status(404).json({
        success: false,
        message: 'Question set not found'
      });
    }

    const questions = await ObjectiveQuestion.findByQuestionSet(setId);

    res.json({
      success: true,
      questionSet: {
        ...questionSet.toObject(),
        questions: questions
      }
    });
  } catch (error) {
    console.error('Error fetching question set:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to fetch question set'
    });
  }
});

// Add questions to a question set
router.post('/question-sets/:setId/questions',  verifyToken, async (req, res) => {
  try {
    const { setId } = req.params;
    const { questions } = req.body;

    if (!questions || !Array.isArray(questions) || questions.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Questions array is required'
      });
    }

    // Find the question set
    const questionSet = await QuestionSet.findById(setId);
    if (!questionSet) {
      return res.status(404).json({
        success: false,
        message: 'Question set not found'
      });
    }

    // Get parent hierarchy from question set
    const hierarchy = {
      book: questionSet.book,
      chapter: questionSet.chapter,
      topic: questionSet.topic,
      subtopic: questionSet.subtopic
    };

    // Create questions
    const createdQuestions = [];
    for (const questionData of questions) {
      const { question, options, correctAnswer, difficulty } = questionData;

      // Validate question data
      if (!question || !options || !Array.isArray(options) || options.length < 2) {
        continue; // Skip invalid questions
      }

      if (correctAnswer === undefined || correctAnswer < 0 || correctAnswer >= options.length) {
        continue; // Skip questions with invalid correct answer
      }

      const objectiveQuestion = new ObjectiveQuestion({
        question: question.trim(),
        options: options.filter(opt => opt && opt.trim()).map(opt => opt.trim()),
        correctAnswer,
        difficulty: difficulty || questionSet.level,
        questionSet: setId,
        ...hierarchy,
        isWorkbook: questionSet.isWorkbook,
        createdBy: req.user.id
      });

      const savedQuestion = await objectiveQuestion.save();
      createdQuestions.push(savedQuestion);

      // Add question to set's questions array
      await questionSet.addQuestion(savedQuestion._id);
    }

    if (createdQuestions.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'No valid questions provided'
      });
    }

    res.status(201).json({
      success: true,
      message: `${createdQuestions.length} question(s) added successfully`,
      questions: createdQuestions
    });
  } catch (error) {
    console.error('Error adding questions to set:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to add questions'
    });
  }
});

// Update a specific question
router.put('/questions/:questionId',  verifyToken, async (req, res) => {
  try {
    const { questionId } = req.params;
    const { question, options, correctAnswer, difficulty } = req.body;

    // Validate input
    if (!question || !options || !Array.isArray(options) || options.length < 2) {
      return res.status(400).json({
        success: false,
        message: 'Question and at least 2 options are required'
      });
    }

    if (correctAnswer === undefined || correctAnswer < 0 || correctAnswer >= options.length) {
      return res.status(400).json({
        success: false,
        message: 'Valid correct answer index is required'
      });
    }

    const objectiveQuestion = await ObjectiveQuestion.findById(questionId);
    if (!objectiveQuestion) {
      return res.status(404).json({
        success: false,
        message: 'Question not found'
      });
    }

    // Update question
    objectiveQuestion.question = question.trim();
    objectiveQuestion.options = options.filter(opt => opt && opt.trim()).map(opt => opt.trim());
    objectiveQuestion.correctAnswer = correctAnswer;
    if (difficulty) {
      objectiveQuestion.difficulty = difficulty;
    }

    await objectiveQuestion.save();

    res.json({
      success: true,
      message: 'Question updated successfully',
      question: objectiveQuestion
    });
  } catch (error) {
    console.error('Error updating question:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to update question'
    });
  }
});

// Delete a specific question
router.delete('/questions/:questionId',  verifyToken, async (req, res) => {
  try {
    const { questionId } = req.params;

    const objectiveQuestion = await ObjectiveQuestion.findById(questionId);
    if (!objectiveQuestion) {
      return res.status(404).json({
        success: false,
        message: 'Question not found'
      });
    }

    // Remove question from question set
    const questionSet = await QuestionSet.findById(objectiveQuestion.questionSet);
    if (questionSet) {
      await questionSet.removeQuestion(questionId);
    }

    // Delete the question
    await ObjectiveQuestion.findByIdAndDelete(questionId);

    res.json({
      success: true,
      message: 'Question deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting question:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to delete question'
    });
  }
});

// Delete a question set and all its questions
router.delete('/question-sets/:setId',  verifyToken, async (req, res) => {
  try {
    const { setId } = req.params;

    const questionSet = await QuestionSet.findById(setId);
    if (!questionSet) {
      return res.status(404).json({
        success: false,
        message: 'Question set not found'
      });
    }

    // Delete all questions in the set
    await ObjectiveQuestion.deleteMany({ questionSet: setId });

    // Delete the question set
    await QuestionSet.findByIdAndDelete(setId);

    res.json({
      success: true,
      message: 'Question set and all its questions deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting question set:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to delete question set'
    });
  }
});

// Get questions by difficulty level
router.get('/:itemType/:itemId/questions/difficulty/:level',  verifyToken, async (req, res) => {
  try {
    const { itemType, itemId, level } = req.params;
    const { isWorkbook = false } = req.query;

    // Validate parent item
    await validateParentItem(itemType, itemId, isWorkbook);

    const questions = await ObjectiveQuestion.findByParent(itemType, itemId, { 
      difficulty: level,
      isWorkbook: isWorkbook === 'true'
    });

    res.json({
      success: true,
      questions: questions
    });
  } catch (error) {
    console.error('Error fetching questions by difficulty:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to fetch questions'
    });
  }
});

// Record answer attempt (for analytics)
router.post('/questions/:questionId/answer',  verifyToken, async (req, res) => {
  try {
    const { questionId } = req.params;
    const { selectedAnswer } = req.body;

    const question = await ObjectiveQuestion.findById(questionId);
    if (!question) {
      return res.status(404).json({
        success: false,
        message: 'Question not found'
      });
    }

    const isCorrect = selectedAnswer === question.correctAnswer;
    await question.recordAnswer(isCorrect);

    res.json({
      success: true,
      isCorrect: isCorrect,
      correctAnswer: question.correctAnswer,
      explanation: question.explanation || null,
      stats: {
        timesAnswered: question.timesAnswered,
        timesCorrect: question.timesCorrect,
        accuracyPercentage: question.accuracyPercentage
      }
    });
  } catch (error) {
    console.error('Error recording answer:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to record answer'
    });
  }
});

module.exports = router;
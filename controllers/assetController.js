// controllers/asset.js

const Book = require('../models/Book');
const Chapter = require('../models/Chapter');
const Topic = require('../models/Topic');
const SubTopic = require('../models/SubTopic');
const Summary = require('../models/Summary');
const QuestionSet = require('../models/QuestionSet');
const ObjectiveQuestion = require('../models/ObjectiveQuestion');
const SubjectiveQuestion = require('../models/SubjectiveQuestion');
const Video = require('../models/Video');
const PreviousYearQuestion = require('../models/PreviousYearQuestion');

// Get resource details (book, chapter, topic, subtopic)
exports.getResourceDetails = async (req, res) => {
  try {
    // Resource is already attached to req by middleware
    const resourceLevel = req.params.subtopicId ? 'subtopic' : 
                         req.params.topicId ? 'topic' : 
                         req.params.chapterId ? 'chapter' : 'book';
    
    res.json({
      success: true,
      data: req.resource[resourceLevel]
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
};

// Get summaries for a resource
exports.getSummaries = async (req, res) => {
  try {
    const query = {};
    
    // Build query based on resource
    if (req.resource.subtopic) {
      query.subtopic = req.resource.subtopic._id;
    } else if (req.resource.topic) {
      query.topic = req.resource.topic._id;
    } else if (req.resource.chapter) {
      query.chapter = req.resource.chapter._id;
    } else if (req.resource.book) {
      query.book = req.resource.book._id;
    }
    
    query.user = req.user.id;
    
    const summaries = await Summary.find(query).sort('-createdAt');
    
    res.json({
      success: true,
      data: summaries
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
};

// Create a summary
exports.createSummary = async (req, res) => {
  try {
    const { content } = req.body;
    
    if (!content) {
      return res.status(400).json({
        success: false,
        message: 'Please provide summary content'
      });
    }
    
    const summaryData = {
      content,
      user: req.user.id
    };
    
    // Add resource references based on the hierarchy
    if (req.resource.book) summaryData.book = req.resource.book._id;
    if (req.resource.chapter) summaryData.chapter = req.resource.chapter._id;
    if (req.resource.topic) summaryData.topic = req.resource.topic._id;
    if (req.resource.subtopic) summaryData.subtopic = req.resource.subtopic._id;
    
    const summary = await Summary.create(summaryData);
    
    res.status(201).json({
      success: true,
      data: summary
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
};

// Get objective question sets
exports.getObjectiveQuestionSets = async (req, res) => {
  try {
    const query = {};
    
    // Build query based on resource
    if (req.resource.subtopic) {
      query.subtopic = req.resource.subtopic._id;
    } else if (req.resource.topic) {
      query.topic = req.resource.topic._id;
    } else if (req.resource.chapter) {
      query.chapter = req.resource.chapter._id;
    } else if (req.resource.book) {
      query.book = req.resource.book._id;
    }
    
    query.user = req.user.id;
    query.type = 'objective';
    
    const objectiveSets = await QuestionSet.find(query).sort('-createdAt');
    
    // For each set, get its questions
    const setsWithQuestions = await Promise.all(objectiveSets.map(async (set) => {
      const questions = await ObjectiveQuestion.find({ questionSet: set._id });
      const setObj = set.toObject();
      setObj.questions = questions;
      return setObj;
    }));
    
    res.json({
      success: true,
      data: setsWithQuestions
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
};

// Create objective question set
exports.createObjectiveQuestionSet = async (req, res) => {
  try {
    const { name, description, level } = req.body;
    
    if (!name || !level) {
      return res.status(400).json({
        success: false,
        message: 'Please provide name and level'
      });
    }
    
    if (!['L1', 'L2', 'L3'].includes(level)) {
      return res.status(400).json({
        success: false,
        message: 'Level must be one of: L1, L2, L3'
      });
    }
    
    const setData = {
      name,
      description,
      level,
      type: 'objective',
      user: req.user.id
    };
    
    // Add resource references based on the hierarchy
    if (req.resource.book) setData.book = req.resource.book._id;
    if (req.resource.chapter) setData.chapter = req.resource.chapter._id;
    if (req.resource.topic) setData.topic = req.resource.topic._id;
    if (req.resource.subtopic) setData.subtopic = req.resource.subtopic._id;
    
    const questionSet = await QuestionSet.create(setData);
    
    res.status(201).json({
      success: true,
      data: questionSet
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
};

// Add questions to objective set
exports.addQuestionsToObjectiveSet = async (req, res) => {
  try {
    const { setId } = req.params;
    const { questions } = req.body;
    
    if (!questions || !Array.isArray(questions) || questions.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Please provide questions array'
      });
    }
    
    // Verify question set exists and belongs to user
    const questionSet = await QuestionSet.findOne({
      _id: setId,
      user: req.user.id,
      type: 'objective'
    });
    
    if (!questionSet) {
      return res.status(404).json({
        success: false,
        message: 'Question set not found'
      });
    }
    
    // Create all questions
    const questionsToCreate = questions.map(q => ({
      ...q,
      questionSet: setId,
      difficulty: questionSet.level // Ensure difficulty matches set level
    }));
    
    const createdQuestions = await ObjectiveQuestion.create(questionsToCreate);
    
    res.status(201).json({
      success: true,
      data: createdQuestions
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
};

// Update objective question
exports.updateObjectiveQuestion = async (req, res) => {
  try {
    const { questionId } = req.params;
    const { question, options, correctAnswer, difficulty } = req.body;
    
    // Find question and ensure it belongs to user
    let objectiveQuestion = await ObjectiveQuestion.findById(questionId);
    
    if (!objectiveQuestion) {
      return res.status(404).json({
        success: false,
        message: 'Question not found'
      });
    }
    
    // Verify ownership by checking the question set
    const questionSet = await QuestionSet.findOne({
      _id: objectiveQuestion.questionSet,
      user: req.user.id
    });
    
    if (!questionSet) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized'
      });
    }
    
    // Update fields
    objectiveQuestion = await ObjectiveQuestion.findByIdAndUpdate(
      questionId,
      {
        question,
        options,
        correctAnswer,
        difficulty,
        updatedAt: Date.now()
      },
      { new: true, runValidators: true }
    );
    
    res.json({
      success: true,
      data: objectiveQuestion
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
};

// Get subjective question sets
exports.getSubjectiveQuestionSets = async (req, res) => {
  try {
    const query = {};
    
    // Build query based on resource
    if (req.resource.subtopic) {
      query.subtopic = req.resource.subtopic._id;
    } else if (req.resource.topic) {
      query.topic = req.resource.topic._id;
    } else if (req.resource.chapter) {
      query.chapter = req.resource.chapter._id;
    } else if (req.resource.book) {
      query.book = req.resource.book._id;
    }
    
    query.user = req.user.id;
    query.type = 'subjective';
    
    const subjectiveSets = await QuestionSet.find(query).sort('-createdAt');
    
    // For each set, get its questions
    const setsWithQuestions = await Promise.all(subjectiveSets.map(async (set) => {
      const questions = await SubjectiveQuestion.find({ questionSet: set._id });
      const setObj = set.toObject();
      setObj.questions = questions;
      return setObj;
    }));
    
    res.json({
      success: true,
      data: setsWithQuestions
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
};

// Create subjective question set
exports.createSubjectiveQuestionSet = async (req, res) => {
  try {
    const { name, description, level } = req.body;
    
    if (!name || !level) {
      return res.status(400).json({
        success: false,
        message: 'Please provide name and level'
      });
    }
    
    if (!['L1', 'L2', 'L3'].includes(level)) {
      return res.status(400).json({
        success: false,
        message: 'Level must be one of: L1, L2, L3'
      });
    }
    
    const setData = {
      name,
      description,
      level,
      type: 'subjective',
      user: req.user.id
    };
    
    // Add resource references based on the hierarchy
    if (req.resource.book) setData.book = req.resource.book._id;
    if (req.resource.chapter) setData.chapter = req.resource.chapter._id;
    if (req.resource.topic) setData.topic = req.resource.topic._id;
    if (req.resource.subtopic) setData.subtopic = req.resource.subtopic._id;
    
    const questionSet = await QuestionSet.create(setData);
    
    res.status(201).json({
      success: true,
      data: questionSet
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
};

// Add questions to subjective set
exports.addQuestionsToSubjectiveSet = async (req, res) => {
  try {
    const { setId } = req.params;
    const { questions } = req.body;
    
    if (!questions || !Array.isArray(questions) || questions.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Please provide questions array'
      });
    }
    
    // Verify question set exists and belongs to user
    const questionSet = await QuestionSet.findOne({
      _id: setId,
      user: req.user.id,
      type: 'subjective'
    });
    
    if (!questionSet) {
      return res.status(404).json({
        success: false,
        message: 'Question set not found'
      });
    }
    
    // Create all questions
    const questionsToCreate = questions.map(q => ({
      ...q,
      questionSet: setId,
      difficulty: questionSet.level // Ensure difficulty matches set level
    }));
    
    const createdQuestions = await SubjectiveQuestion.create(questionsToCreate);
    
    res.status(201).json({
      success: true,
      data: createdQuestions
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
};

// Update subjective question
exports.updateSubjectiveQuestion = async (req, res) => {
  try {
    const { questionId } = req.params;
    const { question, answer, keywords, difficulty } = req.body;
    
    // Find question and ensure it belongs to user
    let subjectiveQuestion = await SubjectiveQuestion.findById(questionId);
    
    if (!subjectiveQuestion) {
      return res.status(404).json({
        success: false,
        message: 'Question not found'
      });
    }
    
    // Verify ownership by checking the question set
    const questionSet = await QuestionSet.findOne({
      _id: subjectiveQuestion.questionSet,
      user: req.user.id
    });
    
    if (!questionSet) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized'
      });
    }
    
    // Update fields
    subjectiveQuestion = await SubjectiveQuestion.findByIdAndUpdate(
      questionId,
      {
        question,
        answer,
        keywords,
        difficulty,
        updatedAt: Date.now()
      },
      { new: true, runValidators: true }
    );
    
    res.json({
      success: true,
      data: subjectiveQuestion
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
};

// Get videos
exports.getVideos = async (req, res) => {
  try {
    const query = {};
    
    // Build query based on resource
    if (req.resource.subtopic) {
      query.subtopic = req.resource.subtopic._id;
    } else if (req.resource.topic) {
      query.topic = req.resource.topic._id;
    } else if (req.resource.chapter) {
      query.chapter = req.resource.chapter._id;
    } else if (req.resource.book) {
      query.book = req.resource.book._id;
    }
    
    query.user = req.user.id;
    
    const videos = await Video.find(query).sort('-createdAt');
    
    res.json({
      success: true,
      data: videos
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
};

// Create video
exports.createVideo = async (req, res) => {
  try {
    const { title, url, description } = req.body;
    
    if (!title || !url) {
      return res.status(400).json({
        success: false,
        message: 'Please provide title and URL'
      });
    }
    
    const videoData = {
      title,
      url,
      description,
      user: req.user.id
    };
    
    // Add resource references based on the hierarchy
    if (req.resource.book) videoData.book = req.resource.book._id;
    if (req.resource.chapter) videoData.chapter = req.resource.chapter._id;
    if (req.resource.topic) videoData.topic = req.resource.topic._id;
    if (req.resource.subtopic) videoData.subtopic = req.resource.subtopic._id;
    
    const video = await Video.create(videoData);
    
    res.status(201).json({
      success: true,
      data: video
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
};

// Get PYQs
exports.getPYQs = async (req, res) => {
  try {
    const query = {};
    
    // Build query based on resource
    if (req.resource.subtopic) {
      query.subtopic = req.resource.subtopic._id;
    } else if (req.resource.topic) {
      query.topic = req.resource.topic._id;
    } else if (req.resource.chapter) {
      query.chapter = req.resource.chapter._id;
    } else if (req.resource.book) {
      query.book = req.resource.book._id;
    }
    
    query.user = req.user.id;
    
    const pyqs = await PreviousYearQuestion.find(query).sort('-year');
    
    res.json({
      success: true,
      data: pyqs
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
};

// Create PYQ
exports.createPYQ = async (req, res) => {
  try {
    const { year, question, answer, difficulty, source } = req.body;
    
    if (!year || !question || !difficulty) {
      return res.status(400).json({
        success: false,
        message: 'Please provide year, question and difficulty'
      });
    }
    
    if (!['easy', 'medium', 'hard'].includes(difficulty)) {
      return res.status(400).json({
        success: false,
        message: 'Difficulty must be one of: easy, medium, hard'
      });
    }
    
    const pyqData = {
      year,
      question,
      answer,
      difficulty,
      source,
      user: req.user.id
    };
    
    // Add resource references based on the hierarchy
    if (req.resource.book) pyqData.book = req.resource.book._id;
    if (req.resource.chapter) pyqData.chapter = req.resource.chapter._id;
    if (req.resource.topic) pyqData.topic = req.resource.topic._id;
    if (req.resource.subtopic) pyqData.subtopic = req.resource.subtopic._id;
    
    const pyq = await PreviousYearQuestion.create(pyqData);
    
    res.status(201).json({
      success: true,
      data: pyq
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
};

// Delete an asset
exports.deleteAsset = async (req, res) => {
  try {
    const { assetType, assetId } = req.params;
    
    let model, query;
    
    switch (assetType) {
      case 'summary':
        model = Summary;
        break;
      case 'video':
        model = Video;
        break;
      case 'pyq':
        model = PreviousYearQuestion;
        break;
      case 'objective-question':
        model = ObjectiveQuestion;
        break;
      case 'subjective-question':
        model = SubjectiveQuestion;
        break;
      default:
        return res.status(400).json({
          success: false,
          message: 'Invalid asset type'
        });
    }
    
    query = { _id: assetId };
    
    // For questions, we need to check ownership differently
    if (assetType === 'objective-question' || assetType === 'subjective-question') {
      const question = await model.findById(assetId);
      
      if (!question) {
        return res.status(404).json({
          success: false,
          message: 'Question not found'
        });
      }
      
      // Check if the question set belongs to the user
      const questionSet = await QuestionSet.findOne({
        _id: question.questionSet,
        user: req.user.id
      });
      
      if (!questionSet) {
        return res.status(403).json({
          success: false,
          message: 'Not authorized'
        });
      }
    } else {
      // For other assets, check user directly
      query.user = req.user.id;
    }
    
    const asset = await model.findOne(query);
    
    if (!asset) {
      return res.status(404).json({
        success: false,
        message: 'Asset not found'
      });
    }
    
    await model.findByIdAndDelete(assetId);
    
    res.json({
      success: true,
      message: 'Asset deleted successfully'
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
};
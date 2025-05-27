const Question = require('../models/AiswbQuestion');
const AISWBSet = require('../models/AISWBSet');
const { validationResult } = require('express-validator');

// Question Controllers
const addQuestion = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: "Invalid input data",
        error: {
          code: "INVALID_INPUT",
          details: errors.array()
        }
      });
    }

    const questionData = req.body.question;
    const setId = req.body.setId;

    // Validate set exists if setId provided
    if (setId) {
      const set = await AISWBSet.findById(setId);
      if (!set) {
        return res.status(404).json({
          success: false,
          message: "Set not found",
          error: {
            code: "SET_NOT_FOUND",
            details: "The specified set does not exist"
          }
        });
      }
    }

    const question = new Question({
      ...questionData,
      setId: setId || null
    });

    await question.save();

    // If setId provided, add question to set
    if (setId) {
      await AISWBSet.findByIdAndUpdate(
        setId,
        { $push: { questions: question._id } }
      );
    }

    res.status(200).json({
      success: true,
      message: "Question added successfully",
      data: {
        id: question._id.toString(),
        question: question.question,
        detailedAnswer: question.detailedAnswer,
        modalAnswer: question.modalAnswer,
        metadata: question.metadata,
        languageMode: question.languageMode,
        createdAt: question.createdAt.toISOString(),
        updatedAt: question.updatedAt.toISOString()
      }
    });

  } catch (error) {
    console.error('Add question error:', error);
    res.status(500).json({
      success: false,
      message: "Internal server error",
      error: {
        code: "SERVER_ERROR",
        details: error.message
      }
    });
  }
};

const updateQuestion = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: "Invalid input data",
        error: {
          code: "INVALID_INPUT",
          details: errors.array()
        }
      });
    }

    const questionId = req.params.questionId;
    const questionData = req.body.question;

    const question = await Question.findById(questionId);
    if (!question) {
      return res.status(404).json({
        success: false,
        message: "Question not found",
        error: {
          code: "QUESTION_NOT_FOUND",
          details: "The specified question does not exist"
        }
      });
    }

    // Update question fields
    Object.assign(question, questionData);
    await question.save();

    res.status(200).json({
      success: true,
      message: "Question updated successfully",
      data: {
        id: question._id.toString(),
        question: question.question,
        detailedAnswer: question.detailedAnswer,
        modalAnswer: question.modalAnswer,
        metadata: question.metadata,
        languageMode: question.languageMode,
        updatedAt: question.updatedAt.toISOString()
      }
    });

  } catch (error) {
    console.error('Update question error:', error);
    res.status(500).json({
      success: false,
      message: "Internal server error",
      error: {
        code: "SERVER_ERROR",
        details: error.message
      }
    });
  }
};

const deleteQuestion = async (req, res) => {
  try {
    const questionId = req.params.questionId;

    const question = await Question.findById(questionId);
    if (!question) {
      return res.status(404).json({
        success: false,
        message: "Question not found",
        error: {
          code: "QUESTION_NOT_FOUND",
          details: "The specified question does not exist"
        }
      });
    }

    // Remove question from any sets
    await AISWBSet.updateMany(
      { questions: questionId },
      { $pull: { questions: questionId } }
    );

    await Question.findByIdAndDelete(questionId);

    res.status(200).json({
      success: true,
      message: "Question deleted successfully"
    });

  } catch (error) {
    console.error('Delete question error:', error);
    res.status(500).json({
      success: false,
      message: "Internal server error",
      error: {
        code: "SERVER_ERROR",
        details: error.message
      }
    });
  }
};

const getQuestionDetails = async (req, res) => {
  try {
    const questionId = req.params.questionId;

    const question = await Question.findById(questionId);
    if (!question) {
      return res.status(404).json({
        success: false,
        message: "Question not found",
        error: {
          code: "QUESTION_NOT_FOUND",
          details: "The specified question does not exist"
        }
      });
    }

    res.status(200).json({
      success: true,
      data: {
        id: question._id.toString(),
        question: question.question,
        detailedAnswer: question.detailedAnswer,
        modalAnswer: question.modalAnswer,
        metadata: question.metadata,
        languageMode: question.languageMode,
        createdAt: question.createdAt.toISOString(),
        updatedAt: question.updatedAt.toISOString()
      }
    });

  } catch (error) {
    console.error('Get question error:', error);
    res.status(500).json({
      success: false,
      message: "Internal server error",
      error: {
        code: "SERVER_ERROR",
        details: error.message
      }
    });
  }
};

// Set Controllers
const getAISWBSets = async (req, res) => {
  try {
    const { itemType, itemId } = req.params;
    const isWorkbook = req.query.isWorkbook === 'true';

    const sets = await AISWBSet.find({
      itemType,
      itemId,
      isWorkbook
    });

    res.status(200).json({
      success: true,
      sets: sets.map(set => ({
        id: set._id.toString(),
        name: set.name,
        questions: set.questions
      }))
    });

  } catch (error) {
    console.error('Get AISWB sets error:', error);
    res.status(500).json({
      success: false,
      message: "Internal server error",
      error: {
        code: "SERVER_ERROR",
        details: error.message
      }
    });
  }
};

const createAISWBSet = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: "Invalid input data",
        error: {
          code: "INVALID_INPUT",
          details: errors.array()
        }
      });
    }

    const { itemType, itemId } = req.params;
    const isWorkbook = req.query.isWorkbook === 'true';
    const { name } = req.body;

    const newSet = new AISWBSet({
      name,
      itemType,
      itemId,
      isWorkbook,
      questions: []
    });

    await newSet.save();

    res.status(200).json({
      success: true,
      set: {
        id: newSet._id.toString(),
        name: newSet.name,
        questions: []
      }
    });

  } catch (error) {
    console.error('Create AISWB set error:', error);
    res.status(500).json({
      success: false,
      message: "Internal server error",
      error: {
        code: "SERVER_ERROR",
        details: error.message
      }
    });
  }
};

const updateAISWBSet = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: "Invalid input data",
        error: {
          code: "INVALID_INPUT",
          details: errors.array()
        }
      });
    }

    const { setId } = req.params;
    const { name } = req.body;

    const set = await AISWBSet.findById(setId);
    if (!set) {
      return res.status(404).json({
        success: false,
        message: "Set not found",
        error: {
          code: "SET_NOT_FOUND",
          details: "The specified set does not exist"
        }
      });
    }

    set.name = name;
    await set.save();

    res.status(200).json({
      success: true,
      set: {
        id: set._id.toString(),
        name: set.name,
        questions: set.questions
      }
    });

  } catch (error) {
    console.error('Update AISWB set error:', error);
    res.status(500).json({
      success: false,
      message: "Internal server error",
      error: {
        code: "SERVER_ERROR",
        details: error.message
      }
    });
  }
};

const deleteAISWBSet = async (req, res) => {
  try {
    const { setId } = req.params;

    const set = await AISWBSet.findById(setId);
    if (!set) {
      return res.status(404).json({
        success: false,
        message: "Set not found",
        error: {
          code: "SET_NOT_FOUND",
          details: "The specified set does not exist"
        }
      });
    }

    // Delete all questions in the set
    await Question.deleteMany({ _id: { $in: set.questions } });

    // Delete the set
    await AISWBSet.findByIdAndDelete(setId);

    res.status(200).json({
      success: true,
      message: "Set deleted successfully"
    });

  } catch (error) {
    console.error('Delete AISWB set error:', error);
    res.status(500).json({
      success: false,
      message: "Internal server error",
      error: {
        code: "SERVER_ERROR",
        details: error.message
      }
    });
  }
};

const getQuestionsInSet = async (req, res) => {
  try {
    const { setId } = req.params;

    const set = await AISWBSet.findById(setId).populate('questions');
    if (!set) {
      return res.status(404).json({
        success: false,
        message: "Set not found",
        error: {
          code: "SET_NOT_FOUND",
          details: "The specified set does not exist"
        }
      });
    }

    const questions = set.questions.map(question => ({
      id: question._id.toString(),
      question: question.question,
      detailedAnswer: question.detailedAnswer,
      metadata: {
        ...question.metadata.toObject(),
        qualityParameters: {
          ...question.metadata.qualityParameters.toObject(),
          customQualityParameters: question.metadata.qualityParameters.customParams.map(param => ({
            name: param
          }))
        }
      },
      languageMode: question.languageMode
    }));

    res.status(200).json({
      success: true,
      questions
    });

  } catch (error) {
    console.error('Get questions in set error:', error);
    res.status(500).json({
      success: false,
      message: "Internal server error",
      error: {
        code: "SERVER_ERROR",
        details: error.message
      }
    });
  }
};

const addQuestionToSet = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: "Invalid input data",
        error: {
          code: "INVALID_INPUT",
          details: errors.array()
        }
      });
    }

    const { setId } = req.params;
    const questionData = req.body;

    const set = await AISWBSet.findById(setId);
    if (!set) {
      return res.status(404).json({
        success: false,
        message: "Set not found",
        error: {
          code: "SET_NOT_FOUND",
          details: "The specified set does not exist"
        }
      });
    }

    // Transform customQualityParameters to customParams
    if (questionData.metadata && questionData.metadata.qualityParameters && questionData.metadata.qualityParameters.customQualityParameters) {
      questionData.metadata.qualityParameters.customParams = questionData.metadata.qualityParameters.customQualityParameters.map(param => param.name);
      delete questionData.metadata.qualityParameters.customQualityParameters;
    }

    const question = new Question({
      ...questionData,
      setId
    });

    await question.save();

    // Add question to set
    set.questions.push(question._id);
    await set.save();

    res.status(200).json({
      success: true,
      question: {
        id: question._id.toString(),
        question: question.question,
        detailedAnswer: question.detailedAnswer,
        metadata: {
          ...question.metadata.toObject(),
          qualityParameters: {
            ...question.metadata.qualityParameters.toObject(),
            customQualityParameters: question.metadata.qualityParameters.customParams.map(param => ({
              name: param
            }))
          }
        },
        languageMode: question.languageMode
      }
    });

  } catch (error) {
    console.error('Add question to set error:', error);
    res.status(500).json({
      success: false,
      message: "Internal server error",
      error: {
        code: "SERVER_ERROR",
        details: error.message
      }
    });
  }
};

const deleteQuestionFromSet = async (req, res) => {
  try {
    const { setId, questionId } = req.params;

    const set = await AISWBSet.findById(setId);
    if (!set) {
      return res.status(404).json({
        success: false,
        message: "Set not found",
        error: {
          code: "SET_NOT_FOUND",
          details: "The specified set does not exist"
        }
      });
    }

    const question = await Question.findById(questionId);
    if (!question) {
      return res.status(404).json({
        success: false,
        message: "Question not found",
        error: {
          code: "QUESTION_NOT_FOUND",
          details: "The specified question does not exist"
        }
      });
    }

    // Remove question from set
    set.questions = set.questions.filter(id => id.toString() !== questionId);
    await set.save();

    // Delete the question
    await Question.findByIdAndDelete(questionId);

    res.status(200).json({
      success: true,
      message: "Question deleted successfully"
    });

  } catch (error) {
    console.error('Delete question from set error:', error);
    res.status(500).json({
      success: false,
      message: "Internal server error",
      error: {
        code: "SERVER_ERROR",
        details: error.message
      }
    });
  }
};

module.exports = {
  addQuestion,
  updateQuestion,
  deleteQuestion,
  getQuestionDetails,
  getAISWBSets,
  createAISWBSet,
  updateAISWBSet,
  deleteAISWBSet,
  getQuestionsInSet,
  addQuestionToSet,
  deleteQuestionFromSet
};

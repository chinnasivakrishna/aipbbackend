const Question = require('../models/AiswbQuestion');
const AISWBSet = require('../models/AISWBSet');
const { validationResult } = require('express-validator');
const UserAnswer = require('../models/UserAnswer');
const UserProfile = require('../models/UserProfile');

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
        answerVideoUrls: question.answerVideoUrls || [], // Updated to handle array
        metadata: question.metadata,
        languageMode: question.languageMode,
        evaluationMode: question.evaluationMode,
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
        answerVideoUrls: question.answerVideoUrls || [], // Updated to handle array
        metadata: question.metadata,
        languageMode: question.languageMode,
        evaluationMode: question.evaluationMode,
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
        answerVideoUrls: question.answerVideoUrls || [], // Updated to handle array
        metadata: question.metadata,
        languageMode: question.languageMode,
        evaluationMode: question.evaluationMode,
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
      answerVideoUrls: question.answerVideoUrls || [], // Updated to handle array
      metadata: {
        ...question.metadata.toObject(),
        qualityParameters: {
          ...question.metadata.qualityParameters.toObject(),
          customQualityParameters: question.metadata.qualityParameters.customParams.map(param => ({
            name: param
          }))
        }
      },
      languageMode: question.languageMode,
      evaluationMode: question.evaluationMode
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
        answerVideoUrls: question.answerVideoUrls || [], // Updated to handle array
        metadata: {
          ...question.metadata.toObject(),
          qualityParameters: {
            ...question.metadata.qualityParameters.toObject(),
            customQualityParameters: question.metadata.qualityParameters.customParams.map(param => ({
              name: param
            }))
          }
        },
        languageMode: question.languageMode,
        evaluationMode: question.evaluationMode
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

const getQuestionSubmissions = async (req, res) => {
  try {
    const { questionId } = req.params;
    const {
      page = 1,
      limit = 10,
      status = 'all',
      sortBy = 'submittedAt',
      sortOrder = 'desc'
    } = req.query;

    // Validate questionId
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

    // Build query filters
    const matchQuery = { questionId };
    
    // Filter by evaluation status if specified
    if (status !== 'all') {
      if (status === 'published') {
        matchQuery['feedback.status'] = 'published';
      } else if (status === 'not_published') {
        matchQuery['feedback.status'] = { $ne: 'published' };
      }
    }

    // Build sort object
    const sortObject = {};
    if (sortBy === 'marks') {
      sortObject['feedback.score'] = sortOrder === 'asc' ? 1 : -1;
    } else if (sortBy === 'accuracy') {
      sortObject['feedback.accuracy'] = sortOrder === 'asc' ? 1 : -1;
    } else {
      sortObject['submittedAt'] = sortOrder === 'asc' ? 1 : -1;
    }

    // Calculate pagination
    const skip = (parseInt(page) - 1) * parseInt(limit);
    const limitNum = parseInt(limit);

    // Get total count
    const totalSubmissions = await UserAnswer.countDocuments(matchQuery);

    // Get submissions with populated user data
    const submissions = await UserAnswer.find(matchQuery)
      .populate('userId') // Only populate the MobileUser
      .sort(sortObject)
      .skip(skip)
      .limit(limitNum)
      .lean();

    // Get user profiles separately
    const userIds = submissions.map(s => s.userId?._id).filter(Boolean);
    const userProfiles = await UserProfile.find({
      userId: { $in: userIds }
    }).lean();

    // Create a map of userId to profile for quick lookup
    const profileMap = userProfiles.reduce((map, profile) => {
      map[profile.userId.toString()] = profile;
      return map;
    }, {});

    // Transform submissions data
    const transformedSubmissions = submissions.map(submission => {
      const mobileUser = submission.userId || {};
      const userProfile = profileMap[mobileUser._id?.toString()] || {};
      
      return {
        submissionId: submission._id.toString(),
        userId: mobileUser._id?.toString() || '',
        userDetails: {
          name: userProfile.name || 'Anonymous User',
          email: mobileUser.mobile || 'N/A', // Using mobile as email equivalent
          profileImage: null, // Not implemented in current schema
          role: 'student' // Default role
        },
        images: submission.answerImages.map(img => ({
          imageId: img._id?.toString() || '',
          imageUrl: img.imageUrl,
          uploadedAt: img.uploadedAt,
          imageType: 'answer',
          imageSize: 0, // Not stored in current schema
          imageFormat: img.imageUrl?.split('.').pop()?.toLowerCase() || 'jpg'
        })),
        evaluation: {
          evaluationId: submission._id.toString(),
          evaluationMode: submission.reviewedBy ? 'manual' : 'auto',
          marks: submission.feedback?.score || 0,
          accuracy: submission.feedback?.accuracy || 0,
          status: submission.feedback?.status || 'not_published',
          evaluatedAt: submission.reviewedAt || submission.updatedAt,
          evaluatedBy: submission.reviewedBy?.toString() || 'system'
        },
        submittedAt: submission.submittedAt,
        updatedAt: submission.updatedAt
      };
    });

    // Calculate pagination info
    const totalPages = Math.ceil(totalSubmissions / limitNum);

    res.status(200).json({
      success: true,
      data: {
        submissions: transformedSubmissions,
        pagination: {
          total: totalSubmissions,
          page: parseInt(page),
          limit: limitNum,
          totalPages
        },
        questionDetails: {
          questionId: question._id.toString(),
          title: question.question,
          description: question.detailedAnswer,
          answerVideoUrls: question.answerVideoUrls || [], // Updated to handle array
          metadata: {
            maximumMarks: question.metadata.maximumMarks,
            qualityParameters: question.metadata.qualityParameters
          }
        }
      }
    });

  } catch (error) {
    console.error('Get question submissions error:', error);
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
  deleteQuestionFromSet,
  getQuestionSubmissions
};
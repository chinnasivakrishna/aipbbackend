// controllers/evaluationController.js
const Evaluation = require('../models/Evaluation');
const UserAnswer = require('../models/UserAnswer');
const AiswbQuestion = require('../models/AiswbQuestion');
const MobileUser = require('../models/MobileUser');

// Save Evaluated Answer
const saveEvaluatedAnswer = async (req, res) => {
  try {
    const {
      submissionId,
      questionId,
      userId,
      evaluation
    } = req.body;

    // Validate required fields
    if (!submissionId || !questionId || !userId || !evaluation) {
      return res.status(400).json({
        success: false,
        message: 'Missing required fields: submissionId, questionId, userId, or evaluation'
      });
    }

    // Validate evaluation structure
    if (!evaluation.geminiAnalysis || typeof evaluation.geminiAnalysis.accuracy !== 'number') {
      return res.status(400).json({
        success: false,
        message: 'Invalid evaluation structure: geminiAnalysis with accuracy is required'
      });
    }

    // Verify submission exists
    const submission = await UserAnswer.findById(submissionId);
    if (!submission) {
      return res.status(404).json({
        success: false,
        message: 'Submission not found'
      });
    }

    // Verify question exists
    const question = await AiswbQuestion.findById(questionId);
    if (!question) {
      return res.status(404).json({
        success: false,
        message: 'Question not found'
      });
    }

    // Verify user exists
    const user = await MobileUser.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Check if evaluation already exists for this submission
    const existingEvaluation = await Evaluation.findOne({ submissionId });
    if (existingEvaluation) {
      return res.status(409).json({
        success: false,
        message: 'Evaluation already exists for this submission'
      });
    }

    // Create new evaluation
    const newEvaluation = new Evaluation({
      submissionId,
      questionId,
      userId,
      clientId: submission.clientId,
      extractedTexts: evaluation.extractedTexts || [],
      geminiAnalysis: {
        accuracy: evaluation.geminiAnalysis.accuracy,
        strengths: evaluation.geminiAnalysis.strengths || [],
        weaknesses: evaluation.geminiAnalysis.weaknesses || [],
        suggestions: evaluation.geminiAnalysis.suggestions || []
      },
      status: evaluation.status || 'not_published',
      evaluatedAt: evaluation.evaluatedAt || new Date()
    });

    const savedEvaluation = await newEvaluation.save();

    res.status(201).json({
      success: true,
      message: 'Evaluation saved successfully',
      data: {
        evaluationId: savedEvaluation._id,
        submissionId: savedEvaluation.submissionId,
        status: savedEvaluation.status,
        evaluatedAt: savedEvaluation.evaluatedAt
      }
    });

  } catch (error) {
    console.error('Error saving evaluation:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error while saving evaluation',
      error: error.message
    });
  }
};

// Get User's Evaluated Answers
const getUserEvaluatedAnswers = async (req, res) => {
  try {
    const { userId } = req.params;
    const {
      questionId,
      status,
      page = 1,
      limit = 10
    } = req.query;

    // Validate userId
    if (!userId) {
      return res.status(400).json({
        success: false,
        message: 'User ID is required'
      });
    }

    // Verify user exists
    const user = await MobileUser.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Get evaluations with pagination
    const result = await Evaluation.getUserEvaluations(userId, {
      questionId,
      status,
      page: parseInt(page),
      limit: parseInt(limit)
    });

    // Format response data
    const formattedEvaluations = result.evaluations.map(evaluation => ({
      evaluationId: evaluation._id,
      submissionId: evaluation.submissionId._id,
      questionId: evaluation.questionId._id,
      userId: evaluation.userId,
      extractedTexts: evaluation.extractedTexts,
      geminiAnalysis: evaluation.geminiAnalysis,
      status: evaluation.status,
      evaluatedAt: evaluation.evaluatedAt,
      question: {
        title: evaluation.questionId.question,
        description: evaluation.questionId.detailedAnswer,
        metadata: evaluation.questionId.metadata
      },
      submission: {
        attemptNumber: evaluation.submissionId.attemptNumber,
        submittedAt: evaluation.submissionId.submittedAt
      }
    }));

    res.status(200).json({
      success: true,
      data: {
        evaluations: formattedEvaluations,
        pagination: result.pagination
      }
    });

  } catch (error) {
    console.error('Error fetching user evaluations:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error while fetching evaluations',
      error: error.message
    });
  }
};

// Update Evaluation Status
const updateEvaluationStatus = async (req, res) => {
  try {
    const { evaluationId } = req.params;
    const { status } = req.body;

    // Validate evaluationId
    if (!evaluationId) {
      return res.status(400).json({
        success: false,
        message: 'Evaluation ID is required'
      });
    }

    // Validate status
    if (!status || !['published', 'not_published'].includes(status)) {
      return res.status(400).json({
        success: false,
        message: 'Valid status is required (published or not_published)'
      });
    }

    // Find and update evaluation
    const evaluation = await Evaluation.findById(evaluationId);
    if (!evaluation) {
      return res.status(404).json({
        success: false,
        message: 'Evaluation not found'
      });
    }

    evaluation.status = status;
    evaluation.updatedAt = new Date();
    await evaluation.save();

    res.status(200).json({
      success: true,
      message: 'Evaluation status updated successfully',
      data: {
        evaluationId: evaluation._id,
        status: evaluation.status,
        updatedAt: evaluation.updatedAt
      }
    });

  } catch (error) {
    console.error('Error updating evaluation status:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error while updating evaluation status',
      error: error.message
    });
  }
};

// Get Single Evaluation Details
const getEvaluationDetails = async (req, res) => {
  try {
    const { evaluationId } = req.params;

    if (!evaluationId) {
      return res.status(400).json({
        success: false,
        message: 'Evaluation ID is required'
      });
    }

    const evaluation = await Evaluation.findById(evaluationId)
      .populate('questionId', 'question detailedAnswer metadata')
      .populate('submissionId', 'attemptNumber submittedAt answerImages textAnswer')
      .populate('userId', 'mobile clientId');

    if (!evaluation) {
      return res.status(404).json({
        success: false,
        message: 'Evaluation not found'
      });
    }

    const formattedEvaluation = {
      evaluationId: evaluation._id,
      submissionId: evaluation.submissionId._id,
      questionId: evaluation.questionId._id,
      userId: evaluation.userId._id,
      extractedTexts: evaluation.extractedTexts,
      geminiAnalysis: evaluation.geminiAnalysis,
      status: evaluation.status,
      evaluatedAt: evaluation.evaluatedAt,
      question: {
        title: evaluation.questionId.question,
        description: evaluation.questionId.detailedAnswer,
        metadata: evaluation.questionId.metadata
      },
      submission: {
        attemptNumber: evaluation.submissionId.attemptNumber,
        submittedAt: evaluation.submissionId.submittedAt,
        answerImages: evaluation.submissionId.answerImages,
        textAnswer: evaluation.submissionId.textAnswer
      },
      user: {
        mobile: evaluation.userId.mobile,
        clientId: evaluation.userId.clientId
      }
    };

    res.status(200).json({
      success: true,
      data: formattedEvaluation
    });

  } catch (error) {
    console.error('Error fetching evaluation details:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error while fetching evaluation details',
      error: error.message
    });
  }
};

// Get All Evaluations (Admin)
const getAllEvaluations = async (req, res) => {
  try {
    const {
      status,
      questionId,
      clientId,
      page = 1,
      limit = 10
    } = req.query;

    const query = {};
    
    if (status) {
      query.status = status;
    }
    
    if (questionId) {
      query.questionId = questionId;
    }
    
    if (clientId) {
      query.clientId = clientId;
    }

    const skip = (page - 1) * limit;

    const [evaluations, total] = await Promise.all([
      Evaluation.find(query)
        .populate('questionId', 'question metadata')
        .populate('userId', 'mobile clientId')
        .populate('submissionId', 'attemptNumber submittedAt')
        .sort({ evaluatedAt: -1 })
        .skip(skip)
        .limit(parseInt(limit)),
      Evaluation.countDocuments(query)
    ]);

    const formattedEvaluations = evaluations.map(evaluation => ({
      evaluationId: evaluation._id,
      submissionId: evaluation.submissionId._id,
      questionId: evaluation.questionId._id,
      userId: evaluation.userId._id,
      clientId: evaluation.clientId,
      extractedTexts: evaluation.extractedTexts,
      geminiAnalysis: evaluation.geminiAnalysis,
      status: evaluation.status,
      evaluatedAt: evaluation.evaluatedAt,
      question: {
        title: evaluation.questionId.question,
        metadata: evaluation.questionId.metadata
      },
      user: {
        mobile: evaluation.userId.mobile,
        clientId: evaluation.userId.clientId
      },
      submission: {
        attemptNumber: evaluation.submissionId.attemptNumber,
        submittedAt: evaluation.submissionId.submittedAt
      }
    }));

    res.status(200).json({
      success: true,
      data: {
        evaluations: formattedEvaluations,
        pagination: {
          total,
          page: parseInt(page),
          limit: parseInt(limit),
          totalPages: Math.ceil(total / limit)
        }
      }
    });

  } catch (error) {
    console.error('Error fetching all evaluations:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error while fetching evaluations',
      error: error.message
    });
  }
};

module.exports = {
  saveEvaluatedAnswer,
  getUserEvaluatedAnswers,
  updateEvaluationStatus,
  getEvaluationDetails,
  getAllEvaluations
};
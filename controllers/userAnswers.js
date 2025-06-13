const {
    submitAnswerService,
    getEvaluationService,
    getSubmissionStatusService,
    getLatestAnswerService,
    getUserAttemptsService,
    getAttemptByNumberService,
    getEvaluationsService,
    getCompleteQuestionDataService,
    reevaluateAnswerService,
    bulkUpdateEvaluationService,
    adminUpdateEvaluationService
  } = require('../services/userAnswers');
  
const UserAnswer = require('../models/UserAnswer');

const submitAnswer = async (req, res, next) => {
    try {
      const result = await submitAnswerService(req);
      res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  };
  
  const getEvaluation = async (req, res) => {
    try {
      const result = await getEvaluationService(req);
      res.status(200).json(result);
    } catch (error) {
      handleErrorResponse(res, error);
    }
  };
  
  const getSubmissionStatus = async (req, res) => {
    try {
      const result = await getSubmissionStatusService(req);
      res.status(200).json(result);
    } catch (error) {
      handleErrorResponse(res, error);
    }
  };
  
  const getLatestAnswer = async (req, res) => {
    try {
      const result = await getLatestAnswerService(req);
      res.status(200).json(result);
    } catch (error) {
      handleErrorResponse(res, error);
    }
  };
  
  const getUserAttempts = async (req, res) => {
    try {
      const result = await getUserAttemptsService(req);
      res.status(200).json(result);
    } catch (error) {
      handleErrorResponse(res, error);
    }
  };
  
  const getAttemptByNumber = async (req, res) => {
    try {
      const result = await getAttemptByNumberService(req);
      res.status(200).json(result);
    } catch (error) {
      handleErrorResponse(res, error);
    }
  };
  
  const getEvaluations = async (req, res) => {
    try {
      const result = await getEvaluationsService(req);
      res.status(200).json(result);
    } catch (error) {
      handleErrorResponse(res, error);
    }
  };
  
  const getCompleteQuestionData = async (req, res) => {
    try {
      const result = await getCompleteQuestionDataService(req);
      res.status(200).json(result);
    } catch (error) {
      handleErrorResponse(res, error);
    }
  };
  
  const reevaluateAnswer = async (req, res) => {
    try {
      const result = await reevaluateAnswerService(req);
      res.status(200).json(result);
    } catch (error) {
      handleErrorResponse(res, error);
    }
  };
  
  const bulkUpdateEvaluation = async (req, res) => {
    try {
      const result = await bulkUpdateEvaluationService(req);
      res.status(200).json(result);
    } catch (error) {
      handleErrorResponse(res, error);
    }
  };
  
  const adminUpdateEvaluation = async (req, res) => {
    try {
      const result = await adminUpdateEvaluationService(req);
      res.status(200).json(result);
    } catch (error) {
      handleErrorResponse(res, error);
    }
  };

  const submitEvaluationFeedback = async (req, res) => {
    try {
      const { answerId } = req.params;
      const { message } = req.body;
      const userId = req.user.id;

      if (!message || !message.trim()) {
        return res.status(400).json({
          success: false,
          message: 'Feedback message is required'
        });
      }

      const answer = await UserAnswer.findById(answerId);
      if (!answer) {
        return res.status(404).json({
          success: false,
          message: 'Answer not found'
        });
      }

      // Verify ownership
      if (answer.userId.toString() !== userId.toString()) {
        return res.status(403).json({
          success: false,
          message: 'Access denied - you can only provide feedback on your own answers'
        });
      }

      // Check if answer has been evaluated
      if (!answer.evaluation || !answer.evaluation.feedback) {
        return res.status(400).json({
          success: false,
          message: 'Cannot provide feedback on unevaluated answers'
        });
      }

      // Check if feedback already exists
      if (!answer.evaluation.feedbackStatus) {
        return res.status(400).json({
          success: false,
          message: 'Feedback has already been submitted for this evaluation'
        });
      }

      // Update feedback and set status
      answer.evaluation.userFeedback = {
        message: message.trim(),
        submittedAt: new Date()
      };
      answer.evaluation.feedbackStatus = false;

      await answer.save();

      res.json({
        success: true,
        message: 'Evaluation feedback submitted successfully',
        data: {
          answerId: answer._id,
          feedbackStatus: answer.evaluation.feedbackStatus,
          feedback: answer.evaluation.userFeedback
        }
      });

    } catch (error) {
      handleErrorResponse(res, error);
    }
  };
  
  const handleErrorResponse = (res, error) => {
    console.error('Controller error:', error);
    
    if (error.name === 'ValidationError') {
      const validationErrors = Object.values(error.errors).map(err => ({
        field: err.path,
        message: err.message,
        value: err.value
      }));
      return res.status(400).json({
        success: false,
        message: "Validation failed",
        error: {
          code: "VALIDATION_ERROR",
          details: validationErrors
        }
      });
    }
  
    if (error.code === 'SUBMISSION_LIMIT_EXCEEDED') {
      return res.status(400).json({
        success: false,
        message: error.message,
        error: {
          code: error.code,
          details: "Maximum 5 attempts allowed per question"
        }
      });
    }
  
    if (error.code === 'CREATION_FAILED') {
      return res.status(409).json({
        success: false,
        message: "Unable to create submission after multiple attempts",
        error: {
          code: "SUBMISSION_PROCESSING_ERROR",
          details: "Please try again in a moment"
        }
      });
    }
  
    if (error.code === 11000 || error.message.includes('E11000')) {
      console.error('Duplicate key error:', error);
      return res.status(409).json({
        success: false,
        message: "Submission processing failed due to duplicate entry",
        error: {
          code: "DUPLICATE_SUBMISSION_ERROR",
          details: "This submission already exists. Please refresh and try again."
        }
      });
    }
  
    res.status(500).json({
      success: false,
      message: "Internal server error",
      error: {
        code: "SERVER_ERROR",
        details: error.message
      }
    });
  };
  
  module.exports = {
    submitAnswer,
    getEvaluation,
    getSubmissionStatus,
    getLatestAnswer,
    getUserAttempts,
    getAttemptByNumber,
    getEvaluations,
    getCompleteQuestionData,
    reevaluateAnswer,
    bulkUpdateEvaluation,
    adminUpdateEvaluation,
    submitEvaluationFeedback
  };
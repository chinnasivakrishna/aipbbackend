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
  } = require('./service/userAnswers');
  
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
    adminUpdateEvaluation
  };
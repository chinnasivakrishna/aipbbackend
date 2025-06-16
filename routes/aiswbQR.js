const express = require('express');
const router = express.Router();
const QRCode = require('qrcode');
const Question = require('../models/AiswbQuestion');
const AISWBSet = require('../models/AISWBSet');
const { validationResult, param, query } = require('express-validator');

// Validation middleware
const validateQuestionId = [
  param('questionId')
    .isMongoId()
    .withMessage('Question ID must be a valid MongoDB ObjectId')
];

const validateSetId = [
  param('setId')
    .isMongoId()
    .withMessage('Set ID must be a valid MongoDB ObjectId')
];

const validateQROptions = [
  query('size')
    .optional()
    .isInt({ min: 100, max: 1000 })
    .withMessage('Size must be between 100 and 1000 pixels'),
  query('frontendBaseUrl')
    .optional()
    .isURL()
    .withMessage('Frontend base URL must be a valid URL')
];

// ==================== QR CODE GENERATION ROUTES ====================

// Generate QR code for a single question (URL only)
router.get('/questions/:questionId/qrcode', 
  validateQuestionId,
  validateQROptions,
  async (req, res) => {
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

      const { questionId } = req.params;
      const { size = 300, frontendBaseUrl } = req.query;

      // Verify question exists
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

      // Generate frontend URL or fallback to API URL
      const baseUrl = frontendBaseUrl || `${req.protocol}://${req.get('host')}`;
      const qrUrl = frontendBaseUrl 
        ? `${frontendBaseUrl}/question/${questionId}`
        : `${baseUrl}/api/aiswb/qr/questions/${questionId}/view`;

      // QR code options for better scanning
      const qrCodeOptions = {
        width: parseInt(size),
        margin: 2,
        color: {
          dark: '#000000',
          light: '#FFFFFF'
        },
        errorCorrectionLevel: 'H' // High error correction for better scanning
      };

      const qrCodeDataURL = await QRCode.toDataURL(qrUrl, qrCodeOptions);

      res.status(200).json({
        success: true,
        data: {
          questionId: question._id.toString(),
          qrCode: qrCodeDataURL,
          url: qrUrl,
          size: parseInt(size),
          metadata: {
            questionPreview: question.question.substring(0, 100) + '...',
            difficultyLevel: question.metadata.difficultyLevel,
            maximumMarks: question.metadata.maximumMarks,
            languageMode: question.languageMode
          }
        }
      });

    } catch (error) {
      console.error('Generate question QR code error:', error);
      res.status(500).json({
        success: false,
        message: "Internal server error",
        error: {
          code: "SERVER_ERROR",
          details: error.message
        }
      });
    }
  }
);

// Generate QR code for a question set (URL only)
router.get('/sets/:setId/qrcode',
  validateSetId,
  validateQROptions,
  async (req, res) => {
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
      const { size = 300, frontendBaseUrl } = req.query;

      // Verify set exists
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

      // Generate frontend URL or fallback to API URL
      const baseUrl = frontendBaseUrl || `${req.protocol}://${req.get('host')}`;
      const qrUrl = frontendBaseUrl 
        ? `${frontendBaseUrl}/set/${setId}`
        : `${baseUrl}/api/aiswb/qr/sets/${setId}/view`;

      const qrCodeOptions = {
        width: parseInt(size),
        margin: 2,
        color: {
          dark: '#000000',
          light: '#FFFFFF'
        },
        errorCorrectionLevel: 'H'
      };

      const qrCodeDataURL = await QRCode.toDataURL(qrUrl, qrCodeOptions);

      res.status(200).json({
        success: true,
        data: {
          setId: set._id.toString(),
          setName: set.name,
          qrCode: qrCodeDataURL,
          url: qrUrl,
          size: parseInt(size),
          metadata: {
            itemType: set.itemType,
            totalQuestions: set.questions.length,
            difficultyBreakdown: set.questions.reduce((acc, q) => {
              acc[q.metadata.difficultyLevel] = (acc[q.metadata.difficultyLevel] || 0) + 1;
              return acc;
            }, {})
          }
        }
      });

    } catch (error) {
      console.error('Generate set QR code error:', error);
      res.status(500).json({
        success: false,
        message: "Internal server error",
        error: {
          code: "SERVER_ERROR",
          details: error.message
        }
      });
    }
  }
);

// Generate batch QR codes for multiple questions (URLs only)
router.post('/questions/batch/qrcode',
  validateQROptions,
  async (req, res) => {
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

      const { questionIds } = req.body;
      const { size = 300, frontendBaseUrl } = req.query;

      if (!questionIds || !Array.isArray(questionIds) || questionIds.length === 0) {
        return res.status(400).json({
          success: false,
          message: "Question IDs array is required",
          error: {
            code: "INVALID_INPUT",
            details: "questionIds must be a non-empty array"
          }
        });
      }

      // Find all questions
      const questions = await Question.find({ _id: { $in: questionIds } });
      
      if (questions.length === 0) {
        return res.status(404).json({
          success: false,
          message: "No questions found",
          error: {
            code: "QUESTIONS_NOT_FOUND",
            details: "None of the specified questions exist"
          }
        });
      }

      const baseUrl = frontendBaseUrl || `${req.protocol}://${req.get('host')}`;
      const qrCodes = [];

      const qrCodeOptions = {
        width: parseInt(size),
        margin: 2,
        color: {
          dark: '#000000',
          light: '#FFFFFF'
        },
        errorCorrectionLevel: 'H'
      };

      // Generate QR code for each question
      for (const question of questions) {
        const qrUrl = frontendBaseUrl 
          ? `${frontendBaseUrl}/question/${question._id}`
          : `${baseUrl}/api/aiswb/qr/questions/${question._id}/view`;

        try {
          const qrCodeDataURL = await QRCode.toDataURL(qrUrl, qrCodeOptions);

          qrCodes.push({
            questionId: question._id.toString(),
            questionPreview: question.question.substring(0, 100) + '...',
            qrCode: qrCodeDataURL,
            url: qrUrl,
            metadata: {
              difficultyLevel: question.metadata.difficultyLevel,
              maximumMarks: question.metadata.maximumMarks,
              languageMode: question.languageMode
            }
          });
        } catch (qrError) {
          console.error(`QR generation failed for question ${question._id}:`, qrError);
          qrCodes.push({
            questionId: question._id.toString(),
            questionPreview: question.question.substring(0, 100) + '...',
            error: 'QR generation failed',
            url: qrUrl
          });
        }
      }

      res.status(200).json({
        success: true,
        data: {
          totalRequested: questionIds.length,
          totalGenerated: qrCodes.filter(qr => qr.qrCode).length,
          size: parseInt(size),
          qrCodes
        }
      });

    } catch (error) {
      console.error('Generate batch QR codes error:', error);
      res.status(500).json({
        success: false,
        message: "Internal server error",
        error: {
          code: "SERVER_ERROR",
          details: error.message
        }
      });
    }
  }
);

// ==================== DATA RETRIEVAL ROUTES ====================

// Get single question data (for QR code scanning)
router.get('/questions/:questionId/view', 
  validateQuestionId,
  async (req, res) => {
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

      const { questionId } = req.params;
      const { includeAnswers = 'false' } = req.query;

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

      const responseData = {
        id: question._id.toString(),
        question: question.question,
        modalAnswer: question.modalAnswer,
        detailedAnswer: question.detailedAnswer,
        answerVideoUrls: question.answerVideoUrls,
        metadata: {
          keywords: question.metadata.keywords,
          difficultyLevel: question.metadata.difficultyLevel,
          wordLimit: question.metadata.wordLimit,
          estimatedTime: question.metadata.estimatedTime,
          maximumMarks: question.metadata.maximumMarks,
          qualityParameters: question.metadata.qualityParameters
        },
        languageMode: question.languageMode,
        evaluationMode: question.evaluationMode,
        setId: question.setId
      };

      // Include detailed answer only if requested
      if (includeAnswers === 'true') {
        responseData.detailedAnswer = question.detailedAnswer;
      }

      res.status(200).json({
        success: true,
        data: responseData
      });

    } catch (error) {
      console.error('Get question view error:', error);
      res.status(500).json({
        success: false,
        message: "Internal server error",
        error: {
          code: "SERVER_ERROR",
          details: error.message
        }
      });
    }
  }
);

// Get question set data (for QR code scanning)
router.get('/sets/:setId/view',
  validateSetId,
  async (req, res) => {
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
      const { includeAnswers = 'false', page = 1, limit = 10 } = req.query;

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

      // Pagination for questions
      const skip = (parseInt(page) - 1) * parseInt(limit);
      const questions = await Question.find({ setId: setId })
        .select(includeAnswers === 'true' ? '' : '-detailedAnswer')
        .skip(skip)
        .limit(parseInt(limit))
        .sort({ createdAt: 1 });

      const totalQuestions = await Question.countDocuments({ setId: setId });

      const responseData = {
        set: {
          id: set._id.toString(),
          name: set.name,
          itemType: set.itemType,
          itemId: set.itemId.toString(),
          isWorkbook: set.isWorkbook,
          totalQuestions: totalQuestions
        },
        questions: questions.map(q => ({
          id: q._id.toString(),
          question: q.question,
          ...(includeAnswers === 'true' && { detailedAnswer: q.detailedAnswer }),
          modalAnswer: q.modalAnswer,
          answerVideoUrls: q.answerVideoUrls,
          metadata: q.metadata,
          languageMode: q.languageMode,
          evaluationMode: q.evaluationMode
        })),
        pagination: {
          currentPage: parseInt(page),
          totalPages: Math.ceil(totalQuestions / parseInt(limit)),
          totalQuestions: totalQuestions,
          questionsPerPage: parseInt(limit),
          hasNextPage: skip + questions.length < totalQuestions,
          hasPrevPage: parseInt(page) > 1
        }
      };

      res.status(200).json({
        success: true,
        data: responseData
      });

    } catch (error) {
      console.error('Get set view error:', error);
      res.status(500).json({
        success: false,
        message: "Internal server error",
        error: {
          code: "SERVER_ERROR",
          details: error.message
        }
      });
    }
  }
);

// Get multiple questions data (for batch QR scanning)
router.post('/questions/batch/view',
  async (req, res) => {
    try {
      const { questionIds } = req.body;
      const { includeAnswers = 'false' } = req.query;

      if (!questionIds || !Array.isArray(questionIds) || questionIds.length === 0) {
        return res.status(400).json({
          success: false,
          message: "Question IDs array is required",
          error: {
            code: "INVALID_INPUT",
            details: "questionIds must be a non-empty array"
          }
        });
      }

      const questions = await Question.find({ _id: { $in: questionIds } })
        .select(includeAnswers === 'true' ? '' : '-detailedAnswer');

      if (questions.length === 0) {
        return res.status(404).json({
          success: false,
          message: "No questions found",
          error: {
            code: "QUESTIONS_NOT_FOUND",
            details: "None of the specified questions exist"
          }
        });
      }

      const responseData = questions.map(q => ({
        id: q._id.toString(),
        question: q.question,
        ...(includeAnswers === 'true' && { detailedAnswer: q.detailedAnswer }),
        modalAnswer: q.modalAnswer,
        answerVideoUrls: q.answerVideoUrls,
        metadata: q.metadata,
        languageMode: q.languageMode,
        evaluationMode: q.evaluationMode,
        setId: q.setId
      }));

      res.status(200).json({
        success: true,
        data: {
          totalRequested: questionIds.length,
          totalFound: questions.length,
          questions: responseData
        }
      });

    } catch (error) {
      console.error('Get batch questions view error:', error);
      res.status(500).json({
        success: false,
        message: "Internal server error",
        error: {
          code: "SERVER_ERROR",
          details: error.message
        }
      });
    }
  }
);

module.exports = router;
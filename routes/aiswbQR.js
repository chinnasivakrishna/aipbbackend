const express = require('express');
const router = express.Router();
const QRCode = require('qrcode');
const Question = require('../models/AiswbQuestion');
const AISWBSet = require('../models/AISWBSet');
const Book = require('../models/Book');
const Workbook = require('../models/Workbook'); // Add Workbook import
const User = require('../models/User');
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
  query('clientId')
    .optional()
    .isString()
    .withMessage('Client ID must be a string')
];

// Helper function to get client name by clientId
async function getClientName(clientId) {
  try {
    const client = await User.findOne({ 
      $or: [
        { userId: clientId },
      ],
      role: 'client' 
    });
    
    if (client) {
      return client.businessName || client.name;
    }
    
    return null;
  } catch (error) {
    console.error('Error fetching client:', error);
    return null;
  }
}

// Updated helper function to get client info from question/set (supports both books and workbooks)
async function getClientInfoFromQuestion(questionId) {
  try {
    const question = await Question.findById(questionId).populate('setId');
    if (!question || !question.setId) {
      return null;
    }

    return await getClientInfoFromSet(question.setId._id);
  } catch (error) {
    console.error('Error fetching client info from question:', error);
    return null;
  }
}

// Updated helper function to get client info from set (supports both books and workbooks)
async function getClientInfoFromSet(setId) {
  try {
    const set = await AISWBSet.findById(setId);
    if (!set) {
      return null;
    }

    let clientId = null;
    let clientName = null;

    // Check if it's a workbook or book based on itemType or isWorkbook flag
    if (set.itemType === 'workbook' || set.isWorkbook) {
      // Get workbook associated with the set
      const workbook = await Workbook.findById(set.itemId).populate('user');
      if (workbook && workbook.user) {
        // For workbooks, the client is the user who created the workbook
        if (workbook.user.role === 'client') {
          clientId = workbook.user.userId;
          clientName = workbook.user.businessName || workbook.user.name;
        } else {
          // If user is not a client, we might need to handle this case differently
          // For now, using the user's name
          clientName = workbook.user.name;
          clientId = workbook.user._id.toString(); // fallback to user ID
        }
      }
    } else {
      // Get book associated with the set
      const book = await Book.findById(set.itemId);
      if (book && book.clientId) {
        clientId = book.clientId;
        clientName = await getClientName(book.clientId);
      }
    }

    if (!clientName) {
      return null;
    }

    return {
      clientId: clientId,
      clientName: clientName
    };
  } catch (error) {
    console.error('Error fetching client info from set:', error);
    return null;
  }
}

// ==================== QR CODE GENERATION ROUTES ====================

// Generate QR code for a single question (URL with client name)
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
      const { size = 300, clientId } = req.query;

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

      // Get client information
      let clientInfo = null;
      if (clientId) {
        const clientName = await getClientName(clientId);
        clientInfo = { clientId, clientName };
      } else {
        clientInfo = await getClientInfoFromQuestion(questionId);
      }

      if (!clientInfo || !clientInfo.clientName) {
        return res.status(404).json({
          success: false,
          message: "Client information not found",
          error: {
            code: "CLIENT_NOT_FOUND",
            details: "Unable to determine client information for this question"
          }
        });
      }

      // Generate frontend URL with client name and question ID
      const frontendBaseUrl = 'https://www.ailisher.com';
      const encodedClientName = encodeURIComponent(clientInfo.clientName);
      const qrUrl = `${frontendBaseUrl}/question/${questionId}?client=${encodedClientName}&clientId=${clientInfo.clientId}`;

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
          clientId: clientInfo.clientId,
          clientName: clientInfo.clientName,
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

// Generate QR code for a question set (URL with client name)
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
      const { size = 300, clientId } = req.query;

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

      // Get client information
      let clientInfo = null;
      if (clientId) {
        const clientName = await getClientName(clientId);
        clientInfo = { clientId, clientName };
      } else {
        clientInfo = await getClientInfoFromSet(setId);
      }

      if (!clientInfo || !clientInfo.clientName) {
        return res.status(404).json({
          success: false,
          message: "Client information not found",
          error: {
            code: "CLIENT_NOT_FOUND",
            details: "Unable to determine client information for this set"
          }
        });
      }

      // Generate frontend URL with client name and set ID
      const frontendBaseUrl = 'https://www.ailisher.com';
      const encodedClientName = encodeURIComponent(clientInfo.clientName);
      const qrUrl = `${frontendBaseUrl}/set/${setId}?client=${encodedClientName}&clientId=${clientInfo.clientId}`;

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
          clientId: clientInfo.clientId,
          clientName: clientInfo.clientName,
          qrCode: qrCodeDataURL,
          url: qrUrl,
          size: parseInt(size),
          metadata: {
            itemType: set.itemType,
            isWorkbook: set.isWorkbook,
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

// Generate batch QR codes for multiple questions (URLs with client names)
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
      const { size = 300, clientId } = req.query;

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

      const frontendBaseUrl = 'https://www.ailisher.com';
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
        try {
          // Get client information for this question
          let clientInfo = null;
          if (clientId) {
            const clientName = await getClientName(clientId);
            clientInfo = { clientId, clientName };
          } else {
            clientInfo = await getClientInfoFromQuestion(question._id);
          }

          if (!clientInfo || !clientInfo.clientName) {
            qrCodes.push({
              questionId: question._id.toString(),
              questionPreview: question.question.substring(0, 100) + '...',
              error: 'Client information not found'
            });
            continue;
          }

          const encodedClientName = encodeURIComponent(clientInfo.clientName);
          const qrUrl = `${frontendBaseUrl}/question/${question._id}?client=${encodedClientName}&clientId=${clientInfo.clientId}`;

          const qrCodeDataURL = await QRCode.toDataURL(qrUrl, qrCodeOptions);

          qrCodes.push({
            questionId: question._id.toString(),
            questionPreview: question.question.substring(0, 100) + '...',
            clientId: clientInfo.clientId,
            clientName: clientInfo.clientName,
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
            error: 'QR generation failed'
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

// Get single question data (for QR code scanning) - now includes client info in response
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

      // Get client information
      const clientInfo = await getClientInfoFromQuestion(questionId);

      const responseData = {
        id: question._id.toString(),
        question: question.question,
        modalAnswer: question.modalAnswer,
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
        setId: question.setId,
        // Include client information
        clientInfo: clientInfo
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

// Get question set data (for QR code scanning) - now includes client info in response
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

      // Get client information
      const clientInfo = await getClientInfoFromSet(setId);

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
        // Include client information
        clientInfo: clientInfo,
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

// Get multiple questions data (for batch QR scanning) - now includes client info
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

      const responseData = [];
      
      // Get client info for each question
      for (const q of questions) {
        const clientInfo = await getClientInfoFromQuestion(q._id);
        
        responseData.push({
          id: q._id.toString(),
          question: q.question,
          ...(includeAnswers === 'true' && { detailedAnswer: q.detailedAnswer }),
          modalAnswer: q.modalAnswer,
          answerVideoUrls: q.answerVideoUrls,
          metadata: q.metadata,
          languageMode: q.languageMode,
          evaluationMode: q.evaluationMode,
          setId: q.setId,
          clientInfo: clientInfo
        });
      }

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
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
  query('format')
    .optional()
    .isIn(['json', 'url', 'text'])
    .withMessage('Format must be json, url, or text'),
  query('size')
    .optional()
    .isInt({ min: 100, max: 1000 })
    .withMessage('Size must be between 100 and 1000 pixels'),
  query('includeAnswers')
    .optional()
    .isBoolean()
    .withMessage('includeAnswers must be a boolean')
];

// Generate QR code for a single question
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
      const { 
        format = 'json', 
        size = 300, 
        includeAnswers = true 
      } = req.query;

      // Find the question
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

      // Prepare question data based on format
      let qrData;
      const baseUrl = `${req.protocol}://${req.get('host')}`;

      switch (format) {
        case 'url':
          qrData = `${baseUrl}/api/aiswb/questions/${questionId}`;
          break;
        
        case 'text':
          qrData = `Question: ${question.question}\n`;
          if (includeAnswers === 'true') {
            qrData += `Answer: ${question.detailedAnswer}\n`;
          }
          qrData += `Difficulty: ${question.metadata.difficultyLevel}\n`;
          qrData += `Word Limit: ${question.metadata.wordLimit}\n`;
          qrData += `Time: ${question.metadata.estimatedTime} minutes\n`;
          qrData += `Marks: ${question.metadata.maximumMarks}`;
          break;
        
        default: // json
          qrData = JSON.stringify({
            id: question._id.toString(),
            question: question.question,
            ...(includeAnswers === 'true' && {
              detailedAnswer: question.detailedAnswer,
              modalAnswer: question.modalAnswer
            }),
            metadata: {
              keywords: question.metadata.keywords,
              difficultyLevel: question.metadata.difficultyLevel,
              wordLimit: question.metadata.wordLimit,
              estimatedTime: question.metadata.estimatedTime,
              maximumMarks: question.metadata.maximumMarks,
              qualityParameters: question.metadata.qualityParameters
            },
            languageMode: question.languageMode,
            apiUrl: `${baseUrl}/api/aiswb/questions/${questionId}`
          });
          break;
      }

      // Generate QR code
      const qrCodeOptions = {
        width: parseInt(size),
        margin: 2,
        color: {
          dark: '#000000',
          light: '#FFFFFF'
        }
      };

      const qrCodeDataURL = await QRCode.toDataURL(qrData, qrCodeOptions);

      res.status(200).json({
        success: true,
        data: {
          questionId: question._id.toString(),
          qrCode: qrCodeDataURL,
          format,
          size: parseInt(size),
          includeAnswers: includeAnswers === 'true',
          dataSize: qrData.length,
          metadata: {
            question: question.question.substring(0, 100) + (question.question.length > 100 ? '...' : ''),
            difficultyLevel: question.metadata.difficultyLevel,
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

// Generate QR code for all questions in a set
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
      const { 
        format = 'json', 
        size = 300, 
        includeAnswers = true 
      } = req.query;

      // Find the set with populated questions
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

      const baseUrl = `${req.protocol}://${req.get('host')}`;
      let qrData;

      switch (format) {
        case 'url':
          qrData = `${baseUrl}/api/aiswb/sets/${setId}/questions`;
          break;
        
        case 'text':
          qrData = `Question Set: ${set.name}\n`;
          qrData += `Total Questions: ${set.questions.length}\n\n`;
          set.questions.forEach((question, index) => {
            qrData += `${index + 1}. ${question.question}\n`;
            if (includeAnswers === 'true') {
              qrData += `Answer: ${question.detailedAnswer}\n`;
            }
            qrData += `Difficulty: ${question.metadata.difficultyLevel} | `;
            qrData += `Marks: ${question.metadata.maximumMarks}\n\n`;
          });
          break;
        
        default: // json
          qrData = JSON.stringify({
            setId: set._id.toString(),
            setName: set.name,
            itemType: set.itemType,
            totalQuestions: set.questions.length,
            questions: set.questions.map(question => ({
              id: question._id.toString(),
              question: question.question,
              ...(includeAnswers === 'true' && {
                detailedAnswer: question.detailedAnswer,
                modalAnswer: question.modalAnswer
              }),
              metadata: {
                keywords: question.metadata.keywords,
                difficultyLevel: question.metadata.difficultyLevel,
                wordLimit: question.metadata.wordLimit,
                estimatedTime: question.metadata.estimatedTime,
                maximumMarks: question.metadata.maximumMarks
              },
              languageMode: question.languageMode
            })),
            apiUrl: `${baseUrl}/api/aiswb/sets/${setId}/questions`
          });
          break;
      }

      // Generate QR code
      const qrCodeOptions = {
        width: parseInt(size),
        margin: 2,
        color: {
          dark: '#000000',
          light: '#FFFFFF'
        }
      };

      const qrCodeDataURL = await QRCode.toDataURL(qrData, qrCodeOptions);

      res.status(200).json({
        success: true,
        data: {
          setId: set._id.toString(),
          setName: set.name,
          qrCode: qrCodeDataURL,
          format,
          size: parseInt(size),
          includeAnswers: includeAnswers === 'true',
          dataSize: qrData.length,
          questionsCount: set.questions.length,
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

// Generate batch QR codes for multiple questions
router.post('/questions/batch/qrcode',
  [
    query('format')
      .optional()
      .isIn(['json', 'url', 'text'])
      .withMessage('Format must be json, url, or text'),
    query('size')
      .optional()
      .isInt({ min: 100, max: 1000 })
      .withMessage('Size must be between 100 and 1000 pixels'),
    query('includeAnswers')
      .optional()
      .isBoolean()
      .withMessage('includeAnswers must be a boolean')
  ],
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
      const { 
        format = 'json', 
        size = 300, 
        includeAnswers = true 
      } = req.query;

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

      const baseUrl = `${req.protocol}://${req.get('host')}`;
      const qrCodes = [];

      const qrCodeOptions = {
        width: parseInt(size),
        margin: 2,
        color: {
          dark: '#000000',
          light: '#FFFFFF'
        }
      };

      // Generate QR code for each question
      for (const question of questions) {
        let qrData;

        switch (format) {
          case 'url':
            qrData = `${baseUrl}/api/aiswb/questions/${question._id}`;
            break;
          
          case 'text':
            qrData = `Question: ${question.question}\n`;
            if (includeAnswers === 'true') {
              qrData += `Answer: ${question.detailedAnswer}\n`;
            }
            qrData += `Difficulty: ${question.metadata.difficultyLevel}\n`;
            qrData += `Marks: ${question.metadata.maximumMarks}`;
            break;
          
          default: // json
            qrData = JSON.stringify({
              id: question._id.toString(),
              question: question.question,
              ...(includeAnswers === 'true' && {
                detailedAnswer: question.detailedAnswer,
                modalAnswer: question.modalAnswer
              }),
              metadata: question.metadata,
              languageMode: question.languageMode,
              apiUrl: `${baseUrl}/api/aiswb/questions/${question._id}`
            });
            break;
        }

        const qrCodeDataURL = await QRCode.toDataURL(qrData, qrCodeOptions);

        qrCodes.push({
          questionId: question._id.toString(),
          question: question.question.substring(0, 100) + (question.question.length > 100 ? '...' : ''),
          qrCode: qrCodeDataURL,
          dataSize: qrData.length,
          metadata: {
            difficultyLevel: question.metadata.difficultyLevel,
            maximumMarks: question.metadata.maximumMarks,
            languageMode: question.languageMode
          }
        });
      }

      res.status(200).json({
        success: true,
        data: {
          totalRequested: questionIds.length,
          totalGenerated: qrCodes.length,
          format,
          size: parseInt(size),
          includeAnswers: includeAnswers === 'true',
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

module.exports = router;
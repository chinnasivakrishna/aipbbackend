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
    .isIn(['json', 'url', 'text', 'minimal'])
    .withMessage('Format must be json, url, text, or minimal'),
  query('size')
    .optional()
    .isInt({ min: 100, max: 1000 })
    .withMessage('Size must be between 100 and 1000 pixels'),
  query('includeAnswers')
    .optional()
    .isBoolean()
    .withMessage('includeAnswers must be a boolean'),
  query('maxLength')
    .optional()
    .isInt({ min: 100, max: 2000 })
    .withMessage('maxLength must be between 100 and 2000 characters')
];

// Helper function to truncate text
const truncateText = (text, maxLength) => {
  if (!text) return '';
  return text.length > maxLength ? text.substring(0, maxLength - 3) + '...' : text;
};

// Helper function to create minimal question data
const createMinimalQuestionData = (question, baseUrl, includeAnswers = false) => {
  return {
    id: question._id.toString(),
    q: truncateText(question.question, 200), // Shortened question
    ...(includeAnswers && question.detailedAnswer && {
      a: truncateText(question.detailedAnswer, 300) // Shortened answer
    }),
    d: question.metadata.difficultyLevel,
    m: question.metadata.maximumMarks,
    t: question.metadata.estimatedTime,
    url: `${baseUrl}/api/aiswb/questions/${question._id}`
  };
};

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
        format = 'minimal', 
        size = 300, 
        includeAnswers = false,
        maxLength = 1000
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
          qrData = `Q: ${truncateText(question.question, 200)}\n`;
          if (includeAnswers === 'true' && question.detailedAnswer) {
            qrData += `A: ${truncateText(question.detailedAnswer, 300)}\n`;
          }
          qrData += `Level: ${question.metadata.difficultyLevel}\n`;
          qrData += `Marks: ${question.metadata.maximumMarks}`;
          break;
        
        case 'minimal':
          qrData = JSON.stringify(createMinimalQuestionData(question, baseUrl, includeAnswers === 'true'));
          break;
        
        default: // json - but optimized
          const optimizedData = {
            id: question._id.toString(),
            question: truncateText(question.question, 300),
            ...(includeAnswers === 'true' && question.detailedAnswer && {
              answer: truncateText(question.detailedAnswer, 400)
            }),
            meta: {
              difficulty: question.metadata.difficultyLevel,
              marks: question.metadata.maximumMarks,
              time: question.metadata.estimatedTime,
              ...(question.metadata.keywords?.length > 0 && {
                keywords: question.metadata.keywords.slice(0, 3) // Limit keywords
              })
            },
            url: `${baseUrl}/api/aiswb/questions/${questionId}`
          };
          qrData = JSON.stringify(optimizedData);
          break;
      }

      // Check if data is too long
      if (qrData.length > parseInt(maxLength)) {
        // Try to create a URL-only QR code as fallback
        qrData = `${baseUrl}/api/aiswb/questions/${questionId}`;
        
        // If still too long, create a minimal ID-only QR
        if (qrData.length > parseInt(maxLength)) {
          qrData = JSON.stringify({
            id: questionId,
            url: `${baseUrl}/api/aiswb/questions/${questionId}`
          });
        }
      }

      // Generate QR code with error correction
      const qrCodeOptions = {
        width: parseInt(size),
        margin: 2,
        color: {
          dark: '#000000',
          light: '#FFFFFF'
        },
        errorCorrectionLevel: 'M' // Medium error correction
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
          truncated: qrData.length >= parseInt(maxLength),
          metadata: {
            question: truncateText(question.question, 100),
            difficultyLevel: question.metadata.difficultyLevel,
            languageMode: question.languageMode
          }
        }
      });

    } catch (error) {
      console.error('Generate question QR code error:', error);
      
      // If QR generation fails due to data size, try URL fallback
      if (error.message.includes('too big') || error.message.includes('data')) {
        try {
          const baseUrl = `${req.protocol}://${req.get('host')}`;
          const fallbackData = `${baseUrl}/api/aiswb/questions/${req.params.questionId}`;
          
          const qrCodeOptions = {
            width: parseInt(req.query.size || 300),
            margin: 2,
            errorCorrectionLevel: 'M'
          };
          
          const fallbackQR = await QRCode.toDataURL(fallbackData, qrCodeOptions);
          
          return res.status(200).json({
            success: true,
            data: {
              questionId: req.params.questionId,
              qrCode: fallbackQR,
              format: 'url',
              size: parseInt(req.query.size || 300),
              fallback: true,
              message: 'Generated URL-only QR code due to data size limitations'
            }
          });
        } catch (fallbackError) {
          console.error('Fallback QR generation failed:', fallbackError);
        }
      }
      
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
        format = 'minimal', 
        size = 300, 
        includeAnswers = false,
        maxLength = 1500
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
          qrData = `Set: ${truncateText(set.name, 50)}\n`;
          qrData += `Questions: ${set.questions.length}\n`;
          // Only include first few questions for text format
          set.questions.slice(0, 3).forEach((question, index) => {
            qrData += `${index + 1}. ${truncateText(question.question, 100)}\n`;
          });
          if (set.questions.length > 3) {
            qrData += `... and ${set.questions.length - 3} more`;
          }
          break;
        
        case 'minimal':
          qrData = JSON.stringify({
            id: set._id.toString(),
            name: truncateText(set.name, 50),
            count: set.questions.length,
            questions: set.questions.slice(0, 5).map(q => ({ // Limit to first 5 questions
              id: q._id.toString(),
              q: truncateText(q.question, 100),
              d: q.metadata.difficultyLevel,
              m: q.metadata.maximumMarks
            })),
            url: `${baseUrl}/api/aiswb/sets/${setId}/questions`
          });
          break;
        
        default: // json - optimized
          qrData = JSON.stringify({
            setId: set._id.toString(),
            name: truncateText(set.name, 100),
            total: set.questions.length,
            preview: set.questions.slice(0, 3).map(q => ({
              id: q._id.toString(),
              question: truncateText(q.question, 150),
              difficulty: q.metadata.difficultyLevel,
              marks: q.metadata.maximumMarks
            })),
            url: `${baseUrl}/api/aiswb/sets/${setId}/questions`
          });
          break;
      }

      // Check data size and apply fallback if needed
      if (qrData.length > parseInt(maxLength)) {
        qrData = `${baseUrl}/api/aiswb/sets/${setId}/questions`;
      }

      // Generate QR code
      const qrCodeOptions = {
        width: parseInt(size),
        margin: 2,
        color: {
          dark: '#000000',
          light: '#FFFFFF'
        },
        errorCorrectionLevel: 'M'
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
          truncated: qrData.length >= parseInt(maxLength),
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
      
      // Fallback for set QR codes
      if (error.message.includes('too big') || error.message.includes('data')) {
        try {
          const baseUrl = `${req.protocol}://${req.get('host')}`;
          const fallbackData = `${baseUrl}/api/aiswb/sets/${req.params.setId}/questions`;
          
          const qrCodeOptions = {
            width: parseInt(req.query.size || 300),
            margin: 2,
            errorCorrectionLevel: 'M'
          };
          
          const fallbackQR = await QRCode.toDataURL(fallbackData, qrCodeOptions);
          
          return res.status(200).json({
            success: true,
            data: {
              setId: req.params.setId,
              qrCode: fallbackQR,
              format: 'url',
              size: parseInt(req.query.size || 300),
              fallback: true,
              message: 'Generated URL-only QR code due to data size limitations'
            }
          });
        } catch (fallbackError) {
          console.error('Fallback QR generation failed:', fallbackError);
        }
      }
      
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
      .isIn(['json', 'url', 'text', 'minimal'])
      .withMessage('Format must be json, url, text, or minimal'),
    query('size')
      .optional()
      .isInt({ min: 100, max: 1000 })
      .withMessage('Size must be between 100 and 1000 pixels'),
    query('includeAnswers')
      .optional()
      .isBoolean()
      .withMessage('includeAnswers must be a boolean'),
    query('maxLength')
      .optional()
      .isInt({ min: 100, max: 2000 })
      .withMessage('maxLength must be between 100 and 2000 characters')
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
        format = 'minimal', 
        size = 300, 
        includeAnswers = false,
        maxLength = 1000
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
        },
        errorCorrectionLevel: 'M'
      };

      // Generate QR code for each question
      for (const question of questions) {
        let qrData;

        switch (format) {
          case 'url':
            qrData = `${baseUrl}/api/aiswb/questions/${question._id}`;
            break;
          
          case 'text':
            qrData = `Q: ${truncateText(question.question, 200)}\n`;
            if (includeAnswers === 'true' && question.detailedAnswer) {
              qrData += `A: ${truncateText(question.detailedAnswer, 200)}\n`;
            }
            qrData += `Level: ${question.metadata.difficultyLevel}\n`;
            qrData += `Marks: ${question.metadata.maximumMarks}`;
            break;
          
          case 'minimal':
            qrData = JSON.stringify(createMinimalQuestionData(question, baseUrl, includeAnswers === 'true'));
            break;
          
          default: // json - optimized
            qrData = JSON.stringify({
              id: question._id.toString(),
              question: truncateText(question.question, 250),
              ...(includeAnswers === 'true' && question.detailedAnswer && {
                answer: truncateText(question.detailedAnswer, 300)
              }),
              difficulty: question.metadata.difficultyLevel,
              marks: question.metadata.maximumMarks,
              url: `${baseUrl}/api/aiswb/questions/${question._id}`
            });
            break;
        }

        // Apply length limit with fallback
        if (qrData.length > parseInt(maxLength)) {
          qrData = `${baseUrl}/api/aiswb/questions/${question._id}`;
        }

        try {
          const qrCodeDataURL = await QRCode.toDataURL(qrData, qrCodeOptions);

          qrCodes.push({
            questionId: question._id.toString(),
            question: truncateText(question.question, 100),
            qrCode: qrCodeDataURL,
            dataSize: qrData.length,
            truncated: qrData.length >= parseInt(maxLength),
            metadata: {
              difficultyLevel: question.metadata.difficultyLevel,
              maximumMarks: question.metadata.maximumMarks,
              languageMode: question.languageMode
            }
          });
        } catch (qrError) {
          console.error(`QR generation failed for question ${question._id}:`, qrError);
          // Skip this question or add error info
          qrCodes.push({
            questionId: question._id.toString(),
            question: truncateText(question.question, 100),
            error: 'QR generation failed',
            dataSize: qrData.length
          });
        }
      }

      res.status(200).json({
        success: true,
        data: {
          totalRequested: questionIds.length,
          totalGenerated: qrCodes.filter(qr => qr.qrCode).length,
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
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

const createMobileDeepLink = (questionId, baseUrl) => {
  return `edtechapp://question/${questionId}?webUrl=${encodeURIComponent(`${baseUrl}/api/aiswb/questions/${questionId}`)}`;
};

// Helper function to create question data with both web and mobile formats
const createUniversalQuestionData = (question, baseUrl, includeAnswers = false) => {
  return {
    web: {
      url: `${baseUrl}/api/aiswb/questions/${question._id}`,
      title: truncateText(question.question, 100),
      description: includeAnswers ? truncateText(question.detailedAnswer, 200) : undefined
    },
    mobile: {
      deepLink: createMobileDeepLink(question._id, baseUrl),
      data: {
        id: question._id.toString(),
        q: truncateText(question.question, 200),
        ...(includeAnswers && question.detailedAnswer && {
          a: truncateText(question.detailedAnswer, 300)
        }),
        d: question.metadata.difficultyLevel,
        m: question.metadata.maximumMarks,
        t: question.metadata.estimatedTime
      }
    }
  };
};

// Generate QR code for a single question (updated)
router.get('/questions/:questionId/qrcode', 
  validateQuestionId,
  validateQROptions,
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const { questionId } = req.params;
      const { 
        format = 'universal', 
        size = 300, 
        includeAnswers = false,
        maxLength = 1000
      } = req.query;

      // Find the question
      const question = await Question.findById(questionId);
      if (!question) {
        return res.status(404).json({ error: 'Question not found' });
      }

      const baseUrl = `${req.protocol}://${req.get('host')}`;
      let qrData;

      switch (format) {
        case 'url':
          qrData = `${baseUrl}/api/aiswb/questions/${questionId}`;
          break;
        
        case 'mobile':
          qrData = createMobileDeepLink(questionId, baseUrl);
          break;
        
        case 'universal':
          qrData = JSON.stringify(createUniversalQuestionData(question, baseUrl, includeAnswers === 'true'));
          break;
        
        default:
          qrData = JSON.stringify(createUniversalQuestionData(question, baseUrl, includeAnswers === 'true'));
          break;
      }

      // Generate QR code
      const qrCodeOptions = {
        width: parseInt(size),
        margin: 2,
        color: { dark: '#000000', light: '#FFFFFF' },
        errorCorrectionLevel: 'H' // High error correction for reliability
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
          mobileDeepLink: format === 'universal' ? createMobileDeepLink(questionId, baseUrl) : undefined
        }
      });

    } catch (error) {
      console.error('Generate question QR code error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }
);

// Generate QR code for a set (updated)
router.get('/sets/:setId/qrcode',
  validateSetId,
  validateQROptions,
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const { setId } = req.params;
      const { 
        format = 'universal', 
        size = 300, 
        includeAnswers = false,
        maxLength = 1500
      } = req.query;

      // Find the set with populated questions
      const set = await AISWBSet.findById(setId).populate('questions');
      if (!set) {
        return res.status(404).json({ error: 'Set not found' });
      }

      const baseUrl = `${req.protocol}://${req.get('host')}`;
      let qrData;

      switch (format) {
        case 'url':
          qrData = `${baseUrl}/api/aiswb/sets/${setId}/questions`;
          break;
        
        case 'mobile':
          qrData = `edtechapp://set/${setId}?webUrl=${encodeURIComponent(`${baseUrl}/api/aiswb/sets/${setId}/questions`)}`;
          break;
        
        case 'universal':
          qrData = JSON.stringify({
            web: {
              url: `${baseUrl}/api/aiswb/sets/${setId}/questions`,
              title: truncateText(set.name, 100),
              description: `Set containing ${set.questions.length} questions`
            },
            mobile: {
              deepLink: `edtechapp://set/${setId}?webUrl=${encodeURIComponent(`${baseUrl}/api/aiswb/sets/${setId}/questions`)}`,
              data: {
                id: set._id.toString(),
                name: truncateText(set.name, 100),
                count: set.questions.length,
                questions: set.questions.slice(0, 5).map(q => ({
                  id: q._id.toString(),
                  q: truncateText(q.question, 100)
                }))
              }
            }
          });
          break;
        
        default:
          qrData = JSON.stringify({
            web: {
              url: `${baseUrl}/api/aiswb/sets/${setId}/questions`,
              title: truncateText(set.name, 100)
            },
            mobile: {
              deepLink: `edtechapp://set/${setId}?webUrl=${encodeURIComponent(`${baseUrl}/api/aiswb/sets/${setId}/questions`)}`
            }
          });
          break;
      }

      // Generate QR code
      const qrCodeOptions = {
        width: parseInt(size),
        margin: 2,
        color: { dark: '#000000', light: '#FFFFFF' },
        errorCorrectionLevel: 'H'
      };

      const qrCodeDataURL = await QRCode.toDataURL(qrData, qrCodeOptions);

      res.status(200).json({
        success: true,
        data: {
          setId: set._id.toString(),
          qrCode: qrCodeDataURL,
          format,
          size: parseInt(size),
          includeAnswers: includeAnswers === 'true',
          dataSize: qrData.length,
          mobileDeepLink: format === 'universal' ? `edtechapp://set/${setId}` : undefined
        }
      });

    } catch (error) {
      console.error('Generate set QR code error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }
);

// Generate batch QR codes (updated)
router.post('/questions/batch/qrcode',
  [ /* keep existing validation */ ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const { questionIds } = req.body;
      const { 
        format = 'universal', 
        size = 300, 
        includeAnswers = false,
        maxLength = 1000
      } = req.query;

      if (!questionIds || !Array.isArray(questionIds) || questionIds.length === 0) {
        return res.status(400).json({ error: 'Question IDs array is required' });
      }

      // Find all questions
      const questions = await Question.find({ _id: { $in: questionIds } });
      
      if (questions.length === 0) {
        return res.status(404).json({ error: 'No questions found' });
      }

      const baseUrl = `${req.protocol}://${req.get('host')}`;
      const qrCodes = [];

      const qrCodeOptions = {
        width: parseInt(size),
        margin: 2,
        color: { dark: '#000000', light: '#FFFFFF' },
        errorCorrectionLevel: 'H'
      };

      // Generate QR code for each question
      for (const question of questions) {
        let qrData;

        switch (format) {
          case 'url':
            qrData = `${baseUrl}/api/aiswb/questions/${question._id}`;
            break;
          
          case 'mobile':
            qrData = createMobileDeepLink(question._id, baseUrl);
            break;
          
          case 'universal':
            qrData = JSON.stringify(createUniversalQuestionData(question, baseUrl, includeAnswers === 'true'));
            break;
          
          default:
            qrData = JSON.stringify(createUniversalQuestionData(question, baseUrl, includeAnswers === 'true'));
            break;
        }

        try {
          const qrCodeDataURL = await QRCode.toDataURL(qrData, qrCodeOptions);

          qrCodes.push({
            questionId: question._id.toString(),
            qrCode: qrCodeDataURL,
            format,
            mobileDeepLink: format === 'universal' ? createMobileDeepLink(question._id, baseUrl) : undefined
          });
        } catch (qrError) {
          console.error(`QR generation failed for question ${question._id}:`, qrError);
          qrCodes.push({
            questionId: question._id.toString(),
            error: 'QR generation failed'
          });
        }
      }

      res.status(200).json({
        success: true,
        data: {
          totalRequested: questionIds.length,
          totalGenerated: qrCodes.filter(qr => qr.qrCode).length,
          qrCodes
        }
      });

    } catch (error) {
      console.error('Generate batch QR codes error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }
);

// Add a new endpoint to handle QR code data requests
router.get('/questions/:questionId/data', 
  validateQuestionId,
  async (req, res) => {
    try {
      const { questionId } = req.params;
      const userAgent = req.headers['user-agent'];
      const isMobileApp = userAgent.includes('YourAppName'); // Replace with your app's user agent identifier

      const question = await Question.findById(questionId);
      if (!question) {
        return res.status(404).json({ error: 'Question not found' });
      }

      if (isMobileApp) {
        // Return detailed data for mobile app
        res.json({
          success: true,
          type: 'question',
          data: {
            id: question._id,
            question: question.question,
            detailedAnswer: question.detailedAnswer,
            metadata: question.metadata
          }
        });
      } else {
        // Redirect web users to a web page or return minimal data
        res.json({
          success: true,
          type: 'redirect',
          url: `${req.protocol}://${req.get('host')}/questions/${questionId}`,
          title: question.question.substring(0, 100),
          description: 'Scan this QR code with the mobile app to view full content'
        });
      }
    } catch (error) {
      console.error('Question data error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }
);

module.exports = router;
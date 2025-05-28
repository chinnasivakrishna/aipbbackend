const express = require('express');
const router = express.Router();
const multer = require('multer');
const { CloudinaryStorage } = require('multer-storage-cloudinary');
const cloudinary = require('cloudinary').v2;
const UserAnswer = require('../models/UserAnswer');
const AiswbQuestion = require('../models/AiswbQuestion');
const AISWBSet = require('../models/AISWBSet');
const { validationResult, param, body, query } = require('express-validator');
const { authenticateMobileUser } = require('../middleware/mobileAuth'); // Import the auth middleware

// Configure Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

// Configure Multer with Cloudinary
const storage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: {
    folder: 'user-answers',
    allowed_formats: ['jpg', 'jpeg', 'png', 'webp', 'pdf'],
    transformation: [
      { width: 1200, height: 1600, crop: 'limit', quality: 'auto' },
      { flags: 'progressive' }
    ]
  }
});

const upload = multer({
  storage: storage,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB per file
    files: 10 // Maximum 10 files per upload
  },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/') || file.mimetype === 'application/pdf') {
      cb(null, true);
    } else {
      cb(new Error('Only image files and PDFs are allowed'), false);
    }
  }
});

// Validation middleware
const validateQuestionId = [
  param('questionId')
    .isMongoId()
    .withMessage('Question ID must be a valid MongoDB ObjectId')
];

const validateAnswerSubmission = [
  // Remove userId validation since it comes from auth token
  body('textAnswer')
    .optional()
    .isString()
    .trim()
    .isLength({ max: 5000 })
    .withMessage('Text answer must be less than 5000 characters'),
  body('timeSpent')
    .optional()
    .isInt({ min: 0 })
    .withMessage('Time spent must be a positive integer'),
  body('sourceType')
    .optional()
    .isIn(['qr_scan', 'direct_access', 'set_practice'])
    .withMessage('Invalid source type'),
  body('setId')
    .optional()
    .isMongoId()
    .withMessage('Set ID must be a valid MongoDB ObjectId')
];

// Submit answer with images - Now uses authenticated user ID
router.post('/questions/:questionId/answers',
  authenticateMobileUser, // Add authentication middleware
  validateQuestionId,
  upload.array('images', 10),
  validateAnswerSubmission,
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        // Clean up uploaded files if validation fails
        if (req.files && req.files.length > 0) {
          for (const file of req.files) {
            try {
              await cloudinary.uploader.destroy(file.filename);
            } catch (cleanupError) {
              console.error('Error cleaning up file:', cleanupError);
            }
          }
        }
        
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
      // Get userId from authenticated user instead of request body
      const userId = req.user.id;
      const { textAnswer, timeSpent, sourceType, setId, deviceInfo, appVersion } = req.body;

      // Verify question exists
      const question = await AiswbQuestion.findById(questionId);
      if (!question) {
        // Clean up uploaded files
        if (req.files && req.files.length > 0) {
          for (const file of req.files) {
            try {
              await cloudinary.uploader.destroy(file.filename);
            } catch (cleanupError) {
              console.error('Error cleaning up file:', cleanupError);
            }
          }
        }
        
        return res.status(404).json({
          success: false,
          message: "Question not found",
          error: {
            code: "QUESTION_NOT_FOUND",
            details: "The specified question does not exist"
          }
        });
      }

      // Verify set exists if provided
      let setInfo = null;
      if (setId) {
        setInfo = await AISWBSet.findById(setId);
        if (!setInfo) {
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

      // Process uploaded images
      const answerImages = [];
      if (req.files && req.files.length > 0) {
        for (const file of req.files) {
          answerImages.push({
            imageUrl: file.path,
            cloudinaryPublicId: file.filename,
            originalName: file.originalname,
            uploadedAt: new Date()
          });
        }
      }

      // Check if user already has an answer for this question
      let userAnswer = await UserAnswer.findOne({
        userId: userId,
        questionId: questionId
      });

      if (userAnswer) {
        // Update existing answer
        // Clean up old images if new ones are provided
        if (answerImages.length > 0 && userAnswer.answerImages.length > 0) {
          for (const oldImage of userAnswer.answerImages) {
            try {
              await cloudinary.uploader.destroy(oldImage.cloudinaryPublicId);
            } catch (cleanupError) {
              console.error('Error cleaning up old image:', cleanupError);
            }
          }
        }

        userAnswer.answerImages = answerImages.length > 0 ? answerImages : userAnswer.answerImages;
        userAnswer.textAnswer = textAnswer || userAnswer.textAnswer;
        userAnswer.setId = setId || userAnswer.setId;
        userAnswer.submissionStatus = 'submitted';
        userAnswer.metadata = {
          ...userAnswer.metadata,
          timeSpent: timeSpent || userAnswer.metadata.timeSpent,
          deviceInfo: deviceInfo || userAnswer.metadata.deviceInfo,
          appVersion: appVersion || userAnswer.metadata.appVersion,
          sourceType: sourceType || userAnswer.metadata.sourceType
        };
      } else {
        // Create new answer
        userAnswer = new UserAnswer({
          userId: userId,
          questionId: questionId,
          setId: setId,
          clientId: req.user.clientId, // Use clientId from authenticated user
          answerImages: answerImages,
          textAnswer: textAnswer,
          submissionStatus: 'submitted',
          metadata: {
            timeSpent: timeSpent || 0,
            deviceInfo: deviceInfo,
            appVersion: appVersion,
            sourceType: sourceType || 'qr_scan'
          }
        });
      }

      await userAnswer.save();

      res.status(200).json({
        success: true,
        message: "Answer submitted successfully",
        data: {
          answerId: userAnswer._id,
          questionId: question._id,
          userId: userId, // Include userId in response
          imagesCount: answerImages.length,
          submissionStatus: userAnswer.submissionStatus,
          submittedAt: userAnswer.submittedAt,
          question: {
            id: question._id,
            question: question.question,
            difficultyLevel: question.metadata.difficultyLevel,
            maximumMarks: question.metadata.maximumMarks,
            estimatedTime: question.metadata.estimatedTime
          },
          ...(setInfo && {
            set: {
              id: setInfo._id,
              name: setInfo.name,
              itemType: setInfo.itemType
            }
          })
        }
      });

    } catch (error) {
      console.error('Submit answer error:', error);
      
      // Clean up uploaded files in case of error
      if (req.files && req.files.length > 0) {
        for (const file of req.files) {
          try {
            await cloudinary.uploader.destroy(file.filename);
          } catch (cleanupError) {
            console.error('Error cleaning up file:', cleanupError);
          }
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

// Get user's answer for a specific question - Now uses authenticated user
router.get('/questions/:questionId/answers',
  authenticateMobileUser, // Add authentication middleware
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
      const userId = req.user.id; // Get from authenticated user

      const userAnswer = await UserAnswer.findOne({
        userId: userId,
        questionId: questionId
      }).populate('questionId', 'question detailedAnswer metadata languageMode')
        .populate('setId', 'name itemType');

      if (!userAnswer) {
        return res.status(404).json({
          success: false,
          message: "Answer not found",
          error: {
            code: "ANSWER_NOT_FOUND",
            details: "No answer found for this question and user"
          }
        });
      }

      res.status(200).json({
        success: true,
        data: {
          answer: {
            id: userAnswer._id,
            textAnswer: userAnswer.textAnswer,
            images: userAnswer.answerImages.map(img => ({
              url: img.imageUrl,
              originalName: img.originalName,
              uploadedAt: img.uploadedAt
            })),
            submissionStatus: userAnswer.submissionStatus,
            submittedAt: userAnswer.submittedAt,
            timeSpent: userAnswer.metadata.timeSpent,
            sourceType: userAnswer.metadata.sourceType
          },
          question: {
            id: userAnswer.questionId._id,
            question: userAnswer.questionId.question,
            detailedAnswer: userAnswer.questionId.detailedAnswer,
            metadata: userAnswer.questionId.metadata,
            languageMode: userAnswer.questionId.languageMode
          },
          ...(userAnswer.setId && {
            set: {
              id: userAnswer.setId._id,
              name: userAnswer.setId.name,
              itemType: userAnswer.setId.itemType
            }
          }),
          ...(userAnswer.feedback && {
            feedback: userAnswer.feedback
          })
        }
      });

    } catch (error) {
      console.error('Get user answer error:', error);
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

// Get all user's answers with pagination - Now uses authenticated user
router.get('/answers',
  authenticateMobileUser, // Add authentication middleware
  [
    query('page')
      .optional()
      .isInt({ min: 1 })
      .withMessage('Page must be a positive integer'),
    query('limit')
      .optional()
      .isInt({ min: 1, max: 50 })
      .withMessage('Limit must be between 1 and 50'),
    query('status')
      .optional()
      .isIn(['draft', 'submitted', 'reviewed'])
      .withMessage('Invalid status filter'),
    query('sourceType')
      .optional()
      .isIn(['qr_scan', 'direct_access', 'set_practice'])
      .withMessage('Invalid source type filter')
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

      const userId = req.user.id; // Get from authenticated user
      const page = parseInt(req.query.page) || 1;
      const limit = parseInt(req.query.limit) || 10;
      const skip = (page - 1) * limit;

      // Build filter
      const filter = {
        userId: userId,
        clientId: req.user.clientId // Use clientId from authenticated user
      };

      if (req.query.status) {
        filter.submissionStatus = req.query.status;
      }

      if (req.query.sourceType) {
        filter['metadata.sourceType'] = req.query.sourceType;
      }

      // Get total count
      const totalAnswers = await UserAnswer.countDocuments(filter);

      // Get paginated results
      const userAnswers = await UserAnswer.find(filter)
        .populate('questionId', 'question metadata languageMode')
        .populate('setId', 'name itemType')
        .sort({ updatedAt: -1 })
        .skip(skip)
        .limit(limit);

      const totalPages = Math.ceil(totalAnswers / limit);

      res.status(200).json({
        success: true,
        data: {
          answers: userAnswers.map(answer => ({
            id: answer._id,
            question: {
              id: answer.questionId._id,
              question: answer.questionId.question.substring(0, 200) + '...',
              difficultyLevel: answer.questionId.metadata.difficultyLevel,
              maximumMarks: answer.questionId.metadata.maximumMarks,
              languageMode: answer.questionId.languageMode
            },
            ...(answer.setId && {
              set: {
                id: answer.setId._id,
                name: answer.setId.name,
                itemType: answer.setId.itemType
              }
            }),
            imagesCount: answer.answerImages.length,
            hasTextAnswer: !!answer.textAnswer,
            submissionStatus: answer.submissionStatus,
            submittedAt: answer.submittedAt,
            timeSpent: answer.metadata.timeSpent,
            sourceType: answer.metadata.sourceType,
            updatedAt: answer.updatedAt
          })),
          pagination: {
            currentPage: page,
            totalPages: totalPages,
            totalAnswers: totalAnswers,
            hasNextPage: page < totalPages,
            hasPrevPage: page > 1
          }
        }
      });

    } catch (error) {
      console.error('Get user answers error:', error);
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

// Delete user's answer (with image cleanup) - Now uses authenticated user
router.delete('/questions/:questionId/answers',
  authenticateMobileUser, // Add authentication middleware
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
      const userId = req.user.id; // Get from authenticated user

      const userAnswer = await UserAnswer.findOne({
        userId: userId,
        questionId: questionId
      });

      if (!userAnswer) {
        return res.status(404).json({
          success: false,
          message: "Answer not found",
          error: {
            code: "ANSWER_NOT_FOUND",
            details: "No answer found for this question and user"
          }
        });
      }

      // Clean up images from Cloudinary
      if (userAnswer.answerImages.length > 0) {
        for (const image of userAnswer.answerImages) {
          try {
            await cloudinary.uploader.destroy(image.cloudinaryPublicId);
          } catch (cleanupError) {
            console.error('Error cleaning up image:', cleanupError);
          }
        }
      }

      await UserAnswer.findByIdAndDelete(userAnswer._id);

      res.status(200).json({
        success: true,
        message: "Answer deleted successfully",
        data: {
          deletedAnswerId: userAnswer._id,
          questionId: questionId,
          userId: userId,
          imagesDeleted: userAnswer.answerImages.length
        }
      });

    } catch (error) {
      console.error('Delete user answer error:', error);
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
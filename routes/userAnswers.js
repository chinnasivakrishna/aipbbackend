const express = require('express');
const router = express.Router();
const multer = require('multer');
const { CloudinaryStorage } = require('multer-storage-cloudinary');
const cloudinary = require('cloudinary').v2;
const UserAnswer = require('../models/UserAnswer');
const AiswbQuestion = require('../models/AiswbQuestion');
const AISWBSet = require('../models/AISWBSet');
const { validationResult, param, body, query } = require('express-validator');
const { authenticateMobileUser } = require('../middleware/mobileAuth');

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
    fileSize: 5 * 1024 * 1024,
    files: 10
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

// Check submission limit for a question
router.get('/questions/:questionId/submission-status',
  authenticateMobileUser,
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
      const userId = req.user.id;

      const submissionStatus = await UserAnswer.canUserSubmit(userId, questionId);

      res.status(200).json({
        success: true,
        data: {
          questionId: questionId,
          userId: userId,
          canSubmit: submissionStatus.canSubmit,
          currentAttempts: submissionStatus.currentAttempts,
          remainingAttempts: submissionStatus.remainingAttempts,
          maxAttempts: 5
        }
      });

    } catch (error) {
      console.error('Check submission status error:', error);
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

// Submit new answer attempt (always creates new record)
router.post('/questions/:questionId/answers',
  authenticateMobileUser,
  validateQuestionId,
  upload.array('images', 10),
  validateAnswerSubmission,
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
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
      const userId = req.user.id;
      const { textAnswer, timeSpent, sourceType, setId, deviceInfo, appVersion } = req.body;

      // Check submission limit first
      const submissionStatus = await UserAnswer.canUserSubmit(userId, questionId);
      if (!submissionStatus.canSubmit) {
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
          message: "Submission limit exceeded",
          error: {
            code: "SUBMISSION_LIMIT_EXCEEDED",
            details: `Maximum ${submissionStatus.currentAttempts} attempts allowed for this question. You have already submitted ${submissionStatus.currentAttempts} answers.`
          }
        });
      }

      // Check if question exists
      const question = await AiswbQuestion.findById(questionId);
      if (!question) {
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

      // Check if set exists (if provided)
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
        console.log(`Processing ${req.files.length} uploaded images...`);
        
        for (const file of req.files) {
          answerImages.push({
            imageUrl: file.path,
            cloudinaryPublicId: file.filename,
            originalName: file.originalname,
            uploadedAt: new Date()
          });
        }
      }

      // Create new answer attempt (never update existing)
      const userAnswer = new UserAnswer({
        userId: userId,
        questionId: questionId,
        setId: setId,
        clientId: req.user.clientId,
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

      await userAnswer.save();

      res.status(200).json({
        success: true,
        message: "Answer submitted successfully",
        data: {
          answerId: userAnswer._id,
          attemptNumber: userAnswer.attemptNumber,
          questionId: question._id,
          userId: userId,
          imagesCount: answerImages.length,
          submissionStatus: userAnswer.submissionStatus,
          submittedAt: userAnswer.submittedAt,
          isFinalAttempt: userAnswer.isFinalAttempt(),
          remainingAttempts: Math.max(0, 5 - userAnswer.attemptNumber),
          question: {
            id: question._id,
            question: question.question,
            difficultyLevel: question.metadata?.difficultyLevel,
            maximumMarks: question.metadata?.maximumMarks,
            estimatedTime: question.metadata?.estimatedTime
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

// Get user's latest answer for a specific question
router.get('/questions/:questionId/answers/latest',
  authenticateMobileUser,
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
      const userId = req.user.id;

      const userAnswer = await UserAnswer.getUserLatestAttempt(userId, questionId)
        .populate('questionId', 'question detailedAnswer metadata languageMode')
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

      const formattedImages = userAnswer.answerImages.map(img => ({
        url: img.imageUrl,
        originalName: img.originalName,
        uploadedAt: img.uploadedAt
      }));

      res.status(200).json({
        success: true,
        data: {
          answer: {
            id: userAnswer._id,
            attemptNumber: userAnswer.attemptNumber,
            textAnswer: userAnswer.textAnswer,
            images: formattedImages,
            submissionStatus: userAnswer.submissionStatus,
            submittedAt: userAnswer.submittedAt,
            timeSpent: userAnswer.metadata.timeSpent,
            sourceType: userAnswer.metadata.sourceType,
            isFinalAttempt: userAnswer.isFinalAttempt()
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
      console.error('Get user latest answer error:', error);
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

// Get all attempts for a specific question
router.get('/questions/:questionId/answers/attempts',
  authenticateMobileUser,
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
      const userId = req.user.id;

      const userAttempts = await UserAnswer.getUserAttempts(userId, questionId)
        .populate('questionId', 'question metadata languageMode')
        .populate('setId', 'name itemType');

      const submissionStatus = await UserAnswer.canUserSubmit(userId, questionId);

      res.status(200).json({
        success: true,
        data: {
          questionId: questionId,
          totalAttempts: userAttempts.length,
          maxAttempts: 5,
          canSubmitMore: submissionStatus.canSubmit,
          remainingAttempts: submissionStatus.remainingAttempts,
          attempts: userAttempts.map(attempt => ({
            id: attempt._id,
            attemptNumber: attempt.attemptNumber,
            textAnswer: attempt.textAnswer,
            imagesCount: attempt.answerImages.length,
            images: attempt.answerImages.map(img => ({
              url: img.imageUrl,
              originalName: img.originalName,
              uploadedAt: img.uploadedAt
            })),
            submissionStatus: attempt.submissionStatus,
            submittedAt: attempt.submittedAt,
            timeSpent: attempt.metadata.timeSpent,
            sourceType: attempt.metadata.sourceType,
            isFinalAttempt: attempt.isFinalAttempt(),
            ...(attempt.setId && {
              set: {
                id: attempt.setId._id,
                name: attempt.setId.name,
                itemType: attempt.setId.itemType
              }
            }),
            ...(attempt.feedback && {
              feedback: attempt.feedback
            })
          }))
        }
      });

    } catch (error) {
      console.error('Get user attempts error:', error);
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

// Get specific attempt by attempt number
router.get('/questions/:questionId/answers/attempts/:attemptNumber',
  authenticateMobileUser,
  [
    ...validateQuestionId,
    param('attemptNumber')
      .isInt({ min: 1, max: 5 })
      .withMessage('Attempt number must be between 1 and 5')
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

      const { questionId, attemptNumber } = req.params;
      const userId = req.user.id;

      const userAnswer = await UserAnswer.findOne({
        userId: userId,
        questionId: questionId,
        attemptNumber: parseInt(attemptNumber)
      }).populate('questionId', 'question detailedAnswer metadata languageMode')
        .populate('setId', 'name itemType');

      if (!userAnswer) {
        return res.status(404).json({
          success: false,
          message: "Answer not found",
          error: {
            code: "ANSWER_NOT_FOUND",
            details: `No attempt ${attemptNumber} found for this question and user`
          }
        });
      }

      const formattedImages = userAnswer.answerImages.map(img => ({
        url: img.imageUrl,
        originalName: img.originalName,
        uploadedAt: img.uploadedAt
      }));

      res.status(200).json({
        success: true,
        data: {
          answer: {
            id: userAnswer._id,
            attemptNumber: userAnswer.attemptNumber,
            textAnswer: userAnswer.textAnswer,
            images: formattedImages,
            submissionStatus: userAnswer.submissionStatus,
            submittedAt: userAnswer.submittedAt,
            timeSpent: userAnswer.metadata.timeSpent,
            sourceType: userAnswer.metadata.sourceType,
            isFinalAttempt: userAnswer.isFinalAttempt()
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
      console.error('Get specific attempt error:', error);
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

// Get all user's answers with pagination (Updated to show all attempts)
router.get('/answers',
  authenticateMobileUser,
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
      .withMessage('Invalid source type filter'),
    query('groupByQuestion')
      .optional()
      .isBoolean()
      .withMessage('groupByQuestion must be a boolean value')
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

      const userId = req.user.id;
      const page = parseInt(req.query.page) || 1;
      const limit = parseInt(req.query.limit) || 10;
      const skip = (page - 1) * limit;
      const groupByQuestion = req.query.groupByQuestion === 'true';

      const filter = {
        userId: userId,
        clientId: req.user.clientId
      };

      if (req.query.status) {
        filter.submissionStatus = req.query.status;
      }

      if (req.query.sourceType) {
        filter['metadata.sourceType'] = req.query.sourceType;
      }

      const totalAnswers = await UserAnswer.countDocuments(filter);

      const userAnswers = await UserAnswer.find(filter)
        .populate('questionId', 'question metadata languageMode')
        .populate('setId', 'name itemType')
        .sort({ updatedAt: -1 })
        .skip(skip)
        .limit(limit);

      const totalPages = Math.ceil(totalAnswers / limit);

      let responseData;

      if (groupByQuestion) {
        // Group answers by question
        const groupedAnswers = {};
        userAnswers.forEach(answer => {
          const questionId = answer.questionId._id.toString();
          if (!groupedAnswers[questionId]) {
            groupedAnswers[questionId] = {
              question: {
                id: answer.questionId._id,
                question: answer.questionId.question.length > 200 ? 
                  answer.questionId.question.substring(0, 200) + '...' : 
                  answer.questionId.question,
                difficultyLevel: answer.questionId.metadata?.difficultyLevel,
                maximumMarks: answer.questionId.metadata?.maximumMarks,
                languageMode: answer.questionId.languageMode
              },
              totalAttempts: 0,
              attempts: []
            };
          }

          groupedAnswers[questionId].totalAttempts++;
          groupedAnswers[questionId].attempts.push({
            id: answer._id,
            attemptNumber: answer.attemptNumber,
            imagesCount: answer.answerImages.length,
            hasTextAnswer: !!answer.textAnswer,
            submissionStatus: answer.submissionStatus,
            submittedAt: answer.submittedAt,
            timeSpent: answer.metadata.timeSpent,
            sourceType: answer.metadata.sourceType,
            isFinalAttempt: answer.isFinalAttempt(),
            images: answer.answerImages.map(img => ({
              url: img.imageUrl,
              originalName: img.originalName,
              uploadedAt: img.uploadedAt
            }))
          });
        });

        responseData = {
          groupedAnswers: Object.values(groupedAnswers)
        };
      } else {
        // Return all answers individually
        responseData = {
          answers: userAnswers.map(answer => ({
            id: answer._id,
            attemptNumber: answer.attemptNumber,
            question: {
              id: answer.questionId._id,
              question: answer.questionId.question.length > 200 ? 
                answer.questionId.question.substring(0, 200) + '...' : 
                answer.questionId.question,
              difficultyLevel: answer.questionId.metadata?.difficultyLevel,
              maximumMarks: answer.questionId.metadata?.maximumMarks,
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
            isFinalAttempt: answer.isFinalAttempt(),
            updatedAt: answer.updatedAt,
            images: answer.answerImages.map(img => ({
              url: img.imageUrl,
              originalName: img.originalName,
              uploadedAt: img.uploadedAt
            }))
          }))
        };
      }

      res.status(200).json({
        success: true,
        data: {
          ...responseData,
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

// Delete specific attempt
router.delete('/questions/:questionId/answers/attempts/:attemptNumber',
  authenticateMobileUser,
  [
    ...validateQuestionId,
    param('attemptNumber')
      .isInt({ min: 1, max: 5 })
      .withMessage('Attempt number must be between 1 and 5')
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

      const { questionId, attemptNumber } = req.params;
      const userId = req.user.id;

      const userAnswer = await UserAnswer.findOne({
        userId: userId,
        questionId: questionId,
        attemptNumber: parseInt(attemptNumber)
      });

      if (!userAnswer) {
        return res.status(404).json({
          success: false,
          message: "Answer not found",
          error: {
            code: "ANSWER_NOT_FOUND",
            details: `No attempt ${attemptNumber} found for this question and user`
          }
        });
      }

      // Clean up images
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
          attemptNumber: userAnswer.attemptNumber,
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
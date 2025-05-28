const express = require('express');
const router = express.Router();
const multer = require('multer');
const { CloudinaryStorage } = require('multer-storage-cloudinary');
const cloudinary = require('cloudinary').v2;
const { Mistral } = require('@mistralai/mistralai');
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

// Configure Mistral
const mistralClient = new Mistral({
  apiKey: process.env.MISTRAL_API_KEY
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

// Helper function to process OCR for a single image
const processImageOCR = async (imageUrl, retries = 3) => {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const startTime = Date.now();
      
      // Fixed API call structure based on the provided example
      const ocrResponse = await mistralClient.ocr.process({
        model: "mistral-ocr-latest",
        document: {
          type: "image_url",  // ✅ Fixed: Changed back to "image_url"
          imageUrl: imageUrl  // ✅ Fixed: Using correct property name
        },
        includeImageBase64: false
      });

      const processingTime = Date.now() - startTime;

      return {
        success: true,
        extractedText: ocrResponse.text || '',
        processingTime: processingTime,
        modelUsed: ocrResponse.model || 'mistral-ocr-latest',
        confidenceScore: ocrResponse.confidence_score || null,
        processedAt: new Date()
      };
    } catch (error) {
      console.error(`OCR processing attempt ${attempt} failed for image ${imageUrl}:`, error.message);
      
      if (attempt === retries) {
        return {
          success: false,
          error: error.message,
          extractedText: '',
          processingTime: 0,
          modelUsed: 'mistral-ocr-latest',
          processedAt: new Date()
        };
      }
      
      // Wait before retry (exponential backoff)
      await new Promise(resolve => setTimeout(resolve, Math.pow(2, attempt) * 1000));
    }
  }
};

// Helper function to process OCR for multiple images
const processMultipleImagesOCR = async (images) => {
  const ocrResults = [];
  
  for (let i = 0; i < images.length; i++) {
    const image = images[i];
    console.log(`Processing OCR for image ${i + 1}/${images.length}: ${image.originalname}`);
    
    const ocrResult = await processImageOCR(image.path);
    
    ocrResults.push({
      imageIndex: i,
      imageUrl: image.path,
      originalName: image.originalname,
      cloudinaryPublicId: image.filename,
      ...ocrResult
    });
  }
  
  return ocrResults;
};

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
    .withMessage('Set ID must be a valid MongoDB ObjectId'),
  body('enableOCR')
    .optional()
    .isBoolean()
    .withMessage('enableOCR must be a boolean value')
];

// OCR Processing Endpoint (kept for standalone use)
router.post('/answers/ocr-process',
  authenticateMobileUser,
  upload.single('image'),
  async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({
          success: false,
          message: "No image file provided",
          error: {
            code: "NO_IMAGE",
            details: "Please upload an image file"
          }
        });
      }

      const ocrResult = await processImageOCR(req.file.path);

      if (!ocrResult.success) {
        return res.status(500).json({
          success: false,
          message: "OCR processing failed",
          error: {
            code: "OCR_ERROR",
            details: ocrResult.error
          }
        });
      }

      res.status(200).json({
        success: true,
        message: "OCR processing completed",
        data: {
          extractedText: ocrResult.extractedText,
          imageInfo: {
            url: req.file.path,
            publicId: req.file.filename
          },
          ocrMetadata: {
            model: ocrResult.modelUsed,
            processingTime: ocrResult.processingTime,
            confidenceScore: ocrResult.confidenceScore,
            processedAt: ocrResult.processedAt
          }
        }
      });

    } catch (error) {
      console.error('OCR processing error:', error);
      if (req.file) {
        try {
          await cloudinary.uploader.destroy(req.file.filename);
        } catch (cleanupError) {
          console.error('Error cleaning up file:', cleanupError);
        }
      }

      res.status(500).json({
        success: false,
        message: "OCR processing failed",
        error: {
          code: "OCR_ERROR",
          details: error.message
        }
      });
    }
  }
);

// Submit answer with images and automatic OCR processing
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
      const { textAnswer, timeSpent, sourceType, setId, deviceInfo, appVersion, enableOCR = true } = req.body;

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

      // Process images and OCR
      const answerImages = [];
      let ocrResults = [];
      
      if (req.files && req.files.length > 0) {
        console.log(`Processing ${req.files.length} uploaded images...`);
        
        // Process OCR for all images if enabled and Mistral API is available
        if (enableOCR && process.env.MISTRAL_API_KEY) {
          try {
            console.log('Starting OCR processing for all images...');
            ocrResults = await processMultipleImagesOCR(req.files);
            console.log('OCR processing completed for all images');
          } catch (ocrError) {
            console.error('Error during bulk OCR processing:', ocrError);
            // Continue without OCR data
          }
        }

        // Create answer images array with OCR data
        for (let i = 0; i < req.files.length; i++) {
          const file = req.files[i];
          const correspondingOCR = ocrResults.find(ocr => ocr.imageIndex === i);
          
          const imageData = {
            imageUrl: file.path,
            cloudinaryPublicId: file.filename,
            originalName: file.originalname,
            uploadedAt: new Date()
          };

          // Add OCR data if available
          if (correspondingOCR) {
            imageData.ocrData = {
              extractedText: correspondingOCR.extractedText || '',
              processingTime: correspondingOCR.processingTime || 0,
              modelUsed: correspondingOCR.modelUsed || 'mistral-ocr-latest',
              processedAt: correspondingOCR.processedAt || new Date(),
              confidenceScore: correspondingOCR.confidenceScore || null,
              success: correspondingOCR.success || false,
              ...(correspondingOCR.error && { error: correspondingOCR.error })
            };
          }

          answerImages.push(imageData);
        }
      }

      // Find existing answer or create new one
      let userAnswer = await UserAnswer.findOne({
        userId: userId,
        questionId: questionId
      });

      if (userAnswer) {
        // Clean up old images if new ones are uploaded
        if (answerImages.length > 0 && userAnswer.answerImages.length > 0) {
          for (const oldImage of userAnswer.answerImages) {
            try {
              await cloudinary.uploader.destroy(oldImage.cloudinaryPublicId);
            } catch (cleanupError) {
              console.error('Error cleaning up old image:', cleanupError);
            }
          }
        }

        // Update existing answer
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
      }

      await userAnswer.save();

      // Prepare response with OCR summary
      const ocrSummary = ocrResults.length > 0 ? {
        totalImages: ocrResults.length,
        successfulOCR: ocrResults.filter(r => r.success).length,
        failedOCR: ocrResults.filter(r => !r.success).length,
        totalExtractedText: ocrResults
          .filter(r => r.success && r.extractedText)
          .map(r => r.extractedText)
          .join('\n\n'),
        averageProcessingTime: ocrResults.length > 0 
          ? Math.round(ocrResults.reduce((sum, r) => sum + r.processingTime, 0) / ocrResults.length)
          : 0
      } : null;

      res.status(200).json({
        success: true,
        message: "Answer submitted successfully",
        data: {
          answerId: userAnswer._id,
          questionId: question._id,
          userId: userId,
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
          }),
          ...(ocrSummary && {
            ocrProcessing: ocrSummary
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

// Get user's answer for a specific question
router.get('/questions/:questionId/answers',
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

      // Format images with OCR data
      const formattedImages = userAnswer.answerImages.map(img => ({
        url: img.imageUrl,
        originalName: img.originalName,
        uploadedAt: img.uploadedAt,
        ...(img.ocrData && {
          ocrData: {
            extractedText: img.ocrData.extractedText,
            processedAt: img.ocrData.processedAt,
            modelUsed: img.ocrData.modelUsed,
            confidenceScore: img.ocrData.confidenceScore,
            processingTime: img.ocrData.processingTime,
            success: img.ocrData.success
          }
        })
      }));

      res.status(200).json({
        success: true,
        data: {
          answer: {
            id: userAnswer._id,
            textAnswer: userAnswer.textAnswer,
            images: formattedImages,
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

// Get all user's answers with pagination (Updated to include image URLs)
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
      query('includeImages')
        .optional()
        .isBoolean()
        .withMessage('includeImages must be a boolean value')
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
        const includeImages = req.query.includeImages === 'true' || req.query.includeImages === true;
  
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
  
        res.status(200).json({
          success: true,
          data: {
            answers: userAnswers.map(answer => {
              const baseResponse = {
                id: answer._id,
                question: {
                  id: answer.questionId._id,
                  question: answer.questionId.question.length > 200 ? 
                    answer.questionId.question.substring(0, 200) + '...' : 
                    answer.questionId.question,
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
                imagesWithOCR: answer.answerImages.filter(img => img.ocrData && img.ocrData.success).length,
                hasTextAnswer: !!answer.textAnswer,
                submissionStatus: answer.submissionStatus,
                submittedAt: answer.submittedAt,
                timeSpent: answer.metadata.timeSpent,
                sourceType: answer.metadata.sourceType,
                updatedAt: answer.updatedAt
              };
  
              // Add image URLs if requested or by default
              if (includeImages || true) { // Always include by default, can be controlled by query param
                baseResponse.images = answer.answerImages.map(img => ({
                  url: img.imageUrl,
                  originalName: img.originalName,
                  uploadedAt: img.uploadedAt,
                  hasOCR: !!(img.ocrData && img.ocrData.success),
                  ...(img.ocrData && img.ocrData.success && {
                    extractedText: img.ocrData.extractedText ? 
                      (img.ocrData.extractedText.length > 100 ? 
                        img.ocrData.extractedText.substring(0, 100) + '...' : 
                        img.ocrData.extractedText) : '',
                    ocrProcessedAt: img.ocrData.processedAt,
                    ocrConfidenceScore: img.ocrData.confidenceScore
                  })
                }));
              }
  
              return baseResponse;
            }),
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

// Delete user's answer (with image cleanup)
router.delete('/questions/:questionId/answers',
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
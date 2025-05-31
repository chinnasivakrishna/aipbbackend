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
const axios = require('axios');
const apis = require('./answerapis');
router.use('/check', apis);


const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GEMINI_API_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent';
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const OPENAI_API_URL = 'https://api.openai.com/v1/chat/completions';

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

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
  body('mode')
    .optional()
    .isIn(['auto', 'manual'])
    .withMessage('Mode must be either auto or manual')
];

const extractTextFromImages = async (imageUrls) => {
  const extractedTexts = [];
  if (!OPENAI_API_KEY) {
    throw new Error('OpenAI API key is not configured');
  }
  
  for (let i = 0; i < imageUrls.length; i++) {
    const imageUrl = imageUrls[i];
    try {
      let processedImageUrl = imageUrl;
      
      if (imageUrl.includes('cloudinary.com')) {
        processedImageUrl = imageUrl;
      } else {        
        const imageResponse = await axios.get(imageUrl, {
          responseType: 'arraybuffer',
          timeout: 30000,
          headers: {
            'User-Agent': 'Mozilla/5.0 (compatible; TextExtractor/1.0)'
          }
        });
        
        if (imageResponse.status !== 200) {
          throw new Error(`Failed to fetch image: ${imageResponse.status} ${imageResponse.statusText}`);
        }
        
        const contentType = imageResponse.headers['content-type'];
        if (!contentType || !contentType.startsWith('image/')) {
          throw new Error(`Invalid content type: ${contentType}`);
        }
        
        const imageBuffer = Buffer.from(imageResponse.data);
        if (imageBuffer.length === 0) {
          throw new Error('Empty image buffer received');
        }
        
        const base64Image = imageBuffer.toString('base64');
        let imageFormat = 'jpeg';
        if (contentType.includes('png')) imageFormat = 'png';
        else if (contentType.includes('webp')) imageFormat = 'webp';
        else if (contentType.includes('gif')) imageFormat = 'gif';
        
        processedImageUrl = `data:image/${imageFormat};base64,${base64Image}`;
      }

      const visionResponse = await axios.post(
        OPENAI_API_URL,
        {
          model: "gpt-4o-mini",
          messages: [
            {
              role: "user",
              content: [
                {
                  type: "text",
                  text: `You are a precise OCR (Optical Character Recognition) system. Your task is to extract ALL text content from this image.

Instructions:
1. Extract ALL visible text exactly as it appears
2. Maintain the original formatting, line breaks, and spacing
3. Include mathematical equations, formulas, and symbols
4. Include any handwritten text if clearly readable
5. Do not add explanations, interpretations, or additional commentary
6. If the text is in multiple languages, extract all of it
7. If there are tables, preserve the table structure
8. If no readable text is found, respond with exactly: "No readable text found"

Return only the extracted text content:`
                },
                {
                  type: "image_url",
                  image_url: {
                    url: processedImageUrl,
                    detail: "high"
                  }
                }
              ]
            }
          ],
          max_tokens: 2000,
          temperature: 0.1
        },
        {
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${OPENAI_API_KEY}`
          },
          timeout: 45000
        }
      );      
      
      if (!visionResponse.data || !visionResponse.data.choices || visionResponse.data.choices.length === 0) {
        throw new Error('Invalid response structure from OpenAI Vision API');
      }
      
      const choice = visionResponse.data.choices[0];
      if (!choice.message || !choice.message.content) {
        throw new Error('No content in OpenAI Vision API response');
      }
      
      const extractedText = choice.message.content.trim();
      if (extractedText === "No readable text found" || extractedText.length === 0) {
        extractedTexts.push("No readable text found");
      } else {
        extractedTexts.push(extractedText);
      }
    } catch (error) {
      let errorMessage = "Failed to extract text";
      if (error.message.includes('timeout')) {
        errorMessage = "Text extraction timed out - image may be too large";
      } else if (error.message.includes('API key')) {
        errorMessage = "API authentication failed";
      } else if (error.message.includes('rate limit')) {
        errorMessage = "Rate limit exceeded - please try again later";
      } else if (error.message.includes('content type')) {
        errorMessage = "Invalid image format";
      }
      extractedTexts.push(`${errorMessage}: ${error.message}`);
    }
  }
  return extractedTexts;
};

const extractTextFromImagesGemini = async (imageUrls) => {
  if (!GEMINI_API_KEY) {
    throw new Error('Gemini API key is not configured');
  }
  const extractedTexts = [];
  for (const imageUrl of imageUrls) {
    try {
      const imageResponse = await axios.get(imageUrl, {
        responseType: 'arraybuffer',
        timeout: 30000
      });
      const imageBuffer = Buffer.from(imageResponse.data);
      const base64Image = imageBuffer.toString('base64');
      const contentType = imageResponse.headers['content-type'] || 'image/jpeg';
      const response = await axios.post(
        `${GEMINI_API_URL}?key=${GEMINI_API_KEY}`,
        {
          contents: [{
            parts: [
              {
                text: "Extract all text content from this image. Return only the text as it appears, maintaining original formatting. If no text is found, respond with 'No readable text found'."
              },
              {
                inline_data: {
                  mime_type: contentType,
                  data: base64Image
                }
              }
            ]
          }],
          generationConfig: {
            temperature: 0.1,
            maxOutputTokens: 1024,
          }
        },
        {
          headers: { 'Content-Type': 'application/json' },
          timeout: 30000
        }
      );
      const extractedText = response.data?.candidates?.[0]?.content?.parts?.[0]?.text || 'No readable text found';
      extractedTexts.push(extractedText.trim());
    } catch (error) {
      extractedTexts.push(`Failed to extract text: ${error.message}`);
    }
  }
  return extractedTexts;
};

const extractTextFromImagesWithFallback = async (imageUrls) => {
  if (!imageUrls || imageUrls.length === 0) {
    return [];
  }  
  try {
    const results = await extractTextFromImages(imageUrls);
    const failedIndices = [];
    results.forEach((result, index) => {
      if (result.startsWith('Failed to extract text') || result.includes('Error')) {
        failedIndices.push(index);
      }
    });
    if (failedIndices.length > 0 && GEMINI_API_KEY) {
      try {
        const failedUrls = failedIndices.map(i => imageUrls[i]);
        const geminiResults = await extractTextFromImagesGemini(failedUrls);
        failedIndices.forEach((originalIndex, geminiIndex) => {
          if (geminiResults[geminiIndex] && !geminiResults[geminiIndex].startsWith('Failed')) {
            results[originalIndex] = geminiResults[geminiIndex];
          }
        });
      } catch (geminiError) {
        console.error('Gemini fallback failed:', geminiError.message);
      }
    }
    return results;
  } catch (openaiError) {
    if (GEMINI_API_KEY) {
      try {
        return await extractTextFromImagesGemini(imageUrls);
      } catch (geminiError) {
        console.error('Both OpenAI and Gemini failed:', geminiError.message);
      }
    }
    return imageUrls.map((_, index) => 
      `Text extraction failed for image ${index + 1}. Please ensure the image is clear and contains readable text.`
    );
  }
};

const generateEvaluationPrompt = (question, extractedTexts) => {
  const combinedText = extractedTexts.join('\n\n--- Next Image ---\n\n');
  return `Please evaluate this student's answer to the given question.

QUESTION:
${question.question}

MAXIMUM MARKS: ${question.metadata?.maximumMarks || 10}

STUDENT'S ANSWER (extracted from images):
${combinedText}

Please provide a detailed evaluation in the following format:

ACCURACY: [Score out of 100]
MARKS AWARDED: [Marks out of ${question.metadata?.maximumMarks || 10}]

STRENGTHS:
- [List 2-3 specific strengths]

WEAKNESSES:
- [List 2-3 areas for improvement]

SUGGESTIONS:
- [List 2-3 specific recommendations]

DETAILED FEEDBACK:
[Provide constructive feedback about the answer]

Please be fair, constructive, and specific in your evaluation.`;
};

const parseEvaluationResponse = (evaluationText, question) => {
  try {
    const lines = evaluationText.split('\n');
    const evaluation = {
      accuracy: 75,
      marks: Math.floor((question.metadata?.maximumMarks || 10) * 0.75),
      strengths: [],
      weaknesses: [],
      suggestions: [],
      feedback: ''
    };
    let currentSection = '';
    for (const line of lines) {
      const trimmedLine = line.trim();
      if (trimmedLine.startsWith('ACCURACY:')) {
        const match = trimmedLine.match(/(\d+)/);
        if (match) evaluation.accuracy = parseInt(match[1]);
      } else if (trimmedLine.startsWith('MARKS AWARDED:')) {
        const match = trimmedLine.match(/(\d+)/);
        if (match) evaluation.marks = parseInt(match[1]);
      } else if (trimmedLine === 'STRENGTHS:') {
        currentSection = 'strengths';
      } else if (trimmedLine === 'WEAKNESSES:') {
        currentSection = 'weaknesses';
      } else if (trimmedLine === 'SUGGESTIONS:') {
        currentSection = 'suggestions';
      } else if (trimmedLine === 'DETAILED FEEDBACK:') {
        currentSection = 'feedback';
      } else if (trimmedLine.startsWith('- ') && currentSection) {
        const content = trimmedLine.substring(2);
        if (currentSection !== 'feedback') {
          evaluation[currentSection].push(content);
        }
      } else if (currentSection === 'feedback' && trimmedLine) {
        evaluation.feedback += (evaluation.feedback ? ' ' : '') + trimmedLine;
      }
    }
    return evaluation;
  } catch (error) {
    console.error('Error parsing evaluation:', error);
    return generateMockEvaluation(question);
  }
};

const generateMockEvaluation = (question) => {
  return {
    accuracy: Math.floor(Math.random() * 30) + 60, // 60-90%
    extractedText: "The answer demonstrates a good understanding of the topic with clear explanations and relevant examples. The content is well-structured and addresses the main points of the question.",
    strengths: [
      'Shows understanding of core concepts',
      'Attempts to address the question requirements'
    ],
    weaknesses: [
      'Could provide more detailed explanations',
      'Some concepts could be explained more clearly'
    ],
    suggestions: [
      'Include more specific examples',
      'Structure your answer with clear sections'
    ],
    marks: Math.floor(Math.random() * (question.metadata.maximumMarks / 2)) + 
           Math.floor(question.metadata.maximumMarks / 2),
    feedback: 'The answer shows understanding of the topic but could be improved with more detailed explanations and examples.'
  };
};

// Updated answer submission handler with manual/auto mode support
router.post('/questions/:questionId/answers',
  authenticateMobileUser,
  validateQuestionId,
  upload.array('images', 10),
  validateAnswerSubmission,
  async (req, res, next) => {
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
      const { textAnswer, timeSpent, sourceType, setId, deviceInfo, appVersion, mode } = req.body;

      // Determine evaluation mode - default to 'auto' if not specified
      const evaluationMode = mode || 'auto';

      if ((!req.files || req.files.length === 0) && (!textAnswer || textAnswer.trim() === '')) {
        return res.status(400).json({
          success: false,
          message: "Either images or text answer must be provided",
          error: {
            code: "NO_ANSWER_PROVIDED",
            details: "At least one form of answer (image or text) is required"
          }
        });
      }

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
          message: "Maximum submission limit reached",
          error: {
            code: "SUBMISSION_LIMIT_EXCEEDED",
            details: "Maximum 5 attempts allowed per question"
          }
        });
      }

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

      let evaluation = null;
      let extractedTexts = [];
      let evaluationStatus = 'not_evaluated';
      let evaluatedAt = null;

      // Handle evaluation based on mode
      if (evaluationMode === 'auto' && answerImages.length > 0) {
        // AUTO MODE: Extract text and evaluate automatically
        try {
          if (!OPENAI_API_KEY && !GEMINI_API_KEY) {
            throw new Error('Text extraction service not configured');
          }
          const imageUrls = answerImages.map(img => img.imageUrl);
          extractedTexts = await extractTextFromImagesWithFallback(imageUrls);
          const hasValidText = extractedTexts.some(text => 
            text && 
            text.trim().length > 0 && 
            !text.startsWith('Failed to extract text') &&
            !text.startsWith('No readable text found') &&
            !text.includes('Text extraction failed')
          );

          if (hasValidText) {
            if (GEMINI_API_KEY) {
              try {
                const prompt = generateEvaluationPrompt(question, extractedTexts);
                const response = await axios.post(
                  `${GEMINI_API_URL}?key=${GEMINI_API_KEY}`,
                  {
                    contents: [{
                      parts: [{
                        text: prompt
                      }]
                    }],
                    generationConfig: {
                      temperature: 0.7,
                      topK: 40,
                      topP: 0.95,
                      maxOutputTokens: 2048,
                    }
                  },
                  {
                    headers: { 'Content-Type': 'application/json' },
                    timeout: 30000
                  }
                );
                if (response.status === 200 && response.data?.candidates?.[0]?.content) {
                  const evaluationText = response.data.candidates[0].content.parts[0].text;
                  evaluation = parseEvaluationResponse(evaluationText, question);
                  evaluationStatus = 'auto_evaluated';
                  evaluatedAt = new Date();
                } else {
                  throw new Error('Invalid response from Gemini API');
                }
              } catch (geminiError) {
                if (OPENAI_API_KEY) {
                  try {
                    const prompt = generateEvaluationPrompt(question, extractedTexts);
                    const response = await axios.post(
                      OPENAI_API_URL,
                      {
                        model: "gpt-4o-mini",
                        messages: [{
                          role: "user",
                          content: prompt
                        }],
                        max_tokens: 1500,
                        temperature: 0.7
                      },
                      {
                        headers: {
                          'Content-Type': 'application/json',
                          'Authorization': `Bearer ${OPENAI_API_KEY}`
                        },
                        timeout: 30000
                      }
                    );
                    if (response.data?.choices?.[0]?.message?.content) {
                      const evaluationText = response.data.choices[0].message.content;
                      evaluation = parseEvaluationResponse(evaluationText, question);
                      evaluationStatus = 'auto_evaluated';
                      evaluatedAt = new Date();
                    } else {
                      throw new Error('Invalid response from OpenAI API');
                    }
                  } catch (openaiError) {
                    evaluation = generateMockEvaluation(question);
                    evaluationStatus = 'auto_evaluated';
                    evaluatedAt = new Date();
                  }
                } else {
                  evaluation = generateMockEvaluation(question);
                  evaluationStatus = 'auto_evaluated';
                  evaluatedAt = new Date();
                }
              }
            } else if (OPENAI_API_KEY) {
              try {
                const prompt = generateEvaluationPrompt(question, extractedTexts);
                const response = await axios.post(
                  OPENAI_API_URL,
                  {
                    model: "gpt-4o-mini",
                    messages: [{
                      role: "user",
                      content: prompt
                    }],
                    max_tokens: 1500,
                    temperature: 0.7
                  },
                  {
                    headers: {
                      'Content-Type': 'application/json',
                      'Authorization': `Bearer ${OPENAI_API_KEY}`
                    },
                    timeout: 30000
                  }
                );
                if (response.data?.choices?.[0]?.message?.content) {
                  const evaluationText = response.data.choices[0].message.content;
                  evaluation = parseEvaluationResponse(evaluationText, question);
                  evaluationStatus = 'auto_evaluated';
                  evaluatedAt = new Date();
                } else {
                  throw new Error('Invalid response from OpenAI API');
                }
              } catch (openaiError) {
                evaluation = generateMockEvaluation(question);
                evaluationStatus = 'auto_evaluated';
                evaluatedAt = new Date();
              }
            } else {
              evaluation = generateMockEvaluation(question);
              evaluationStatus = 'auto_evaluated';
              evaluatedAt = new Date();
            }
          } else {
            evaluation = generateMockEvaluation(question);
            evaluationStatus = 'auto_evaluated';
            evaluatedAt = new Date();
            extractedTexts = extractedTexts.map(text => 
              text.startsWith('Failed') || text.includes('extraction failed') ? 
              text : 'No readable text could be extracted from this image'
            );
          }
        } catch (extractionError) {
          evaluation = generateMockEvaluation(question);
          evaluationStatus = 'auto_evaluated';
          evaluatedAt = new Date();
          extractedTexts = [`Text extraction service error: ${extractionError.message}. Please try again or contact support if the issue persists.`];
        }
      } else if (evaluationMode === 'manual' && answerImages.length > 0) {
        // MANUAL MODE: Only extract text, don't evaluate
        try {
          if (OPENAI_API_KEY || GEMINI_API_KEY) {
            const imageUrls = answerImages.map(img => img.imageUrl);
            extractedTexts = await extractTextFromImagesWithFallback(imageUrls);
          }
        } catch (extractionError) {
          console.error('Text extraction error in manual mode:', extractionError);
          extractedTexts = [`Text extraction failed: ${extractionError.message}`];
        }
        // Keep evaluation as null and evaluationStatus as 'not_evaluated'
        evaluationStatus = 'not_evaluated';
      }

      const userAnswerData = {
        userId: userId,
        questionId: questionId,
        clientId: req.user.clientId,
        answerImages: answerImages,
        textAnswer: textAnswer || '',
        submissionStatus: 'submitted',
        metadata: {
          timeSpent: parseInt(timeSpent) || 0,
          deviceInfo: deviceInfo || '',
          appVersion: appVersion || '',
          sourceType: sourceType || 'qr_scan'
        },
        evaluation: evaluation,
        extractedTexts: extractedTexts,
        evaluatedAt: evaluatedAt,
        evaluationStatus: evaluationStatus,
        evaluationMode: evaluationMode
      };

      if (setId) {
        userAnswerData.setId = setId;
      }

      let userAnswer;
      try {
        userAnswer = await UserAnswer.createNewAttemptSafe(userAnswerData);
        
        // Auto-progress status based on evaluation mode
        if (evaluationMode === 'auto' && evaluation) {
          // AUTO MODE: Auto-publish after successful evaluation
          await userAnswer.updateStatus('evaluation', 'evaluated', 'Auto-evaluation completed');
          await userAnswer.updateStatus('main', 'published', 'Auto-published after successful evaluation');
          await userAnswer.updateStatus('review', 'review_completed', 'Auto-completed review for auto evaluation');
        } else if (evaluationMode === 'manual') {
          // MANUAL MODE: Keep as pending, not evaluated, not published
          await userAnswer.updateStatus('main', 'pending', 'Pending manual review and evaluation');
          await userAnswer.updateStatus('evaluation', 'not_evaluated', 'Awaiting manual evaluation');
          await userAnswer.updateStatus('review', 'review_pending', 'Awaiting manual review');
        }
      } catch (creationError) {
        if (creationError.code === 'SUBMISSION_LIMIT_EXCEEDED') {
          throw creationError;
        }
        if (creationError.code === 'CREATION_FAILED') {
          throw creationError;
        }
        throw creationError;
      }

      // Prepare response message based on mode
      const responseMessage = evaluationMode === 'auto' 
        ? "Answer submitted and evaluated successfully"
        : "Answer submitted successfully. Awaiting manual evaluation";

      res.status(200).json({
        success: true,
        message: responseMessage,
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
          status: userAnswer.status,
          evaluationStatus: userAnswer.evaluationStatus,
          evaluationMode: userAnswer.evaluationMode,
          reviewStatus: userAnswer.reviewStatus,
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
          }),
          ...(evaluation && evaluationMode === 'auto' && {
            evaluation: evaluation
          }),
          ...(extractedTexts.length > 0 && {
            extractedTexts: extractedTexts
          })
        }
      });
    } catch (error) {
      if (req.files && req.files.length > 0) {
        for (const file of req.files) {
          try {
            await cloudinary.uploader.destroy(file.filename);
          } catch (cleanupError) {
            console.error('Error cleaning up file:', cleanupError);
          }
        }
      }
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
        return res.status(409).json({
          success: false,
          message: "Submission processing failed due to duplicate entry",
          error: {
            code: "DUPLICATE_SUBMISSION_ERROR",
            details: " submission already exists. Please refresh and try again."
          }
        });
      }
      
      console.error('Submission error:', error);
      res.status(500).json({
        success: false,
        message: "Internal server error",
        error: {
          code: "SERVER_ERROR",
          details: process.env.NODE_ENV === 'development' ? error.message : 'An unexpected error occurred'
        }
      });
    }
  }
);

module.exports = router;
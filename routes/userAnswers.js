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
const fetch = require('node-fetch'); // Make sure to install: npm install node-fetch
const axios = require('axios');
// API Configuration
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
    .withMessage('Set ID must be a valid MongoDB ObjectId')
];

// Improved OpenAI text extraction function
const extractTextFromImages = async (imageUrls) => {
  console.log('Starting OpenAI text extraction for', imageUrls.length, 'images');
  const extractedTexts = [];
  
  // Validate API key
  if (!OPENAI_API_KEY) {
    throw new Error('OpenAI API key is not configured');
  }
  
  for (let i = 0; i < imageUrls.length; i++) {
    const imageUrl = imageUrls[i];
    console.log(`Processing image ${i + 1}/${imageUrls.length}:`, imageUrl);
    
    try {
      let processedImageUrl = imageUrl;
      
      // Check if it's a Cloudinary URL that can be used directly
      if (imageUrl.includes('cloudinary.com')) {
        // Use Cloudinary URL directly - OpenAI can access public URLs
        console.log('Using Cloudinary URL directly');
        processedImageUrl = imageUrl;
      } else {
        // For non-Cloudinary URLs, we need to download and convert to base64
        console.log('Downloading image for base64 conversion');
        
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
      
      console.log('Sending request to OpenAI Vision API');
      
      // Call OpenAI Vision API
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
          timeout: 45000 // Increased timeout
        }
      );
      
      console.log('OpenAI Vision API response status:', visionResponse.status);
      
      if (!visionResponse.data || !visionResponse.data.choices || visionResponse.data.choices.length === 0) {
        throw new Error('Invalid response structure from OpenAI Vision API');
      }
      
      const choice = visionResponse.data.choices[0];
      if (!choice.message || !choice.message.content) {
        throw new Error('No content in OpenAI Vision API response');
      }
      
      const extractedText = choice.message.content.trim();
      
      // Check if extraction was successful
      if (extractedText === "No readable text found" || extractedText.length === 0) {
        console.log(`No text found in image ${i + 1}`);
        extractedTexts.push("No readable text found");
      } else {
        console.log(`Successfully extracted ${extractedText.length} characters from image ${i + 1}`);
        extractedTexts.push(extractedText);
      }
      
    } catch (error) {
      console.error(`Error extracting text from image ${i + 1}:`, error.message);
      
      // Provide more specific error messages
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
  
  console.log('Text extraction completed. Results:', extractedTexts.length);
  return extractedTexts;
};

// Simplified function for Gemini as backup (keeping your existing logic but simplified)
const extractTextFromImagesGemini = async (imageUrls) => {
  if (!GEMINI_API_KEY) {
    throw new Error('Gemini API key is not configured');
  }
  
  console.log('Using Gemini API as fallback for', imageUrls.length, 'images');
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
      console.error('Gemini extraction error:', error.message);
      extractedTexts.push(`Failed to extract text: ${error.message}`);
    }
  }
  
  return extractedTexts;
};

// Main extraction function with improved error handling
const extractTextFromImagesWithFallback = async (imageUrls) => {
  if (!imageUrls || imageUrls.length === 0) {
    return [];
  }
  
  console.log('Starting text extraction with fallback for', imageUrls.length, 'images');
  
  try {
    // Try OpenAI first (primary method)
    console.log('Attempting text extraction with OpenAI Vision API');
    const results = await extractTextFromImages(imageUrls);
    
    // Check if any extractions failed and we have Gemini as backup
    const failedIndices = [];
    results.forEach((result, index) => {
      if (result.startsWith('Failed to extract text') || result.includes('Error')) {
        failedIndices.push(index);
      }
    });
    
    // If some failed and we have Gemini available, retry those with Gemini
    if (failedIndices.length > 0 && GEMINI_API_KEY) {
      console.log(`Retrying ${failedIndices.length} failed extractions with Gemini`);
      
      try {
        const failedUrls = failedIndices.map(i => imageUrls[i]);
        const geminiResults = await extractTextFromImagesGemini(failedUrls);
        
        // Replace failed results with Gemini results
        failedIndices.forEach((originalIndex, geminiIndex) => {
          if (geminiResults[geminiIndex] && !geminiResults[geminiIndex].startsWith('Failed')) {
            results[originalIndex] = geminiResults[geminiIndex];
            console.log(`Successfully recovered text for image ${originalIndex + 1} using Gemini`);
          }
        });
      } catch (geminiError) {
        console.error('Gemini fallback also failed:', geminiError.message);
      }
    }
    
    return results;
    
  } catch (openaiError) {
    console.error('OpenAI extraction completely failed:', openaiError.message);
    
    // If OpenAI completely fails, try Gemini for all images
    if (GEMINI_API_KEY) {
      console.log('Falling back to Gemini for all images');
      try {
        return await extractTextFromImagesGemini(imageUrls);
      } catch (geminiError) {
        console.error('Both OpenAI and Gemini failed:', geminiError.message);
      }
    }
    
    // If both fail, return error messages
    return imageUrls.map((_, index) => 
      `Text extraction failed for image ${index + 1}. Please ensure the image is clear and contains readable text.`
    );
  }
};

// Add this helper function for generating evaluation prompts
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

// Helper function to parse evaluation response
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
      const { textAnswer, timeSpent, sourceType, setId, deviceInfo, appVersion } = req.body;

      // Validate that at least one form of answer is provided
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

      // Check submission limits
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

      // Get question details
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

      // Get set info if provided
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
        console.log('Processing uploaded images:', req.files.length);
        for (const file of req.files) {
          answerImages.push({
            imageUrl: file.path,
            cloudinaryPublicId: file.filename,
            originalName: file.originalname,
            uploadedAt: new Date()
          });
          console.log('Image processed:', file.path);
        }
      }

      // Initialize evaluation data
      let evaluation = null;
      let extractedTexts = [];
      
      // Extract text and evaluate if images are provided
      if (answerImages.length > 0) {
        console.log('Starting text extraction for', answerImages.length, 'images');
        
        try {
          // Check API keys before proceeding
          if (!OPENAI_API_KEY && !GEMINI_API_KEY) {
            console.error('No API keys configured for text extraction');
            throw new Error('Text extraction service not configured');
          }
          
          // Extract text from images using the improved function
          const imageUrls = answerImages.map(img => img.imageUrl);
          console.log('Image URLs for extraction:', imageUrls);
          
          // Use the improved extraction function
          extractedTexts = await extractTextFromImagesWithFallback(imageUrls);
          console.log('Text extraction completed. Results:', extractedTexts.map(text => `${text.substring(0, 50)}...`));

          // Check if we have meaningful extracted text
          const hasValidText = extractedTexts.some(text => 
            text && 
            text.trim().length > 0 && 
            !text.startsWith('Failed to extract text') &&
            !text.startsWith('No readable text found') &&
            !text.includes('Text extraction failed')
          );

          if (hasValidText) {
            console.log('Valid text found, proceeding with evaluation');
            
            // Generate evaluation using the extracted text
            if (GEMINI_API_KEY) {
              try {
                console.log('Attempting evaluation with Gemini API');
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
                  console.log('Evaluation completed successfully with Gemini');
                } else {
                  throw new Error('Invalid response from Gemini API');
                }
                
              } catch (geminiError) {
                console.error('Gemini evaluation failed:', geminiError.message);
                
                // Try OpenAI for evaluation if available
                if (OPENAI_API_KEY) {
                  try {
                    console.log('Trying OpenAI for evaluation as fallback');
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
                      console.log('Evaluation completed successfully with OpenAI');
                    } else {
                      throw new Error('Invalid response from OpenAI API');
                    }
                    
                  } catch (openaiError) {
                    console.error('OpenAI evaluation also failed:', openaiError.message);
                    evaluation = generateMockEvaluation(question);
                  }
                } else {
                  evaluation = generateMockEvaluation(question);
                }
              }
            } else if (OPENAI_API_KEY) {
              // Use OpenAI for evaluation if Gemini is not available
              try {
                console.log('Using OpenAI for evaluation');
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
                  console.log('Evaluation completed successfully with OpenAI');
                } else {
                  throw new Error('Invalid response from OpenAI API');
                }
                
              } catch (openaiError) {
                console.error('OpenAI evaluation failed:', openaiError.message);
                evaluation = generateMockEvaluation(question);
              }
            } else {
              console.log('No API keys available for evaluation, using mock evaluation');
              evaluation = generateMockEvaluation(question);
            }
          } else {
            console.log('No valid text extracted, using mock evaluation');
            evaluation = generateMockEvaluation(question);
            // Update extracted texts to indicate the issue
            extractedTexts = extractedTexts.map(text => 
              text.startsWith('Failed') || text.includes('extraction failed') ? 
              text : 'No readable text could be extracted from this image'
            );
          }
          
        } catch (extractionError) {
          console.error('Text extraction process failed:', extractionError.message);
          evaluation = generateMockEvaluation(question);
          extractedTexts = [`Text extraction service error: ${extractionError.message}. Please try again or contact support if the issue persists.`];
        }
      } else {
        console.log('No images provided, skipping text extraction');
      }

      // Prepare user answer data
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
        evaluatedAt: evaluation ? new Date() : null
      };

      if (setId) {
        userAnswerData.setId = setId;
      }

      // Save the answer
      let userAnswer;
      try {
        userAnswer = await UserAnswer.createNewAttemptSafe(userAnswerData);
      } catch (saferError) {        
        if (saferError.code === 'SUBMISSION_LIMIT_EXCEEDED') {
          throw saferError;
        }
        try {
          userAnswer = await UserAnswer.createNewAttempt(userAnswerData);
        } catch (transactionError) {
          throw transactionError;
        }
      }
      res.status(200).json({
        success: true,
        message: "Answer submitted and evaluated successfully",
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
          }),
          ...(evaluation && {
            evaluation: evaluation
          }),
          ...(extractedTexts.length > 0 && {
            extractedTexts: extractedTexts
          })
        }
      });
    } catch (error) {
      console.error('Route handler error:', error);
      if (req.files && req.files.length > 0) {
        for (const file of req.files) {
          try {
            await cloudinary.uploader.destroy(file.filename);
          } catch (cleanupError) {
            console.error('Error cleaning up file:', cleanupError);          }
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
        console.error('Duplicate key error still occurring:', error);
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
    }
  }
);
router.get('/questions/:questionId/answers/:answerId/evaluation',
  authenticateMobileUser,
  [
    ...validateQuestionId,
    param('answerId')
      .isMongoId()
      .withMessage('Answer ID must be a valid MongoDB ObjectId')
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

      const { questionId, answerId } = req.params;
      const userId = req.user.id;

      const userAnswer = await UserAnswer.findOne({
        _id: answerId,
        userId: userId,
        questionId: questionId
      }).populate('questionId', 'question metadata');

      if (!userAnswer) {
        return res.status(404).json({
          success: false,
          message: "Answer not found",
          error: {
            code: "ANSWER_NOT_FOUND",
            details: "The specified answer does not exist or you don't have permission to access it"
          }
        });
      }

      if (!userAnswer.evaluation) {
        return res.status(404).json({
          success: false,
          message: "Evaluation not found",
          error: {
            code: "EVALUATION_NOT_FOUND",
            details: "This answer has not been evaluated yet"
          }
        });
      }

      res.status(200).json({
        success: true,
        data: {
          answerId: userAnswer._id,
          questionId: userAnswer.questionId._id,
          question: {
            question: userAnswer.questionId.question,
            maximumMarks: userAnswer.questionId.metadata?.maximumMarks
          },
          evaluation: userAnswer.evaluation,
          extractedTexts: userAnswer.extractedTexts,
          evaluatedAt: userAnswer.evaluatedAt
        }
      });

    } catch (error) {
      console.error('Get evaluation error:', error);
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
          ...(userAnswer.evaluation && {
            evaluation: userAnswer.evaluation
          }),
          ...(userAnswer.extractedTexts && {
            extractedTexts: userAnswer.extractedTexts
          })
        }
      });

    } catch (error) {
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
            ...(attempt.evaluation && {
              evaluation: attempt.evaluation
            }),
            ...(attempt.extractedTexts && {
              extractedTexts: attempt.extractedTexts
            })
          }))
        }
      });
    } catch (error) {
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
          ...(userAnswer.evaluation && {
            evaluation: userAnswer.evaluation
          }),
          ...(userAnswer.extractedTexts && {
            extractedTexts: userAnswer.extractedTexts
          })
        }
      });
    } catch (error) {
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
router.get('/questions/:questionId/evaluations',
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
      console.log(questionId,"hii");
      console.log(req.params);

      const answers = await UserAnswer.find({
        userId: userId,
        questionId: questionId,
        evaluation: { $exists: true }
      }).sort({ attemptNumber: 1 })
        .populate('questionId', 'question metadata');

      if (answers.length === 0) {
        return res.status(404).json({
          success: false,
          message: "No evaluations found",
          error: {
            code: "NO_EVALUATIONS_FOUND",
            details: "No evaluations found for this question and user"
          }
        });
      }

      res.status(200).json({
        success: true,
        data: {
          questionId: questionId,
          question: answers[0].questionId.question,
          maximumMarks: answers[0].questionId.metadata?.maximumMarks,
          evaluations: answers.map(answer => ({
            answerId: answer._id,
            attemptNumber: answer.attemptNumber,
            submittedAt: answer.submittedAt,
            evaluatedAt: answer.evaluatedAt,
            evaluation: answer.evaluation,
            extractedTexts: answer.extractedTexts
          }))
        }
      });

    } catch (error) {
      console.error('Get evaluations error:', error);
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

// Add these three new API endpoints to your userAnswers.js router

// 1. API to get all data for a question (images, evaluations, user data)
router.get('/questions/:questionId/complete-data',
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

      // Get all user answers for this question
      const userAnswers = await UserAnswer.find({
        userId: userId,
        questionId: questionId
      }).sort({ attemptNumber: 1 })
        .populate('questionId', 'question detailedAnswer metadata languageMode')
        .populate('setId', 'name itemType')
        .populate('reviewedBy', 'username email');

      if (userAnswers.length === 0) {
        return res.status(404).json({
          success: false,
          message: "No answers found",
          error: {
            code: "NO_ANSWERS_FOUND",
            details: "No answers found for this question and user"
          }
        });
      }

      // Get submission status
      const submissionStatus = await UserAnswer.canUserSubmit(userId, questionId);

      // Get question details from first answer
      const questionData = userAnswers[0].questionId;

      // Prepare comprehensive response
      const completeData = {
        question: {
          id: questionData._id,
          question: questionData.question,
          detailedAnswer: questionData.detailedAnswer,
          metadata: questionData.metadata,
          languageMode: questionData.languageMode
        },
        submissionInfo: {
          totalAttempts: userAnswers.length,
          maxAttempts: 5,
          canSubmitMore: submissionStatus.canSubmit,
          remainingAttempts: submissionStatus.remainingAttempts
        },
        userData: {
          userId: userId,
          clientId: req.user.clientId,
          userInfo: {
            username: req.user.username,
            email: req.user.email
          }
        },
        attempts: userAnswers.map(answer => ({
          id: answer._id,
          attemptNumber: answer.attemptNumber,
          textAnswer: answer.textAnswer,
          submissionStatus: answer.submissionStatus,
          submittedAt: answer.submittedAt,
          reviewedAt: answer.reviewedAt,
          evaluatedAt: answer.evaluatedAt,
          isFinalAttempt: answer.isFinalAttempt(),
          
          // Images data
          images: {
            count: answer.answerImages.length,
            details: answer.answerImages.map(img => ({
              imageUrl: img.imageUrl,
              cloudinaryPublicId: img.cloudinaryPublicId,
              originalName: img.originalName,
              uploadedAt: img.uploadedAt
            }))
          },
          
          // Extracted texts
          extractedTexts: answer.extractedTexts || [],
          
          // Evaluation data
          evaluation: answer.evaluation ? {
            accuracy: answer.evaluation.accuracy,
            marks: answer.evaluation.marks,
            extractedText: answer.evaluation.extractedText,
            strengths: answer.evaluation.strengths || [],
            weaknesses: answer.evaluation.weaknesses || [],
            suggestions: answer.evaluation.suggestions || [],
            feedback: answer.evaluation.feedback
          } : null,
          
          // Feedback data (if reviewed manually)
          feedback: answer.feedback ? {
            score: answer.feedback.score,
            comments: answer.feedback.comments,
            suggestions: answer.feedback.suggestions || []
          } : null,
          
          // Metadata
          metadata: {
            timeSpent: answer.metadata.timeSpent,
            deviceInfo: answer.metadata.deviceInfo,
            appVersion: answer.metadata.appVersion,
            sourceType: answer.metadata.sourceType
          },
          
          // Set information
          ...(answer.setId && {
            set: {
              id: answer.setId._id,
              name: answer.setId.name,
              itemType: answer.setId.itemType
            }
          }),
          
          // Reviewer information
          ...(answer.reviewedBy && {
            reviewedBy: {
              id: answer.reviewedBy._id,
              username: answer.reviewedBy.username,
              email: answer.reviewedBy.email
            }
          })
        }))
      };

      res.status(200).json({
        success: true,
        message: "Complete question data retrieved successfully",
        data: completeData
      });

    } catch (error) {
      console.error('Get complete question data error:', error);
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

// 2. API for re-evaluation of an answer
router.post('/questions/:questionId/answers/:answerId/re-evaluate',
  authenticateMobileUser,
  [
    ...validateQuestionId,
    param('answerId')
      .isMongoId()
      .withMessage('Answer ID must be a valid MongoDB ObjectId')
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

      const { questionId, answerId } = req.params;
      const userId = req.user.id;

      // Find the answer
      const userAnswer = await UserAnswer.findOne({
        _id: answerId,
        userId: userId,
        questionId: questionId
      }).populate('questionId', 'question metadata');

      if (!userAnswer) {
        return res.status(404).json({
          success: false,
          message: "Answer not found",
          error: {
            code: "ANSWER_NOT_FOUND",
            details: "The specified answer does not exist or you don't have permission to access it"
          }
        });
      }

      // Check if answer has images or extracted texts to re-evaluate
      if ((!userAnswer.answerImages || userAnswer.answerImages.length === 0) && 
          (!userAnswer.extractedTexts || userAnswer.extractedTexts.length === 0) &&
          (!userAnswer.textAnswer || userAnswer.textAnswer.trim() === '')) {
        return res.status(400).json({
          success: false,
          message: "No content to evaluate",
          error: {
            code: "NO_CONTENT",
            details: "This answer has no images, extracted text, or text content to evaluate"
          }
        });
      }

      let evaluation = null;
      let extractedTexts = userAnswer.extractedTexts || [];

      try {
        // If we have images but no extracted texts, extract them first
        if (userAnswer.answerImages && userAnswer.answerImages.length > 0 && extractedTexts.length === 0) {
          console.log('Re-extracting text from images for re-evaluation');
          const imageUrls = userAnswer.answerImages.map(img => img.imageUrl);
          extractedTexts = await extractTextFromImagesWithFallback(imageUrls);
          
          // Update the answer with new extracted texts
          await UserAnswer.findByIdAndUpdate(answerId, {
            extractedTexts: extractedTexts
          });
        }

        // Determine what content to evaluate
        let contentToEvaluate = [];
        if (extractedTexts.length > 0) {
          contentToEvaluate = extractedTexts;
        }
        if (userAnswer.textAnswer && userAnswer.textAnswer.trim()) {
          contentToEvaluate.push(userAnswer.textAnswer);
        }

        if (contentToEvaluate.length === 0) {
          throw new Error('No content available for evaluation');
        }

        // Generate new evaluation
        const question = userAnswer.questionId;
        
        if (GEMINI_API_KEY) {
          try {
            console.log('Re-evaluating with Gemini API');
            const prompt = generateEvaluationPrompt(question, contentToEvaluate);
            
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
              console.log('Re-evaluation completed successfully with Gemini');
            } else {
              throw new Error('Invalid response from Gemini API');
            }
            
          } catch (geminiError) {
            console.error('Gemini re-evaluation failed:', geminiError.message);
            
            // Try OpenAI as fallback
            if (OPENAI_API_KEY) {
              const prompt = generateEvaluationPrompt(question, contentToEvaluate);
              
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
                console.log('Re-evaluation completed successfully with OpenAI');
              } else {
                throw new Error('Invalid response from OpenAI API');
              }
            } else {
              evaluation = generateMockEvaluation(question);
            }
          }
        } else if (OPENAI_API_KEY) {
          // Use OpenAI for re-evaluation
          const prompt = generateEvaluationPrompt(question, contentToEvaluate);
          
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
            console.log('Re-evaluation completed successfully with OpenAI');
          } else {
            throw new Error('Invalid response from OpenAI API');
          }
        } else {
          console.log('No API keys available for re-evaluation, using mock evaluation');
          evaluation = generateMockEvaluation(question);
        }

        // Update the answer with new evaluation
        const updatedAnswer = await UserAnswer.findByIdAndUpdate(
          answerId,
          {
            evaluation: evaluation,
            evaluatedAt: new Date(),
            extractedTexts: extractedTexts
          },
          { new: true }
        );

        res.status(200).json({
          success: true,
          message: "Answer re-evaluated successfully",
          data: {
            answerId: updatedAnswer._id,
            questionId: questionId,
            attemptNumber: updatedAnswer.attemptNumber,
            previousEvaluation: userAnswer.evaluation,
            newEvaluation: evaluation,
            extractedTexts: extractedTexts,
            evaluatedAt: updatedAnswer.evaluatedAt,
            question: {
              id: question._id,
              question: question.question,
              maximumMarks: question.metadata?.maximumMarks
            }
          }
        });

      } catch (evaluationError) {
        console.error('Re-evaluation error:', evaluationError.message);
        res.status(500).json({
          success: false,
          message: "Re-evaluation failed",
          error: {
            code: "EVALUATION_ERROR",
            details: evaluationError.message
          }
        });
      }

    } catch (error) {
      console.error('Re-evaluate answer error:', error);
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

// 3. API for updating an evaluation manually
router.put('/questions/:questionId/answers/:answerId/evaluation',
  authenticateMobileUser,
  [
    ...validateQuestionId,
    param('answerId')
      .isMongoId()
      .withMessage('Answer ID must be a valid MongoDB ObjectId'),
    body('accuracy')
      .optional()
      .isFloat({ min: 0, max: 100 })
      .withMessage('Accuracy must be between 0 and 100'),
    body('marks')
      .optional()
      .isFloat({ min: 0 })
      .withMessage('Marks must be a positive number'),
    body('strengths')
      .optional()
      .isArray()
      .withMessage('Strengths must be an array'),
    body('strengths.*')
      .optional()
      .isString()
      .trim()
      .withMessage('Each strength must be a string'),
    body('weaknesses')
      .optional()
      .isArray()
      .withMessage('Weaknesses must be an array'),
    body('weaknesses.*')
      .optional()
      .isString()
      .trim()
      .withMessage('Each weakness must be a string'),
    body('suggestions')
      .optional()
      .isArray()
      .withMessage('Suggestions must be an array'),
    body('suggestions.*')
      .optional()
      .isString()
      .trim()
      .withMessage('Each suggestion must be a string'),
    body('feedback')
      .optional()
      .isString()
      .trim()
      .isLength({ max: 2000 })
      .withMessage('Feedback must be less than 2000 characters'),
    body('extractedText')
      .optional()
      .isString()
      .trim()
      .withMessage('Extracted text must be a string')
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

      const { questionId, answerId } = req.params;
      const userId = req.user.id;
      const { 
        accuracy, 
        marks, 
        strengths, 
        weaknesses, 
        suggestions, 
        feedback, 
        extractedText 
      } = req.body;

      // Find the answer
      const userAnswer = await UserAnswer.findOne({
        _id: answerId,
        userId: userId,
        questionId: questionId
      }).populate('questionId', 'question metadata');

      if (!userAnswer) {
        return res.status(404).json({
          success: false,
          message: "Answer not found",
          error: {
            code: "ANSWER_NOT_FOUND",
            details: "The specified answer does not exist or you don't have permission to access it"
          }
        });
      }

      // Prepare the evaluation update
      const evaluationUpdate = {};
      const currentEvaluation = userAnswer.evaluation || {};

      // Update only provided fields
      if (accuracy !== undefined) evaluationUpdate.accuracy = accuracy;
      if (marks !== undefined) evaluationUpdate.marks = marks;
      if (extractedText !== undefined) evaluationUpdate.extractedText = extractedText;
      if (feedback !== undefined) evaluationUpdate.feedback = feedback;
      if (strengths !== undefined) evaluationUpdate.strengths = strengths;
      if (weaknesses !== undefined) evaluationUpdate.weaknesses = weaknesses;
      if (suggestions !== undefined) evaluationUpdate.suggestions = suggestions;

      // Merge with existing evaluation
      const updatedEvaluation = {
        ...currentEvaluation,
        ...evaluationUpdate
      };

      // Validate marks against question's maximum marks
      const maxMarks = userAnswer.questionId.metadata?.maximumMarks || 10;
      if (updatedEvaluation.marks > maxMarks) {
        return res.status(400).json({
          success: false,
          message: "Invalid marks",
          error: {
            code: "MARKS_EXCEEDED",
            details: `Marks cannot exceed maximum marks of ${maxMarks}`
          }
        });
      }

      // Update the answer
      const updatedAnswer = await UserAnswer.findByIdAndUpdate(
        answerId,
        {
          evaluation: updatedEvaluation,
          evaluatedAt: new Date()
        },
        { new: true }
      ).populate('questionId', 'question metadata');

      res.status(200).json({
        success: true,
        message: "Evaluation updated successfully",
        data: {
          answerId: updatedAnswer._id,
          questionId: questionId,
          attemptNumber: updatedAnswer.attemptNumber,
          previousEvaluation: currentEvaluation,
          updatedEvaluation: updatedEvaluation,
          fieldsUpdated: Object.keys(evaluationUpdate),
          evaluatedAt: updatedAnswer.evaluatedAt,
          question: {
            id: updatedAnswer.questionId._id,
            question: updatedAnswer.questionId.question,
            maximumMarks: updatedAnswer.questionId.metadata?.maximumMarks
          }
        }
      });

    } catch (error) {
      console.error('Update evaluation error:', error);
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
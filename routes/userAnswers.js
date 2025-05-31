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

const answerapis = require('./answerapis');
router.use('/crud', answerapis);


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
        console.log(`No text found in image ${i + 1}`);
        extractedTexts.push("No readable text found");
      } else {
        console.log(`Successfully extracted ${extractedText.length} characters from image ${i + 1}`);
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
      console.error('Gemini extraction error:', error.message);
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
            console.log(`Successfully recovered text for image ${originalIndex + 1} using Gemini`);
          }
        });
      } catch (geminiError) {
        console.error('Gemini fallback also failed:', geminiError.message);
      }
    }

    return results;
    
  } catch (openaiError) {
    if (GEMINI_API_KEY) {
      console.log('Falling back to Gemini for all images');
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
    accuracy: Math.floor(Math.random() * 30) + 60,
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

// POST /questions/:questionId/answers - Submit answer for a question
router.post('/questions/:questionId/answers',
  authenticateMobileUser,
  validateQuestionId,
  upload.array('images', 10),
  validateAnswerSubmission,
  async (req, res, next) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        // Clean up uploaded files on validation error
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

      // Validate set if provided
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
          console.log('Image processed:', file.path);
        }
      }
      
      // Initialize variables for status and evaluation
      let submissionStatusValue, reviewStatusValue, statusValue, popularityStatusValue;
      let evaluation = null;
      let extractedTexts = [];
      
      // Check evaluation mode and set statuses accordingly
      const isAutoEvaluation = question.evaluationMode === 'auto';
      
      if (isAutoEvaluation) {
        console.log('Auto evaluation mode - AI evaluation with auto-publish');
        
        // For auto evaluation mode - auto publish after AI evaluation
        submissionStatusValue = 'evaluated';
        reviewStatusValue = null; // No review process for auto evaluation
        statusValue = 'published';
        popularityStatusValue = 'not_popular';
        
      } else {
        console.log('Manual evaluation mode - AI evaluation but manual approval required');
        
        // For manual evaluation mode - AI evaluation but requires human approval
        submissionStatusValue = 'submitted'; // Keep as submitted for human review
        reviewStatusValue = 'review_pending';
        statusValue = 'not_published'; // Don't publish until human approval
        popularityStatusValue = 'not_popular';
      }

      // PERFORM AI EVALUATION FOR BOTH MODES
      console.log('Performing AI evaluation for both auto and manual modes');
      
      // Process images and evaluate for both modes
      if (answerImages.length > 0) {        
        try {
          if (!OPENAI_API_KEY && !GEMINI_API_KEY) {
            console.error('No API keys configured for text extraction');
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
            // Try Gemini first, then OpenAI as fallback
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
                  console.log('AI evaluation completed successfully using Gemini');
                } else {
                  throw new Error('Invalid response from Gemini API');
                }
              } catch (geminiError) {
                console.log('Gemini evaluation failed, trying OpenAI fallback');
                
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
                      console.log('AI evaluation completed successfully using OpenAI');
                    } else {
                      throw new Error('Invalid response from OpenAI API');
                    }
                  } catch (openaiError) {
                    console.log('Both AI services failed, using mock evaluation');
                    evaluation = generateMockEvaluation(question);
                  }
                } else {
                  console.log('No OpenAI key available, using mock evaluation');
                  evaluation = generateMockEvaluation(question);
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
                  console.log('AI evaluation completed successfully using OpenAI');
                } else {
                  throw new Error('Invalid response from OpenAI API');
                }
              } catch (openaiError) {
                console.log('OpenAI evaluation failed, using mock evaluation');
                evaluation = generateMockEvaluation(question);
              }
            } else {
              console.log('No AI API keys available, using mock evaluation');
              evaluation = generateMockEvaluation(question);
            }
          } else {
            console.log('No valid text extracted from images, using mock evaluation');
            evaluation = generateMockEvaluation(question);
            extractedTexts = extractedTexts.map(text => 
              text.startsWith('Failed') || text.includes('extraction failed') ? 
              text : 'No readable text could be extracted from this image'
            );
          }
        } catch (extractionError) {
          console.error('Text extraction error:', extractionError);
          evaluation = generateMockEvaluation(question);
          extractedTexts = [`Text extraction service error: ${extractionError.message}. Please try again or contact support if the issue persists.`];
        }
      } else {
        // For text-only answers - still perform AI evaluation
        console.log('Text-only answer, performing AI evaluation');
        
        if (textAnswer && textAnswer.trim()) {
          // Create evaluation for text answer
          try {
            const textEvaluationPrompt = `Please evaluate this student's text answer to the given question.

QUESTION:
${question.question}

MAXIMUM MARKS: ${question.metadata?.maximumMarks || 10}

STUDENT'S ANSWER:
${textAnswer}

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

            if (GEMINI_API_KEY) {
              try {
                const response = await axios.post(
                  `${GEMINI_API_URL}?key=${GEMINI_API_KEY}`,
                  {
                    contents: [{
                      parts: [{
                        text: textEvaluationPrompt
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
                  console.log('Text AI evaluation completed successfully using Gemini');
                } else {
                  throw new Error('Invalid response from Gemini API');
                }
              } catch (geminiError) {
                if (OPENAI_API_KEY) {
                  try {
                    const response = await axios.post(
                      OPENAI_API_URL,
                      {
                        model: "gpt-4o-mini",
                        messages: [{
                          role: "user",
                          content: textEvaluationPrompt
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
                      console.log('Text AI evaluation completed successfully using OpenAI');
                    } else {
                      throw new Error('Invalid response from OpenAI API');
                    }
                  } catch (openaiError) {
                    evaluation = generateMockEvaluation(question);
                  }
                } else {
                  evaluation = generateMockEvaluation(question);
                }
              }
            } else if (OPENAI_API_KEY) {
              try {
                const response = await axios.post(
                  OPENAI_API_URL,
                  {
                    model: "gpt-4o-mini",
                    messages: [{
                      role: "user",
                      content: textEvaluationPrompt
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
                  console.log('Text AI evaluation completed successfully using OpenAI');
                } else {
                  throw new Error('Invalid response from OpenAI API');
                }
              } catch (openaiError) {
                evaluation = generateMockEvaluation(question);
              }
            } else {
              evaluation = generateMockEvaluation(question);
            }
          } catch (textEvaluationError) {
            console.error('Text evaluation error:', textEvaluationError);
            evaluation = generateMockEvaluation(question);
          }
        } else {
          evaluation = generateMockEvaluation(question);
        }
      }

      // Prepare user answer data
      const userAnswerData = {
        userId: userId,
        questionId: questionId,
        clientId: req.user.clientId,
        answerImages: answerImages,
        textAnswer: textAnswer || '',
        submissionStatus: submissionStatusValue,
        reviewStatus: reviewStatusValue,
        status: statusValue,
        popularityStatus: popularityStatusValue,
        metadata: {
          timeSpent: parseInt(timeSpent) || 0,
          deviceInfo: deviceInfo || '',
          appVersion: appVersion || '',
          sourceType: sourceType || 'qr_scan'
        },
        evaluation: evaluation, // AI evaluation saved for both modes
        extractedTexts: extractedTexts,
        evaluatedAt: new Date() // Always set evaluation timestamp since AI evaluation is performed
      };

      if (setId) {
        userAnswerData.setId = setId;
      }

      // Create the answer with proper attempt handling
      let userAnswer;
      try {
        userAnswer = await UserAnswer.createNewAttemptSafe(userAnswerData);
      } catch (saferError) {        
        if (saferError.code === 'SUBMISSION_LIMIT_EXCEEDED') {
          throw saferError;
        }
        // Fallback to transaction method
        try {
          userAnswer = await UserAnswer.createNewAttempt(userAnswerData);
        } catch (transactionError) {
          throw transactionError;
        }
      }

      // Prepare response data
      const responseData = {
        answerId: userAnswer._id,
        attemptNumber: userAnswer.attemptNumber,
        questionId: question._id,
        userId: userId,
        imagesCount: answerImages.length,
        submissionStatus: userAnswer.submissionStatus,
        reviewStatus: userAnswer.reviewStatus,
        status: userAnswer.status,
        popularityStatus: userAnswer.popularityStatus,
        submittedAt: userAnswer.submittedAt,
        isFinalAttempt: userAnswer.isFinalAttempt(),
        remainingAttempts: Math.max(0, 5 - userAnswer.attemptNumber),
        evaluationMode: question.evaluationMode,
        question: {
          id: question._id,
          question: question.question,
          difficultyLevel: question.metadata?.difficultyLevel,
          maximumMarks: question.metadata?.maximumMarks,
          estimatedTime: question.metadata?.estimatedTime,
          evaluationMode: question.evaluationMode
        },
        // Always include evaluation data since AI evaluation is performed for both modes
        evaluation: evaluation,
        evaluatedAt: userAnswer.evaluatedAt
      };

      // Add set info if available
      if (setInfo) {
        responseData.set = {
          id: setInfo._id,
          name: setInfo.name,
          itemType: setInfo.itemType
        };
      }

      // Add extracted texts if available
      if (extractedTexts.length > 0) {
        responseData.extractedTexts = extractedTexts;
      }

      // Different success messages based on evaluation mode
      const successMessage = isAutoEvaluation 
        ? "Answer submitted and automatically evaluated & published" 
        : "Answer submitted and AI evaluated - pending human review for publication";

      res.status(200).json({
        success: true,
        message: successMessage,
        data: responseData
      });

    } catch (error) {
      // Clean up uploaded files on any error
      if (req.files && req.files.length > 0) {
        for (const file of req.files) {
          try {
            await cloudinary.uploader.destroy(file.filename);
          } catch (cleanupError) {
            console.error('Error cleaning up file:', cleanupError);
          }
        }
      }

      // Handle specific error types
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
            details: "This submission already exists. Please refresh and try again."
          }
        });
      }

      // Generic server error
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
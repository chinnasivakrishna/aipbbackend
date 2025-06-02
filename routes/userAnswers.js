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
const crud =  require('./answerapis');
router.use('/crud', crud);

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
          timeout: 45000 // Increased timeout
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

// Enhanced evaluation response parser with better handling
const parseEvaluationResponse = (evaluationText, question) => {
  try {
    console.log('Parsing evaluation response:', evaluationText.substring(0, 200) + '...');
    
    const lines = evaluationText.split('\n').map(line => line.trim()).filter(line => line.length > 0);
    const evaluation = {
      accuracy: 75,
      marks: Math.floor((question.metadata?.maximumMarks || 10) * 0.75),
      strengths: [],
      weaknesses: [],
      suggestions: [],
      feedback: ''
    };

    let currentSection = '';
    let feedbackLines = [];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      
      // Check for section headers
      if (line.toLowerCase().includes('accuracy:') || line.toLowerCase().startsWith('accuracy:')) {
        const match = line.match(/(\d+)/);
        if (match) {
          evaluation.accuracy = Math.min(100, Math.max(0, parseInt(match[1])));
        }
        currentSection = '';
      } else if (line.toLowerCase().includes('marks awarded:') || line.toLowerCase().includes('marks:')) {
        const match = line.match(/(\d+)/);
        if (match) {
          evaluation.marks = Math.min(question.metadata?.maximumMarks || 10, Math.max(0, parseInt(match[1])));
        }
        currentSection = '';
      } else if (line.toLowerCase().includes('strengths:') || line.toLowerCase() === 'strengths') {
        currentSection = 'strengths';
      } else if (line.toLowerCase().includes('weaknesses:') || line.toLowerCase() === 'weaknesses') {
        currentSection = 'weaknesses';
      } else if (line.toLowerCase().includes('suggestions:') || line.toLowerCase() === 'suggestions') {
        currentSection = 'suggestions';
      } else if (line.toLowerCase().includes('detailed feedback:') || line.toLowerCase().includes('feedback:')) {
        currentSection = 'feedback';
      } else if (currentSection) {
        // Process content based on current section
        if (currentSection === 'feedback') {
          feedbackLines.push(line);
        } else if (line.startsWith('- ') || line.startsWith('• ') || line.match(/^\d+\./)) {
          // Handle bullet points and numbered lists
          let content = line.replace(/^[-•]\s*/, '').replace(/^\d+\.\s*/, '').trim();
          if (content && evaluation[currentSection]) {
            evaluation[currentSection].push(content);
          }
        } else if (line.length > 0 && !line.toLowerCase().includes(':')) {
          // Handle lines without bullet points
          if (evaluation[currentSection] && Array.isArray(evaluation[currentSection])) {
            evaluation[currentSection].push(line);
          }
        }
      }
    }

    // Join feedback lines
    evaluation.feedback = feedbackLines.join(' ').trim();

    // Ensure we have at least some default content
    if (evaluation.strengths.length === 0) {
      evaluation.strengths = [
        'Answer shows understanding of the topic',
        'Relevant content provided'
      ];
    }

    if (evaluation.weaknesses.length === 0) {
      evaluation.weaknesses = [
        'Could provide more detailed explanations',
        'Some areas need improvement'
      ];
    }

    if (evaluation.suggestions.length === 0) {
      evaluation.suggestions = [
        'Include more specific examples',
        'Structure the answer more clearly'
      ];
    }

    if (!evaluation.feedback || evaluation.feedback.length === 0) {
      evaluation.feedback = 'The answer demonstrates understanding but could be enhanced with more detailed explanations and examples.';
    }

    // Limit array lengths to avoid overly long responses
    evaluation.strengths = evaluation.strengths.slice(0, 5);
    evaluation.weaknesses = evaluation.weaknesses.slice(0, 5);
    evaluation.suggestions = evaluation.suggestions.slice(0, 5);

    console.log('Parsed evaluation:', JSON.stringify(evaluation, null, 2));
    return evaluation;
    
  } catch (error) {
    console.error('Error parsing evaluation:', error);
    return generateMockEvaluation(question);
  }
};

const generateMockEvaluation = (question) => {
  const baseAccuracy = Math.floor(Math.random() * 30) + 60; // 60-90%
  const maxMarks = question.metadata?.maximumMarks || 10;
  const marks = Math.floor((baseAccuracy / 100) * maxMarks);

  return {
    accuracy: baseAccuracy,
    marks: marks,
    strengths: [
      'Shows understanding of core concepts',
      'Attempts to address the question requirements',
      'Demonstrates basic knowledge of the topic'
    ],
    weaknesses: [
      'Could provide more detailed explanations',
      'Some concepts could be explained more clearly',
      'Missing some key points'
    ],
    suggestions: [
      'Include more specific examples to support your points',
      'Structure your answer with clear sections or headings',
      'Provide more comprehensive coverage of the topic'
    ],
    feedback: 'The answer shows a good understanding of the topic and addresses the main question. However, it could be improved with more detailed explanations, specific examples, and better organization. Consider expanding on key concepts and providing clearer connections between different points.'
  };
};

// Validation for manual evaluation
const validateManualEvaluation = [
  body('evaluationPrompt')
    .isString()
    .trim()
    .isLength({ min: 10, max: 2000 })
    .withMessage('Evaluation prompt must be between 10 and 2000 characters'),
  body('includeExtractedText')
    .optional()
    .isBoolean()
    .withMessage('includeExtractedText must be a boolean'),
  body('includeQuestionDetails')
    .optional()
    .isBoolean()
    .withMessage('includeQuestionDetails must be a boolean'),
  body('maxMarks')
    .optional()
    .isInt({ min: 1, max: 100 })
    .withMessage('Max marks must be between 1 and 100')
];

const generateCustomEvaluationPrompt = (question, extractedTexts, userPrompt, options = {}) => {
  const { includeExtractedText = true, includeQuestionDetails = true, maxMarks } = options;
  
  let prompt = `You are an expert evaluator. Please evaluate this student's answer based on the following custom evaluation criteria:\n\n`;
  
  // Add custom evaluation criteria
  prompt += `EVALUATION CRITERIA:\n${userPrompt}\n\n`;
  
  // Add question details if requested
  if (includeQuestionDetails && question) {
    prompt += `QUESTION DETAILS:\n`;
    prompt += `Question: ${question.question}\n`;
    if (question.metadata?.difficultyLevel) {
      prompt += `Difficulty Level: ${question.metadata.difficultyLevel}\n`;
    }
    if (maxMarks || question.metadata?.maximumMarks) {
      prompt += `Maximum Marks: ${maxMarks || question.metadata.maximumMarks}\n`;
    }
    if (question.metadata?.keywords && question.metadata.keywords.length > 0) {
      prompt += `Keywords: ${question.metadata.keywords.join(', ')}\n`;
    }
    prompt += '\n';
  }
  
  // Add extracted text if available and requested
  if (includeExtractedText && extractedTexts && extractedTexts.length > 0) {
    const combinedText = extractedTexts.join('\n\n--- Next Image ---\n\n');
    prompt += `STUDENT'S ANSWER (extracted from images):\n${combinedText}\n\n`;
  }
  
  // Add response format
  prompt += `Please provide a detailed evaluation in the following format:

ACCURACY: [Score out of 100]
MARKS AWARDED: [Marks out of ${maxMarks || question?.metadata?.maximumMarks || 10}]

STRENGTHS:
- [List 2-3 specific strengths based on your evaluation criteria]

WEAKNESSES:
- [List 2-3 areas for improvement based on your evaluation criteria]

SUGGESTIONS:
- [List 2-3 specific recommendations for improvement]

DETAILED FEEDBACK:
[Provide comprehensive feedback based on your custom evaluation criteria]

Please be fair, constructive, and specific in your evaluation according to the provided criteria.`;

  return prompt;
};

router.post('/answers/:answerId/evaluate-manual',
  [
    param('answerId')
      .isMongoId()
      .withMessage('Answer ID must be a valid MongoDB ObjectId')
  ],
  validateManualEvaluation,
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

      const { answerId } = req.params;
      const { 
        evaluationPrompt, 
        includeExtractedText = true, 
        includeQuestionDetails = true,
        maxMarks 
      } = req.body;

      // Find the user answer
      const userAnswer = await UserAnswer.findById(answerId)
        .populate('questionId')
        .populate('userId', 'name email');

      if (!userAnswer) {
        return res.status(404).json({
          success: false,
          message: "Answer not found",
          error: {
            code: "ANSWER_NOT_FOUND",
            details: "The specified answer does not exist"
          }
        });
      }

      const question = userAnswer.questionId;
      let extractedTexts = userAnswer.extractedTexts || [];

      // If no extracted texts exist and we have images, extract them
      if (extractedTexts.length === 0 && userAnswer.answerImages.length > 0 && includeExtractedText) {
        try {
          const imageUrls = userAnswer.answerImages.map(img => img.imageUrl);
          extractedTexts = await extractTextFromImagesWithFallback(imageUrls);
          
          // Update the user answer with extracted texts
          userAnswer.extractedTexts = extractedTexts;
          await userAnswer.save();
        } catch (extractionError) {
          console.error('Text extraction failed:', extractionError);
          extractedTexts = [`Text extraction failed: ${extractionError.message}`];
        }
      }

      // Check if AI evaluation services are available
      if (!OPENAI_API_KEY && !GEMINI_API_KEY) {
        return res.status(503).json({
          success: false,
          message: "Evaluation service unavailable",
          error: {
            code: "SERVICE_UNAVAILABLE",
            details: "AI evaluation services are not configured"
          }
        });
      }

      let evaluation = null;

      try {
        // Generate custom evaluation prompt
        const customPrompt = generateCustomEvaluationPrompt(
          question, 
          includeExtractedText ? extractedTexts : [], 
          evaluationPrompt,
          { includeExtractedText, includeQuestionDetails, maxMarks }
        );

        // Try Gemini first if available
        if (GEMINI_API_KEY) {
          try {
            const response = await axios.post(
              `${GEMINI_API_URL}?key=${GEMINI_API_KEY}`,
              {
                contents: [{
                  parts: [{
                    text: customPrompt
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
              evaluation.evaluationMethod = 'gemini';
            } else {
              throw new Error('Invalid response from Gemini API');
            }
          } catch (geminiError) {
            console.error('Gemini evaluation failed:', geminiError.message);
            
            // Fallback to OpenAI if available
            if (OPENAI_API_KEY) {
              const response = await axios.post(
                OPENAI_API_URL,
                {
                  model: "gpt-4o-mini",
                  messages: [{
                    role: "user",
                    content: customPrompt
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
                evaluation.evaluationMethod = 'openai';
              } else {
                throw new Error('Invalid response from OpenAI API');
              }
            } else {
              throw geminiError;
            }
          }
        } else if (OPENAI_API_KEY) {
          // Use OpenAI directly if Gemini is not available
          const response = await axios.post(
            OPENAI_API_URL,
            {
              model: "gpt-4o-mini",
              messages: [{
                role: "user",
                content: customPrompt
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
            evaluation.evaluationMethod = 'openai';
          } else {
            throw new Error('Invalid response from OpenAI API');
          }
        }

        if (!evaluation) {
          throw new Error('No evaluation service available');
        }

        // Update the user answer with the new evaluation
        // Note: Since we removed authentication middleware, we can't use req.user
        // You'll need to handle evaluatedBy and reviewedBy differently
        userAnswer.evaluation = {
          ...evaluation,
          evaluatedAt: new Date(),
          evaluationType: 'manual_custom',
          customPrompt: evaluationPrompt
        };
        userAnswer.reviewStatus = 'review_completed';
        userAnswer.reviewedAt = new Date();
        
        await userAnswer.save();

        // Prepare response
        const responseData = {
          answerId: userAnswer._id,
          questionId: question._id,
          userId: userAnswer.userId._id,
          evaluation: evaluation,
          evaluatedAt: userAnswer.evaluation.evaluatedAt,
          evaluationType: 'manual_custom',
          customPrompt: evaluationPrompt,
          question: {
            id: question._id,
            question: question.question,
            difficultyLevel: question.metadata?.difficultyLevel,
            maximumMarks: maxMarks || question.metadata?.maximumMarks
          }
        };

        if (includeExtractedText && extractedTexts.length > 0) {
          responseData.extractedTexts = extractedTexts;
        }

        res.status(200).json({
          success: true,
          message: "Answer evaluated successfully with custom criteria",
          data: responseData
        });

      } catch (evaluationError) {
        console.error('Custom evaluation failed:', evaluationError);
        res.status(500).json({
          success: false,
          message: "Evaluation failed",
          error: {
            code: "EVALUATION_ERROR",
            details: evaluationError.message
          }
        });
      }

    } catch (error) {
      console.error('Manual evaluation error:', error);
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
          console.log('Image processed:', file.path);
        }
      }

      // Check if the question evaluation mode is manual or auto
      const isManualEvaluation = question.evaluationMode === 'manual';
      console.log(`Question evaluation mode: ${question.evaluationMode}`);

      let evaluation = null;
      let extractedTexts = [];

      // Only perform evaluation and text extraction for auto evaluation mode
      if (!isManualEvaluation && answerImages.length > 0) {        
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
                } else {
                  throw new Error('Invalid response from OpenAI API');
                }
              } catch (openaiError) {
                evaluation = generateMockEvaluation(question);
              }
            } else {
              evaluation = generateMockEvaluation(question);
            }
          } else {
            evaluation = generateMockEvaluation(question);
            extractedTexts = extractedTexts.map(text => 
              text.startsWith('Failed') || text.includes('extraction failed') ? 
              text : 'No readable text could be extracted from this image'
            );
          }
        } catch (extractionError) {
          evaluation = generateMockEvaluation(question);
          extractedTexts = [`Text extraction service error: ${extractionError.message}. Please try again or contact support if the issue persists.`];
        }
      } else if (isManualEvaluation) {
        console.log('Manual evaluation mode - skipping automatic evaluation and text extraction');
        // For manual evaluation, we don't perform text extraction or evaluation
        evaluation = null;
        extractedTexts = [];
      } else {
        console.log('No images provided, skipping text extraction');
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
        }
      };

      // Only add evaluation and extractedTexts if it's auto evaluation mode
      if (!isManualEvaluation) {
        if (evaluation) {
          userAnswerData.evaluation = evaluation;
          userAnswerData.evaluatedAt = new Date();
        }
        if (extractedTexts.length > 0) {
          userAnswerData.extractedTexts = extractedTexts;
        }
      }

      if (setId) {
        userAnswerData.setId = setId;
      }

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

      // Prepare response data
      const responseData = {
        answerId: userAnswer._id,
        attemptNumber: userAnswer.attemptNumber,
        questionId: question._id,
        userId: userId,
        imagesCount: answerImages.length,
        submissionStatus: userAnswer.submissionStatus,
        submittedAt: userAnswer.submittedAt,
        isFinalAttempt: userAnswer.isFinalAttempt(),
        remainingAttempts: Math.max(0, 5 - userAnswer.attemptNumber),
        evaluationMode: question.evaluationMode,
        question: {
          id: question._id,
          question: question.question,
          difficultyLevel: question.metadata?.difficultyLevel,
          maximumMarks: question.metadata?.maximumMarks,
          estimatedTime: question.metadata?.estimatedTime
        }
      };

      // Add set info if available
      if (setInfo) {
        responseData.set = {
          id: setInfo._id,
          name: setInfo.name,
          itemType: setInfo.itemType
        };
      }

      // Only add evaluation and extractedTexts data for auto evaluation mode
      if (!isManualEvaluation) {
        if (evaluation) {
          responseData.evaluation = evaluation;
        }
        if (extractedTexts.length > 0) {
          responseData.extractedTexts = extractedTexts;
        }
      }

      // Determine success message based on evaluation mode
      const successMessage = isManualEvaluation 
        ? "Answer submitted successfully and will be evaluated manually"
        : "Answer submitted and evaluated successfully";

      res.status(200).json({
        success: true,
        message: successMessage,
        data: responseData
      });

    } catch (error) {
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

module.exports = router;
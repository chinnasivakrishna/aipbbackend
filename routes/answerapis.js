const express = require('express');
const router = express.Router();
const UserAnswer = require('../models/UserAnswer');
const AiswbQuestion = require('../models/AiswbQuestion');
const AISWBSet = require('../models/AISWBSet');
const { validationResult, param, body, query } = require('express-validator');

// GET /crud/answers - List all submitted answers with pagination and filters
router.get('/answers', [
  query('page')
    .optional()
    .isInt({ min: 1 })
    .withMessage('Page must be a positive integer'),
  query('limit')
    .optional()
    .isInt({ min: 1, max: 100 })
    .withMessage('Limit must be between 1 and 100'),
  query('publishStatus')
    .optional()
    .isIn(['published', 'not_published'])
    .withMessage('Invalid publish status filter'),
  query('submissionStatus')
    .optional()
    .isIn(['submitted', 'rejected', 'evaluated'])
    .withMessage('Invalid submission status filter'),
  query('reviewStatus')
    .optional()
    .isIn(['review_pending', 'review_accepted', 'review_completed'])
    .withMessage('Invalid review status filter'),
  query('evaluationMode')
    .optional()
    .isIn(['auto', 'manual'])
    .withMessage('Invalid evaluation mode filter'),
  query('search')
    .optional()
    .isString()
    .trim()
    .isLength({ max: 100 })
    .withMessage('Search term must be less than 100 characters')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: "Invalid query parameters",
        error: {
          code: "INVALID_QUERY",
          details: errors.array()
        }
      });
    }

    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const skip = (page - 1) * limit;

    // Build filter object
    const filter = {};
    
    if (req.query.publishStatus) {
      filter.publishStatus = req.query.publishStatus;
    }
    
    if (req.query.submissionStatus) {
      filter.submissionStatus = req.query.submissionStatus;
    }
    
    if (req.query.reviewStatus) {
      filter.reviewStatus = req.query.reviewStatus;
    }

    // Build aggregation pipeline
    const pipeline = [
      { $match: filter },
      {
        $lookup: {
          from: 'aiswbquestions',
          localField: 'questionId',
          foreignField: '_id',
          as: 'question'
        }
      },
      {
        $lookup: {
          from: 'mobileusers',
          localField: 'userId',
          foreignField: '_id',
          as: 'user'
        }
      },
      {
        $lookup: {
          from: 'aiswbsets',
          localField: 'setId',
          foreignField: '_id',
          as: 'set'
        }
      },
      {
        $unwind: {
          path: '$question',
          preserveNullAndEmptyArrays: false
        }
      },
      {
        $unwind: {
          path: '$user',
          preserveNullAndEmptyArrays: false
        }
      },
      {
        $unwind: {
          path: '$set',
          preserveNullAndEmptyArrays: true
        }
      }
    ];

    // Add evaluation mode filter if specified
    if (req.query.evaluationMode) {
      pipeline.push({
        $match: {
          'question.evaluationMode': req.query.evaluationMode
        }
      });
    }

    // Add search functionality
    if (req.query.search) {
      const searchRegex = new RegExp(req.query.search, 'i');
      pipeline.push({
        $match: {
          $or: [
            { 'question.question': searchRegex },
            { 'user.name': searchRegex },
            { 'user.email': searchRegex },
            { textAnswer: searchRegex }
          ]
        }
      });
    }

    // Add projection to select only needed fields
    pipeline.push({
      $project: {
        _id: 1,
        userId: 1,
        questionId: 1,
        setId: 1,
        attemptNumber: 1,
        answerImages: 1,
        textAnswer: 1,
        submissionStatus: 1,
        reviewStatus: 1,
        publishStatus: 1,
        popularityStatus: 1,
        submittedAt: 1,
        reviewedAt: 1,
        evaluatedAt: 1,
        evaluation: 1,
        feedback: 1,
        extractedTexts: 1,
        metadata: 1,
        annotations: 1,
        'question._id': 1,
        'question.question': 1,
        'question.evaluationMode': 1,
        'question.evaluationType': 1,
        'question.metadata.difficultyLevel': 1,
        'question.metadata.maximumMarks': 1,
        'question.metadata.estimatedTime': 1,
        'user._id': 1,
        'user.name': 1,
        'user.email': 1,
        'user.phoneNumber': 1,
        'set._id': 1,
        'set.name': 1,
        'set.itemType': 1
      }
    });

    // Add sorting
    pipeline.push({
      $sort: { submittedAt: -1 }
    });

    // Get total count for pagination
    const countPipeline = [...pipeline];
    countPipeline.push({ $count: "total" });
    
    const [countResult] = await UserAnswer.aggregate(countPipeline);
    const totalCount = countResult ? countResult.total : 0;

    // Add pagination
    pipeline.push({ $skip: skip });
    pipeline.push({ $limit: limit });

    const answers = await UserAnswer.aggregate(pipeline);

    const totalPages = Math.ceil(totalCount / limit);

    res.status(200).json({
      success: true,
      message: "Answers retrieved successfully",
      data: {
        answers: answers,
        pagination: {
          currentPage: page,
          totalPages: totalPages,
          totalCount: totalCount,
          limit: limit,
          hasNextPage: page < totalPages,
          hasPrevPage: page > 1
        }
      }
    });

  } catch (error) {
    console.error('Error fetching answers:', error);
    res.status(500).json({
      success: false,
      message: "Internal server error",
      error: {
        code: "SERVER_ERROR",
        details: error.message
      }
    });
  }
});

// GET /crud/answers/evaluated - List all evaluated answers
router.get('/answers/evaluated', [
  query('page')
    .optional()
    .isInt({ min: 1 })
    .withMessage('Page must be a positive integer'),
  query('limit')
    .optional()
    .isInt({ min: 1, max: 100 })
    .withMessage('Limit must be between 1 and 100'),
  query('evaluationMode')
    .optional()
    .isIn(['auto', 'manual'])
    .withMessage('Invalid evaluation mode filter')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: "Invalid query parameters",
        error: {
          code: "INVALID_QUERY",
          details: errors.array()
        }
      });
    }

    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const skip = (page - 1) * limit;

    // Build filter for evaluated answers
    const filter = {
      submissionStatus: 'evaluated',
      evaluatedAt: { $exists: true, $ne: null }
    };

    const pipeline = [
      { $match: filter },
      {
        $lookup: {
          from: 'aiswbquestions',
          localField: 'questionId',
          foreignField: '_id',
          as: 'question'
        }
      },
      {
        $lookup: {
          from: 'mobileusers',
          localField: 'userId',
          foreignField: '_id',
          as: 'user'
        }
      },
      {
        $lookup: {
          from: 'aiswbsets',
          localField: 'setId',
          foreignField: '_id',
          as: 'set'
        }
      },
      {
        $unwind: {
          path: '$question',
          preserveNullAndEmptyArrays: false
        }
      },
      {
        $unwind: {
          path: '$user',
          preserveNullAndEmptyArrays: false
        }
      },
      {
        $unwind: {
          path: '$set',
          preserveNullAndEmptyArrays: true
        }
      }
    ];

    // Add evaluation mode filter if specified
    if (req.query.evaluationMode) {
      pipeline.push({
        $match: {
          'question.evaluationMode': req.query.evaluationMode
        }
      });
    }

    // Add projection
    pipeline.push({
      $project: {
        _id: 1,
        userId: 1,
        questionId: 1,
        setId: 1,
        attemptNumber: 1,
        answerImages: 1,
        textAnswer: 1,
        submissionStatus: 1,
        reviewStatus: 1,
        publishStatus: 1,
        popularityStatus: 1,
        submittedAt: 1,
        reviewedAt: 1,
        evaluatedAt: 1,
        evaluation: 1,
        extractedTexts: 1,
        metadata: 1,
        annotations: 1,
        'question._id': 1,
        'question.question': 1,
        'question.evaluationMode': 1,
        'question.metadata.difficultyLevel': 1,
        'question.metadata.maximumMarks': 1,
        'question.metadata.estimatedTime': 1,
        'user._id': 1,
        'user.name': 1,
        'user.email': 1,
        'user.phoneNumber': 1,
        'set._id': 1,
        'set.name': 1,
        'set.itemType': 1
      }
    });

    // Add sorting
    pipeline.push({
      $sort: { evaluatedAt: -1 }
    });

    // Get total count
    const countPipeline = [...pipeline];
    countPipeline.push({ $count: "total" });
    
    const [countResult] = await UserAnswer.aggregate(countPipeline);
    const totalCount = countResult ? countResult.total : 0;

    // Add pagination
    pipeline.push({ $skip: skip });
    pipeline.push({ $limit: limit });

    const evaluatedAnswers = await UserAnswer.aggregate(pipeline);

    const totalPages = Math.ceil(totalCount / limit);

    res.status(200).json({
      success: true,
      message: "Evaluated answers retrieved successfully",
      data: {
        answers: evaluatedAnswers,
        pagination: {
          currentPage: page,
          totalPages: totalPages,
          totalCount: totalCount,
          limit: limit,
          hasNextPage: page < totalPages,
          hasPrevPage: page > 1
        }
      }
    });

  } catch (error) {
    console.error('Error fetching evaluated answers:', error);
    res.status(500).json({
      success: false,
      message: "Internal server error",
      error: {
        code: "SERVER_ERROR",
        details: error.message
      }
    });
  }
});

// PUT /crud/answers/:answerId/evaluate - Evaluate answer (for manual mode)
router.put('/answers/:answerId/evaluate', [
  param('answerId')
    .isMongoId()
    .withMessage('Answer ID must be a valid MongoDB ObjectId'),
  body('evaluation')
    .optional()
    .isObject()
    .withMessage('Evaluation must be an object'),
  body('evaluation.accuracy')
    .optional()
    .isInt({ min: 0, max: 100 })
    .withMessage('Accuracy must be between 0 and 100'),
  body('evaluation.marks')
    .optional()
    .isInt({ min: 0 })
    .withMessage('Marks must be a positive integer'),
  body('evaluation.strengths')
    .optional()
    .isArray()
    .withMessage('Strengths must be an array'),
  body('evaluation.weaknesses')
    .optional()
    .isArray()
    .withMessage('Weaknesses must be an array'),
  body('evaluation.suggestions')
    .optional()
    .isArray()
    .withMessage('Suggestions must be an array'),
  body('evaluation.feedback')
    .optional()
    .isString()
    .trim()
    .withMessage('Feedback must be a string'),
  body('publish')
    .optional()
    .isBoolean()
    .withMessage('Publish must be a boolean')
], async (req, res) => {
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
    const { evaluation, publish = false } = req.body;

    // Find the answer with question details
    const answer = await UserAnswer.findById(answerId).populate('questionId');
    if (!answer) {
      return res.status(404).json({
        success: false,
        message: "Answer not found",
        error: {
          code: "ANSWER_NOT_FOUND",
          details: "The specified answer does not exist"
        }
      });
    }

    // Check if question is in manual evaluation mode
    if (answer.questionId.evaluationMode !== 'manual') {
      return res.status(400).json({
        success: false,
        message: "Answer is not in manual evaluation mode",
        error: {
          code: "INVALID_EVALUATION_MODE",
          details: "Only answers in manual evaluation mode can be manually evaluated"
        }
      });
    }

    // Prepare update data
    const updateData = {
      submissionStatus: 'evaluated',
      evaluatedAt: new Date()
    };

    // Update evaluation if provided
    if (evaluation) {
      updateData.evaluation = {
        ...answer.evaluation,
        ...evaluation
      };
    }

    // Handle publish status
    if (publish) {
      updateData.publishStatus = 'published';
    }

    const updatedAnswer = await UserAnswer.findByIdAndUpdate(
      answerId,
      updateData,
      { new: true, runValidators: true }
    ).populate([
      {
        path: 'questionId',
        select: 'question evaluationMode metadata'
      },
      {
        path: 'userId',
        select: 'name email phoneNumber'
      },
      {
        path: 'setId',
        select: 'name itemType'
      }
    ]);

    res.status(200).json({
      success: true,
      message: publish ? "Answer evaluated and published successfully" : "Answer evaluated successfully",
      data: {
        answer: updatedAnswer
      }
    });

  } catch (error) {
    console.error('Error evaluating answer:', error);
    res.status(500).json({
      success: false,
      message: "Internal server error",
      error: {
        code: "SERVER_ERROR",
        details: error.message
      }
    });
  }
});

// PUT /crud/answers/:answerId/publish - Publish answer
router.put('/answers/:answerId/publish', [
  param('answerId')
    .isMongoId()
    .withMessage('Answer ID must be a valid MongoDB ObjectId')
], async (req, res) => {
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

    const answer = await UserAnswer.findById(answerId);
    if (!answer) {
      return res.status(404).json({
        success: false,
        message: "Answer not found",
        error: {
          code: "ANSWER_NOT_FOUND",
          details: "The specified answer does not exist"
        }
      });
    }

    // Check if answer is evaluated
    if (answer.submissionStatus !== 'evaluated') {
      return res.status(400).json({
        success: false,
        message: "Answer must be evaluated before publishing",
        error: {
          code: "ANSWER_NOT_EVALUATED",
          details: "Only evaluated answers can be published"
        }
      });
    }

    const updatedAnswer = await UserAnswer.findByIdAndUpdate(
      answerId,
      {
        publishStatus: 'published',
        // reviewStatus: 'review_completed'
      },
      { new: true, runValidators: true }
    ).populate([
      {
        path: 'questionId',
        select: 'question evaluationMode metadata'
      },
      {
        path: 'userId',
        select: 'name email phoneNumber'
      },
      {
        path: 'setId',
        select: 'name itemType'
      }
    ]);

    res.status(200).json({
      success: true,
      message: "Answer published successfully",
      data: {
        answer: updatedAnswer
      }
    });

  } catch (error) {
    console.error('Error publishing answer:', error);
    res.status(500).json({
      success: false,
      message: "Internal server error",
      error: {
        code: "SERVER_ERROR",
        details: error.message
      }
    });
  }
});

// PUT /crud/answers/:answerId/unpublish - Unpublish answer
router.put('/answers/:answerId/unpublish', [
  param('answerId')
    .isMongoId()
    .withMessage('Answer ID must be a valid MongoDB ObjectId')
], async (req, res) => {
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

    const answer = await UserAnswer.findById(answerId);
    if (!answer) {
      return res.status(404).json({
        success: false,
        message: "Answer not found",
        error: {
          code: "ANSWER_NOT_FOUND",
          details: "The specified answer does not exist"
        }
      });
    }

    const updatedAnswer = await UserAnswer.findByIdAndUpdate(
      answerId,
      {
        publishStatus: 'not_published',
        // reviewStatus: 'review_accepted'
      },
      { new: true, runValidators: true }
    ).populate([
      {
        path: 'questionId',
        select: 'question evaluationMode metadata'
      },
      {
        path: 'userId',
        select: 'name email phoneNumber'
      },
      {
        path: 'setId',
        select: 'name itemType'
      }
    ]);

    res.status(200).json({
      success: true,
      message: "Answer unpublished successfully",
      data: {
        answer: updatedAnswer
      }
    });

  } catch (error) {
    console.error('Error unpublishing answer:', error);
    res.status(500).json({
      success: false,
      message: "Internal server error",
      error: {
        code: "SERVER_ERROR",
        details: error.message
      }
    });
  }
});

// PUT /crud/answers/:answerId/status - Update answer status
router.put('/answers/:answerId/status', [
  param('answerId')
    .isMongoId()
    .withMessage('Answer ID must be a valid MongoDB ObjectId'),
  body('publishStatus')
    .optional()
    .isIn(['published', 'not_published'])
    .withMessage('Publish status must be either published or not_published'),
  body('submissionStatus')
    .optional()
    .isIn(['submitted', 'rejected', 'evaluated'])
    .withMessage('Submission status must be valid'),
  body('reviewStatus')
    .optional()
    .isIn(['review_pending', 'review_accepted', 'review_completed'])
    .withMessage('Review status must be valid'),
  body('popularityStatus')
    .optional()
    .isIn(['popular', 'not_popular'])
    .withMessage('Popularity status must be valid')
], async (req, res) => {
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
    const { publishStatus, submissionStatus, reviewStatus, popularityStatus } = req.body;

    const answer = await UserAnswer.findById(answerId);
    if (!answer) {
      return res.status(404).json({
        success: false,
        message: "Answer not found",
        error: {
          code: "ANSWER_NOT_FOUND",
          details: "The specified answer does not exist"
        }
      });
    }

    // Prepare update data
    const updateData = {};
    
    if (publishStatus !== undefined) {
      updateData.publishStatus = publishStatus;
    }
    
    if (submissionStatus !== undefined) {
      updateData.submissionStatus = submissionStatus;
    }
    
    if (reviewStatus !== undefined) {
      updateData.reviewStatus = reviewStatus;
    }
    
    if (popularityStatus !== undefined) {
      updateData.popularityStatus = popularityStatus;
    }

    // // Add timestamps based on status changes
    // if (reviewStatus === 'review_completed' && !answer.reviewedAt) {
    //   updateData.reviewedAt = new Date();
    // }

    const updatedAnswer = await UserAnswer.findByIdAndUpdate(
      answerId,
      updateData,
      { new: true, runValidators: true }
    ).populate([
      {
        path: 'questionId',
        select: 'question evaluationMode metadata'
      },
      {
        path: 'userId',
        select: 'name email phoneNumber'
      },
      {
        path: 'setId',
        select: 'name itemType'
      }
    ]);

    res.status(200).json({
      success: true,
      message: "Answer status updated successfully",
      data: {
        answer: updatedAnswer
      }
    });

  } catch (error) {
    console.error('Error updating answer status:', error);
    res.status(500).json({
      success: false,
      message: "Internal server error",
      error: {
        code: "SERVER_ERROR",
        details: error.message
      }
    });
  }
});

// GET /crud/answers/:answerId - Get single answer details
router.get('/answers/:answerId', [
  param('answerId')
    .isMongoId()
    .withMessage('Answer ID must be a valid MongoDB ObjectId')
], async (req, res) => {
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

    const answer = await UserAnswer.findById(answerId).populate([
      {
        path: 'questionId',
        select: 'question detailedAnswer evaluationMode metadata'
      },
      {
        path: 'userId',
        select: 'name email phoneNumber'
      },
      {
        path: 'setId',
        select: 'name itemType description'
      }
    ]);

    if (!answer) {
      return res.status(404).json({
        success: false,
        message: "Answer not found",
        error: {
          code: "ANSWER_NOT_FOUND",
          details: "The specified answer does not exist"
        }
      });
    }

    res.status(200).json({
      success: true,
      message: "Answer retrieved successfully",
      data: {
        answer: answer
      }
    });

  } catch (error) {
    console.error('Error fetching answer:', error);
    res.status(500).json({
      success: false,
      message: "Internal server error",
      error: {
        code: "SERVER_ERROR",
        details: error.message
      }
    });
  }
});

module.exports = router;

const express = require('express');
const router = express.Router();
const UserAnswer = require('../models/UserAnswer');
const AiswbQuestion = require('../models/AiswbQuestion');
const Evaluation = require('../models/Evaluation');
const UserProfile = require('../models/UserProfile');

// Get question submissions as per the documentation
router.get('/questions/:questionId/submissions', async (req, res) => {
  try {
    const { questionId } = req.params;
    const { 
      page = 1, 
      limit = 10, 
      status = 'submitted',
      sortBy = 'submittedAt',
      sortOrder = 'desc' 
    } = req.query;

    // Validate question exists
    const question = await AiswbQuestion.findById(questionId);
    if (!question) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'QUESTION_NOT_FOUND',
          message: 'Question not found'
        }
      });
    }

    // Build query
    const query = { questionId };
    if (status) {
      // Map API status to database field
      const statusMap = {
        'submitted': 'submitted',
        'evaluated': 'reviewed',
        'review': 'draft',
        'rejected': 'rejected'
      };
      query.submissionStatus = statusMap[status] || status;
    }

    // Build sort
    const sort = {};
    if (sortBy === 'submittedAt') {
      sort.submittedAt = sortOrder === 'asc' ? 1 : -1;
    } else if (sortBy === 'marks') {
      sort['feedback.score'] = sortOrder === 'asc' ? 1 : -1;
    } else if (sortBy === 'accuracy') {
      sort['feedback.accuracy'] = sortOrder === 'asc' ? 1 : -1;
    } else {
      sort.submittedAt = -1; // default
    }

    const skip = (page - 1) * limit;

    const [answers, total] = await Promise.all([
      UserAnswer.find(query)
        .populate('userId', 'mobile clientId')
        .populate('questionId', 'question detailedAnswer metadata')
        .sort(sort)
        .skip(skip)
        .limit(parseInt(limit)),
      UserAnswer.countDocuments(query)
    ]);

    // Get user profiles separately
    const userIds = answers.map(answer => answer.userId?._id).filter(Boolean);
    const userProfiles = await UserProfile.find({ userId: { $in: userIds } });

    // Get evaluations for these answers
    const answerIds = answers.map(a => a._id);
    const evaluations = await Evaluation.find({ submissionId: { $in: answerIds } });

    // Format response as per documentation
    const submissions = answers.map(answer => {
      const evaluation = evaluations.find(e => e.submissionId.equals(answer._id));
      const profile = userProfiles.find(p => p.userId.equals(answer.userId?._id));
      
      return {
        id: answer._id,
        studentName: profile?.name || answer.userId?.mobile || 'Unknown',
        submittedAt: answer.submittedAt,
        status: answer.submissionStatus,
        answerImages: answer.answerImages.map(img => ({
          imageId: img.cloudinaryPublicId || img._id,
          imageUrl: img.imageUrl,
          uploadedAt: img.uploadedAt,
          imageType: 'answer',
          imageSize: img.size || 0,
          imageFormat: img.format || 'jpg'
        })),
        evaluation: evaluation ? {
          evaluationId: evaluation._id,
          evaluationMode: evaluation.evaluationMode || 'auto',
          marks: evaluation.marks || evaluation.geminiAnalysis?.accuracy || 0,
          accuracy: evaluation.geminiAnalysis?.accuracy || 0,
          status: evaluation.status,
          evaluatedAt: evaluation.evaluatedAt,
          evaluatedBy: evaluation.evaluatedBy || 'system',
          feedback: evaluation.feedback || '',
          geminiAnalysis: evaluation.geminiAnalysis || {
            accuracy: 0,
            strengths: [],
            weaknesses: [],
            suggestions: []
          },
          extractedTexts: evaluation.extractedTexts || []
        } : null
      };
    });

    res.json({
      success: true,
      data: {
        submissions,
        pagination: {
          total,
          page: parseInt(page),
          limit: parseInt(limit),
          totalPages: Math.ceil(total / limit)
        },
        questionDetails: {
          questionId: question._id,
          title: question.question,
          description: question.detailedAnswer,
          metadata: {
            maximumMarks: question.metadata?.maximumMarks || 100,
            qualityParameters: question.metadata?.qualityParameters || {}
          }
        }
      }
    });

  } catch (error) {
    console.error('Error fetching question submissions:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_SERVER_ERROR',
        message: 'An error occurred while fetching submissions'
      }
    });
  }
});

// Start evaluation for a submission
router.post('/submissions/:submissionId/evaluate', async (req, res) => {
  try {
    const { submissionId } = req.params;
    const { evaluationMode = 'auto', config = {} } = req.body;

    // Find the submission by ID - no need to populate initially
    const submission = await UserAnswer.findById(submissionId);
    
    if (!submission) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'SUBMISSION_NOT_FOUND',
          message: 'Submission not found'
        }
      });
    }

    // Now populate the necessary fields
    await submission.populate('questionId');
    await submission.populate('userId');

    // Check if evaluation already exists
    let evaluation = await Evaluation.findOne({ submissionId });
    
    if (!evaluation) {
      // Create new evaluation
      evaluation = new Evaluation({
        submissionId,
        questionId: submission.questionId._id,
        userId: submission.userId._id,
        clientId: submission.clientId,
        extractedTexts: [],
        geminiAnalysis: {
          accuracy: 0,
          strengths: [],
          weaknesses: [],
          suggestions: []
        },
        status: 'not_published',
        evaluationMode,
        evaluatedBy: config.evaluatorId || 'system'
      });
    }

    if (evaluationMode === 'auto') {
      // Simulate auto evaluation
      const mockAccuracy = Math.floor(Math.random() * 40) + 60; // 60-100
      evaluation.geminiAnalysis = {
        accuracy: mockAccuracy,
        strengths: ['Clear presentation', 'Good understanding of concepts'],
        weaknesses: ['Could be more detailed', 'Missing some examples'],
        suggestions: ['Add more examples', 'Elaborate on key points']
      };
      evaluation.extractedTexts = ['Sample extracted text from image'];
      evaluation.marks = mockAccuracy;
      
      if (config.autoPublish) {
        evaluation.status = 'published';
      }
    } else {
      // Manual mode - set to review status
      evaluation.status = 'not_published';
      if (config.evaluatorId) {
        evaluation.evaluatedBy = config.evaluatorId;
      }
    }

    await evaluation.save();

    // Update submission status - DO NOT try to save the entire submission
    // Just update the specific field to avoid validation issues
    await UserAnswer.findByIdAndUpdate(
      submissionId, 
      { submissionStatus: 'reviewed' },
      { new: false, runValidators: false }
    );

    res.json({
      success: true,
      data: {
        evaluationId: evaluation._id,
        evaluationMode,
        status: evaluation.status,
        marks: evaluation.marks || 0,
        accuracy: evaluation.geminiAnalysis?.accuracy || 0,
        autoEvaluationDetails: evaluationMode === 'auto' ? {
          processingTime: 2.5,
          confidenceScore: 0.85,
          autoPublishReason: config.autoPublish ? 'Auto-publish enabled' : 'Manual review required'
        } : undefined
      }
    });

  } catch (error) {
    console.error('Error starting evaluation:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'EVALUATION_FAILED',
        message: 'Failed to start evaluation'
      }
    });
  }
});

// Update evaluation
router.put('/submissions/:submissionId/evaluation', async (req, res) => {
  try {
    const { submissionId } = req.params;
    const { marks, feedback, status, evaluationMode = 'manual' } = req.body;

    const evaluation = await Evaluation.findOne({ submissionId });
    if (!evaluation) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'EVALUATION_NOT_FOUND',
          message: 'Evaluation not found'
        }
      });
    }

    // Update evaluation fields
    if (marks !== undefined) evaluation.marks = marks;
    if (feedback !== undefined) evaluation.feedback = feedback;
    if (status !== undefined) evaluation.status = status;
    evaluation.evaluationMode = evaluationMode;
    evaluation.updatedAt = new Date();

    await evaluation.save();

    res.json({
      success: true,
      data: {
        evaluationId: evaluation._id,
        marks: evaluation.marks,
        feedback: evaluation.feedback,
        status: evaluation.status,
        evaluationMode: evaluation.evaluationMode,
        updatedAt: evaluation.updatedAt
      }
    });

  } catch (error) {
    console.error('Error updating evaluation:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'UPDATE_FAILED',
        message: 'Failed to update evaluation'
      }
    });
  }
});

// Publish evaluation
router.post('/submissions/:submissionId/publish', async (req, res) => {
  try {
    const { submissionId } = req.params;
    const { evaluationMode = 'manual', publishReason = '' } = req.body;

    const evaluation = await Evaluation.findOne({ submissionId });
    if (!evaluation) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'EVALUATION_NOT_FOUND',
          message: 'Evaluation not found'
        }
      });
    }

    evaluation.status = 'published';
    evaluation.evaluationMode = evaluationMode;
    evaluation.updatedAt = new Date();

    // Add to publish history if it doesn't exist
    if (!evaluation.publishHistory) {
      evaluation.publishHistory = [];
    }
    evaluation.publishHistory.push({
      status: 'published',
      timestamp: new Date(),
      changedBy: 'system',
      mode: evaluationMode,
      reason: publishReason
    });

    await evaluation.save();

    res.json({
      success: true,
      data: {
        evaluationId: evaluation._id,
        status: evaluation.status,
        publishedAt: evaluation.updatedAt,
        evaluationMode,
        publishReason
      }
    });

  } catch (error) {
    console.error('Error publishing evaluation:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'PUBLISH_FAILED',
        message: 'Failed to publish evaluation'
      }
    });
  }
});

// Get all answers for a specific question (admin access) - Legacy support
router.get('/question/:questionId', async (req, res) => {
  try {
    const { questionId } = req.params;
    const { page = 1, limit = 10, status } = req.query;

    // Validate question exists
    const question = await AiswbQuestion.findById(questionId);
    if (!question) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'QUESTION_NOT_FOUND',
          message: 'Question not found'
        }
      });
    }

    // Build query
    const query = { questionId };
    if (status) {
      query.submissionStatus = status;
    }

    const skip = (page - 1) * limit;

    const [answers, total] = await Promise.all([
      UserAnswer.find(query)
        .populate('userId', 'mobile clientId')
        .populate('questionId', 'question metadata')
        .sort({ submittedAt: -1 })
        .skip(skip)
        .limit(parseInt(limit)),
      UserAnswer.countDocuments(query)
    ]);

    // Get user profiles separately
    const userIds = answers.map(answer => answer.userId?._id).filter(Boolean);
    const userProfiles = await UserProfile.find({ userId: { $in: userIds } });

    // Get evaluations for these answers
    const answerIds = answers.map(a => a._id);
    const evaluations = await Evaluation.find({ submissionId: { $in: answerIds } });

    // Map evaluations to answers
    const answersWithEvaluations = answers.map(answer => {
      const evaluation = evaluations.find(e => e.submissionId.equals(answer._id));
      const profile = userProfiles.find(p => p.userId.equals(answer.userId?._id));
      
      return {
        ...answer.toObject(),
        evaluation: evaluation || null,
        userProfile: profile || null
      };
    });

    res.json({
      success: true,
      data: {
        answers: answersWithEvaluations,
        pagination: {
          total,
          page: parseInt(page),
          limit: parseInt(limit),
          totalPages: Math.ceil(total / limit)
        },
        questionDetails: {
          questionId: question._id,
          question: question.question,
          metadata: question.metadata
        }
      }
    });

  } catch (error) {
    console.error('Error fetching question answers:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_SERVER_ERROR',
        message: 'An error occurred while fetching answers'
      }
    });
  }
});

// Get all evaluations for a specific question (admin access)
router.get('/question/:questionId/evaluations', async (req, res) => {
  try {
    const { questionId } = req.params;
    const { page = 1, limit = 10, status } = req.query;

    // Build evaluation query
    const query = { questionId };
    if (status) {
      query.status = status;
    }

    const skip = (page - 1) * limit;

    const [evaluations, total] = await Promise.all([
      Evaluation.find(query)
        .populate('submissionId', 'attemptNumber submittedAt')
        .populate('questionId', 'question metadata')
        .populate('userId', 'mobile clientId')
        .sort({ evaluatedAt: -1 })
        .skip(skip)
        .limit(parseInt(limit)),
      Evaluation.countDocuments(query)
    ]);

    // Get user profiles separately
    const userIds = evaluations.map(eval => eval.userId?._id).filter(Boolean);
    const userProfiles = await UserProfile.find({ userId: { $in: userIds } });

    // Add user profiles to evaluations
    const evaluationsWithProfiles = evaluations.map(evaluation => {
      const profile = userProfiles.find(p => p.userId.equals(evaluation.userId?._id));
      return {
        ...evaluation.toObject(),
        userProfile: profile || null
      };
    });

    res.json({
      success: true,
      data: {
        evaluations: evaluationsWithProfiles,
        pagination: {
          total,
          page: parseInt(page),
          limit: parseInt(limit),
          totalPages: Math.ceil(total / limit)
        }
      }
    });

  } catch (error) {
    console.error('Error fetching question evaluations:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_SERVER_ERROR',
        message: 'An error occurred while fetching evaluations'
      }
    });
  }
});

// Get all answers for a specific user (admin access)
router.get('/user/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const { page = 1, limit = 10, status } = req.query;

    // Build query
    const query = { userId };
    if (status) {
      query.submissionStatus = status;
    }

    const skip = (page - 1) * limit;

    const [answers, total] = await Promise.all([
      UserAnswer.find(query)
        .populate('questionId', 'question metadata')
        .sort({ submittedAt: -1 })
        .skip(skip)
        .limit(parseInt(limit)),
      UserAnswer.countDocuments(query)
    ]);

    // Get evaluations for these answers
    const answerIds = answers.map(a => a._id);
    const evaluations = await Evaluation.find({ submissionId: { $in: answerIds } });

    // Map evaluations to answers
    const answersWithEvaluations = answers.map(answer => {
      const evaluation = evaluations.find(e => e.submissionId.equals(answer._id));
      return {
        ...answer.toObject(),
        evaluation: evaluation || null
      };
    });

    res.json({
      success: true,
      data: {
        answers: answersWithEvaluations,
        pagination: {
          total,
          page: parseInt(page),
          limit: parseInt(limit),
          totalPages: Math.ceil(total / limit)
        }
      }
    });

  } catch (error) {
    console.error('Error fetching user answers:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_SERVER_ERROR',
        message: 'An error occurred while fetching user answers'
      }
    });
  }
});

module.exports = router;
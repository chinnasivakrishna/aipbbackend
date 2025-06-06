// routes/mobileSubmittedAnswers.js
const express = require('express');
const router = express.Router();
const UserAnswer = require('../models/UserAnswer');
const AiswbQuestion = require('../models/AiswbQuestion');
const { authenticateMobileUser } = require('../middleware/mobileAuth');

// Apply authentication middleware to all routes
router.use(authenticateMobileUser);

/**
 * GET /api/clients/:clientId/mobile/submitted-answers
 * Get list of submitted answers for the authenticated mobile user
 */
router.get('/', async (req, res) => {
  try {
    const { id: userId, clientId } = req.user;
    const { 
      page = 1, 
      limit = 10, 
      status,
      questionId,
      submissionStatus,
      reviewStatus,
      publishStatus,
      sortBy = 'submittedAt',
      sortOrder = 'desc'
    } = req.query;

    // Build filter object
    const filter = {
      userId: userId,
      clientId: clientId
    };

    // Add optional filters
    if (questionId) filter.questionId = questionId;
    if (submissionStatus) filter.submissionStatus = submissionStatus;
    if (reviewStatus) filter.reviewStatus = reviewStatus;
    if (publishStatus) filter.publishStatus = publishStatus;

    // Legacy status filter support
    if (status) {
      switch (status) {
        case 'submitted':
          filter.submissionStatus = 'submitted';
          break;
        case 'evaluated':
          filter.submissionStatus = 'evaluated';
          break;
        case 'rejected':
          filter.submissionStatus = 'rejected';
          break;
      }
    }

    // Calculate pagination
    const skip = (parseInt(page) - 1) * parseInt(limit);
    
    // Build sort object
    const sort = {};
    sort[sortBy] = sortOrder === 'asc' ? 1 : -1;

    // Get total count for pagination
    const total = await UserAnswer.countDocuments(filter);

    // Fetch submitted answers with population
    const submittedAnswers = await UserAnswer.find(filter)
      .populate({
        path: 'questionId',
        select: 'question metadata.difficultyLevel metadata.maximumMarks metadata.wordLimit metadata.estimatedTime languageMode evaluationMode'
      })
      .select(`
        questionId attemptNumber answerImages textAnswer submissionStatus 
        submittedAt reviewedAt feedback evaluation publishStatus reviewStatus 
        popularityStatus metadata.timeSpent metadata.sourceType evaluatedAt
      `)
      .sort(sort)
      .skip(skip)
      .limit(parseInt(limit))
      .lean();

    // Transform the data for mobile response
    const transformedAnswers = submittedAnswers.map(answer => ({
      _id: answer._id,
      questionId: answer.questionId?._id,
      question: {
        text: answer.questionId?.question,
        difficultyLevel: answer.questionId?.metadata?.difficultyLevel,
        maximumMarks: answer.questionId?.metadata?.maximumMarks,
        wordLimit: answer.questionId?.metadata?.wordLimit,
        estimatedTime: answer.questionId?.metadata?.estimatedTime,
        languageMode: answer.questionId?.languageMode,
        evaluationMode: answer.questionId?.evaluationMode
      },
      attemptNumber: answer.attemptNumber,
      submissionStatus: answer.submissionStatus,
      reviewStatus: answer.reviewStatus,
      publishStatus: answer.publishStatus,
      popularityStatus: answer.popularityStatus,
      submittedAt: answer.submittedAt,
      reviewedAt: answer.reviewedAt,
      evaluatedAt: answer.evaluatedAt,
      hasImages: answer.answerImages && answer.answerImages.length > 0,
      hasTextAnswer: Boolean(answer.textAnswer),
      timeSpent: answer.metadata?.timeSpent || 0,
      sourceType: answer.metadata?.sourceType || 'qr_scan',
      
      // Basic feedback/evaluation info (without detailed content)
      isEvaluated: answer.submissionStatus === 'evaluated',
      hasEvaluation: Boolean(answer.evaluation?.accuracy !== undefined || answer.evaluation?.marks !== undefined),
      hasFeedback: Boolean(answer.feedback?.score !== undefined || answer.feedback?.comments),
      
      // Summary stats
      evaluationSummary: answer.evaluation ? {
        accuracy: answer.evaluation.accuracy,
        marks: answer.evaluation.marks,
        hasStrengths: Boolean(answer.evaluation.strengths?.length),
        hasWeaknesses: Boolean(answer.evaluation.weaknesses?.length),
        hasSuggestions: Boolean(answer.evaluation.suggestions?.length)
      } : null,
      
      feedbackSummary: answer.feedback ? {
        score: answer.feedback.score,
        hasComments: Boolean(answer.feedback.comments),
        hasSuggestions: Boolean(answer.feedback.suggestions?.length)
      } : null
    }));

    res.status(200).json({
      success: true,
      message: 'Submitted answers retrieved successfully',
      data: {
        answers: transformedAnswers,
        pagination: {
          currentPage: parseInt(page),
          totalPages: Math.ceil(total / parseInt(limit)),
          totalAnswers: total,
          hasNextPage: skip + transformedAnswers.length < total,
          hasPreviousPage: parseInt(page) > 1,
          limit: parseInt(limit)
        },
        summary: {
          totalSubmitted: total,
          evaluatedCount: transformedAnswers.filter(a => a.isEvaluated).length,
          publishedCount: transformedAnswers.filter(a => a.publishStatus === 'published').length,
          popularCount: transformedAnswers.filter(a => a.popularityStatus === 'popular').length
        }
      }
    });

  } catch (error) {
    console.error('Error fetching submitted answers:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch submitted answers',
      error: {
        code: 'FETCH_SUBMITTED_ANSWERS_ERROR',
        details: error.message
      }
    });
  }
});

/**
 * GET /api/clients/:clientId/mobile/submitted-answers/:answerId
 * Get detailed analysis for a particular submitted answer
 */
router.get('/:answerId', async (req, res) => {
  try {
    const { answerId } = req.params;
    const { id: userId, clientId } = req.user;

    // Find the specific answer with full details
    const userAnswer = await UserAnswer.findOne({
      _id: answerId,
      userId: userId,
      clientId: clientId
    }).populate({
      path: 'questionId',
      select: 'question detailedAnswer modalAnswer answerVideoUrls metadata languageMode evaluationMode'
    }).populate({
      path: 'reviewedBy',
      select: 'name email'
    });

    if (!userAnswer) {
      return res.status(404).json({
        success: false,
        message: 'Answer not found or access denied',
        error: {
          code: 'ANSWER_NOT_FOUND',
          details: 'The specified answer does not exist or you do not have access to it'
        }
      });
    }

    // Check if evaluation/analysis is available
    const hasEvaluation = Boolean(
      userAnswer.evaluation?.accuracy !== undefined || 
      userAnswer.evaluation?.marks !== undefined ||
      userAnswer.feedback?.score !== undefined
    );

    if (!hasEvaluation && userAnswer.submissionStatus !== 'evaluated') {
      return res.status(200).json({
        success: true,
        message: 'Answer found but analysis is not yet available',
        data: {
          answer: {
            _id: userAnswer._id,
            questionId: userAnswer.questionId._id,
            question: userAnswer.questionId.question,
            attemptNumber: userAnswer.attemptNumber,
            submissionStatus: userAnswer.submissionStatus,
            reviewStatus: userAnswer.reviewStatus,
            submittedAt: userAnswer.submittedAt,
            analysisAvailable: false,
            expectedAnalysisTime: '24-48 hours' // You can make this dynamic
          }
        }
      });
    }

    // Prepare the detailed response with analysis
    const responseData = {
      answer: {
        _id: userAnswer._id,
        questionId: userAnswer.questionId._id,
        attemptNumber: userAnswer.attemptNumber,
        submissionStatus: userAnswer.submissionStatus,
        reviewStatus: userAnswer.reviewStatus,
        publishStatus: userAnswer.publishStatus,
        popularityStatus: userAnswer.popularityStatus,
        submittedAt: userAnswer.submittedAt,
        reviewedAt: userAnswer.reviewedAt,
        evaluatedAt: userAnswer.evaluatedAt,
        analysisAvailable: true,
        
        // Question details
        question: {
          text: userAnswer.questionId.question,
          detailedAnswer: userAnswer.questionId.detailedAnswer,
          modalAnswer: userAnswer.questionId.modalAnswer,
          answerVideoUrls: userAnswer.questionId.answerVideoUrls || [],
          metadata: userAnswer.questionId.metadata,
          languageMode: userAnswer.questionId.languageMode,
          evaluationMode: userAnswer.questionId.evaluationMode
        },
        
        // User's submission
        submission: {
          answerImages: userAnswer.answerImages || [],
          textAnswer: userAnswer.textAnswer,
          extractedTexts: userAnswer.extractedTexts || [],
          timeSpent: userAnswer.metadata?.timeSpent || 0,
          sourceType: userAnswer.metadata?.sourceType || 'qr_scan'
        },
        
        // AI Evaluation (if available)
        evaluation: userAnswer.evaluation ? {
          accuracy: userAnswer.evaluation.accuracy,
          marks: userAnswer.evaluation.marks,
          extractedText: userAnswer.evaluation.extractedText,
          strengths: userAnswer.evaluation.strengths || [],
          weaknesses: userAnswer.evaluation.weaknesses || [],
          suggestions: userAnswer.evaluation.suggestions || [],
          feedback: userAnswer.evaluation.feedback
        } : null,
        
        // Manual Review Feedback (if available)
        feedback: userAnswer.feedback ? {
          score: userAnswer.feedback.score,
          comments: userAnswer.feedback.comments,
          suggestions: userAnswer.feedback.suggestions || []
        } : null,
        
        // Reviewer information (if reviewed manually)
        reviewedBy: userAnswer.reviewedBy ? {
          name: userAnswer.reviewedBy.name,
          email: userAnswer.reviewedBy.email
        } : null
      }
    };

    res.status(200).json({
      success: true,
      message: 'Answer analysis retrieved successfully',
      data: responseData
    });

  } catch (error) {
    console.error('Error fetching answer analysis:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch answer analysis',
      error: {
        code: 'FETCH_ANSWER_ANALYSIS_ERROR',
        details: error.message
      }
    });
  }
});




module.exports = router;
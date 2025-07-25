// routes/mobileSubmittedAnswers.js
const express = require('express');
const router = express.Router();
const UserAnswer = require('../models/UserAnswer');
const AiswbQuestion = require('../models/AiswbQuestion');
const { authenticateMobileUser } = require('../middleware/mobileAuth');
const { generateAnnotatedImageUrl } = require('../utils/s3');

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
        submittedAt acceptedAt feedback evaluation publishStatus reviewStatus 
        popularityStatus metadata.timeSpent metadata.sourceType evaluatedAt
        requestID requestnote  annotations reviewRequestedAt reviewAssignedAt reviewCompletedAt
      `)
      .sort(sort)
      .skip(skip)
      .limit(parseInt(limit))
      .lean();

    for(const answer of submittedAnswers){
      if(answer.feedback.expertReview.annotatedImages){
        for(const image of answer.feedback.expertReview.annotatedImages){
          if(image.s3Key){
            image.downloadUrl = await generateAnnotatedImageUrl(image.s3Key);
          }
        }
      }
      if(answer.annotations){
        for(const annotation of answer.annotations){
          if(annotation.s3Key){
            annotation.downloadUrl = await generateAnnotatedImageUrl(annotation.s3Key);
          }
        }
      }
    }
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
      requestID: answer.requestID,
      requestnote: answer.requestnote,
      feedback: answer.feedback,
      publishStatus: answer.publishStatus,
      popularityStatus: answer.popularityStatus,
      submittedAt: answer.submittedAt,
      acceptedAt: answer.acceptedAt,
      evaluatedAt: answer.evaluatedAt,
      reviewRequestedAt: answer.reviewRequestedAt,
      reviewAcceptedAt: answer.reviewAssignedAt,
      reviewCompletedAt: answer.reviewCompletedAt,
      hasImages: answer.answerImages && answer.answerImages.length > 0,
      hasTextAnswer: Boolean(answer.textAnswer),
      answerImages: answer.answerImages || [],
      annotations: answer.annotations || [],
      timeSpent: answer.metadata?.timeSpent || 0,
      sourceType: answer.metadata?.sourceType || 'qr_scan',
      
      // Basic feedback/evaluation info (without detailed content)
      isEvaluated: answer.submissionStatus === 'evaluated',
      hasEvaluation: Boolean(answer.evaluation?.relevancy !== undefined || answer.evaluation?.score !== undefined),
      hasFeedback: Boolean(answer.feedback?.score !== undefined || answer.feedback?.comments),
      hasExpertReview: Boolean(answer.feedback?.expertReview?.score !== undefined || answer.feedback?.expertReview?.remarks),
      
      // Summary stats (updated to match new evaluation structure)
      evaluationSummary: answer.evaluation ? {
        relevancy: answer.evaluation.relevancy,
        score: answer.evaluation.score,
        remark: answer.evaluation.remark,
        hasComments: Boolean(answer.evaluation.comments?.length),
        hasAnalysis: Boolean(answer.evaluation.analysis && (
          answer.evaluation.analysis.introduction?.length ||
          answer.evaluation.analysis.body?.length ||
          answer.evaluation.analysis.conclusion?.length ||
          answer.evaluation.analysis.strengths?.length ||
          answer.evaluation.analysis.weaknesses?.length ||
          answer.evaluation.analysis.suggestions?.length ||
          answer.evaluation.analysis.feedback?.length
        ))
      } : null,
      
      feedbackSummary: answer.feedback ? {
        score: answer.feedback.score,
        hasComments: Boolean(answer.feedback.comments),
        hasSuggestions: Boolean(answer.feedback.suggestions?.length)
      } : null,
      
      // Expert Review Summary
      expertReviewSummary: answer.feedback?.expertReview ? {
        score: answer.feedback.expertReview.score,
        result: answer.feedback.expertReview.result,
        hasRemarks: Boolean(answer.feedback.expertReview.remarks),
        hasAnnotatedImages: Boolean(answer.feedback.expertReview.annotatedImages?.length),
        reviewedAt: answer.feedback.expertReview.reviewedAt
      } : null,
      
    }));
    console.log(transformedAnswers)
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
      userAnswer.evaluation?.relevancy !== undefined || 
      userAnswer.evaluation?.score !== undefined ||
      userAnswer.feedback?.score !== undefined ||
      userAnswer.feedback?.expertReview?.score !== undefined
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
            requestID: userAnswer.requestID,
            requestnote: userAnswer.requestnote,
            analysisAvailable: false,
            expectedAnalysisTime: '24-48 hours' // You can make this dynamic
          }
        }
      });
    }
    
    if(userAnswer.feedback.expertReview.annotatedImages){
      for(const image of userAnswer.feedback.expertReview.annotatedImages){
          if(image.s3Key){
            image.downloadUrl = await generateAnnotatedImageUrl(image.s3Key);
        }
      }
    }
    if(userAnswer.annotations){
        for(const annotation of userAnswer.annotations){
          if(annotation.s3Key){
            annotation.downloadUrl = await generateAnnotatedImageUrl(annotation.s3Key);
        }
      }

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
        acceptedAt: userAnswer.acceptedAt,
        evaluatedAt: userAnswer.evaluatedAt,
        requestID: userAnswer.requestID,
        requestnote: userAnswer.requestnote,
        analysisAvailable: true,
        annotations:userAnswer.annotations,

        
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
        
        // AI/Manual Evaluation (updated to match new structure)
        evaluation: userAnswer.evaluation ? {
          relevancy: userAnswer.evaluation.relevancy,
          score: userAnswer.evaluation.score.toString(),
          remark: userAnswer.evaluation.remark,
          extractedText: userAnswer.evaluation.extractedText,
          feedbackStatus: userAnswer.evaluation.feedbackStatus,
          userFeedback: userAnswer.evaluation.userFeedback,
          comments: userAnswer.evaluation.comments || [],
          analysis: userAnswer.evaluation.analysis ? {
            introduction: userAnswer.evaluation.analysis.introduction || [],
            body: userAnswer.evaluation.analysis.body || [],
            conclusion: userAnswer.evaluation.analysis.conclusion || [],
            strengths: userAnswer.evaluation.analysis.strengths || [],
            weaknesses: userAnswer.evaluation.analysis.weaknesses || [],
            suggestions: userAnswer.evaluation.analysis.suggestions || [],
            feedback: userAnswer.evaluation.analysis.feedback || []
          } : {
            introduction: [],
            body: [],
            conclusion: [],
            strengths: [],
            weaknesses: [],
            suggestions: [],
            feedback: []
          }
        } : null,
        
        // Manual Review Feedback (if available)
        feedback: userAnswer.feedback ? {
          score: userAnswer.feedback.score,
          comments: userAnswer.feedback.comments,
          suggestions: userAnswer.feedback.suggestions || [],
          // Include full expert review data
          expertReview: userAnswer.feedback.expertReview ? {
            result: userAnswer.feedback.expertReview.result,
            score: userAnswer.feedback.expertReview.score,
            remarks: userAnswer.feedback.expertReview.remarks,
            annotatedImages: userAnswer.feedback.expertReview.annotatedImages || [],
            reviewedAt: userAnswer.feedback.expertReview.reviewedAt
          } : null
        } : null,
        
        // Reviewer information (if reviewed manually)
        reviewedBy: userAnswer.reviewedBy ? {
          name: userAnswer.reviewedBy.name,
          email: userAnswer.reviewedBy.email
        } : null,

        // Add this line to include top-level annotations in the detail response
        annotations: userAnswer.annotations || [],
        reviewRequestedAt:userAnswer.reviewRequestedAt,
        reviewAcceptedAt:userAnswer.reviewAssignedAt,
        reviewCompletedAt:userAnswer.reviewCompletedAt,

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
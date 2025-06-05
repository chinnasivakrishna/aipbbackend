// controllers/answerSheetController.js
const AnswerSheet = require('../models/AnswerSheet');
const AiswbQuestion = require('../models/AiswbQuestion');
const MobileUser = require('../models/MobileUser');
const UserProfile = require('../models/UserProfile');
const path = require('path');
const fs = require('fs').promises;

class AnswerSheetController {
  // Submit answer sheet with images
  async submitAnswerSheet(req, res) {
    try {
      const { questionId } = req.params;
      const userId = req.user.id;
      const { language, deviceInfo, location } = req.body;

      // Verify question exists
      const question = await AiswbQuestion.findById(questionId);
      if (!question) {
        return res.status(404).json({
          success: false,
          message: "Question not found",
          error: { code: "QUESTION_NOT_FOUND" }
        });
      }

      // Get user profile
      const userProfile = await UserProfile.findOne({ userId });
      if (!userProfile) {
        return res.status(404).json({
          success: false,
          message: "User profile not found",
          error: { code: "PROFILE_NOT_FOUND" }
        });
      }

      // Check if files were uploaded
      if (!req.files || req.files.length === 0) {
        return res.status(400).json({
          success: false,
          message: "At least one image is required",
          error: { code: "NO_IMAGES_UPLOADED" }
        });
      }

      // Process uploaded images
      const images = req.files.map(file => ({
        filename: file.filename,
        originalName: file.originalname,
        mimetype: file.mimetype,
        size: file.size,
        url: `/api/answer-sheets/images/${questionId}/${file.filename}`
      }));

      // Create answer sheet submission
      const answerSheet = new AnswerSheet({
        questionId,
        userId,
        userProfile: userProfile._id,
        images,
        submissionData: {
          language: language || question.languageMode,
          deviceInfo: deviceInfo ? JSON.parse(deviceInfo) : {},
          location: location ? JSON.parse(location) : {}
        },
        clientId: req.user.clientId
      });

      await answerSheet.save();

      res.status(201).json({
        success: true,
        message: "Answer sheet submitted successfully",
        data: {
          submissionId: answerSheet._id,
          questionId: answerSheet.questionId,
          imagesCount: images.length,
          submittedAt: answerSheet.createdAt,
          status: answerSheet.status
        }
      });

    } catch (error) {
      console.error('Submit answer sheet error:', error);
      res.status(500).json({
        success: false,
        message: "Internal server error",
        error: { code: "SERVER_ERROR", details: error.message }
      });
    }
  }

  // Get user's own submissions
  async getMySubmissions(req, res) {
    try {
      const userId = req.user.id;
      const { page = 1, limit = 10, status, questionId } = req.query;

      const filter = { userId };
      if (status) filter.status = status;
      if (questionId) filter.questionId = questionId;

      const skip = (parseInt(page) - 1) * parseInt(limit);

      const submissions = await AnswerSheet.find(filter)
        .populate('questionId', 'question metadata languageMode')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit));

      const total = await AnswerSheet.countDocuments(filter);

      res.status(200).json({
        success: true,
        data: {
          submissions: submissions.map(sub => ({
            id: sub._id,
            questionId: sub.questionId._id,
            question: sub.questionId.question.substring(0, 100) + '...',
            imagesCount: sub.images.length,
            status: sub.status,
            submittedAt: sub.createdAt,
            language: sub.submissionData.language,
            difficultyLevel: sub.questionId.metadata.difficultyLevel,
            maximumMarks: sub.questionId.metadata.maximumMarks
          })),
          pagination: {
            currentPage: parseInt(page),
            totalPages: Math.ceil(total / parseInt(limit)),
            totalItems: total,
            itemsPerPage: parseInt(limit)
          }
        }
      });

    } catch (error) {
      console.error('Get my submissions error:', error);
      res.status(500).json({
        success: false,
        message: "Internal server error",
        error: { code: "SERVER_ERROR", details: error.message }
      });
    }
  }

  // Get detailed view of user's submission
  async getMySubmissionDetails(req, res) {
    try {
      const { submissionId } = req.params;
      const userId = req.user.id;

      const submission = await AnswerSheet.findOne({ 
        _id: submissionId, 
        userId 
      }).populate([
        { path: 'questionId', select: 'question detailedAnswer modalAnswer metadata languageMode' },
        { path: 'userProfile', select: 'name age gender exams nativeLanguage' }
      ]);

      if (!submission) {
        return res.status(404).json({
          success: false,
          message: "Submission not found",
          error: { code: "SUBMISSION_NOT_FOUND" }
        });
      }

      res.status(200).json({
        success: true,
        data: {
          id: submission._id,
          question: {
            id: submission.questionId._id,
            text: submission.questionId.question,
            metadata: submission.questionId.metadata,
            languageMode: submission.questionId.languageMode
          },
          images: submission.images,
          submissionData: submission.submissionData,
          status: submission.status,
          adminReview: submission.adminReview,
          submittedAt: submission.createdAt,
          updatedAt: submission.updatedAt
        }
      });

    } catch (error) {
      console.error('Get submission details error:', error);
      res.status(500).json({
        success: false,
        message: "Internal server error",
        error: { code: "SERVER_ERROR", details: error.message }
      });
    }
  }

  // Admin: Get all submissions with filters
  async getAdminSubmissions(req, res) {
    try {
      const { 
        page = 1, 
        limit = 20, 
        status, 
        questionId, 
        userId, 
        clientId,
        dateFrom,
        dateTo,
        sortBy = 'createdAt',
        sortOrder = 'desc'
      } = req.query;

      const filter = {};
      if (status) filter.status = status;
      if (questionId) filter.questionId = questionId;
      if (userId) filter.userId = userId;
      if (clientId) filter.clientId = clientId;
      
      if (dateFrom || dateTo) {
        filter.createdAt = {};
        if (dateFrom) filter.createdAt.$gte = new Date(dateFrom);
        if (dateTo) filter.createdAt.$lte = new Date(dateTo);
      }

      const skip = (parseInt(page) - 1) * parseInt(limit);
      const sort = { [sortBy]: sortOrder === 'desc' ? -1 : 1 };

      const submissions = await AnswerSheet.find(filter)
        .populate([
          { path: 'questionId', select: 'question metadata languageMode' },
          { path: 'userId', select: 'mobile clientId' },
          { path: 'userProfile', select: 'name age gender exams' },
          { path: 'adminReview.reviewedBy', select: 'username email' }
        ])
        .sort(sort)
        .skip(skip)
        .limit(parseInt(limit));

      const total = await AnswerSheet.countDocuments(filter);

      res.status(200).json({
        success: true,
        data: {
          submissions: submissions.map(sub => ({
            id: sub._id,
            question: {
              id: sub.questionId._id,
              text: sub.questionId.question.substring(0, 150) + '...',
              difficultyLevel: sub.questionId.metadata.difficultyLevel,
              maximumMarks: sub.questionId.metadata.maximumMarks
            },
            user: {
              id: sub.userId._id,
              mobile: sub.userId.mobile,
              name: sub.userProfile.name,
              age: sub.userProfile.age,
              clientId: sub.userId.clientId
            },
            imagesCount: sub.images.length,
            status: sub.status,
            language: sub.submissionData.language,
            submittedAt: sub.createdAt,
            adminReview: sub.adminReview
          })),
          pagination: {
            currentPage: parseInt(page),
            totalPages: Math.ceil(total / parseInt(limit)),
            totalItems: total,
            itemsPerPage: parseInt(limit)
          }
        }
      });

    } catch (error) {
      console.error('Get admin submissions error:', error);
      res.status(500).json({
        success: false,
        message: "Internal server error",
        error: { code: "SERVER_ERROR", details: error.message }
      });
    }
  }

  // Admin: Get detailed submission with question and answer
  async getAdminSubmissionDetails(req, res) {
    try {
      const { submissionId } = req.params;

      const submission = await AnswerSheet.findById(submissionId)
        .populate([
          { 
            path: 'questionId', 
            select: 'question detailedAnswer modalAnswer metadata languageMode setId',
            populate: { path: 'setId', select: 'name itemType' }
          },
          { path: 'userId', select: 'mobile clientId lastLoginAt' },
          { path: 'userProfile', select: 'name age gender exams nativeLanguage' },
          { path: 'adminReview.reviewedBy', select: 'username email' }
        ]);

      if (!submission) {
        return res.status(404).json({
          success: false,
          message: "Submission not found",
          error: { code: "SUBMISSION_NOT_FOUND" }
        });
      }

      res.status(200).json({
        success: true,
        data: {
          id: submission._id,
          question: {
            id: submission.questionId._id,
            text: submission.questionId.question,
            detailedAnswer: submission.questionId.detailedAnswer,
            modalAnswer: submission.questionId.modalAnswer,
            metadata: submission.questionId.metadata,
            languageMode: submission.questionId.languageMode,
            set: submission.questionId.setId
          },
          user: {
            id: submission.userId._id,
            mobile: submission.userId.mobile,
            clientId: submission.userId.clientId,
            lastLoginAt: submission.userId.lastLoginAt,
            profile: {
              name: submission.userProfile.name,
              age: submission.userProfile.age,
              gender: submission.userProfile.gender,
              exams: submission.userProfile.exams,
              nativeLanguage: submission.userProfile.nativeLanguage
            }
          },
          images: submission.images,
          submissionData: submission.submissionData,
          status: submission.status,
          adminReview: submission.adminReview,
          submittedAt: submission.createdAt,
          updatedAt: submission.updatedAt
        }
      });

    } catch (error) {
      console.error('Get admin submission details error:', error);
      res.status(500).json({
        success: false,
        message: "Internal server error",
        error: { code: "SERVER_ERROR", details: error.message }
      });
    }
  }

  // Admin: Review submission
  async reviewSubmission(req, res) {
    try {
      const { submissionId } = req.params;
      const { status, comments, rating } = req.body;
      const reviewerId = req.user.id;

      const submission = await AnswerSheet.findById(submissionId);
      if (!submission) {
        return res.status(404).json({
          success: false,
          message: "Submission not found",
          error: { code: "SUBMISSION_NOT_FOUND" }
        });
      }

      submission.status = status;
      submission.adminReview = {
        reviewedBy: reviewerId,
        reviewedAt: new Date(),
        comments,
        rating
      };

      await submission.save();

      res.status(200).json({
        success: true,
        message: "Submission reviewed successfully",
        data: {
          submissionId: submission._id,
          status: submission.status,
          reviewedAt: submission.adminReview.reviewedAt,
          rating: submission.adminReview.rating
        }
      });

    } catch (error) {
      console.error('Review submission error:', error);
      res.status(500).json({
        success: false,
        message: "Internal server error",
        error: { code: "SERVER_ERROR", details: error.message }
      });
    }
  }

  // Admin: Get submissions for a specific question
  async getQuestionSubmissions(req, res) {
    try {
      const { questionId } = req.params;
      const { page = 1, limit = 20, status } = req.query;

      const filter = { questionId };
      if (status) filter.status = status;

      const skip = (parseInt(page) - 1) * parseInt(limit);

      const submissions = await AnswerSheet.find(filter)
        .populate([
          { path: 'userId', select: 'mobile clientId' },
          { path: 'userProfile', select: 'name age gender' }
        ])
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit));

      const total = await AnswerSheet.countDocuments(filter);

      res.status(200).json({
        success: true,
        data: {
          questionId,
          submissions: submissions.map(sub => ({
            id: sub._id,
            user: {
              id: sub.userId._id,
              mobile: sub.userId.mobile,
              name: sub.userProfile.name,
              clientId: sub.userId.clientId
            },
            imagesCount: sub.images.length,
            status: sub.status,
            language: sub.submissionData.language,
            submittedAt: sub.createdAt
          })),
          pagination: {
            currentPage: parseInt(page),
            totalPages: Math.ceil(total / parseInt(limit)),
            totalItems: total,
            itemsPerPage: parseInt(limit)
          }
        }
      });

    } catch (error) {
      console.error('Get question submissions error:', error);
      res.status(500).json({
        success: false,
        message: "Internal server error",
        error: { code: "SERVER_ERROR", details: error.message }
      });
    }
  }

  // Admin: Get submission analytics
  async getSubmissionAnalytics(req, res) {
    try {
      const { clientId, dateFrom, dateTo } = req.query;

      const matchFilter = {};
      if (clientId) matchFilter.clientId = clientId;
      if (dateFrom || dateTo) {
        matchFilter.createdAt = {};
        if (dateFrom) matchFilter.createdAt.$gte = new Date(dateFrom);
        if (dateTo) matchFilter.createdAt.$lte = new Date(dateTo);
      }

      const analytics = await AnswerSheet.aggregate([
        { $match: matchFilter },
        {
          $group: {
            _id: null,
            totalSubmissions: { $sum: 1 },
            byStatus: {
              $push: {
                status: "$status",
                count: 1
              }
            },
            byLanguage: {
              $push: {
                language: "$submissionData.language",
                count: 1
              }
            },
            totalImages: { $sum: { $size: "$images" } },
            avgImagesPerSubmission: { $avg: { $size: "$images" } }
          }
        }
      ]);

      // Get top questions by submission count
      const topQuestions = await AnswerSheet.aggregate([
        { $match: matchFilter },
        {
          $group: {
            _id: "$questionId",
            submissionCount: { $sum: 1 }
          }
        },
        { $sort: { submissionCount: -1 } },
        { $limit: 10 },
        {
          $lookup: {
            from: "aiswbquestions",
            localField: "_id",
            foreignField: "_id",
            as: "question"
          }
        },
        { $unwind: "$question" },
        {
          $project: {
            questionId: "$_id",
            question: { $substr: ["$question.question", 0, 100] },
            submissionCount: 1,
            difficultyLevel: "$question.metadata.difficultyLevel"
          }
        }
      ]);

      res.status(200).json({
        success: true,
        data: {
          overview: analytics[0] || {
            totalSubmissions: 0,
            byStatus: [],
            byLanguage: [],
            totalImages: 0,
            avgImagesPerSubmission: 0
          },
          topQuestions
        }
      });

    } catch (error) {
      console.error('Get submission analytics error:', error);
      res.status(500).json({
        success: false,
        message: "Internal server error",
        error: { code: "SERVER_ERROR", details: error.message }
      });
    }
  }

  // Serve images with access control
  async serveImage(req, res) {
    try {
      const { questionId, filename } = req.params;
      const imagePath = path.join(__dirname, '..', 'uploads', 'answer-sheets', questionId, filename);

      try {
        await fs.access(imagePath);
        res.sendFile(path.resolve(imagePath));
      } catch (error) {
        res.status(404).json({
          success: false,
          message: "Image not found",
          error: { code: "IMAGE_NOT_FOUND" }
        });
      }

    } catch (error) {
      console.error('Serve image error:', error);
      res.status(500).json({
        success: false,
        message: "Internal server error",
        error: { code: "SERVER_ERROR", details: error.message }
      });
    }
  }
}

module.exports = new AnswerSheetController();

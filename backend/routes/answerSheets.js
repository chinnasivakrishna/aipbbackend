const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs').promises;
const answerSheetController = require('../controllers/answerSheetController');
const answerSheetValidation = require('../middleware/answerSheetValidation');

// Import authentication middleware

// Configure multer for image uploads
const storage = multer.diskStorage({
  destination: async (req, file, cb) => {
    const uploadDir = path.join(__dirname, '..', 'uploads', 'answer-sheets', req.params.questionId);
    try {
      await fs.mkdir(uploadDir, { recursive: true });
      cb(null, uploadDir);
    } catch (error) {
      cb(error);
    }
  },
  filename: (req, file, cb) => {
    const timestamp = Date.now();
    const randomString = Math.random().toString(36).substring(2, 15);
    const extension = path.extname(file.originalname);
    cb(null, `${timestamp}_${randomString}${extension}`);
  }
});

const fileFilter = (req, file, cb) => {
  if (file.mimetype.startsWith('image/')) {
    cb(null, true);
  } else {
    cb(new Error('Only image files are allowed'), false);
  }
};

const upload = multer({
  storage: storage,
  fileFilter: fileFilter,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
    files: 10 // Maximum 10 images per submission
  }
});

// Mobile Routes (for users to submit answer sheets)
router.post('/questions/:questionId/submit',
   // Add authentication middleware
  upload.array('images', 10),
  answerSheetValidation.validateAnswerSubmission,
  answerSheetController.submitAnswerSheet
);

router.get('/my-submissions',
   // Add authentication middleware
  answerSheetValidation.validateMySubmissionsQuery,
  answerSheetController.getMySubmissions
);

router.get('/my-submissions/:submissionId',
   // Add authentication middleware
  answerSheetValidation.validateSubmissionId,
  answerSheetController.getMySubmissionDetails
);

// Admin Routes (for viewing and managing submissions)
router.get('/admin/submissions',
   // Add admin authentication middleware
  answerSheetValidation.validateAdminSubmissionsQuery,
  answerSheetController.getAdminSubmissions
);

router.get('/admin/submissions/:submissionId',
   // Add admin authentication middleware
  answerSheetValidation.validateSubmissionId,
  answerSheetController.getAdminSubmissionDetails
);

router.put('/admin/submissions/:submissionId/review',
   // Add admin authentication middleware
  answerSheetValidation.validateSubmissionReview,
  answerSheetController.reviewSubmission
);

router.get('/admin/questions/:questionId/submissions',
   // Add admin authentication middleware
  answerSheetValidation.validateQuestionSubmissionsQuery,
  answerSheetController.getQuestionSubmissions
);

router.get('/admin/analytics/submissions',
   // Add admin authentication middleware
  answerSheetValidation.validateAnalyticsQuery,
  answerSheetController.getSubmissionAnalytics
);

// Image serving route
router.get('/images/:questionId/:filename',
  answerSheetValidation.validateImageAccess,
  answerSheetController.serveImage
);

module.exports = router;
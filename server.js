const dotenv = require('dotenv');
dotenv.config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');
const authRoutes = require('./routes/auth');
const adminRoutes = require('./routes/admin');
const clientRoutes = require('./routes/client');
const userRoutes = require('./routes/user');
const datastoreRoutes = require('./routes/datastores');
const datastoreRoute = require('./routes/datastore');
const bookRoutes = require('./routes/books');
const subtopicsRoutes = require('./routes/subtopics');
const assetsRoutes = require('./routes/assets');
const videoAssetsRoutes = require('./routes/videoAssets');
const pyqAssetsRoutes = require('./routes/pyqAssets');
const subjectiveAssetsRoutes = require('./routes/subjectiveAssets');
const objectiveAssetsRoutes = require('./routes/objectiveAssets');
const workbookRoutes = require('./routes/workbooks');
const qrCodeRoutes = require('./routes/qrcode');
const pdfSplitsRoutes = require('./routes/pdfSplits');
const mobileAuthRoutes = require('./routes/mobileAuth');
const mobileBooksRoutes = require('./routes/mobileBooks');
const aiswbRoutes = require('./routes/aiswb');
const userAnswersRoutes = require('./routes/userAnswers');
const evaluationRoutes = require('./routes/evaluations'); // Updated evaluation routes
const { checkClientAccess } = require('./middleware/mobileAuth');
const adminAnswers = require('./routes/adminAnswers');
const myBooksRoutes = require('./routes/myBooks');
const evaluatorsRoutes = require('./routes/evaluators');
const app = express();
const mainBookstoreRoutes = require('./routes/mainBookstore');
const mobileSubmittedAnswersRoutes = require('./routes/mobileSubmittedAnswers');
const expertReviewRoutes = require('./routes/expertReview');
const evaluatorReviewsRoutes = require('./routes/evaluatorReviews');
const reviewRequestsRoutes = require('./routes/reviewRequests');
const mobileReviewsRoutes = require('./routes/mobileReviews');
const mobileQRAuthRoutes = require('./routes/mobileQRAuth');


app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

mongoose.connect(process.env.MONGODB_URI)
  .then(() => console.log('Connected to MongoDB'))
  .catch(err => console.error('MongoDB connection error:', err));

// Verify Mistral API key is configured
if (!process.env.MISTRAL_API_KEY) {
  console.warn('MISTRAL_API_KEY is not configured - OCR features will be disabled');
}

// API routes
app.use('/api/admin/answers', require('./routes/adminAnswers'));

app.use('/api/auth', authRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/client', clientRoutes);
app.use('/api/user', userRoutes);
app.use('/api/datastores', datastoreRoutes);
app.use('/api/datastore', datastoreRoute);
app.use('/api/books', bookRoutes);
app.use('/api/subtopics', subtopicsRoutes);
app.use('/api/assets', assetsRoutes);
app.use('/api/video-assets', videoAssetsRoutes);
app.use('/api/pyq-assets', pyqAssetsRoutes);
app.use('/api/subjective-assets', subjectiveAssetsRoutes);
app.use('/api/objective-assets', objectiveAssetsRoutes);
app.use('/api/workbooks', workbookRoutes);
app.use('/api/qrcode', qrCodeRoutes);
app.use('/api/books', pdfSplitsRoutes);
app.use('/api/aiswb', aiswbRoutes);
app.use('/api/mybooks', myBooksRoutes);
app.use('/api/evaluators', evaluatorsRoutes);
app.use('/api/homepage', mainBookstoreRoutes);
app.use('/api/review', expertReviewRoutes);

// Global Evaluation routes (accessible without client-specific middleware)
// These handle the main Assessment Dashboard APIs as per PDF requirements
app.use('/api/aiswb', evaluationRoutes);

// Mobile routes with client-specific access
app.use('/api/clients/:clientId/mobile/auth', 
  checkClientAccess(),
  (req, res, next) => {
    req.clientId = req.params.clientId;
    next();
  }, 
  mobileAuthRoutes
);
app.use('/api/clients/:clientId/homepage', 
  checkClientAccess(),
  (req, res, next) => {
    req.clientId = req.params.clientId;
    next();
  }, 
  mainBookstoreRoutes
);

app.use('/api/clients/:clientId', 
  checkClientAccess(),
  (req, res, next) => {
    req.clientId = req.params.clientId;
    next();
  }, 
  mainBookstoreRoutes
);

app.use('/api/clients/:clientId/mobile/mybooks', 
  checkClientAccess(),
  (req, res, next) => {
    req.clientId = req.params.clientId;
    next();
  }, 
  myBooksRoutes
);

app.use('/api/clients/:clientId/mobile/books', 
  checkClientAccess(),
  (req, res, next) => {
    req.clientId = req.params.clientId;
    next();
  }, 
  mobileBooksRoutes
);

app.use('/api/clients/:clientId/mobile/userAnswers', 
  checkClientAccess(),
  (req, res, next) => {
    req.clientId = req.params.clientId;
    next();
  }, 
  userAnswersRoutes
);

// Client-specific evaluation routes for mobile users
app.use('/api/clients/:clientId/mobile/evaluations', 
  checkClientAccess(),
  (req, res, next) => {
    req.clientId = req.params.clientId;
    next();
  }, 
  evaluationRoutes
);

app.use('/api/clients/:clientId/mobile/submitted-answers', 
  checkClientAccess(),
  (req, res, next) => {
    req.clientId = req.params.clientId;
    next();
  }, 
  mobileSubmittedAnswersRoutes
);

app.use('/api/clients/:clientId/mobile/review', 
  checkClientAccess(),
  (req, res, next) => {
    req.clientId = req.params.clientId;
    next();
  }, 
  reviewRequestsRoutes
);

// Mount subtopics routes
app.use('/api/books/:bookId/chapters/:chapterId/topics/:topicId/subtopics', subtopicsRoutes);
app.use('/api/workbooks/:workbookId/chapters/:chapterId/topics/:topicId/subtopics', subtopicsRoutes);

app.use('/api/review', expertReviewRoutes);
app.use('/api/mobile-qr-auth', mobileQRAuthRoutes);

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ success: false, message: 'Internal server error' });
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

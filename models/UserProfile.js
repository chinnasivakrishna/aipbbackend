// models/UserProfile.js
const mongoose = require('mongoose');

const UserProfileSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'MobileUser',
    required: true,
    unique: true
  },
  name: {
    type: String,
    required: true,
    trim: true,
    maxlength: [100, 'Name cannot be more than 100 characters']
  },
  age: {
    type: String,
    enum: ['<15', '15-18', '19-25', '26-31', '32-40', '40+']
  },
  gender: {
    type: String,
    enum: ['Male', 'Female', 'Other']
  },
  exams: [{
    type: String,
    enum: ['UPSC', 'CA', 'CMA', 'CS', 'ACCA', 'CFA', 'FRM', 'NEET', 'JEE', 'GATE', 'CAT', 'GMAT', 'GRE', 'IELTS', 'TOEFL', 'NET/JRF', 'BPSC', 'UPPCS', 'NDA','SSC', 'Teacher', 'CLAT','Judiciary', 'Other']
  }],
  nativeLanguage: {
    type: String,
    enum: ['Hindi', 'English', 'Bengali', 'Telugu', 'Marathi', 'Tamil', 'Gujarati', 'Urdu', 'Kannada', 'Odia', 'Malayalam', 'Punjabi', 'Assamese', 'Other']
  },
  clientId: { // Changed from 'client' to 'clientId'
    type: String,
    required: true
    // No enum restriction - will validate against actual client IDs
  },
  isComplete: {
    type: Boolean,
    default: true
  },
  isEvaluator:{
    type: Boolean,
    default: false
  },
  // Enhanced Test statistics
  completedTests: {
    type: Number,
    default: 0
  },
  totalTestScore: {
    type: Number,
    default: 0
  },
  averageTestScore: {
    type: Number,
    default: 0
  },
  testId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'ObjectiveTest',
    default: null
  },
  // New comprehensive test tracking fields
  testHistory: [{
    testId: { 
      type: mongoose.Schema.Types.ObjectId, 
      ref: 'ObjectiveTest' 
    },
    testResultId: { 
      type: mongoose.Schema.Types.ObjectId, 
      ref: 'TestResult' 
    },
    score: { type: Number },
    completionTime: { type: String },
    submittedAt: { type: Date },
    totalQuestions: { type: Number },
    correctAnswers: { type: Number },
    levelBreakdown: {
      L1: { total: { type: Number, default: 0 }, correct: { type: Number, default: 0 }, score: { type: Number, default: 0 } },
      L2: { total: { type: Number, default: 0 }, correct: { type: Number, default: 0 }, score: { type: Number, default: 0 } },
      L3: { total: { type: Number, default: 0 }, correct: { type: Number, default: 0 }, score: { type: Number, default: 0 } }
    }
  }],
  performanceStats: {
    bestScore: { type: Number, default: 0 },
    worstScore: { type: Number, default: 100 },
    averageCompletionTime: { type: String, default: '0' },
    totalQuestionsAttempted: { type: Number, default: 0 },
    totalCorrectAnswers: { type: Number, default: 0 },
    accuracyRate: { type: Number, default: 0 }
  },
  levelPerformance: {
    L1: { 
      totalTests: { type: Number, default: 0 }, 
      averageScore: { type: Number, default: 0 }, 
      bestScore: { type: Number, default: 0 },
      totalQuestions: { type: Number, default: 0 },
      correctAnswers: { type: Number, default: 0 }
    },
    L2: { 
      totalTests: { type: Number, default: 0 }, 
      averageScore: { type: Number, default: 0 }, 
      bestScore: { type: Number, default: 0 },
      totalQuestions: { type: Number, default: 0 },
      correctAnswers: { type: Number, default: 0 }
    },
    L3: { 
      totalTests: { type: Number, default: 0 }, 
      averageScore: { type: Number, default: 0 }, 
      bestScore: { type: Number, default: 0 },
      totalQuestions: { type: Number, default: 0 },
      correctAnswers: { type: Number, default: 0 }
    }
  },
  studyProgress: {
    lastTestDate: { type: Date },
    testStreak: { type: Number, default: 0 }, // consecutive days with tests
    weeklyGoal: { type: Number, default: 0 },
    weeklyProgress: { type: Number, default: 0 },
    monthlyTests: { type: Number, default: 0 },
    yearlyTests: { type: Number, default: 0 }
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
});

// Update timestamp on save
UserProfileSchema.pre('save', function(next) {
  this.updatedAt = Date.now();
  next();
});

module.exports = mongoose.model('UserProfile', UserProfileSchema);

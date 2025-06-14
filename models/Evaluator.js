// models/Evaluator.js
const mongoose = require('mongoose');

const evaluatorSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Name is required'],
    minlength: [2, 'Name must be at least 2 characters long'],
    maxlength: [50, 'Name must not exceed 50 characters'],
    trim: true
  },
  email: {
    type: String,
    required: [true, 'Email is required'],
    unique: true,
    lowercase: true,
    trim: true,
    match: [/^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/, 'Please enter a valid email']
  },
  phoneNumber: {
    type: String,
    required: [true, 'Phone number is required'],
    unique: true,
    match: [/^\d{10}$/, 'Phone number must be exactly 10 digits'],
    trim: true
  },
  subjectMatterExpert: {
    type: String,
    required: [true, 'Subject matter expert field is required'],
    minlength: [2, 'Subject matter expert must be at least 2 characters long'],
    maxlength: [100, 'Subject matter expert must not exceed 100 characters'],
    trim: true
  },
  examFocus: {
    type: String,
    required: [true, 'Exam focus is required'],
    minlength: [2, 'Exam focus must be at least 2 characters long'],
    maxlength: [100, 'Exam focus must not exceed 100 characters'],
    trim: true
  },
  experience: {
    type: Number,
    required: [true, 'Experience is required'],
    min: [0, 'Experience cannot be negative'],
    max: [50, 'Experience cannot exceed 50 years']
  },
  grade: {
    type: String,
    required: [true, 'Grade is required'],
    enum: {
      values: ['1st grade', '2nd grade', '3rd grade'],
      message: 'Grade must be one of: 1st grade, 2nd grade, 3rd grade'
    }
  },
  status: {
    type: String,
    enum: ['PENDING', 'VERIFIED', 'NOT_VERIFIED'],
    default: 'PENDING'
  },
  enabled: {
    type: Boolean,
    default: true
  },
  verifiedAt: {
    type: Date
  },
  isEvaluator: {
    type: Boolean,
    default: true
  },
  clientAccess: [{
    id: {
      type: String,
      required: true
    },
    name: {
      type: String,
      required: true
    }
  }]
}, {
  timestamps: true
});

// Index for better query performance
evaluatorSchema.index({ email: 1 });
evaluatorSchema.index({ phoneNumber: 1 });

module.exports = mongoose.model('Evaluator', evaluatorSchema);
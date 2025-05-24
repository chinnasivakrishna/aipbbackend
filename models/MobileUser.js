// models/MobileUser.js
const mongoose = require('mongoose');

const MobileUserSchema = new mongoose.Schema({
  mobile: {
    type: String,
    required: true,
    trim: true,
    match: [/^\d{10}$/, 'Please enter a valid 10-digit mobile number']
  },
  isVerified: {
    type: Boolean,
    default: true // Since we're not using OTP, users are verified by default
  },
  client: {
    type: String,
    required: true,
    enum: ['kitabai', 'ailisher'], // Add more clients as needed
    default: 'kitabai'
  },
  authToken: {
    type: String,
    default: null
  },
  lastLoginAt: {
    type: Date,
    default: Date.now
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

// Create compound index for mobile and client combination
MobileUserSchema.index({ mobile: 1, client: 1 }, { unique: true });

// Update timestamp on save
MobileUserSchema.pre('save', function(next) {
  this.updatedAt = Date.now();
  if (this.isModified('authToken') && this.authToken) {
    this.lastLoginAt = Date.now();
  }
  next();
});

module.exports = mongoose.model('MobileUser', MobileUserSchema);
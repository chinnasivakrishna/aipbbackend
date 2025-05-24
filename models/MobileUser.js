// models/MobileUser.js
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const MobileUserSchema = new mongoose.Schema({
  mobile: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    match: [/^\d{10}$/, 'Please enter a valid 10-digit mobile number']
  },
  isVerified: {
    type: Boolean,
    default: false
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
MobileUserSchema.pre('save', function(next) {
  this.updatedAt = Date.now();
  next();
});

module.exports = mongoose.model('MobileUser', MobileUserSchema);

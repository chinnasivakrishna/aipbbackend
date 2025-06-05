
// models/OTP.js
const mongoose = require('mongoose');

const OTPSchema = new mongoose.Schema({
  mobile: {
    type: String,
    required: true,
    match: [/^\d{10}$/, 'Please enter a valid 10-digit mobile number']
  },
  otp: {
    type: String,
    required: true
  },
  client: {
    type: String,
    required: true,
    enum: ['kitabai', 'ailisher']
  },
  expiresAt: {
    type: Date,
    required: true,
    default: () => new Date(Date.now() + 5 * 60 * 1000) // 5 minutes from now
  },
  isUsed: {
    type: Boolean,
    default: false
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

// Create TTL index for automatic deletion
OTPSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

module.exports = mongoose.model('OTP', OTPSchema);

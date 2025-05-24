// routes/mobileAuth.js
const express = require('express');
const router = express.Router();
const MobileUser = require('../models/MobileUser');
const OTP = require('../models/OTP');
const UserProfile = require('../models/UserProfile');
const twilioService = require('../services/twilioService');
const { generateToken, authenticateMobileUser, checkClientAccess } = require('../middleware/mobileAuth');

// Validation helper
const validateMobile = (mobile) => {
  const mobileRegex = /^\d{10}$/;
  return mobileRegex.test(mobile);
};

// Age group validation helper
const validateAgeGroup = (age) => {
  const validAgeGroups = ['<15', '15-18', '19-25', '26-31', '32-40', '40+'];
  return validAgeGroups.includes(age);
};

// Route: Send OTP
// POST /api/mobile-auth/:client/send-otp
router.post('/:client/send-otp', checkClientAccess(['kitabai', 'ailisher']), async (req, res) => {
  try {
    const { mobile } = req.body;
    const client = req.clientName;

    // Validation
    if (!mobile) {
      return res.status(400).json({
        success: false,
        message: 'Mobile number is required.'
      });
    }

    if (!validateMobile(mobile)) {
      return res.status(400).json({
        success: false,
        message: 'Please enter a valid 10-digit mobile number.'
      });
    }

    // Check for recent OTP requests (prevent spam)
    const recentOTP = await OTP.findOne({
      mobile,
      client,
      createdAt: { $gte: new Date(Date.now() - 60000) } // Within last 1 minute
    });

    if (recentOTP) {
      return res.status(429).json({
        success: false,
        message: 'Please wait 1 minute before requesting another OTP.'
      });
    }

    // Generate and save OTP
    const otpCode = twilioService.generateOTP();
    
    // Remove any existing unused OTPs for this mobile and client
    await OTP.deleteMany({ mobile, client, isUsed: false });

    const otp = new OTP({
      mobile,
      otp: otpCode,
      client
    });

    await otp.save();

    // Send OTP via SMS
    const smsResult = await twilioService.sendOTP(mobile, otpCode, client);

    if (!smsResult.success) {
      // Remove the OTP if SMS failed
      await OTP.findByIdAndDelete(otp._id);
      
      return res.status(500).json({
        success: false,
        message: 'Failed to send OTP. Please try again.'
      });
    }

    res.status(200).json({
      status: 'OTP_SENT',
      message: 'OTP has been sent to the provided number.',
      success: true
    });

  } catch (error) {
    console.error('Send OTP error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error. Please try again later.'
    });
  }
});

// Route: Verify OTP
// POST /api/mobile-auth/:client/verify-otp
router.post('/:client/verify-otp', checkClientAccess(['kitabai', 'ailisher']), async (req, res) => {
  try {
    const { mobile, otp } = req.body;
    const client = req.clientName;

    // Validation
    if (!mobile || !otp) {
      return res.status(400).json({
        success: false,
        message: 'Mobile number and OTP are required.'
      });
    }

    if (!validateMobile(mobile)) {
      return res.status(400).json({
        success: false,
        message: 'Please enter a valid 10-digit mobile number.'
      });
    }

    // Find valid OTP
    const otpRecord = await OTP.findOne({
      mobile,
      otp,
      client,
      isUsed: false,
      expiresAt: { $gt: new Date() }
    });

    if (!otpRecord) {
      return res.status(400).json({
        success: false,
        message: 'Invalid or expired OTP.'
      });
    }

    // Mark OTP as used
    otpRecord.isUsed = true;
    await otpRecord.save();

    // Find or create mobile user
    let mobileUser = await MobileUser.findOne({ mobile, client });
    
    if (!mobileUser) {
      mobileUser = new MobileUser({
        mobile,
        client,
        isVerified: true
      });
    } else {
      mobileUser.isVerified = true;
    }

    await mobileUser.save();

    // Generate auth token
    const token = generateToken(mobileUser._id, mobile, client);
    mobileUser.authToken = token;
    await mobileUser.save();

    // Check if profile exists
    const profile = await UserProfile.findOne({ userId: mobileUser._id });
    const isProfileComplete = !!profile;

    res.status(200).json({
      status: 'VERIFIED',
      success: true,
      token,
      is_profile_complete: isProfileComplete,
      user_id: mobileUser._id,
      message: 'OTP verified successfully.'
    });

  } catch (error) {
    console.error('Verify OTP error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error. Please try again later.'
    });
  }
});

// Route: Create/Update Profile
// POST /api/mobile-auth/:client/profile
router.post('/:client/profile', checkClientAccess(['kitabai', 'ailisher']), authenticateMobileUser, async (req, res) => {
  try {
    const { name, age, gender, exams, native_language } = req.body;
    const client = req.clientName;
    const userId = req.user.id;

    // Validation
    const errors = [];
    
    if (!name || name.trim().length === 0) {
      errors.push('Name is required.');
    }
    
    if (!age || !validateAgeGroup(age)) {
      errors.push('Please select a valid age group.');
    }
    
    if (!gender || !['Male', 'Female', 'Other'].includes(gender)) {
      errors.push('Please select a valid gender.');
    }
    
    if (!exams || !Array.isArray(exams) || exams.length === 0) {
      errors.push('Please select at least one exam.');
    }
    
    if (!native_language) {
      errors.push('Please select your native language.');
    }

    if (errors.length > 0) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed.',
        errors
      });
    }

    // Check if profile already exists
    let profile = await UserProfile.findOne({ userId });

    if (profile) {
      // Update existing profile
      profile.name = name.trim();
      profile.age = age;
      profile.gender = gender;
      profile.exams = exams;
      profile.nativeLanguage = native_language;
      profile.updatedAt = new Date();
    } else {
      // Create new profile
      profile = new UserProfile({
        userId,
        name: name.trim(),
        age,
        gender,
        exams,
        nativeLanguage: native_language,
        client
      });
    }

    await profile.save();

    // Send welcome SMS for new profiles
    if (!profile.createdAt || Math.abs(new Date() - profile.createdAt) < 5000) {
      await twilioService.sendWelcomeMessage(req.user.mobile, name, client);
    }

    res.status(200).json({
      status: 'PROFILE_SAVED',
      success: true,
      message: 'User profile saved successfully.',
      profile: {
        name: profile.name,
        age: profile.age,
        gender: profile.gender,
        exams: profile.exams,
        native_language: profile.nativeLanguage
      }
    });

  } catch (error) {
    console.error('Profile creation error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error. Please try again later.'
    });
  }
});

// Route: Get Profile
// GET /api/mobile-auth/:client/profile
router.get('/:client/profile', checkClientAccess(['kitabai', 'ailisher']), authenticateMobileUser, async (req, res) => {
  try {
    const userId = req.user.id;

    const profile = await UserProfile.findOne({ userId }).populate('userId', 'mobile createdAt');

    if (!profile) {
      return res.status(200).json({
        success: true,
        is_profile_complete: false,
        message: 'Profile not found. Please complete your profile setup.'
      });
    }

    res.status(200).json({
      success: true,
      is_profile_complete: true,
      profile: {
        name: profile.name,
        age: profile.age,
        gender: profile.gender,
        exams: profile.exams,
        native_language: profile.nativeLanguage,
        mobile: profile.userId.mobile,
        created_at: profile.createdAt,
        updated_at: profile.updatedAt
      }
    });

  } catch (error) {
    console.error('Get profile error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error. Please try again later.'
    });
  }
});

// Route: Update Profile
// PUT /api/mobile-auth/:client/profile
router.put('/:client/profile', checkClientAccess(['kitabai', 'ailisher']), authenticateMobileUser, async (req, res) => {
  try {
    const { name, age, gender, exams, native_language } = req.body;
    const userId = req.user.id;

    const profile = await UserProfile.findOne({ userId });

    if (!profile) {
      return res.status(404).json({
        success: false,
        message: 'Profile not found. Please create profile first.'
      });
    }

    // Update only provided fields with validation
    if (name !== undefined) profile.name = name.trim();
    if (age !== undefined) {
      if (!validateAgeGroup(age)) {
        return res.status(400).json({
          success: false,
          message: 'Please select a valid age group.'
        });
      }
      profile.age = age;
    }
    if (gender !== undefined) profile.gender = gender;
    if (exams !== undefined) profile.exams = exams;
    if (native_language !== undefined) profile.nativeLanguage = native_language;
    
    profile.updatedAt = new Date();

    await profile.save();

    res.status(200).json({
      success: true,
      message: 'Profile updated successfully.',
      profile: {
        name: profile.name,
        age: profile.age,
        gender: profile.gender,
        exams: profile.exams,
        native_language: profile.nativeLanguage
      }
    });

  } catch (error) {
    console.error('Update profile error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error. Please try again later.'
    });
  }
});

// Route: Logout (invalidate token)
// POST /api/mobile-auth/:client/logout
router.post('/:client/logout', checkClientAccess(['kitabai', 'ailisher']), authenticateMobileUser, async (req, res) => {
  try {
    const userId = req.user.id;

    // Clear auth token from database
    await MobileUser.findByIdAndUpdate(userId, { authToken: null });

    res.status(200).json({
      success: true,
      message: 'Logged out successfully.'
    });

  } catch (error) {
    console.error('Logout error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error. Please try again later.'
    });
  }
});

module.exports = router;
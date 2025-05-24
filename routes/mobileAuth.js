// routes/mobileAuth.js
const express = require('express');
const router = express.Router();
const MobileUser = require('../models/MobileUser');
const UserProfile = require('../models/UserProfile');
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

// Route: Login/Register with Mobile Number
// POST /api/mobile-auth/:client/login
router.post('/:client/login', checkClientAccess(['kitabai', 'ailisher']), async (req, res) => {
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

    // Check if mobile user exists
    let mobileUser = await MobileUser.findOne({ mobile, client });
    
    if (!mobileUser) {
      // Create new mobile user
      mobileUser = new MobileUser({
        mobile,
        client,
        isVerified: true
      });
      await mobileUser.save();
    } else {
      // Update verification status if needed
      if (!mobileUser.isVerified) {
        mobileUser.isVerified = true;
        await mobileUser.save();
      }
    }

    // Generate auth token
    const token = generateToken(mobileUser._id, mobile, client);
    mobileUser.authToken = token;
    await mobileUser.save();

    // Check if profile exists
    const profile = await UserProfile.findOne({ userId: mobileUser._id });
    const isProfileComplete = !!profile;

    if (isProfileComplete) {
      // Existing user with complete profile
      res.status(200).json({
        status: 'LOGIN_SUCCESS',
        success: true,
        token,
        is_profile_complete: true,
        user_id: mobileUser._id,
        message: 'Login successful.',
        profile: {
          name: profile.name,
          age: profile.age,
          gender: profile.gender,
          exams: profile.exams,
          native_language: profile.nativeLanguage
        }
      });
    } else {
      // New user or user without profile
      res.status(200).json({
        status: 'PROFILE_REQUIRED',
        success: true,
        token,
        is_profile_complete: false,
        user_id: mobileUser._id,
        message: 'Please complete your profile to continue.'
      });
    }

  } catch (error) {
    console.error('Login error:', error);
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
    let isNewProfile = !profile;

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

    res.status(200).json({
      status: 'PROFILE_SAVED',
      success: true,
      message: isNewProfile ? 'Profile created successfully.' : 'Profile updated successfully.',
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

// Route: Check User Status
// POST /api/mobile-auth/:client/check-user
router.post('/:client/check-user', checkClientAccess(['kitabai', 'ailisher']), async (req, res) => {
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

    // Check if mobile user exists
    const mobileUser = await MobileUser.findOne({ mobile, client });
    
    if (!mobileUser) {
      return res.status(200).json({
        success: true,
        user_exists: false,
        message: 'New user. Registration required.'
      });
    }

    // Check if profile exists
    const profile = await UserProfile.findOne({ userId: mobileUser._id });
    
    res.status(200).json({
      success: true,
      user_exists: true,
      is_profile_complete: !!profile,
      message: profile ? 'User exists with complete profile.' : 'User exists but profile incomplete.'
    });

  } catch (error) {
    console.error('Check user error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error. Please try again later.'
    });
  }
});

module.exports = router;
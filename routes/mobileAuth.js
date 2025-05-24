// routes/mobileAuth.js - Updated with RESTful URLs
const express = require('express');
const router = express.Router();
const MobileUser = require('../models/MobileUser');
const UserProfile = require('../models/UserProfile');
const User = require('../models/User');
const { generateToken, authenticateMobileUser, checkClientAccess } = require('../middleware/mobileAuth');

// Validation helpers
const validateMobile = (mobile) => /^\d{10}$/.test(mobile);
const validateAgeGroup = (age) => ['<15', '15-18', '19-25', '26-31', '32-40', '40+'].includes(age);

// Route: Login/Register with Mobile Number
// POST /api/clients/:clientId/mobile/auth/login
router.post('/login', checkClientAccess(), async (req, res) => {
  try {
    const { mobile } = req.body;
    const clientId = req.params.clientId;
    const client = req.clientInfo;

    if (!mobile || !validateMobile(mobile)) {
      return res.status(400).json({
        success: false,
        message: 'Please enter a valid 10-digit mobile number.'
      });
    }

    let mobileUser = await MobileUser.findOne({ mobile, clientId });
    
    if (!mobileUser) {
      mobileUser = new MobileUser({
        mobile,
        clientId,
        isVerified: true
      });
      await mobileUser.save();
    } else if (!mobileUser.isVerified) {
      mobileUser.isVerified = true;
      await mobileUser.save();
    }

    const token = generateToken(mobileUser._id, mobile, clientId);
    mobileUser.authToken = token;
    await mobileUser.save();

    const profile = await UserProfile.findOne({ userId: mobileUser._id });
    const isProfileComplete = !!profile;

    res.status(200).json({
      status: isProfileComplete ? 'LOGIN_SUCCESS' : 'PROFILE_REQUIRED',
      success: true,
      token,
      is_profile_complete: isProfileComplete,
      user_id: mobileUser._id,
      client_id: clientId,
      client_name: client.businessName,
      message: isProfileComplete ? 'Login successful.' : 'Please complete your profile to continue.',
      ...(isProfileComplete && {
        profile: {
          name: profile.name,
          age: profile.age,
          gender: profile.gender,
          exams: profile.exams,
          native_language: profile.nativeLanguage
        }
      })
    });

  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error. Please try again later.'
    });
  }
});

// Route: Create/Update Profile
// POST /api/clients/:clientId/mobile/auth/profile
router.post('/profile', checkClientAccess(), authenticateMobileUser, async (req, res) => {
  try {
    const { name, age, gender, exams, native_language } = req.body;
    const clientId = req.params.clientId;
    const userId = req.user.id;

    const mobileUser = await MobileUser.findOne({ _id: userId, clientId });
    if (!mobileUser) {
      return res.status(403).json({
        success: false,
        message: 'Access denied. User does not belong to this client.'
      });
    }

    // Validation
    const errors = [];
    if (!name || name.trim().length === 0) errors.push('Name is required.');
    if (!age || !validateAgeGroup(age)) errors.push('Please select a valid age group.');
    if (!gender || !['Male', 'Female', 'Other'].includes(gender)) errors.push('Please select a valid gender.');
    if (!exams || !Array.isArray(exams) || exams.length === 0) errors.push('Please select at least one exam.');
    if (!native_language) errors.push('Please select your native language.');

    if (errors.length > 0) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed.',
        errors
      });
    }

    let profile = await UserProfile.findOne({ userId });
    const isNewProfile = !profile;

    if (profile) {
      profile.name = name.trim();
      profile.age = age;
      profile.gender = gender;
      profile.exams = exams;
      profile.nativeLanguage = native_language;
      profile.updatedAt = new Date();
    } else {
      profile = new UserProfile({
        userId,
        name: name.trim(),
        age,
        gender,
        exams,
        nativeLanguage: native_language,
        clientId
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
// GET /api/clients/:clientId/mobile/auth/profile
router.get('/profile', checkClientAccess(), authenticateMobileUser, async (req, res) => {
  try {
    const clientId = req.params.clientId;
    const userId = req.user.id;

    const mobileUser = await MobileUser.findOne({ _id: userId, clientId });
    if (!mobileUser) {
      return res.status(403).json({
        success: false,
        message: 'Access denied. User does not belong to this client.'
      });
    }

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
// PUT /api/clients/:clientId/mobile/auth/profile
router.put('/profile', checkClientAccess(), authenticateMobileUser, async (req, res) => {
  try {
    const { name, age, gender, exams, native_language } = req.body;
    const clientId = req.params.clientId;
    const userId = req.user.id;

    const mobileUser = await MobileUser.findOne({ _id: userId, clientId });
    if (!mobileUser) {
      return res.status(403).json({
        success: false,
        message: 'Access denied. User does not belong to this client.'
      });
    }

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
// POST /api/clients/:clientId/mobile/auth/logout
router.post('/logout', checkClientAccess(), authenticateMobileUser, async (req, res) => {
  try {
    const clientId = req.params.clientId;
    const userId = req.user.id;

    await MobileUser.findOneAndUpdate(
      { _id: userId, clientId }, 
      { authToken: null }
    );

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
// POST /api/clients/:clientId/mobile/auth/check-user
router.post('/check-user', checkClientAccess(), async (req, res) => {
  try {
    const { mobile } = req.body;
    const clientId = req.params.clientId;
    const client = req.clientInfo;

    if (!mobile || !validateMobile(mobile)) {
      return res.status(400).json({
        success: false,
        message: 'Please enter a valid 10-digit mobile number.'
      });
    }

    const mobileUser = await MobileUser.findOne({ mobile, clientId });
    if (!mobileUser) {
      return res.status(200).json({
        success: true,
        user_exists: false,
        client_id: clientId,
        client_name: client.businessName,
        message: 'New user. Registration required.'
      });
    }

    const profile = await UserProfile.findOne({ userId: mobileUser._id });
    
    res.status(200).json({
      success: true,
      user_exists: true,
      is_profile_complete: !!profile,
      client_id: clientId,
      client_name: client.businessName,
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
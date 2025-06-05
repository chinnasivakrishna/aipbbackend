// routes/mobileAuth.js - Updated version with response codes starting from 1500
const express = require('express');
const router = express.Router({ mergeParams: true }); // Important: mergeParams to access :clientId
const MobileUser = require('../models/MobileUser');
const UserProfile = require('../models/UserProfile');
const User = require('../models/User');
const { generateToken, authenticateMobileUser, checkClientAccess } = require('../middleware/mobileAuth');

// Add comprehensive logging middleware for this router
router.use((req, res, next) => {
  console.log('=== MOBILE AUTH ROUTER MIDDLEWARE ===');
  console.log('Timestamp:', new Date().toISOString());
  console.log('Method:', req.method);
  console.log('URL:', req.url);
  console.log('Full URL:', req.originalUrl);
  console.log('Params:', req.params);
  console.log('Query:', req.query);
  console.log('Body:', req.body);
  console.log('Headers:', req.headers);
  console.log('=====================================');
  next();
});

// Validation helpers
const validateMobile = (mobile) => /^\d{10}$/.test(mobile);
const validateAgeGroup = (age) => ['<15', '15-18', '19-25', '26-31', '32-40', '40+'].includes(age);

console.log("Mobile Auth Routes loaded successfully");

// Route: Check User Status
// POST /api/clients/:clientId/mobile/auth/check-user
router.post('/check-user', async (req, res) => {
  try {
    console.log('=== CHECK USER ROUTE HIT ===');
    console.log('req.params:', req.params);
    console.log('req.body:', req.body);
    
    const { mobile } = req.body;
    const clientId = req.params.clientId;

    console.log('Extracted clientId:', clientId);
    console.log('Extracted mobile:', mobile);

    if (!clientId) {
      console.log('No clientId provided');
      return res.status(400).json({
        success: false,
        responseCode: 1500,
        message: 'Client ID is required.'
      });
    }

    // Validate client exists and is active
    console.log('Validating client with userId:', clientId);
    const client = await User.findOne({
      userId: clientId,
      role: 'client',
      status: 'active'
    });

    console.log('Client found:', client);

    if (!client) {
      console.log('Client validation failed');
      return res.status(400).json({
        success: false,
        responseCode: 1501,
        message: 'Invalid client ID or client is not active.'
      });
    }

    if (!mobile || !validateMobile(mobile)) {
      console.log('Mobile validation failed for check-user');
      return res.status(400).json({
        success: false,
        responseCode: 1502,
        message: 'Please enter a valid 10-digit mobile number.'
      });
    }

    console.log('Searching for existing mobile user:', { mobile, clientId });
    const mobileUser = await MobileUser.findOne({ mobile, clientId });
    console.log('Found existing mobile user:', mobileUser);
    
    if (!mobileUser) {
      console.log('No existing user found');
      const response = {
        success: true,
        responseCode: 1503,
        user_exists: false,
        client_id: clientId,
        client_name: client.businessName,
        message: 'New user. Registration required.'
      };
      console.log('Sending new user response:', response);
      return res.status(200).json(response);
    }

    console.log('Searching for profile for existing user:', mobileUser._id);
    const profile = await UserProfile.findOne({ userId: mobileUser._id });
    console.log('Found profile for existing user:', profile);
    
    const response = {
      success: true,
      responseCode: profile ? 1504 : 1505,
      user_exists: true,
      is_profile_complete: !!profile,
      client_id: clientId,
      client_name: client.businessName,
      message: profile ? 'User exists with complete profile.' : 'User exists but profile incomplete.'
    };
    
    console.log('Sending existing user response:', response);
    res.status(200).json(response);

  } catch (error) {
    console.error('=== CHECK USER ERROR ===');
    console.error('Error details:', error);
    console.error('Error stack:', error.stack);
    res.status(500).json({
      success: false,
      responseCode: 1506,
      message: 'Internal server error. Please try again later.'
    });
  }
});

// Route: Login/Register with Mobile Number
// POST /api/clients/:clientId/mobile/auth/login
router.post('/login', async (req, res) => {
  try {
    console.log('=== LOGIN ROUTE HIT ===');
    console.log('req.params:', req.params);
    console.log('req.body:', req.body);
    
    const { mobile } = req.body;
    const clientId = req.params.clientId;

    console.log('Extracted clientId:', clientId);
    console.log('Extracted mobile:', mobile);

    if (!clientId) {
      console.log('No clientId provided');
      return res.status(400).json({
        success: false,
        responseCode: 1507,
        message: 'Client ID is required.'
      });
    }

    // Validate client exists and is active
    console.log('Validating client with userId:', clientId);
    const client = await User.findOne({
      userId: clientId,
      role: 'client',
      status: 'active'
    });

    console.log('Client found:', client);

    if (!client) {
      console.log('Client validation failed');
      return res.status(400).json({
        success: false,
        responseCode: 1508,
        message: 'Invalid client ID or client is not active.'
      });
    }

    if (!mobile || !validateMobile(mobile)) {
      console.log('Mobile validation failed');
      return res.status(400).json({
        success: false,
        responseCode: 1509,
        message: 'Please enter a valid 10-digit mobile number.'
      });
    }

    console.log('Searching for mobile user with:', { mobile, clientId });
    let mobileUser = await MobileUser.findOne({ mobile, clientId });
    console.log('Found mobile user:', mobileUser);
    
    const isNewUser = !mobileUser;
    
    if (!mobileUser) {
      console.log('Creating new mobile user');
      mobileUser = new MobileUser({
        mobile,
        clientId,
        isVerified: true
      });
      await mobileUser.save();
      console.log('New mobile user created:', mobileUser);
    } else if (!mobileUser.isVerified) {
      console.log('Updating user verification status');
      mobileUser.isVerified = true;
      await mobileUser.save();
    }

    console.log('Generating token for user:', mobileUser._id);
    const token = generateToken(mobileUser._id, mobile, clientId);
    console.log('Generated token:', token);
    
    mobileUser.authToken = token;
    await mobileUser.save();
    console.log('Token saved to user');

    console.log('Searching for user profile with userId:', mobileUser._id);
    const profile = await UserProfile.findOne({ userId: mobileUser._id });
    console.log('Found profile:', profile);
    
    const isProfileComplete = !!profile;
    console.log('Is profile complete:', isProfileComplete);

    // Prepare base response
    const response = {
      status: isProfileComplete ? 'LOGIN_SUCCESS' : 'PROFILE_REQUIRED',
      success: true,
      responseCode: isProfileComplete ? 1510 : 1511,
      token,
      is_profile_complete: isProfileComplete,
      user_id: mobileUser._id,
      client_id: clientId,
      client_name: client.businessName,
      message: isProfileComplete ? 'Login successful.' : 'Please complete your profile to continue.'
    };

    // Add profile data if complete
    if (isProfileComplete) {
      response.profile = {
        name: profile.name,
        age: profile.age,
        gender: profile.gender,
        exams: profile.exams,
        native_language: profile.nativeLanguage
      };
    }

    // Add profile options if profile is incomplete (new user or existing user without profile)
    if (!isProfileComplete) {
      // Get all available options from UserProfile enum
      const availableExams = ['UPSC', 'CA', 'CMA', 'CS', 'ACCA', 'CFA', 'FRM', 'NEET', 'JEE', 'GATE', 'CAT', 'GMAT', 'GRE', 'IELTS', 'TOEFL', 'NET/JRF', 'BPSC', 'UPPCS', 'NDA', 'SSC', 'Teacher', 'CLAT', 'Judiciary', 'Other'];
      const availableLanguages = ['Hindi', 'English', 'Bengali', 'Telugu', 'Marathi', 'Tamil', 'Gujarati', 'Urdu', 'Kannada', 'Odia', 'Malayalam', 'Punjabi', 'Assamese', 'Other'];
      const availableAgeGroups = ['<15', '15-18', '19-25', '26-31', '32-40', '40+'];
      const availableGenders = ['Male', 'Female', 'Other'];
      
      response.profile_options = {
        exams: availableExams,
        languages: availableLanguages,
        age_groups: availableAgeGroups,
        genders: availableGenders
      };
      
      // Add additional context for new users
      if (isNewUser) {
        response.is_new_user = true;
      }
    }

    console.log('Sending response:', response);
    res.status(200).json(response);

  } catch (error) {
    console.error('=== LOGIN ERROR ===');
    console.error('Error details:', error);
    console.error('Error stack:', error.stack);
    res.status(500).json({
      success: false,
      responseCode: 1512,
      message: 'Internal server error. Please try again later.'
    });
  }
});

// Route: Create/Update Profile
// POST /api/clients/:clientId/mobile/auth/profile
router.post('/profile', authenticateMobileUser, async (req, res) => {
  try {
    console.log('=== PROFILE CREATE ROUTE HIT ===');
    const { name, age, gender, exams, native_language } = req.body;
    const clientId = req.params.clientId;
    const userId = req.user.id;

    const mobileUser = await MobileUser.findOne({ _id: userId, clientId });
    if (!mobileUser) {
      return res.status(403).json({
        success: false,
        responseCode: 1513,
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
        responseCode: 1514,
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
      responseCode: isNewProfile ? 1515 : 1516,
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
      responseCode: 1517,
      message: 'Internal server error. Please try again later.'
    });
  }
});

// Route: Get Profile
// GET /api/clients/:clientId/mobile/auth/profile
router.get('/profile', authenticateMobileUser, async (req, res) => {
  try {
    console.log('=== GET PROFILE ROUTE HIT ===');
    const clientId = req.params.clientId;
    const userId = req.user.id;

    const mobileUser = await MobileUser.findOne({ _id: userId, clientId });
    if (!mobileUser) {
      return res.status(403).json({
        success: false,
        responseCode: 1518,
        message: 'Access denied. User does not belong to this client.'
      });
    }

    const profile = await UserProfile.findOne({ userId }).populate('userId', 'mobile createdAt');

    if (!profile) {
      return res.status(200).json({
        success: true,
        responseCode: 1519,
        is_profile_complete: false,
        message: 'Profile not found. Please complete your profile setup.'
      });
    }

    res.status(200).json({
      success: true,
      responseCode: 1520,
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
      responseCode: 1521,
      message: 'Internal server error. Please try again later.'
    });
  }
});

// Route: Update Profile
// PUT /api/clients/:clientId/mobile/auth/profile
router.put('/profile', authenticateMobileUser, async (req, res) => {
  try {
    console.log('=== UPDATE PROFILE ROUTE HIT ===');
    const { name, age, gender, exams, native_language } = req.body;
    const clientId = req.params.clientId;
    const userId = req.user.id;

    const mobileUser = await MobileUser.findOne({ _id: userId, clientId });
    if (!mobileUser) {
      return res.status(403).json({
        success: false,
        responseCode: 1522,
        message: 'Access denied. User does not belong to this client.'
      });
    }

    const profile = await UserProfile.findOne({ userId });
    if (!profile) {
      return res.status(404).json({
        success: false,
        responseCode: 1523,
        message: 'Profile not found. Please create profile first.'
      });
    }

    // Update only provided fields with validation
    if (name !== undefined) profile.name = name.trim();
    if (age !== undefined) {
      if (!validateAgeGroup(age)) {
        return res.status(400).json({
          success: false,
          responseCode: 1524,
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
      responseCode: 1525,
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
      responseCode: 1526,
      message: 'Internal server error. Please try again later.'
    });
  }
});

// Route: Logout (invalidate token)
// POST /api/clients/:clientId/mobile/auth/logout
router.post('/logout', authenticateMobileUser, async (req, res) => {
  try {
    console.log('=== LOGOUT ROUTE HIT ===');
    const clientId = req.params.clientId;
    const userId = req.user.id;

    await MobileUser.findOneAndUpdate(
      { _id: userId, clientId }, 
      { authToken: null }
    );

    res.status(200).json({
      success: true,
      responseCode: 1527,
      message: 'Logged out successfully.'
    });

  } catch (error) {
    console.error('Logout error:', error);
    res.status(500).json({
      success: false,
      responseCode: 1528,
      message: 'Internal server error. Please try again later.'
    });
  }
});

// Add a test route to verify the router is working
router.get('/test', (req, res) => {
  console.log('=== TEST ROUTE HIT ===');
  console.log('req.params:', req.params);
  res.json({
    success: true,
    responseCode: 1529,
    message: 'Mobile auth router is working!',
    clientId: req.params.clientId,
    timestamp: new Date().toISOString()
  });
});

// Add error handling middleware specific to this router
router.use((error, req, res, next) => {
  console.error('=== MOBILE AUTH ROUTER ERROR ===');
  console.error('Error:', error);
  console.error('Request URL:', req.originalUrl);
  console.error('Request Method:', req.method);
  console.error('Request Params:', req.params);
  console.error('Request Body:', req.body);
  
  res.status(500).json({
    success: false,
    responseCode: 1530,
    message: 'Router error occurred',
    error: error.message
  });
});

console.log("Mobile Auth Routes module exported successfully");

module.exports = router;
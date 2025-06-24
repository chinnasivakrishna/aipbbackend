// Enhanced mobileAuth.js with better duplicate handling and validation

const express = require('express');
const router = express.Router({ mergeParams: true });
const MobileUser = require('../models/MobileUser');
const UserProfile = require('../models/UserProfile');
const User = require('../models/User');
const { generateToken, authenticateMobileUser, checkClientAccess } = require('../middleware/mobileAuth');

// Validation helpers
const validateMobile = (mobile) => /^\d{10}$/.test(mobile);
const validateAgeGroup = (age) => ['<15', '15-18', '19-25', '26-31', '32-40', '40+'].includes(age);

// Enhanced client validation middleware
const validateClient = async (req, res, next) => {
  try {
    const clientId = req.params.clientId;
    
    if (!clientId) {
      return res.status(400).json({
        success: false,
        responseCode: 1500,
        message: 'Client ID is required.'
      });
    }

    const client = await User.findOne({
      userId: clientId,
      role: 'client',
      status: 'active'
    });

    if (!client) {
      return res.status(400).json({
        success: false,
        responseCode: 1501,
        message: 'Invalid client ID or client is not active.'
      });
    }

    req.client = client; // Attach client info to request
    next();
  } catch (error) {
    console.error('Client validation error:', error);
    res.status(500).json({
      success: false,
      responseCode: 1502,
      message: 'Error validating client.'
    });
  }
};

// Route: Enhanced Check User Status with cross-client info
router.post('/check-user', validateClient, async (req, res) => {
  try {
    const { mobile } = req.body;
    const clientId = req.params.clientId;
    const client = req.client;

    if (!mobile || !validateMobile(mobile)) {
      return res.status(400).json({
        success: false,
        responseCode: 1503,
        message: 'Please enter a valid 10-digit mobile number.'
      });
    }

    // Check if user exists for this specific client
    const mobileUser = await MobileUser.findByMobileAndClient(mobile, clientId);
    
    if (!mobileUser) {
      // Optional: Check if mobile exists with other clients (for analytics)
      const crossClientUsage = await MobileUser.getMobileUsageAcrossClients(mobile);
      
      return res.status(200).json({
        success: true,
        responseCode: 1504,
        user_exists: false,
        client_id: clientId,
        client_name: client.businessName,
        message: 'New user for this client. Registration required.',
        // Optional info for debugging (remove in production if privacy concern)
        cross_client_usage_count: crossClientUsage.length
      });
    }

    // Check profile completeness
    const profile = await UserProfile.findOne({ userId: mobileUser._id });
    
    res.status(200).json({
      success: true,
      responseCode: profile ? 1505 : 1506,
      user_exists: true,
      is_profile_complete: !!profile,
      client_id: clientId,
      client_name: client.businessName,
      user_id: mobileUser._id,
      last_login: mobileUser.lastLoginAt,
      login_count: mobileUser.loginCount,
      message: profile ? 'User exists with complete profile.' : 'User exists but profile incomplete.'
    });

  } catch (error) {
    console.error('Check user error:', error);
    res.status(500).json({
      success: false,
      responseCode: 1507,
      message: 'Internal server error. Please try again later.'
    });
  }
});

// Route: Enhanced Login/Register with better duplicate handling
router.post('/login', validateClient, async (req, res) => {
  try {
    const { mobile } = req.body;
    const clientId = req.params.clientId;
    const client = req.client;

    if (!mobile || !validateMobile(mobile)) {
      return res.status(400).json({
        success: false,
        responseCode: 1508,
        message: 'Please enter a valid 10-digit mobile number.'
      });
    }

    let mobileUser = await MobileUser.findByMobileAndClient(mobile, clientId);
    const isNewUser = !mobileUser;
    
    if (!mobileUser) {
      try {
        // Create new mobile user for this client
        mobileUser = new MobileUser({
          mobile,
          clientId,
          isVerified: true
        });
        await mobileUser.save();
        console.log(`New mobile user created: ${mobile} for client: ${clientId}`);
        
      } catch (error) {
        // Handle duplicate key error specifically
        if (error.message.includes('Mobile number already exists for this client')) {
          // This shouldn't happen due to our findByMobileAndClient check, but just in case
          mobileUser = await MobileUser.findByMobileAndClient(mobile, clientId);
          if (!mobileUser) {
            throw error; // Re-throw if still not found
          }
        } else {
          throw error;
        }
      }
    }

    // Generate token and update user
    const token = generateToken(mobileUser._id, mobile, clientId);
    mobileUser.authToken = token;
    await mobileUser.save();

    // Check profile completeness
    const profile = await UserProfile.findOne({ userId: mobileUser._id });
    const isProfileComplete = !!profile;

    // Base response
    const response = {
      status: isProfileComplete ? 'LOGIN_SUCCESS' : 'PROFILE_REQUIRED',
      success: true,
      responseCode: isProfileComplete ? 1509 : 1510,
      token,
      is_profile_complete: isProfileComplete,
      is_new_user: isNewUser,
      user_id: mobileUser._id,
      client_id: clientId,
      client_name: client.businessName,
      login_count: mobileUser.loginCount,
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
    } else {
      // Add profile options for incomplete profiles
      response.profile_options = {
        exams: ['UPSC', 'CA', 'CMA', 'CS', 'ACCA', 'CFA', 'FRM', 'NEET', 'JEE', 'GATE', 'CAT', 'GMAT', 'GRE', 'IELTS', 'TOEFL', 'NET/JRF', 'BPSC', 'UPPCS', 'NDA', 'SSC', 'Teacher', 'CLAT', 'Judiciary', 'Other'],
        languages: ['Hindi', 'English', 'Bengali', 'Telugu', 'Marathi', 'Tamil', 'Gujarati', 'Urdu', 'Kannada', 'Odia', 'Malayalam', 'Punjabi', 'Assamese', 'Other'],
        age_groups: ['<15', '15-18', '19-25', '26-31', '32-40', '40+'],
        genders: ['Male', 'Female', 'Other']
      };
    }

    res.status(200).json(response);

  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({
      success: false,
      responseCode: 1511,
      message: 'Internal server error. Please try again later.'
    });
  }
});

// Route: Get Mobile Usage Analytics (Admin only - optional)
router.get('/mobile-analytics/:mobile', async (req, res) => {
  try {
    const { mobile } = req.params;
    
    if (!validateMobile(mobile)) {
      return res.status(400).json({
        success: false,
        responseCode: 1512,
        message: 'Please provide a valid 10-digit mobile number.'
      });
    }

    const usage = await MobileUser.getMobileUsageAcrossClients(mobile);
    const clientDetails = await Promise.all(
      usage.map(async (user) => {
        const client = await User.findOne({ userId: user.clientId }).select('businessName userId');
        return {
          client_id: user.clientId,
          client_name: client?.businessName || 'Unknown',
          registered_at: user.createdAt
        };
      })
    );

    res.status(200).json({
      success: true,
      responseCode: 1513,
      mobile,
      total_clients: usage.length,
      client_details: clientDetails,
      message: `Mobile number is registered with ${usage.length} client(s).`
    });

  } catch (error) {
    console.error('Mobile analytics error:', error);
    res.status(500).json({
      success: false,
      responseCode: 1514,
      message: 'Internal server error.'
    });
  }
});

// Route: Bulk Check Mobile Numbers (for client admin)
router.post('/bulk-check', validateClient, async (req, res) => {
  try {
    const { mobiles } = req.body;
    const clientId = req.params.clientId;

    if (!Array.isArray(mobiles) || mobiles.length === 0) {
      return res.status(400).json({
        success: false,
        responseCode: 1515,
        message: 'Please provide an array of mobile numbers.'
      });
    }

    const results = await Promise.all(
      mobiles.map(async (mobile) => {
        if (!validateMobile(mobile)) {
          return { mobile, status: 'invalid', message: 'Invalid mobile number format' };
        }

        const user = await MobileUser.findByMobileAndClient(mobile, clientId);
        if (user) {
          const profile = await UserProfile.findOne({ userId: user._id });
          return {
            mobile,
            status: 'exists',
            user_id: user._id,
            profile_complete: !!profile,
            last_login: user.lastLoginAt
          };
        } else {
          return { mobile, status: 'new', message: 'Ready for registration' };
        }
      })
    );

    res.status(200).json({
      success: true,
      responseCode: 1516,
      results,
      summary: {
        total: mobiles.length,
        existing: results.filter(r => r.status === 'exists').length,
        new: results.filter(r => r.status === 'new').length,
        invalid: results.filter(r => r.status === 'invalid').length
      }
    });

  } catch (error) {
    console.error('Bulk check error:', error);
    res.status(500).json({
      success: false,
      responseCode: 1517,
      message: 'Internal server error.'
    });
  }
});

module.exports = router;
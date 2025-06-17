// routes/mobileQRAuth.js
const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const MobileUser = require('../models/MobileUser');
const User = require('../models/User');
const UserProfile = require('../models/UserProfile');
const { sendMobileOtp, verifyOTP } = require('../services/otpService');
const { generateToken } = require('../middleware/mobileAuth');
const { validationResult, body, param } = require('express-validator');

// Validation middleware
const validateMobile = [
  body('mobile')
    .matches(/^\d{10}$/)
    .withMessage('Please enter a valid 10-digit mobile number')
];

const validateOTP = [
  body('mobile')
    .matches(/^\d{10}$/)
    .withMessage('Please enter a valid 10-digit mobile number'),
  body('otp')
    .isLength({ min: 6, max: 6 })
    .withMessage('OTP must be 6 digits'),
  body('name')
    .optional()
    .isLength({ min: 2, max: 50 })
    .withMessage('Name must be between 2 and 50 characters')
];

const validateClientId = [
  param('clientId')
    .notEmpty()
    .withMessage('Client ID is required')
];

// Generate QR token for question access
const generateQRToken = (questionId, clientId) => {
  return jwt.sign(
    { 
      questionId,
      clientId,
      type: 'qr',
      purpose: 'question_access'
    },
    process.env.JWT_SECRET,
    { expiresIn: '24h' } // QR tokens valid for 24 hours
  );
};

// ==================== QR AUTHENTICATION ROUTES ====================

// Check if mobile number is registered and get client info
router.post('/clients/:clientId/qr/check-user',
  validateClientId,
  validateMobile,
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          message: "Invalid input data",
          error: {
            code: "INVALID_INPUT",
            details: errors.array()
          }
        });
      }

      const { clientId } = req.params;
      const { mobile } = req.body;

      // Verify client exists and get client info
      const client = await User.findOne({
        userId: clientId,
        role: 'client',
        status: 'active'
      });

      if (!client) {
        return res.status(400).json({
          success: false,
          message: 'Invalid client ID or client is not active',
          error: {
            code: 'INVALID_CLIENT',
            details: `Client with ID ${clientId} not found or is not active`
          }
        });
      }

      // Check if mobile user exists
      const mobileUser = await MobileUser.findOne({ mobile, clientId });
      let userProfile = null;

      if (mobileUser) {
        // Get user profile if exists
        userProfile = await UserProfile.findOne({ userId: mobileUser._id });
      }

      // Prepare client info
      const clientInfo = {
        clientId: client.userId,
        clientName: client.businessName || client.name,
        clientLogo: client.businessLogo,
        businessWebsite: client.businessWebsite,
        city: client.city
      };

      res.status(200).json({
        success: true,
        message: 'User check completed',
        data: {
          isRegistered: !!mobileUser,
          userExists: !!mobileUser,
          clientInfo: clientInfo,
          userProfile: mobileUser ? {
            name: userProfile?.name,
            profilePicture: userProfile?.profilePicture,
            mobile: mobile
          } : null
        }
      });

    } catch (error) {
      console.error('Check user error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to check user',
        error: {
          code: 'USER_CHECK_ERROR',
          details: error.message
        }
      });
    }
  }
);

// Send OTP for mobile authentication
router.post('/clients/:clientId/qr/send-otp',
  validateClientId,
  validateMobile,
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          message: "Invalid input data",
          error: {
            code: "INVALID_INPUT",
            details: errors.array()
          }
        });
      }

      const { clientId } = req.params;
      const { mobile } = req.body;

      // Verify client exists and get client info
      const client = await User.findOne({
        userId: clientId,
        role: 'client',
        status: 'active'
      });

      if (!client) {
        return res.status(400).json({
          success: false,
          message: 'Invalid client ID or client is not active',
          error: {
            code: 'INVALID_CLIENT',
            details: `Client with ID ${clientId} not found or is not active`
          }
        });
      }

      // Check if mobile user exists and get profile
      const mobileUser = await MobileUser.findOne({ mobile, clientId });
      let userProfile = null;

      if (mobileUser) {
        userProfile = await UserProfile.findOne({ userId: mobileUser._id });
      }

      // Send OTP
      await sendMobileOtp(mobile);

      // Prepare response data
      const responseData = {
        mobile: mobile,
        clientId: clientId,
        otpSent: true,
        clientInfo: {
          clientId: client.userId,
          clientName: client.businessName || client.name,
          clientLogo: client.businessLogo,
          businessWebsite: client.businessWebsite,
          city: client.city
        }
      };

      // Add user info if registered
      if (mobileUser && userProfile) {
        responseData.userInfo = {
          isRegistered: true,
          name: userProfile.name,
          profilePicture: userProfile.profilePicture,
          mobile: mobile
        };
      } else {
        responseData.userInfo = {
          isRegistered: false
        };
      }

      res.status(200).json({
        success: true,
        message: 'OTP sent successfully',
        data: responseData
      });

    } catch (error) {
      console.error('Send OTP error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to send OTP',
        error: {
          code: 'OTP_SEND_ERROR',
          details: error.message
        }
      });
    }
  }
);

// Verify OTP and authenticate user
router.post('/clients/:clientId/qr/verify-otp',
  validateClientId,
  validateOTP,
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          message: "Invalid input data",
          error: {
            code: "INVALID_INPUT",
            details: errors.array()
          }
        });
      }

      const { clientId } = req.params;
      const { mobile, otp, name } = req.body;

      // Verify client exists
      const client = await User.findOne({
        userId: clientId,
        role: 'client',
        status: 'active'
      });

      if (!client) {
        return res.status(400).json({
          success: false,
          message: 'Invalid client ID or client is not active',
          error: {
            code: 'INVALID_CLIENT',
            details: `Client with ID ${clientId} not found or is not active`
          }
        });
      }

      // Verify OTP
      const otpResult = verifyOTP(mobile, otp);
      if (!otpResult.success) {
        return res.status(400).json({
          success: false,
          message: otpResult.message,
          error: {
            code: 'INVALID_OTP',
            details: otpResult.message
          }
        });
      }

      // Find or create mobile user
      let mobileUser = await MobileUser.findOne({ mobile, clientId });
      let userProfile = null;
      let isNewUser = false;
      
      if (!mobileUser) {
        // Create new mobile user
        isNewUser = true;
        mobileUser = new MobileUser({
          mobile,
          clientId,
          isVerified: true
        });
      }

      // Generate auth token
      const authToken = generateToken(mobileUser._id, mobile, clientId);
      mobileUser.authToken = authToken;
      mobileUser.lastLoginAt = new Date();
      
      await mobileUser.save();

      // Handle user profile
      if (isNewUser && name) {
        // Create new profile for new user
        userProfile = new UserProfile({
          userId: mobileUser._id,
          name: name,
          mobile: mobile,
          createdAt: new Date(),
          updatedAt: new Date()
        });
        await userProfile.save();
      } else {
        // Get existing profile for registered user
        userProfile = await UserProfile.findOne({ userId: mobileUser._id });
        
        // Update profile if name is provided and user doesn't have a name
        if (name && (!userProfile || !userProfile.name)) {
          if (!userProfile) {
            userProfile = new UserProfile({
              userId: mobileUser._id,
              name: name,
              mobile: mobile,
              createdAt: new Date(),
              updatedAt: new Date()
            });
          } else {
            userProfile.name = name;
            userProfile.updatedAt = new Date();
          }
          await userProfile.save();
        }
      }

      // Prepare response
      const responseData = {
        user: {
          id: mobileUser._id,
          mobile: mobileUser.mobile,
          clientId: mobileUser.clientId,
          isVerified: mobileUser.isVerified,
          isNewUser: isNewUser,
          name: userProfile?.name,
          profilePicture: userProfile?.profilePicture
        },
        clientInfo: {
          clientId: client.userId,
          clientName: client.businessName || client.name,
          clientLogo: client.businessLogo,
          businessWebsite: client.businessWebsite,
          city: client.city
        },
        authToken: authToken,
        tokenType: 'Bearer',
        expiresIn: '30d'
      };

      res.status(200).json({
        success: true,
        message: 'Authentication successful',
        data: responseData
      });

    } catch (error) {
      console.error('Verify OTP error:', error);
      res.status(500).json({
        success: false,
        message: 'Authentication failed',
        error: {
          code: 'AUTH_ERROR',
          details: error.message
        }
      });
    }
  }
);

module.exports = router;
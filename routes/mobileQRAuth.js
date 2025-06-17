// routes/mobileQRAuth.js
const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const MobileUser = require('../models/MobileUser');
const User = require('../models/User');
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

      // Send OTP
      await sendMobileOtp(mobile);

      res.status(200).json({
        success: true,
        message: 'OTP sent successfully',
        data: {
          mobile: mobile,
          clientId: clientId,
          otpSent: true
        }
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
      
      if (!mobileUser) {
        // Create new mobile user
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

      // Create or update user profile if name is provided
      if (name) {
        const UserProfile = require('../models/UserProfile');
        await UserProfile.findOneAndUpdate(
          { userId: mobileUser._id },
          { 
            userId: mobileUser._id,
            name: name,
            mobile: mobile,
            updatedAt: new Date()
          },
          { upsert: true, new: true }
        );
      }

      res.status(200).json({
        success: true,
        message: 'Authentication successful',
        data: {
          user: {
            id: mobileUser._id,
            mobile: mobileUser.mobile,
            clientId: mobileUser.clientId,
            isVerified: mobileUser.isVerified,
            name: name
          },
          authToken: authToken,
          tokenType: 'Bearer',
          expiresIn: '30d'
        }
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

// ==================== QR QUESTION ACCESS ROUTES ====================

// Generate QR code with authentication token for question access
router.get('/clients/:clientId/questions/:questionId/qr-auth',
  validateClientId,
  param('questionId').isMongoId().withMessage('Question ID must be valid'),
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

      const { clientId, questionId } = req.params;
      const { frontendBaseUrl } = req.query;

      // Verify client exists
      const client = await User.findOne({
        userId: clientId,
        role: 'client',
        status: 'active'
      });

      if (!client) {
        return res.status(400).json({
          success: false,
          message: 'Invalid client ID',
          error: {
            code: 'INVALID_CLIENT',
            details: 'Client not found or inactive'
          }
        });
      }

      // Generate QR token for question access
      const qrToken = generateQRToken(questionId, clientId);

      // Create QR URL with authentication
      const baseUrl = frontendBaseUrl || `${req.protocol}://${req.get('host')}`;
      const qrUrl = `${baseUrl}/qr-question/${questionId}?client=${clientId}&token=${qrToken}`;

      res.status(200).json({
        success: true,
        data: {
          questionId,
          clientId,
          qrUrl,
          qrToken,
          expiresIn: '24h',
          authRequired: true
        }
      });

    } catch (error) {
      console.error('Generate QR auth URL error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to generate QR auth URL',
        error: {
          code: 'QR_AUTH_ERROR',
          details: error.message
        }
      });
    }
  }
);

// Validate QR token and get question access
router.get('/clients/:clientId/qr-access/:questionId',
  validateClientId,
  param('questionId').isMongoId().withMessage('Question ID must be valid'),
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

      const { clientId, questionId } = req.params;
      const { token } = req.query;

      if (!token) {
        return res.status(401).json({
          success: false,
          message: 'QR token is required',
          error: {
            code: 'MISSING_QR_TOKEN',
            details: 'QR token must be provided in query parameters'
          }
        });
      }

      // Verify QR token
      let decoded;
      try {
        decoded = jwt.verify(token, process.env.JWT_SECRET);
      } catch (jwtError) {
        return res.status(401).json({
          success: false,
          message: 'Invalid or expired QR token',
          error: {
            code: 'INVALID_QR_TOKEN',
            details: jwtError.message
          }
        });
      }

      // Validate token data
      if (decoded.type !== 'qr' || 
          decoded.questionId !== questionId || 
          decoded.clientId !== clientId) {
        return res.status(401).json({
          success: false,
          message: 'Invalid QR token data',
          error: {
            code: 'TOKEN_DATA_MISMATCH',
            details: 'Token does not match the requested resource'
          }
        });
      }

      // Check if user is authenticated
      const authToken = req.header('Authorization')?.replace('Bearer ', '');
      let isAuthenticated = false;
      let user = null;

      if (authToken) {
        try {
          const authDecoded = jwt.verify(authToken, process.env.JWT_SECRET);
          if (authDecoded.type === 'mobile' && authDecoded.clientId === clientId) {
            user = await MobileUser.findOne({
              _id: authDecoded.id,
              authToken: authToken,
              clientId: clientId
            });
            isAuthenticated = !!user;
          }
        } catch (authError) {
          // Authentication failed, but we'll handle it below
        }
      }

      res.status(200).json({
        success: true,
        data: {
          questionId,
          clientId,
          qrTokenValid: true,
          isAuthenticated,
          user: isAuthenticated ? {
            id: user._id,
            mobile: user.mobile,
            clientId: user.clientId
          } : null,
          requiresAuth: !isAuthenticated,
          authUrl: !isAuthenticated ? `/clients/${clientId}/qr/auth` : null
        }
      });

    } catch (error) {
      console.error('QR access validation error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to validate QR access',
        error: {
          code: 'QR_ACCESS_ERROR',
          details: error.message
        }
      });
    }
  }
);

module.exports = router;
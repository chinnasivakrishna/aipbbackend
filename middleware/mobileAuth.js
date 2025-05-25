// middleware/mobileAuth.js - Fixed parameter handling
const jwt = require('jsonwebtoken');
const MobileUser = require('../models/MobileUser');
const User = require('../models/User');

// Generate JWT token
const generateToken = (userId, mobile, clientId) => {
  return jwt.sign(
    { 
      id: userId, 
      mobile: mobile,
      clientId: clientId,
      type: 'mobile' 
    },
    process.env.JWT_SECRET,
    { expiresIn: '30d' }
  );
};

// Authenticate mobile user
const authenticateMobileUser = async (req, res, next) => {
  try {
    const token = req.header('Authorization')?.replace('Bearer ', '');
    
    if (!token) {
      return res.status(401).json({
        success: false,
        message: 'Access denied. No token provided.'
      });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    if (decoded.type !== 'mobile') {
      return res.status(401).json({
        success: false,
        message: 'Invalid token type.'
      });
    }

    // Check if user exists and token matches
    const user = await MobileUser.findOne({
      _id: decoded.id,
      authToken: token
    });

    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'Invalid token or user not found.'
      });
    }

    // Verify client ID from URL matches user's client
    // Try multiple ways to get clientId
    const clientIdFromUrl = req.params.clientId || req.clientId;
    if (clientIdFromUrl && user.clientId !== clientIdFromUrl) {
      return res.status(403).json({
        success: false,
        message: 'Access denied. Client mismatch.'
      });
    }

    req.user = {
      id: user._id,
      mobile: user.mobile,
      clientId: user.clientId
    };

    next();
  } catch (error) {
    console.error('Authentication error:', error);
    res.status(401).json({
      success: false,
      message: 'Invalid token.'
    });
  }
};

// Check client access middleware
const checkClientAccess = (allowedClients = []) => {
  return async (req, res, next) => {
    try {
      // Try multiple ways to get clientId
      const clientId = req.params.clientId || req.clientId;
      
      console.log('Checking client access for:', clientId);
      console.log('Available params:', req.params);
      console.log('Request URL:', req.originalUrl);
      
      if (!clientId) {
        return res.status(400).json({
          success: false,
          message: 'Client ID is required.'
        });
      }

      // Validate client exists and is active
      const client = await User.findOne({
        userId: clientId,
        role: 'client',
        status: 'active'
      });

      if (!client) {
        return res.status(400).json({
          success: false,
          message: 'Invalid client ID or client is not active.'
        });
      }

      // If specific clients are allowed, check if current client is in the list
      // This is kept for backward compatibility but can be removed if not needed
      if (allowedClients.length > 0) {
        // For now, we'll allow all valid clients
        // You can implement specific business logic here if needed
      }

      // Add client info to request
      req.clientId = clientId;
      req.clientInfo = {
        id: client._id,
        userId: client.userId,
        businessName: client.businessName,
        businessOwnerName: client.businessOwnerName
      };

      next();
    } catch (error) {
      console.error('Client access check error:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error during client validation.'
      });
    }
  };
};

module.exports = {
  generateToken,
  authenticateMobileUser,
  checkClientAccess
};
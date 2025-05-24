// middleware/mobileAuth.js
const jwt = require('jsonwebtoken');
const MobileUser = require('../models/MobileUser');

// Generate JWT token for mobile users
const generateToken = (userId, mobile, client) => {
  return jwt.sign(
    { 
      userId,
      mobile,
      client,
      type: 'mobile_user'
    },
    process.env.JWT_SECRET,
    { expiresIn: '30d' }
  );
};

// Middleware to authenticate mobile users
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
    
    // Check if it's a mobile user token
    if (decoded.type !== 'mobile_user') {
      return res.status(401).json({
        success: false,
        message: 'Invalid token type.'
      });
    }

    // Find the user
    const user = await MobileUser.findById(decoded.userId);
    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'Token is valid but user not found.'
      });
    }

    if (!user.isVerified) {
      return res.status(401).json({
        success: false,
        message: 'Mobile number not verified.'
      });
    }

    // Add user info to request
    req.user = {
      id: user._id,
      mobile: user.mobile,
      client: user.client,
      isVerified: user.isVerified
    };

    next();
  } catch (error) {
    console.error('Auth middleware error:', error);
    
    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({
        success: false,
        message: 'Invalid token.'
      });
    }
    
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({
        success: false,
        message: 'Token expired.'
      });
    }

    res.status(500).json({
      success: false,
      message: 'Token verification failed.'
    });
  }
};

// Middleware to check client access
const checkClientAccess = (allowedClients) => {
  return (req, res, next) => {
    const clientFromRoute = req.params.client || req.body.client || req.query.client;
    
    if (!clientFromRoute) {
      return res.status(400).json({
        success: false,
        message: 'Client parameter is required.'
      });
    }

    if (!allowedClients.includes(clientFromRoute)) {
      return res.status(403).json({
        success: false,
        message: 'Access denied for this client.'
      });
    }

    // Add client to request for easy access
    req.clientName = clientFromRoute;
    next();
  };
};

module.exports = {
  generateToken,
  authenticateMobileUser,
  checkClientAccess
};
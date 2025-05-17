// controllers/adminController.js - Admin controller functions
const jwt = require('jsonwebtoken');
const Admin = require('../models/Admin');
const User = require('../models/User');

// Generate JWT Token for admin
const generateAdminToken = (id) => {
  return jwt.sign({ id }, process.env.JWT_SECRET, {
    expiresIn: '7d'
  });
};

// Register a new admin
exports.register = async (req, res) => {
  try {
    const { name, email, password, adminCode } = req.body;

    // Verify admin registration code
    if (adminCode !== process.env.ADMIN_REGISTRATION_CODE) {
      return res.status(401).json({ success: false, message: 'Invalid admin registration code' });
    }

    // Check if admin already exists
    const existingAdmin = await Admin.findOne({ email });
    if (existingAdmin) {
      return res.status(400).json({ success: false, message: 'Admin with this email already exists' });
    }

    // Create new admin
    const admin = await Admin.create({
      name,
      email,
      password
    });

    // Generate token
    const token = generateAdminToken(admin._id);

    res.status(201).json({
      success: true,
      token,
      user: {
        id: admin._id,
        name: admin.name,
        email: admin.email
      }
    });
  } catch (error) {
    console.error('Admin registration error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

// Login admin
exports.login = async (req, res) => {
  try {
    const { email, password } = req.body;

    // Check if admin exists
    const admin = await Admin.findOne({ email });
    if (!admin) {
      return res.status(401).json({ success: false, message: 'Invalid credentials' });
    }

    // Check if password matches
    const isMatch = await admin.comparePassword(password);
    if (!isMatch) {
      return res.status(401).json({ success: false, message: 'Invalid credentials' });
    }

    // Generate token
    const token = generateAdminToken(admin._id);

    res.json({
      success: true,
      token,
      user: {
        id: admin._id,
        name: admin.name,
        email: admin.email
      }
    });
  } catch (error) {
    console.error('Admin login error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

// Generate login token for client (admin impersonation)
exports.generateClientLoginToken = async (req, res) => {
  try {
    const clientId = req.params.id;
    
    // Find client by ID
    const client = await User.findById(clientId);
    if (!client || client.role !== 'client') {
      return res.status(404).json({ success: false, message: 'Client not found' });
    }
    
    // Generate a short-lived token for this client (e.g., 1 hour)
    const token = jwt.sign({ id: client._id }, process.env.JWT_SECRET, {
      expiresIn: '1h'
    });
    
    res.json({
      success: true,
      token,
      user: {
        id: client._id,
        name: client.name,
        email: client.email,
        role: client.role
      }
    });
  } catch (error) {
    console.error('Generate client login token error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};
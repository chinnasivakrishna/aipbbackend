// controllers/clientController.js - Client controller functions
const User = require('../models/User');

// Get client dashboard data
exports.getDashboard = async (req, res) => {
  try {
    // Get statistics and data needed for client dashboard
    // This is a placeholder - implement actual dashboard data retrieval based on your requirements
    
    // Example: Get count of users managed by this client
    const userCount = await User.countDocuments({ managedBy: req.user._id });
    
    res.json({
      success: true,
      data: {
        userCount,
        // Add other relevant dashboard data
        recentActivity: [],
        performanceStats: {
          booksCreated: 5,
          activeUsers: 25,
          completionRate: 78
        }
      }
    });
  } catch (error) {
    console.error('Client dashboard error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

// Get all clients
exports.getAllClients = async (req, res) => {
  try {
    const clients = await User.find({ role: 'client' })
      .select('-password')
      .sort({ createdAt: -1 });
    
    res.json({
      success: true,
      count: clients.length,
      clients
    });
  } catch (error) {
    console.error('Get clients error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

// Get client by ID
exports.getClientById = async (req, res) => {
  try {
    const client = await User.findById(req.params.id).select('-password');
    
    if (!client || client.role !== 'client') {
      return res.status(404).json({ success: false, message: 'Client not found' });
    }
    
    res.json({
      success: true,
      client
    });
  } catch (error) {
    console.error('Get client error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

// Update client status
exports.updateClientStatus = async (req, res) => {
  try {
    const { status } = req.body;
    
    const client = await User.findByIdAndUpdate(
      req.params.id,
      { status },
      { new: true }
    ).select('-password');
    
    if (!client) {
      return res.status(404).json({ success: false, message: 'Client not found' });
    }
    
    res.json({
      success: true,
      client
    });
  } catch (error) {
    console.error('Update client error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

// Delete client
exports.deleteClient = async (req, res) => {
  try {
    const client = await User.findByIdAndDelete(req.params.id);
    
    if (!client) {
      return res.status(404).json({ success: false, message: 'Client not found' });
    }
    
    res.json({
      success: true,
      message: 'Client deleted successfully'
    });
  } catch (error) {
    console.error('Delete client error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};
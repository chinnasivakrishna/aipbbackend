// controllers/clientManagementController.js - Admin's client management controller
const jwt = require('jsonwebtoken');
const Client = require('../models/Client');
const User = require('../models/User');
const bcrypt = require('bcryptjs');

// Get all clients
exports.getAllClients = async (req, res) => {
  try {
    const clients = await Client.find().select('-password').sort({ createdAt: -1 });
    
    // Count users for each client (assuming users have a clientId field)
    const clientsWithUserCount = await Promise.all(clients.map(async (client) => {
      const clientObj = client.toObject();
      const userCount = await User.countDocuments({ clientId: client._id });
      clientObj.userCount = userCount;
      return clientObj;
    }));
    
    res.json({
      success: true,
      clients: clientsWithUserCount
    });
  } catch (error) {
    console.error('Error fetching clients:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

// Get single client by ID
exports.getClientById = async (req, res) => {
  try {
    const client = await Client.findById(req.params.id).select('-password');
    
    if (!client) {
      return res.status(404).json({ success: false, message: 'Client not found' });
    }
    
    const userCount = await User.countDocuments({ clientId: client._id });
    const clientWithUserCount = {
      ...client.toObject(),
      userCount
    };
    
    res.json({
      success: true,
      client: clientWithUserCount
    });
  } catch (error) {
    console.error('Error fetching client:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

// Create new client
exports.createClient = async (req, res) => {
  try {
    const { name, email, password, company, plan } = req.body;
    
    // Check if client with email already exists
    const existingClient = await Client.findOne({ email });
    if (existingClient) {
      return res.status(400).json({ success: false, message: 'Client with this email already exists' });
    }
    
    // Create client
    const client = await Client.create({
      name,
      email,
      password,
      company,
      plan,
      createdBy: req.admin._id
    });
    
    // Don't send password back
    const clientResponse = {
      _id: client._id,
      name: client.name,
      email: client.email,
      company: client.company,
      plan: client.plan,
      userCount: 0,
      createdAt: client.createdAt
    };
    
    res.status(201).json({
      success: true,
      client: clientResponse,
      message: 'Client created successfully'
    });
  } catch (error) {
    console.error('Error creating client:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

// Update client
exports.updateClient = async (req, res) => {
  try {
    const { name, email, company, plan, password } = req.body;
    
    // Check if updating email to one that already exists
    if (email) {
      const existingClient = await Client.findOne({ email, _id: { $ne: req.params.id } });
      if (existingClient) {
        return res.status(400).json({ success: false, message: 'Another client with this email already exists' });
      }
    }
    
    // Prepare update data
    const updateData = {
      name,
      email,
      company,
      plan
    };
    
    // If password is provided, hash it
    if (password) {
      const salt = await bcrypt.genSalt(10);
      updateData.password = await bcrypt.hash(password, salt);
    }
    
    // Update client
    const updatedClient = await Client.findByIdAndUpdate(
      req.params.id,
      { $set: updateData },
      { new: true }
    ).select('-password');
    
    if (!updatedClient) {
      return res.status(404).json({ success: false, message: 'Client not found' });
    }
    
    // Add user count
    const userCount = await User.countDocuments({ clientId: updatedClient._id });
    const clientResponse = {
      ...updatedClient.toObject(),
      userCount
    };
    
    res.json({
      success: true,
      client: clientResponse,
      message: 'Client updated successfully'
    });
  } catch (error) {
    console.error('Error updating client:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

// Delete client
exports.deleteClient = async (req, res) => {
  try {
    const client = await Client.findById(req.params.id);
    
    if (!client) {
      return res.status(404).json({ success: false, message: 'Client not found' });
    }
    
    // Delete client
    await client.deleteOne();
    
    // You may want to delete or reassign associated users
    // await User.deleteMany({ clientId: req.params.id });
    // OR
    // await User.updateMany({ clientId: req.params.id }, { clientId: null });
    
    res.json({
      success: true,
      message: 'Client deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting client:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};
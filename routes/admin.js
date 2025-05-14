// routes/admin.js - Admin routes
const express = require('express');
const router = express.Router();
const adminController = require('../controllers/adminController');
const clientsController = require('../controllers/clientController');
const { verifyAdminToken } = require('../middleware/auth');

// Auth routes
router.post('/register', adminController.register);
router.post('/login', adminController.login);

// Protected routes - all require admin authentication
router.use(verifyAdminToken);

// Client management routes
router.get('/clients', clientsController.getAllClients);
router.get('/clients/:id', clientsController.getClientById);
router.put('/clients/:id/status', clientsController.updateClientStatus);
router.delete('/clients/:id', clientsController.deleteClient);

// Generate login token for a client (for admin impersonation)
router.post('/clients/:id/login-token', adminController.generateClientLoginToken);

module.exports = router;
// routes/admin.js - Updated Admin routes
const express = require('express');
const router = express.Router();
const adminController = require('../controllers/adminController');
const clientsController = require('../controllers/clientController');
const { verifyAdminToken } = require('../middleware/auth');

// Auth routes
router.post('/register', adminController.register);
router.post('/login', adminController.login);

// Protected routes - all require admin authentication
// router.use(verifyAdminToken);

// Client management routes
router.get('/clients', clientsController.getAllClients);
router.get('/users', clientsController.getAllUsers);
router.get('/userprofile',clientsController.getuserprofile);
router.post('/clients', adminController.createClient); // Add new client
router.get('/clients/:id', clientsController.getClientById);
router.put('/clients/:id', clientsController.updateClient); // Update client
router.put('/clients/:id/status', clientsController.updateClientStatus);
router.delete('/clients/:id', clientsController.deleteClient);

// Generate login token for a client (for admin impersonation)
router.post('/clients/:id/login-token', adminController.generateClientLoginToken);

// Create a new credit plan (admin only)
router.post('/plans',verifyAdminToken, adminController.createCreditPlan);
  
// Get all credit plans (admin)
router.get('/plans',verifyAdminToken, adminController.getCreditPlans);

router.post('/add-credit',verifyAdminToken, adminController.addCredit);

router.get('/credit-account',verifyAdminToken, adminController.getCreditAccount);

router.get('/credit-account/:id',verifyAdminToken, adminController.getCreditAccountById);

router.get('/get-recharge-plan',verifyAdminToken, adminController.getCreditRechargePlans);

module.exports = router;
// src/routes/paytm.js
const express = require('express');
const axios = require('axios');
const PaytmChecksum = require('paytmchecksum');
const Payment = require('../models/Payment');
const PaytmConfig = require('../config/paytm');
const { sendSuccessResponse, sendErrorResponse, sendValidationError } = require('../utils/response');

const router = express.Router();

// 1. Initialize Payment
router.post('/initiate', async (req, res) => {
  try {
    const { amount, customerEmail, customerPhone, customerName } = req.body;
    
    // Validate required fields
    if (!amount || !customerEmail || !customerPhone || !customerName) {
      return sendValidationError(res, 'Missing required fields: amount, customerEmail, customerPhone, customerName');
    }

    // Generate unique order ID
    const orderId = `ORDER_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    // Create payment record in database
    const payment = new Payment({
      orderId,
      amount: parseFloat(amount),
      customerEmail,
      customerPhone,
      customerName,
      status: 'PENDING'
    });

    await payment.save();

    // Prepare Paytm parameters
    const paytmParams = {
      MID: PaytmConfig.MID,
      WEBSITE: PaytmConfig.WEBSITE,
      CHANNEL_ID: PaytmConfig.CHANNEL_ID,
      INDUSTRY_TYPE_ID: PaytmConfig.INDUSTRY_TYPE_ID,
      ORDER_ID: orderId,
      CUST_ID: customerEmail,
      TXN_AMOUNT: parseFloat(amount).toFixed(2),
      CALLBACK_URL: PaytmConfig.CALLBACK_URL,
      EMAIL: customerEmail,
      MOBILE_NO: customerPhone
    };

    // Generate checksum
    const checksum = await PaytmChecksum.generateSignature(paytmParams, PaytmConfig.MERCHANT_KEY);
    paytmParams.CHECKSUMHASH = checksum;

    // Update payment record with checksum
    await Payment.findOneAndUpdate(
      { orderId },
      { 
        checksumHash: checksum,
        paytmOrderId: orderId,
        updatedAt: new Date()
      }
    );

    console.log('Payment initiated:', { orderId, amount: paytmParams.TXN_AMOUNT, customerEmail });

    return sendSuccessResponse(res, {
      orderId,
      paytmParams,
      paytmUrl: PaytmConfig.PAYTM_URL
    }, 'Payment initiated successfully');

  } catch (error) {
    console.error('Payment initiation error:', error);
    return sendErrorResponse(res, 'Payment initiation failed', error);
  }
});

// 2. Payment Callback Handler
router.post('/callback', async (req, res) => {
  try {
    const paytmResponse = req.body;
    const orderId = paytmResponse.ORDERID;

    console.log('Received Paytm callback:', paytmResponse);

    // Verify checksum
    let isValidChecksum = true;
    if (paytmResponse.CHECKSUMHASH) {
      isValidChecksum = PaytmChecksum.verifySignature(paytmResponse, PaytmConfig.MERCHANT_KEY, paytmResponse.CHECKSUMHASH);
    }

    // Determine payment status
    let paymentStatus = 'FAILED';
    if (paytmResponse.STATUS === 'TXN_SUCCESS') {
      paymentStatus = 'SUCCESS';
    } else if (paytmResponse.STATUS === 'TXN_FAILURE') {
      paymentStatus = 'FAILED';
    } else if (paytmResponse.STATUS === 'PENDING') {
      paymentStatus = 'PENDING';
    }

    // Update payment status in database
    const updateData = {
      status: paymentStatus,
      transactionId: paytmResponse.TXNID || paytmResponse.ORDERID,
      paytmTxnId: paytmResponse.TXNID,
      paytmResponse: paytmResponse,
      paymentMode: paytmResponse.PAYMENTMODE,
      bankName: paytmResponse.BANKNAME,
      bankTxnId: paytmResponse.BANKTXNID,
      responseCode: paytmResponse.RESPCODE,
      responseMsg: paytmResponse.RESPMSG,
      updatedAt: new Date()
    };

    const payment = await Payment.findOneAndUpdate(
      { orderId },
      updateData,
      { new: true }
    );

    if (!payment) {
      return sendErrorResponse(res, 'Payment record not found', null, 404);
    }

    console.log('Payment updated:', { orderId, status: paymentStatus, checksumValid: isValidChecksum });

    // Return JSON response instead of HTML redirect
    return sendSuccessResponse(res, {
      orderId,
      status: paymentStatus,
      transactionId: updateData.transactionId,
      responseCode: paytmResponse.RESPCODE,
      responseMsg: paytmResponse.RESPMSG,
      checksumValid: isValidChecksum
    }, 'Payment callback processed successfully');

  } catch (error) {
    console.error('Payment callback error:', error);
    return sendErrorResponse(res, 'Payment callback processing failed', error);
  }
});

// 3. Check Payment Status
router.get('/status/:orderId', async (req, res) => {
  try {
    const { orderId } = req.params;
    
    const payment = await Payment.findOne({ orderId });
    
    if (!payment) {
      return sendErrorResponse(res, 'Payment not found', null, 404);
    }

    return sendSuccessResponse(res, {
      orderId: payment.orderId,
      amount: payment.amount,
      status: payment.status,
      transactionId: payment.transactionId,
      customerEmail: payment.customerEmail,
      customerName: payment.customerName,
      paymentMode: payment.paymentMode,
      bankName: payment.bankName,
      responseCode: payment.responseCode,
      responseMsg: payment.responseMsg,
      createdAt: payment.createdAt,
      updatedAt: payment.updatedAt
    }, 'Payment status retrieved successfully');

  } catch (error) {
    console.error('Status check error:', error);
    return sendErrorResponse(res, 'Status check failed', error);
  }
});

// 4. Get All Payments (Admin)
router.get('/payments', async (req, res) => {
  try {
    const { page = 1, limit = 10, status } = req.query;
    
    const filter = {};
    if (status) filter.status = status;
    
    const payments = await Payment.find(filter)
      .sort({ createdAt: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit)
      .select('-paytmResponse -checksumHash');

    const total = await Payment.countDocuments(filter);

    return sendSuccessResponse(res, {
      payments,
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(total / limit),
        totalRecords: total,
        limit: parseInt(limit)
      }
    }, 'Payments retrieved successfully');

  } catch (error) {
    console.error('Get payments error:', error);
    return sendErrorResponse(res, 'Failed to fetch payments', error);
  }
});

// 5. Transaction Status Inquiry
router.post('/transaction-status', async (req, res) => {
  try {
    const { orderId } = req.body;
    
    if (!orderId) {
      return sendValidationError(res, 'Order ID is required');
    }

    const statusParams = {
      MID: PaytmConfig.MID,
      ORDERID: orderId
    };

    const checksum = await PaytmChecksum.generateSignature(statusParams, PaytmConfig.MERCHANT_KEY);
    statusParams.CHECKSUMHASH = checksum;

    const response = await axios.post(PaytmConfig.STATUS_URL, statusParams, {
      headers: {
        'Content-Type': 'application/json'
      }
    });

    console.log('Paytm status response:', response.data);

    return sendSuccessResponse(res, response.data, 'Transaction status retrieved successfully');

  } catch (error) {
    console.error('Transaction status inquiry error:', error);
    return sendErrorResponse(res, 'Failed to check transaction status', error);
  }
});

module.exports = router;        
// src/config/paytm.js
const PaytmConfig = {
    MID: process.env.PAYTM_MID,
    WEBSITE: process.env.PAYTM_WEBSITE,
    CHANNEL_ID: process.env.PAYTM_CHANNEL_ID,
    INDUSTRY_TYPE_ID: process.env.PAYTM_INDUSTRY_TYPE,
    MERCHANT_KEY: process.env.PAYTM_KEY,
    CALLBACK_URL: process.env.PAYTM_CALLBACK_URL,
    PAYTM_URL: process.env.PAYTM_URL,
    STATUS_URL: process.env.PAYTM_STATUS_URL
  };
  
  module.exports = PaytmConfig;
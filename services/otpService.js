// services/otpService.js
const axios = require('axios');
const NodeCache = require('node-cache');
require('dotenv').config();

const cache = new NodeCache();

function generateOTP(length = 6) {
  return Array.from({ length }, () => Math.floor(Math.random() * 10)).join('');
}

async function sendMobileOtp(mobile, otp = null) {
  otp = otp || generateOTP();
  const ttl = parseInt(process.env.OTP_TIME_LIMIT || '300'); // 5 minutes
  cache.set(mobile, otp, ttl);
  
  console.log(`📱 Mobile: ${mobile}, 🔐 OTP: ${otp}`);

  const params = {
    method: 'SendMessage',
    send_to: mobile,
    msg: `${otp} is your Mobishaala OTP for App Login.`,
    msg_type: 'TEXT',
    userid: process.env.GUPSHUP_USERID,
    auth_scheme: 'plain',
    password: process.env.GUPSHUP_PASSWORD,
    v: '1.1',
    format: 'text',
    principalEntityId: process.env.PRINCIPAL_ENTITY_ID,
    mask: process.env.MASK
  };

  try {
    const response = await axios.get('https://enterprise.smsgupshup.com/GatewayAPI/rest', { params });
    
    if (response.data.toLowerCase().includes('error')) {
      console.error(`❌ OTP send failed: ${response.data}`);
      throw new Error('Failed to send OTP');
    }
    
    console.log(`✅ OTP sent: ${response.data}`);
    return { success: true, message: 'OTP sent successfully' };
  } catch (error) {
    console.error('Error sending OTP:', error);
    throw new Error('Failed to send OTP');
  }
}

function verifyOTP(mobile, otp) {
  const cachedOtp = cache.get(mobile);
  
  if (!cachedOtp) {
    return { success: false, message: 'OTP expired or not sent' };
  }
  
  if (otp !== cachedOtp) {
    return { success: false, message: 'Invalid OTP' };
  }
  
  // Remove OTP from cache after successful verification
  cache.del(mobile);
  return { success: true, message: 'OTP verified successfully' };
}

module.exports = {
  sendMobileOtp,
  verifyOTP,
  cache
};
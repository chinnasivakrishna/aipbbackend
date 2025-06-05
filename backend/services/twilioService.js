// services/twilioService.js
const twilio = require('twilio');
const dotenv = require('dotenv');

// Ensure environment variables are loaded
dotenv.config();

class TwilioService {
  constructor() {
    // Add validation for environment variables
    const accountSid = process.env.TWILIO_ACCOUNT_SID;
    const authToken = process.env.TWILIO_AUTH_TOKEN;
    const phoneNumber = process.env.TWILIO_PHONE_NUMBER;

    if (!accountSid || !authToken || !phoneNumber) {
      console.error('Missing Twilio environment variables:');
      console.error('TWILIO_ACCOUNT_SID:', accountSid ? 'SET' : 'MISSING');
      console.error('TWILIO_AUTH_TOKEN:', authToken ? 'SET' : 'MISSING');
      console.error('TWILIO_PHONE_NUMBER:', phoneNumber ? 'SET' : 'MISSING');
      throw new Error('Twilio credentials are not properly configured');
    }

    try {
      this.client = twilio(accountSid, authToken);
      this.fromNumber = phoneNumber;
      console.log('Twilio service initialized successfully');
    } catch (error) {
      console.error('Failed to initialize Twilio client:', error);
      throw error;
    }
  }

  // Generate 6-digit OTP
  generateOTP() {
    return Math.floor(100000 + Math.random() * 900000).toString();
  }

  // Send OTP via SMS
  async sendOTP(mobile, otp, client = 'kitabai') {
    try {
      // Validate inputs
      if (!mobile || !otp) {
        throw new Error('Mobile number and OTP are required');
      }

      // Format mobile number properly
      const formattedMobile = mobile.startsWith('+91') ? mobile : `+91${mobile}`;
      
      const message = `Your ${client.toUpperCase()} verification code is: ${otp}. Valid for 5 minutes. Don't share this code with anyone.`;
      
      console.log(`Sending OTP to ${formattedMobile}`);
      
      const result = await this.client.messages.create({
        body: message,
        from: this.fromNumber,
        to: formattedMobile
      });

      console.log(`SMS sent successfully. SID: ${result.sid}, Status: ${result.status}`);

      return {
        success: true,
        messageId: result.sid,
        status: result.status
      };
    } catch (error) {
      console.error('Twilio SMS Error:', error);
      return {
        success: false,
        error: error.message || 'Failed to send SMS'
      };
    }
  }

  // Send welcome SMS after successful registration
  async sendWelcomeMessage(mobile, name, client = 'kitabai') {
    try {
      // Validate inputs
      if (!mobile || !name) {
        throw new Error('Mobile number and name are required');
      }

      // Format mobile number properly
      const formattedMobile = mobile.startsWith('+91') ? mobile : `+91${mobile}`;
      
      const message = `Welcome to ${client.toUpperCase()}, ${name}! Your account has been successfully created. Start your learning journey today!`;
      
      console.log(`Sending welcome message to ${formattedMobile}`);
      
      const result = await this.client.messages.create({
        body: message,
        from: this.fromNumber,
        to: formattedMobile
      });

      console.log(`Welcome SMS sent successfully. SID: ${result.sid}`);

      return {
        success: true,
        messageId: result.sid
      };
    } catch (error) {
      console.error('Welcome SMS Error:', error);
      return {
        success: false,
        error: error.message || 'Failed to send welcome SMS'
      };
    }
  }

  // Test method to verify Twilio configuration
  async testConnection() {
    try {
      // Try to fetch account details to verify credentials
      const account = await this.client.api.accounts(process.env.TWILIO_ACCOUNT_SID).fetch();
      console.log('Twilio connection test successful:', account.friendlyName);
      return { success: true, accountName: account.friendlyName };
    } catch (error) {
      console.error('Twilio connection test failed:', error);
      return { success: false, error: error.message };
    }
  }
}

module.exports = new TwilioService();
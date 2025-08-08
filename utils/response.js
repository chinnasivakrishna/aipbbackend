// src/utils/response.js
const sendSuccessResponse = (res, data, message = 'Success', statusCode = 200) => {
    return res.status(statusCode).json({
      success: true,
      message,
      data,
      timestamp: new Date().toISOString()
    });
  };
  
  const sendErrorResponse = (res, message = 'Error', error = null, statusCode = 500) => {
    return res.status(statusCode).json({
      success: false,
      message,
      error: error ? error.message : null,
      timestamp: new Date().toISOString()
    });
  };
  
  const sendValidationError = (res, message = 'Validation Error', statusCode = 400) => {
    return res.status(statusCode).json({
      success: false,
      message,
      timestamp: new Date().toISOString()
    });
  };
  
  module.exports = {
    sendSuccessResponse,
    sendErrorResponse,
    sendValidationError
  };
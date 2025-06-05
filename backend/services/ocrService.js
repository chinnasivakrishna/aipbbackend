// services/ocrService.js - Enhanced version with Mistral OCR
const { Mistral } = require('@mistralai/mistralai');
const UserAnswer = require('../models/UserAnswer');

class OCRService {
  constructor() {
    this.client = new Mistral({
      apiKey: process.env.MISTRAL_API_KEY
    });
  }

  /**
   * Extract text from image URL using Mistral OCR
   * @param {string} imageUrl - URL of the image to process
   * @param {Object} options - Additional options for OCR processing
   * @returns {Promise<Object>} OCR result with extracted text
   */
  async extractTextFromImageUrl(imageUrl, options = {}) {
    const startTime = Date.now();
    
    try {
      console.log(`Starting OCR processing for image: ${imageUrl}`);
      
      const ocrResponse = await this.client.ocr.process({
        model: "mistral-ocr-latest",
        document: {
          type: "document_url",
          documentUrl: imageUrl
        },
        includeImageBase64: options.includeImageBase64 || false,
        ...options
      });

      const processingTime = Date.now() - startTime;
      console.log(`OCR completed in ${processingTime}ms for image: ${imageUrl}`);

      return {
        success: true,
        extractedText: ocrResponse.text || '',
        confidence: ocrResponse.confidence || null,
        metadata: {
          processingTime: processingTime,
          imageBase64: ocrResponse.imageBase64 || null,
          boundingBoxes: this.formatBoundingBoxes(ocrResponse.boundingBoxes || [])
        }
      };
    } catch (error) {
      const processingTime = Date.now() - startTime;
      console.error('Mistral OCR Error:', error);
      
      return {
        success: false,
        error: error.message,
        extractedText: '',
        metadata: {
          processingTime: processingTime,
          errorDetails: error.response?.data || error.message
        }
      };
    }
  }

  /**
   * Extract text from base64 image data
   * @param {string} base64Data - Base64 encoded image data
   * @param {Object} options - Additional options for OCR processing
   * @returns {Promise<Object>} OCR result with extracted text
   */
  async extractTextFromBase64(base64Data, options = {}) {
    const startTime = Date.now();
    
    try {
      console.log('Starting OCR processing for base64 image');
      
      const ocrResponse = await this.client.ocr.process({
        model: "mistral-ocr-latest",
        document: {
          type: "document_base64",
          documentBase64: base64Data
        },
        includeImageBase64: options.includeImageBase64 || false,
        ...options
      });

      const processingTime = Date.now() - startTime;
      console.log(`OCR completed in ${processingTime}ms for base64 image`);

      return {
        success: true,
        extractedText: ocrResponse.text || '',
        confidence: ocrResponse.confidence || null,
        metadata: {
          processingTime: processingTime,
          imageBase64: ocrResponse.imageBase64 || null,
          boundingBoxes: this.formatBoundingBoxes(ocrResponse.boundingBoxes || [])
        }
      };
    } catch (error) {
      const processingTime = Date.now() - startTime;
      console.error('Mistral OCR Error:', error);
      
      return {
        success: false,
        error: error.message,
        extractedText: '',
        metadata: {
          processingTime: processingTime,
          errorDetails: error.response?.data || error.message
        }
      };
    }
  }

  /**
   * Format bounding boxes to match UserAnswer schema
   * @param {Array} boundingBoxes - Raw bounding boxes from Mistral
   * @returns {Array} Formatted bounding boxes
   */
  formatBoundingBoxes(boundingBoxes) {
    if (!Array.isArray(boundingBoxes)) return [];
    
    return boundingBoxes.map(box => ({
      text: box.text || '',
      x: box.x || 0,
      y: box.y || 0,
      width: box.width || 0,
      height: box.height || 0,
      confidence: box.confidence || 0
    }));
  }

  /**
   * Process OCR for a single image in UserAnswer
   * @param {string} userAnswerId - UserAnswer document ID
   * @param {number} imageIndex - Index of the image in answerImages array
   * @returns {Promise<Object>} Processing result
   */
  async processUserAnswerImage(userAnswerId, imageIndex) {
    try {
      const userAnswer = await UserAnswer.findById(userAnswerId);
      if (!userAnswer) {
        throw new Error('UserAnswer not found');
      }

      if (!userAnswer.answerImages[imageIndex]) {
        throw new Error('Image not found at specified index');
      }

      const image = userAnswer.answerImages[imageIndex];
      
      // Update processing status to 'processing'
      userAnswer.answerImages[imageIndex].ocrData.processingStatus = 'processing';
      await userAnswer.save();

      // Process OCR
      const ocrResult = await this.extractTextFromImageUrl(image.imageUrl);

      // Update the image's OCR data
      if (ocrResult.success) {
        userAnswer.answerImages[imageIndex].ocrData = {
          extractedText: ocrResult.extractedText,
          confidence: ocrResult.confidence,
          processedAt: new Date(),
          processingStatus: 'completed',
          errorMessage: null,
          metadata: ocrResult.metadata
        };
      } else {
        userAnswer.answerImages[imageIndex].ocrData = {
          extractedText: '',
          confidence: null,
          processedAt: new Date(),
          processingStatus: 'failed',
          errorMessage: ocrResult.error,
          metadata: ocrResult.metadata
        };
      }

      // Save the updated document (this will trigger the pre-save middleware
      // which updates the overall OCR status and extractedTextFromImages)
      await userAnswer.save();

      return {
        success: ocrResult.success,
        userAnswerId: userAnswerId,
        imageIndex: imageIndex,
        extractedText: ocrResult.extractedText,
        processingStatus: userAnswer.answerImages[imageIndex].ocrData.processingStatus,
        overallOcrStatus: userAnswer.ocrProcessingStatus
      };

    } catch (error) {
      console.error('Error processing user answer image:', error);
      
      // Update status to failed if possible
      try {
        const userAnswer = await UserAnswer.findById(userAnswerId);
        if (userAnswer && userAnswer.answerImages[imageIndex]) {
          userAnswer.answerImages[imageIndex].ocrData.processingStatus = 'failed';
          userAnswer.answerImages[imageIndex].ocrData.errorMessage = error.message;
          userAnswer.answerImages[imageIndex].ocrData.processedAt = new Date();
          await userAnswer.save();
        }
      } catch (updateError) {
        console.error('Error updating failed status:', updateError);
      }

      return {
        success: false,
        error: error.message,
        userAnswerId: userAnswerId,
        imageIndex: imageIndex
      };
    }
  }

  /**
   * Process OCR for all images in a UserAnswer document
   * @param {string} userAnswerId - UserAnswer document ID
   * @param {Object} options - Processing options
   * @returns {Promise<Object>} Batch processing result
   */
  async processAllUserAnswerImages(userAnswerId, options = {}) {
    try {
      const userAnswer = await UserAnswer.findById(userAnswerId);
      if (!userAnswer) {
        throw new Error('UserAnswer not found');
      }

      if (userAnswer.answerImages.length === 0) {
        return {
          success: true,
          message: 'No images to process',
          userAnswerId: userAnswerId,
          processedImages: 0
        };
      }

      const results = [];
      const delay = options.delay || 1000; // Default 1 second delay between requests

      for (let i = 0; i < userAnswer.answerImages.length; i++) {
        console.log(`Processing image ${i + 1}/${userAnswer.answerImages.length} for UserAnswer ${userAnswerId}`);
        
        const result = await this.processUserAnswerImage(userAnswerId, i);
        results.push(result);

        // Add delay between processing to avoid rate limiting
        if (i < userAnswer.answerImages.length - 1 && delay > 0) {
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }

      const successCount = results.filter(r => r.success).length;
      const failureCount = results.filter(r => !r.success).length;

      return {
        success: true,
        userAnswerId: userAnswerId,
        totalImages: userAnswer.answerImages.length,
        processedSuccessfully: successCount,
        failed: failureCount,
        results: results
      };

    } catch (error) {
      console.error('Error in batch processing:', error);
      return {
        success: false,
        error: error.message,
        userAnswerId: userAnswerId
      };
    }
  }

  /**
   * Process OCR for all pending UserAnswer images in the system
   * @param {Object} options - Processing options
   * @returns {Promise<Object>} System-wide processing result
   */
  async processPendingOCR(options = {}) {
    try {
      console.log('Starting system-wide OCR processing...');
      
      // Find all UserAnswers with pending OCR
      const pendingAnswers = await UserAnswer.findPendingOCR();
      console.log(`Found ${pendingAnswers.length} UserAnswers with pending OCR`);

      if (pendingAnswers.length === 0) {
        return {
          success: true,
          message: 'No pending OCR tasks found',
          processedAnswers: 0
        };
      }

      const results = [];
      const batchDelay = options.batchDelay || 2000; // Delay between UserAnswer documents

      for (let i = 0; i < pendingAnswers.length; i++) {
        const userAnswer = pendingAnswers[i];
        console.log(`Processing UserAnswer ${i + 1}/${pendingAnswers.length}: ${userAnswer._id}`);
        
        const result = await this.processAllUserAnswerImages(userAnswer._id.toString(), {
          delay: options.imageDelay || 1000
        });
        results.push(result);

        // Add delay between UserAnswer documents
        if (i < pendingAnswers.length - 1 && batchDelay > 0) {
          await new Promise(resolve => setTimeout(resolve, batchDelay));
        }
      }

      const successfulAnswers = results.filter(r => r.success).length;
      const totalImagesProcessed = results.reduce((sum, r) => sum + (r.processedSuccessfully || 0), 0);

      console.log(`OCR processing completed. ${successfulAnswers}/${pendingAnswers.length} UserAnswers processed successfully`);

      return {
        success: true,
        processedAnswers: successfulAnswers,
        totalAnswers: pendingAnswers.length,
        totalImagesProcessed: totalImagesProcessed,
        results: results
      };

    } catch (error) {
      console.error('Error in system-wide OCR processing:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Get OCR processing statistics
   * @returns {Promise<Object>} OCR statistics
   */
  async getOCRStats() {
    try {
      const stats = await UserAnswer.aggregate([
        {
          $group: {
            _id: '$ocrProcessingStatus',
            count: { $sum: 1 },
            totalImages: { $sum: { $size: '$answerImages' } }
          }
        }
      ]);

      const imageStats = await UserAnswer.aggregate([
        { $unwind: '$answerImages' },
        {
          $group: {
            _id: '$answerImages.ocrData.processingStatus',
            count: { $sum: 1 }
          }
        }
      ]);

      return {
        success: true,
        userAnswerStats: stats.reduce((acc, stat) => {
          acc[stat._id] = {
            count: stat.count,
            totalImages: stat.totalImages
          };
          return acc;
        }, {}),
        imageStats: imageStats.reduce((acc, stat) => {
          acc[stat._id] = stat.count;
          return acc;
        }, {})
      };

    } catch (error) {
      console.error('Error getting OCR stats:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }
}

module.exports = new OCRService();
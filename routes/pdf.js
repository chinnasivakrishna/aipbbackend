// routes/pdf.js
const express = require('express');
const router = express.Router();
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const os = require('os');

// Import middleware and models with error checking
let auth, PDFProcessor, DatastoreItem;

try {
  auth = require('../middleware/auth');
  if (typeof auth !== 'function') {
    console.error('❌ Auth middleware is not a function:', typeof auth);
    throw new Error('Auth middleware import failed');
  }
  console.log('✅ Auth middleware loaded successfully');
} catch (error) {
  console.error('❌ Failed to load auth middleware:', error.message);
  // Create a dummy auth middleware as fallback
  auth = (req, res, next) => {
    console.warn('⚠️ Using dummy auth middleware - please fix auth import');
    req.user = { id: 'dummy-user' }; // Add dummy user for testing
    next();
  };
}

try {
  PDFProcessor = require('../services/PDFProcessor');
  if (typeof PDFProcessor !== 'function') {
    console.error('❌ PDFProcessor is not a constructor:', typeof PDFProcessor);
    throw new Error('PDFProcessor import failed');
  }
  console.log('✅ PDFProcessor loaded successfully');
} catch (error) {
  console.error('❌ Failed to load PDFProcessor:', error.message);
  // Create a dummy PDFProcessor class as fallback
  PDFProcessor = class {
    constructor(config) {
      this.config = config;
      console.warn('⚠️ Using dummy PDFProcessor - please fix PDFProcessor import');
    }
    
    async initializeDB() {
      throw new Error('PDFProcessor not properly configured');
    }
    
    async processPDFPipeline() {
      throw new Error('PDFProcessor not properly configured');
    }
    
    async answerQuestion() {
      throw new Error('PDFProcessor not properly configured');
    }
  };
}

try {
  DatastoreItem = require('../models/DatastoreItem');
  if (!DatastoreItem) {
    console.error('❌ DatastoreItem model is undefined');
    throw new Error('DatastoreItem import failed');
  }
  console.log('✅ DatastoreItem model loaded successfully');
} catch (error) {
  console.error('❌ Failed to load DatastoreItem model:', error.message);
  // You'll need to fix the DatastoreItem import - this is critical
  throw error;
}

// Initialize PDF processor with error handling
const initializePDFProcessor = () => {
  try {
    const config = {
      chunkrApiKey: process.env.CHUNKR_API_KEY,
      geminiApiKey: process.env.GEMINI_API_KEY,
      astraToken: process.env.ASTRA_DB_APPLICATION_TOKEN,
      astraApiEndpoint: process.env.ASTRA_DB_API_ENDPOINT,
      keyspace: process.env.ASTRA_DB_KEYSPACE,
      collectionName: process.env.ASTRA_COLLECTION_NAME || 'pdf_embeddings',
      embeddingModel: process.env.EMBEDDING_MODEL || 'text-embedding-004',
      chatModel: process.env.CHAT_MODEL || 'gemini-1.5-flash',
      vectorDimensions: process.env.VECTOR_DIMENSIONS || '768',
      chunkSize: process.env.CHUNK_SIZE || '400',
      chunkOverlap: process.env.CHUNK_OVERLAP || '100',
      maxContextChunks: process.env.MAX_CONTEXT_CHUNKS || '20'
    };
    
    return new PDFProcessor(config);
  } catch (error) {
    console.error('Failed to initialize PDFProcessor:', error);
    throw error;
  }
};

// Download PDF from Cloudinary URL
const downloadPDFFromCloudinary = async (cloudinaryUrl) => {
  try {
    console.log('Downloading PDF from:', cloudinaryUrl);
    
    const response = await axios({
      method: 'GET',
      url: cloudinaryUrl,
      responseType: 'stream'
    });
    
    // Create temporary file
    const tempDir = os.tmpdir();
    const tempFileName = `pdf_${Date.now()}_${Math.random().toString(36).substr(2, 9)}.pdf`;
    const tempFilePath = path.join(tempDir, tempFileName);
    
    // Write stream to file
    const writer = fs.createWriteStream(tempFilePath);
    response.data.pipe(writer);
    
    return new Promise((resolve, reject) => {
      writer.on('finish', () => {
        console.log('PDF downloaded successfully to:', tempFilePath);
        resolve(tempFilePath);
      });
      writer.on('error', reject);
    });
  } catch (error) {
    console.error('Error downloading PDF:', error);
    throw new Error('Failed to download PDF from Cloudinary');
  }
};

// Clean up temporary file
const cleanupTempFile = (filePath) => {
  try {
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
      console.log('Temporary file cleaned up:', filePath);
    }
  } catch (error) {
    console.error('Error cleaning up temp file:', error);
  }
};

// Check if PDF is already embedded
const checkIfEmbedded = async (pdfProcessor, fileName) => {
  try {
    await pdfProcessor.initializeDB();
    const collection = pdfProcessor.collection;
    
    const existingDoc = await collection.findOne({ file_name: fileName });
    return !!existingDoc;
  } catch (error) {
    console.error('Error checking embedding status:', error);
    return false;
  }
};

// Middleware validation function
const validateMiddleware = (middleware, name) => {
  if (typeof middleware !== 'function') {
    throw new Error(`${name} middleware is not a function. Got: ${typeof middleware}`);
  }
};

// Validate all middleware before defining routes
try {
  validateMiddleware(auth, 'auth');
  console.log('✅ All middleware validated successfully');
} catch (error) {
  console.error('❌ Middleware validation failed:', error.message);
  throw error;
}

// @route   POST /api/pdf/:id/embed
// @desc    Create embeddings for a PDF
// @access  Private
router.post('/:id/embed', auth, async (req, res) => {
  let tempFilePath = null;
  
  try {
    console.log('=== PDF EMBEDDING REQUEST ===');
    console.log('PDF ID:', req.params.id);
    console.log('User ID:', req.user?.id);
    
    // Find the PDF item in database
    const pdfItem = await DatastoreItem.findOne({
      _id: req.params.id,
      user: req.user.id,
      type: 'pdf'
    });
    
    if (!pdfItem) {
      return res.status(404).json({
        success: false,
        message: 'PDF not found or access denied'
      });
    }
    
    console.log('Found PDF item:', pdfItem.title);
    console.log('PDF URL:', pdfItem.url);
    
    // Initialize PDF processor
    const pdfProcessor = initializePDFProcessor();
    
    // Check if already embedded
    const isAlreadyEmbedded = await checkIfEmbedded(pdfProcessor, pdfItem.title);
    
    if (isAlreadyEmbedded) {
      console.log('PDF already embedded');
      return res.json({
        success: true,
        message: 'PDF embeddings already exist',
        status: 'already_embedded',
        fileName: pdfItem.title
      });
    }
    
    // Download PDF from Cloudinary
    tempFilePath = await downloadPDFFromCloudinary(pdfItem.url);
    
    // Process PDF and create embeddings
    console.log('Starting PDF processing...');
    const result = await pdfProcessor.processPDFPipeline(tempFilePath, pdfItem.title);
    
    console.log('PDF processing completed:', result);
    
    // Update the PDF item to mark as embedded
    await DatastoreItem.findByIdAndUpdate(req.params.id, {
      isEmbedded: true,
      embeddedAt: new Date(),
      embeddingTaskId: result.taskId
    });
    
    res.json({
      success: true,
      message: 'PDF embeddings created successfully',
      data: {
        taskId: result.taskId,
        fileName: result.fileName,
        summary: result.summary,
        status: 'embedded'
      }
    });
    
  } catch (error) {
    console.error('PDF embedding error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create PDF embeddings',
      error: error.message
    });
  } finally {
    // Clean up temporary file
    if (tempFilePath) {
      cleanupTempFile(tempFilePath);
    }
  }
});

// @route   POST /api/pdf/:id/chat
// @desc    Chat with PDF using embeddings
// @access  Private
router.post('/:id/chat', auth, async (req, res) => {
  try {
    console.log('=== PDF CHAT REQUEST ===');
    console.log('PDF ID:', req.params.id);
    console.log('User ID:', req.user?.id);
    
    const { question } = req.body;
    
    if (!question || question.trim().length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Question is required'
      });
    }
    
    // Find the PDF item in database
    const pdfItem = await DatastoreItem.findOne({
      _id: req.params.id,
      user: req.user.id,
      type: 'pdf'
    });
    
    if (!pdfItem) {
      return res.status(404).json({
        success: false,
        message: 'PDF not found or access denied'
      });
    }
    
    console.log('Found PDF item:', pdfItem.title);
    console.log('Question:', question);
    
    // Initialize PDF processor
    const pdfProcessor = initializePDFProcessor();
    
    // Check if embeddings exist
    const isEmbedded = await checkIfEmbedded(pdfProcessor, pdfItem.title);
    
    if (!isEmbedded) {
      return res.status(400).json({
        success: false,
        message: 'PDF embeddings not found. Please create embeddings first.',
        requiresEmbedding: true
      });
    }
    
    // Generate answer using embeddings
    console.log('Generating answer...');
    const answer = await pdfProcessor.answerQuestion(question, pdfItem.title);
    
    console.log('Answer generated successfully');
    
    res.json({
      success: true,
      data: {
        question: question,
        answer: answer.answer,
        confidence: answer.confidence,
        sources: answer.sources,
        analysis: answer.analysis,
        sourceDetails: answer.sourceDetails || [],
        fileName: pdfItem.title
      }
    });
    
  } catch (error) {
    console.error('PDF chat error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to process chat request',
      error: error.message
    });
  }
});

// @route   GET /api/pdf/:id/status
// @desc    Check PDF embedding status
// @access  Private
router.get('/:id/status', auth, async (req, res) => {
  try {
    console.log('=== PDF STATUS CHECK ===');
    console.log('PDF ID:', req.params.id);
    
    // Find the PDF item in database
    const pdfItem = await DatastoreItem.findOne({
      _id: req.params.id,
      user: req.user.id,
      type: 'pdf'
    });
    
    if (!pdfItem) {
      return res.status(404).json({
        success: false,
        message: 'PDF not found or access denied'
      });
    }
    
    // Initialize PDF processor
    const pdfProcessor = initializePDFProcessor();
    
    // Check if embeddings exist
    const isEmbedded = await checkIfEmbedded(pdfProcessor, pdfItem.title);
    
    res.json({
      success: true,
      data: {
        fileName: pdfItem.title,
        isEmbedded: isEmbedded,
        embeddedAt: pdfItem.embeddedAt || null,
        taskId: pdfItem.embeddingTaskId || null,
        canChat: isEmbedded
      }
    });
    
  } catch (error) {
    console.error('PDF status check error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to check PDF status',
      error: error.message
    });
  }
});

// @route   GET /api/pdf/:id/embeddings/info
// @desc    Get detailed information about PDF embeddings
// @access  Private
router.get('/:id/embeddings/info', auth, async (req, res) => {
  try {
    console.log('=== PDF EMBEDDINGS INFO ===');
    console.log('PDF ID:', req.params.id);
    
    // Find the PDF item in database
    const pdfItem = await DatastoreItem.findOne({
      _id: req.params.id,
      user: req.user.id,
      type: 'pdf'
    });
    
    if (!pdfItem) {
      return res.status(404).json({
        success: false,
        message: 'PDF not found or access denied'
      });
    }
    
    // Initialize PDF processor
    const pdfProcessor = initializePDFProcessor();
    await pdfProcessor.initializeDB();
    
    // Get all documents for this PDF
    const documents = await pdfProcessor.collection.find({ 
      file_name: pdfItem.title 
    }).toArray();
    
    if (documents.length === 0) {
      return res.json({
        success: true,
        data: {
          fileName: pdfItem.title,
          isEmbedded: false,
          totalChunks: 0,
          message: 'No embeddings found for this PDF'
        }
      });
    }
    
    // Calculate statistics
    const totalWords = documents.reduce((sum, doc) => sum + (doc.word_count || 0), 0);
    const totalChars = documents.reduce((sum, doc) => sum + (doc.char_count || 0), 0);
    const avgChunkSize = totalChars / documents.length;
    
    res.json({
      success: true,
      data: {
        fileName: pdfItem.title,
        isEmbedded: true,
        totalChunks: documents.length,
        totalWords: totalWords,
        totalCharacters: totalChars,
        averageChunkSize: Math.round(avgChunkSize),
        processingMethod: documents[0]?.processing_method || 'unknown',
        processedAt: documents[0]?.processed_at || null,
        chunkSize: documents[0]?.chunk_size || null,
        overlapSize: documents[0]?.overlap_size || null,
        chunks: documents.map(doc => ({
          chunkIndex: doc.chunk_index,
          wordCount: doc.word_count,
          charCount: doc.char_count,
          preview: doc.text_content ? doc.text_content.substring(0, 200) + '...' : 'No content'
        }))
      }
    });
    
  } catch (error) {
    console.error('PDF embeddings info error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get embeddings information',
      error: error.message
    });
  }
});

// @route   DELETE /api/pdf/:id/embeddings
// @desc    Delete PDF embeddings from database
// @access  Private
router.delete('/:id/embeddings', auth, async (req, res) => {
  try {
    console.log('=== DELETE PDF EMBEDDINGS ===');
    console.log('PDF ID:', req.params.id);
    
    // Find the PDF item in database
    const pdfItem = await DatastoreItem.findOne({
      _id: req.params.id,
      user: req.user.id,
      type: 'pdf'
    });
    
    if (!pdfItem) {
      return res.status(404).json({
        success: false,
        message: 'PDF not found or access denied'
      });
    }
    
    // Initialize PDF processor
    const pdfProcessor = initializePDFProcessor();
    await pdfProcessor.initializeDB();
    
    // Delete all documents for this PDF
    const deleteResult = await pdfProcessor.collection.deleteMany({ 
      file_name: pdfItem.title 
    });
    
    // Update the PDF item to mark as not embedded
    await DatastoreItem.findByIdAndUpdate(req.params.id, {
      $unset: {
        isEmbedded: 1,
        embeddedAt: 1,
        embeddingTaskId: 1
      }
    });
    
    res.json({
      success: true,
      message: 'PDF embeddings deleted successfully',
      data: {
        fileName: pdfItem.title,
        deletedCount: deleteResult.deletedCount
      }
    });
    
  } catch (error) {
    console.error('Delete PDF embeddings error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete PDF embeddings',
      error: error.message
    });
  }
});

// Health check endpoint to verify all dependencies
router.get('/health', (req, res) => {
  const status = {
    timestamp: new Date().toISOString(),
    auth: typeof auth === 'function' ? 'loaded' : 'failed',
    pdfProcessor: typeof PDFProcessor === 'function' ? 'loaded' : 'failed',
    datastoreItem: DatastoreItem ? 'loaded' : 'failed',
    environment: {
      chunkrApiKey: !!process.env.CHUNKR_API_KEY,
      geminiApiKey: !!process.env.GEMINI_API_KEY,
      astraToken: !!process.env.ASTRA_DB_APPLICATION_TOKEN,
      astraApiEndpoint: !!process.env.ASTRA_DB_API_ENDPOINT
    }
  };
  
  const allGood = Object.values(status).every(val => 
    typeof val === 'string' ? val === 'loaded' : val !== false
  );
  
  res.status(allGood ? 200 : 500).json({
    success: allGood,
    status: allGood ? 'healthy' : 'unhealthy',
    details: status
  });
});

module.exports = router;
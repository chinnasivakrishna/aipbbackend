const UserAnswer = require('../models/UserAnswer');
const AiswbQuestion = require('../models/AiswbQuestion');
const AISWBSet = require('../models/AISWBSet');
let fetch;
(async () => {
  fetch = (await import('node-fetch')).default;
})();
const axios = require('axios');
const cloudinary = require('cloudinary').v2;

// API Configuration
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GEMINI_API_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent';
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const OPENAI_API_URL = 'https://api.openai.com/v1/chat/completions';

// Text extraction functions
const extractTextFromImages = async (imageUrls) => {
  // ... (same implementation as original)
};

const extractTextFromImagesGemini = async (imageUrls) => {
  // ... (same implementation as original)
};

const extractTextFromImagesWithFallback = async (imageUrls) => {
  // ... (same implementation as original)
};

// Evaluation functions
const generateEvaluationPrompt = (question, extractedTexts) => {
  // ... (same implementation as original)
};

const parseEvaluationResponse = (evaluationText, question) => {
  // ... (same implementation as original)
};

const generateMockEvaluation = (question) => {
  // ... (same implementation as original)
};

// Service functions
const submitAnswerService = async (req) => {
  // ... (same implementation as original route handler)
  // Return the response data instead of sending the response
};

const getEvaluationService = async (req) => {
  // ... (same implementation as original route handler)
  // Return the response data instead of sending the response
};

const getSubmissionStatusService = async (req) => {
  // ... (same implementation as original route handler)
  // Return the response data instead of sending the response
};

const getLatestAnswerService = async (req) => {
  // ... (same implementation as original route handler)
  // Return the response data instead of sending the response
};

const getUserAttemptsService = async (req) => {
  // ... (same implementation as original route handler)
  // Return the response data instead of sending the response
};

const getAttemptByNumberService = async (req) => {
  // ... (same implementation as original route handler)
  // Return the response data instead of sending the response
};

const getEvaluationsService = async (req) => {
  // ... (same implementation as original route handler)
  // Return the response data instead of sending the response
};

const getCompleteQuestionDataService = async (req) => {
  // ... (same implementation as original route handler)
  // Return the response data instead of sending the response
};

const reevaluateAnswerService = async (req) => {
  // ... (same implementation as original route handler)
  // Return the response data instead of sending the response
};

const bulkUpdateEvaluationService = async (req) => {
  // ... (same implementation as original route handler)
  // Return the response data instead of sending the response
};

const adminUpdateEvaluationService = async (req) => {
  // ... (same implementation as original route handler)
  // Return the response data instead of sending the response
};

module.exports = {
  extractTextFromImages,
  extractTextFromImagesGemini,
  extractTextFromImagesWithFallback,
  generateEvaluationPrompt,
  parseEvaluationResponse,
  generateMockEvaluation,
  submitAnswerService,
  getEvaluationService,
  getSubmissionStatusService,
  getLatestAnswerService,
  getUserAttemptsService,
  getAttemptByNumberService,
  getEvaluationsService,
  getCompleteQuestionDataService,
  reevaluateAnswerService,
  bulkUpdateEvaluationService,
  adminUpdateEvaluationService
};
const express = require('express');
const {verifyToken} = require('../middleware/auth');
const {addQuestion, getAllQuestionsByTest, updateQuestion, deleteQuestion} = require('../controllers/subjectivetestquestion');
const { validateQuestion, validateTestId } = require('../middleware/aiswbValidation');
const { authenticateMobileUser } = require('../middleware/mobileAuth');

const router =express.Router();

router.get('/mobile/:testId',authenticateMobileUser,validateTestId,getAllQuestionsByTest);

router.post('/:testId',verifyToken,validateQuestion,addQuestion);

router.get('/:testId',verifyToken,validateTestId,getAllQuestionsByTest);

router.put('/:questionId',verifyToken,updateQuestion);

router.delete('/:questionId',verifyToken,deleteQuestion);

module.exports = router;
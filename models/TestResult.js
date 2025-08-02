const mongoose = require('mongoose');

const testResultSchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    testId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'ObjectiveTest',
        required: true
    },
    clientId: {
        type: String,
        ref: 'Client',
        required: true
    },
    answers: {
        type: Map,
        of: Number
    },
    score: {
        type: Number,
        // required: true,
        min: 0,
        max: 100
    },
    totalQuestions: {
        type: Number,
        // required: true
    },
    answeredQuestions: {
        type: Number,
        // required: true
    },
    correctAnswers: {
        type: Number,
        // required: true
    },
    levelBreakdown: {
        L1: { total: Number, correct: Number, score: Number },
        L2: { total: Number, correct: Number, score: Number },
        L3: { total: Number, correct: Number, score: Number }
    },
    startTime: {
        type: Date,
        required: true
    },
    submittedAt: {
        type: Date,
        default: Date.now
    },
    completionTime: {
        type: String, 
        // required: true
    },
    status: {
        type: String,
        enum: ['completed', 'in_progress', 'abandoned'],
        default: 'completed'
    }
}, {
    timestamps: true
});

// Index for efficient queries
testResultSchema.index({ userId: 1, testId: 1 });
testResultSchema.index({ clientId: 1, testId: 1 });
testResultSchema.index({ submittedAt: -1 });

module.exports = mongoose.model('TestResult', testResultSchema); 
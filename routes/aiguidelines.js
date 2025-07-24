const express = require('express');
const Book = require('../models/Book');
const router = express.Router();

// Update AI Guidelines for a specific book
router.put('/:bookId', async (req, res) => {
    const { message, prompt, FAQs } = req.body;
    try {
        const book = await Book.findByIdAndUpdate(
            req.params.bookId,
            { aiGuidelines: { message, prompt, FAQs } },
            { new: true }
        );
        if (!book) {
            return res.status(404).json({ error: 'Book not found' });
        }
        console.log(book.aiGuidelines);

        res.status(200).json(book.aiGuidelines);
    } catch (err) {
        res.status(500).json({ error: 'Server error' });
    }
});

// Get AI Guidelines for a specific book
router.get('/:bookId', async (req, res) => {
    try {
        const book = await Book.findById(req.params.bookId, 'aiGuidelines');
        if (!book) {
            return res.status(404).json({ error: 'Book not found' });
        }
        res.status(200).json(book.aiGuidelines);
    } catch (err) {
        res.status(500).json({ error: 'Server error' });
    }
});

module.exports = router;
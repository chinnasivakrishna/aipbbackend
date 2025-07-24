const mongoose = require('mongoose');

const SubcategorySchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true }
});

const CategorySchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true, unique: true },
  subcategories: [SubcategorySchema],
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: false }, // Optional: track who created
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Category', CategorySchema); 
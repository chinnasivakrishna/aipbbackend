const Category = require('../models/Category');

// Add a new category
exports.addCategory = async (req, res) => {
  try {
    const { name } = req.body;
    if (!name) return res.status(400).json({ error: 'Category name is required' });
    const existing = await Category.findOne({ name });
    if (existing) return res.status(409).json({ error: 'Category already exists' });
    const category = new Category({ name, subcategories: [] });
    await category.save();
    res.status(201).json(category);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// Add a subcategory to an existing category
exports.addSubcategory = async (req, res) => {
  try {
    const { categoryId } = req.params;
    const { name } = req.body;
    if (!name) return res.status(400).json({ error: 'Subcategory name is required' });
    const category = await Category.findById(categoryId);
    if (!category) return res.status(404).json({ error: 'Category not found' });
    if (category.subcategories.some(sc => sc.name === name)) {
      return res.status(409).json({ error: 'Subcategory already exists' });
    }
    category.subcategories.push({ name });
    await category.save();
    res.status(201).json(category);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// Get all user-defined categories and subcategories
exports.getAllCategories = async (req, res) => {
  try {
    const categories = await Category.find();
    res.json(categories);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}; 
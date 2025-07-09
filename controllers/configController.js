const Config = require('../models/Config');

// Add a new model to a sourcetype (create if not exists)
exports.addModel = async (req, res) => {
  try {
    const { sourcetype, key, sourcename, modelname, description, status } = req.body;
    const { id: clientId } = req.params;
    let config = await Config.findOne({ clientId, sourcetype });
    if (!config) {
      config = new Config({
        clientId,
        sourcetype,
        models: [{ key, sourcename, modelname, description, status }]
      });
    } else {
      // Prevent duplicate key
      if (config.models.some(m => m.key === key)) {
        return res.status(400).json({ message: 'Model key already exists.' });
      }
      config.models.push({ key, sourcename, modelname, description, status });
    }
    await config.save();
    res.status(201).json(config);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// Get all configs or by sourcetype
exports.getConfigs = async (req, res) => {
  try {
    const { sourcetype } = req.query;
    const { id: clientId } = req.params;
    let configs;
    if (sourcetype) {
      configs = await Config.findOne({ clientId, sourcetype });
    } else {
      configs = await Config.find({ clientId });
    }
    res.json(configs);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// Update a model by key within a sourcetype
exports.updateModel = async (req, res) => {
  try {
    const { sourcetype, key } = req.params;
    const { id: clientId } = req.params;
    const update = req.body;
    const config = await Config.findOne({ clientId, sourcetype });
    if (!config) return res.status(404).json({ message: 'Config not found' });
    const model = config.models.find(m => m.key === key);
    if (!model) return res.status(404).json({ message: 'Model not found' });
    Object.assign(model, update);
    await config.save();
    res.json(config);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// Delete a model by key within a sourcetype
exports.deleteModel = async (req, res) => {
  try {
    const { sourcetype, key } = req.params;
    const { id: clientId } = req.params;
    const config = await Config.findOne({ clientId, sourcetype });
    if (!config) return res.status(404).json({ message: 'Config not found' });
    const initialLength = config.models.length;
    config.models = config.models.filter(m => m.key !== key);
    if (config.models.length === initialLength) {
      return res.status(404).json({ message: 'Model not found' });
    }
    await config.save();
    res.json({ message: 'Model deleted', config });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// Check if config is expired
exports.checkIsExpired = async (req, res) => {
  try {
    const { id: clientId, sourcetype, modelId } = req.params;
    const config = await Config.findOne({ clientId, sourcetype });
    if (!config) return res.status(404).json({ message: 'Config not found' });
    const model = config.models.id(modelId);
    if (!model) return res.status(404).json({ message: 'Model not found' });
    res.json({ isExpired: model.isExpired });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// Set config expired flag
exports.setIsExpired = async (req, res) => {
  try {
    const { id: clientId, sourcetype, modelId } = req.params;
    const { isExpired } = req.body;
    const config = await Config.findOne({ clientId, sourcetype });
    if (!config) return res.status(404).json({ message: 'Config not found' });
    const model = config.models.id(modelId);
    if (!model) return res.status(404).json({ message: 'Model not found' });
    model.isExpired = !!isExpired;
    await config.save();
    res.json(config);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// Get all expired models for a config section
exports.getExpiredModels = async (req, res) => {
  try {
    const { id: clientId, sourcetype } = req.params;
    const config = await Config.findOne({ clientId, sourcetype });
    if (!config) return res.status(404).json({ message: 'Config not found' });
    const expiredModels = config.models.filter(m => m.isExpired);
    res.json({ expiredModels });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
}; 
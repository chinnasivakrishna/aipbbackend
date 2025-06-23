// models/aiModel.js
const mongoose = require('mongoose');

const modelSchema = new mongoose.Schema({
  key: { type: String, required: true, unique: true }, // Unique key for each model
  sourcename: { type: String, required: true },
  modelname: { type: String, required: true },
  description: { type: String },
  status:{ type: String },
});

const configSchema = new mongoose.Schema(
  {
    sourcetype: {
      type: String,
      enum: ['LLM', 'SST', 'TTS'],
      required: true,
      unique: true // Only one config per sourcetype
    },
    models: [modelSchema] // Array of models for this type
  },
  { timestamps: true }
);

module.exports = mongoose.model('Config', configSchema);

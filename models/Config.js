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
    clientId: { type: mongoose.Schema.Types.ObjectId, ref: 'Client', required: true, index: true },
    sourcetype: {
      type: String,
      enum: ['LLM', 'SST', 'TTS'],
      required: true
    },
    models: [modelSchema], // Array of models for this type
    isExpired: { type: Boolean, default: false }
  },
  { timestamps: true }
);

configSchema.index({ clientId: 1, sourcetype: 1 }, { unique: true });

module.exports = mongoose.model('Config', configSchema);

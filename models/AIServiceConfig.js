const mongoose = require("mongoose")

const aiServiceConfigSchema = new mongoose.Schema({
  serviceName: {
    type: String,
    required: true,
    enum: ["openai", "gemini", "agentic"], // Added agentic service
    unique: true,
  },
  displayName: {
    type: String,
    required: true,
  },
  apiKey: {
    type: String,
    required: true,
  },
  apiUrl: {
    type: String,
    required: true,
  },
  isActive: {
    type: Boolean,
    default: true,
  },
  supportedTasks: [
    {
      type: String,
      enum: ["text_extraction", "analysis", "evaluation"],
      required: true,
    },
  ],
  taskPreferences: {
    text_extraction: {
      type: Boolean,
      default: false,
    },
    analysis: {
      type: Boolean,
      default: false,
    },
    evaluation: {
      type: Boolean,
      default: false,
    },
  },
  // Additional configuration for agentic service
  serviceConfig: {
    timeout: {
      type: Number,
      default: 60,
    },
    includeMarginalia: {
      type: Boolean,
      default: false,
    },
    includeMetadataInMarkdown: {
      type: Boolean,
      default: false,
    },
    pages: {
      type: String,
      default: null, // e.g., "0,1,2" for first 3 pages
    },
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
  updatedAt: {
    type: Date,
    default: Date.now,
  },
})

// Update the updatedAt field before saving
aiServiceConfigSchema.pre("save", function (next) {
  this.updatedAt = Date.now()
  next()
})

// Static method to get active service for a specific task
aiServiceConfigSchema.statics.getActiveServiceForTask = async function (taskType) {
  try {
    const service = await this.findOne({
      isActive: true,
      [`taskPreferences.${taskType}`]: true,
    })
    return service
  } catch (error) {
    console.error(`Error getting active service for task ${taskType}:`, error)
    return null
  }
}

// Static method to get all active services
aiServiceConfigSchema.statics.getActiveServices = async function () {
  try {
    return await this.find({ isActive: true })
  } catch (error) {
    console.error("Error getting active services:", error)
    return []
  }
}

module.exports = mongoose.model("AiServiceConfig", aiServiceConfigSchema)

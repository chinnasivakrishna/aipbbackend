const express = require("express")
const router = express.Router()
const AiServiceConfig = require("../models/AiServiceConfig")
const { body, validationResult } = require("express-validator")

// Updated validation middleware to include agentic service
const validateAiServiceConfig = [
  body("serviceName")
    .isIn(["openai", "gemini", "agentic"])
    .withMessage("Service name must be openai, gemini, or agentic"),
  body("displayName")
    .isString()
    .trim()
    .isLength({ min: 1, max: 100 })
    .withMessage("Display name is required and must be less than 100 characters"),
  body("apiKey")
    .isString()
    .trim()
    .isLength({ min: 10 })
    .withMessage("API key is required and must be at least 10 characters"),
  body("apiUrl").isURL().withMessage("API URL must be a valid URL"),
  body("isActive").optional().isBoolean().withMessage("isActive must be a boolean"),
  body("supportedTasks")
    .isArray({ min: 1 })
    .withMessage("At least one supported task is required")
    .custom((tasks) => {
      const validTasks = ["text_extraction", "analysis", "evaluation"]
      return tasks.every((task) => validTasks.includes(task))
    })
    .withMessage("Invalid task type. Must be one of: text_extraction, analysis, evaluation"),
  body("taskPreferences").optional().isObject().withMessage("Task preferences must be an object"),
  body("taskPreferences.text_extraction")
    .optional()
    .isBoolean()
    .withMessage("text_extraction preference must be a boolean"),
  body("taskPreferences.analysis").optional().isBoolean().withMessage("analysis preference must be a boolean"),
  body("taskPreferences.evaluation").optional().isBoolean().withMessage("evaluation preference must be a boolean"),
  // Additional validation for agentic service config
  body("serviceConfig")
    .optional()
    .isObject()
    .withMessage("Service config must be an object"),
  body("serviceConfig.timeout")
    .optional()
    .isInt({ min: 1, max: 600 })
    .withMessage("Timeout must be between 1 and 600 seconds"),
  body("serviceConfig.includeMarginalia").optional().isBoolean().withMessage("includeMarginalia must be a boolean"),
  body("serviceConfig.includeMetadataInMarkdown")
    .optional()
    .isBoolean()
    .withMessage("includeMetadataInMarkdown must be a boolean"),
  body("serviceConfig.pages").optional().isString().withMessage("pages must be a string"),
]

// Helper function to hide API keys
const hideApiKeys = (services) => {
  if (Array.isArray(services)) {
    return services.map((service) => {
      const serviceObj = service.toObject()
      serviceObj.apiKey = serviceObj.apiKey ? "***HIDDEN***" : null
      return serviceObj
    })
  } else {
    const serviceObj = services.toObject()
    serviceObj.apiKey = serviceObj.apiKey ? "***HIDDEN***" : null
    return serviceObj
  }
}

// GET all AI service configurations
router.get("/", async (req, res) => {
  try {
    const services = await AiServiceConfig.find().sort({ createdAt: -1 })

    // Hide API keys in response for security
    const servicesWithoutKeys = hideApiKeys(services)

    res.json({
      success: true,
      message: "AI service configurations retrieved successfully",
      data: servicesWithoutKeys,
    })
  } catch (error) {
    console.error("Error fetching AI service configurations:", error)
    res.status(500).json({
      success: false,
      message: "Internal server error",
      error: error.message,
    })
  }
})

// GET active AI service configurations
router.get("/active", async (req, res) => {
  try {
    const activeServices = await AiServiceConfig.getActiveServices()

    // Hide API keys in response for security
    const servicesWithoutKeys = hideApiKeys(activeServices)

    res.json({
      success: true,
      message: "Active AI service configurations retrieved successfully",
      data: servicesWithoutKeys,
    })
  } catch (error) {
    console.error("Error fetching active AI service configurations:", error)
    res.status(500).json({
      success: false,
      message: "Internal server error",
      error: error.message,
    })
  }
})

// GET AI service configuration by service name
router.get("/:serviceName", async (req, res) => {
  try {
    const { serviceName } = req.params

    if (!["openai", "gemini", "agentic"].includes(serviceName)) {
      return res.status(400).json({
        success: false,
        message: "Invalid service name. Must be openai, gemini, or agentic",
      })
    }

    const service = await AiServiceConfig.findOne({ serviceName })

    if (!service) {
      return res.status(404).json({
        success: false,
        message: `${serviceName} service configuration not found`,
      })
    }

    // Hide API key in response for security
    const serviceObj = hideApiKeys(service)

    res.json({
      success: true,
      message: `${serviceName} service configuration retrieved successfully`,
      data: serviceObj,
    })
  } catch (error) {
    console.error("Error fetching AI service configuration:", error)
    res.status(500).json({
      success: false,
      message: "Internal server error",
      error: error.message,
    })
  }
})

// GET API key for a specific service (requires authentication/authorization in production)
router.get("/:serviceName/apikey", async (req, res) => {
  try {
    const { serviceName } = req.params

    if (!["openai", "gemini", "agentic"].includes(serviceName)) {
      return res.status(400).json({
        success: false,
        message: "Invalid service name. Must be openai, gemini, or agentic",
      })
    }

    const service = await AiServiceConfig.findOne({ serviceName })

    if (!service) {
      return res.status(404).json({
        success: false,
        message: `${serviceName} service configuration not found`,
      })
    }

    res.json({
      success: true,
      message: `${serviceName} API key retrieved successfully`,
      data: {
        serviceName: service.serviceName,
        apiKey: service.apiKey,
      },
    })
  } catch (error) {
    console.error("Error fetching API key:", error)
    res.status(500).json({
      success: false,
      message: "Internal server error",
      error: error.message,
    })
  }
})

// PUT update API key for a service
router.put("/:serviceName/apikey", async (req, res) => {
  try {
    const { serviceName } = req.params
    const { apiKey } = req.body

    if (!["openai", "gemini", "agentic"].includes(serviceName)) {
      return res.status(400).json({
        success: false,
        message: "Invalid service name. Must be openai, gemini, or agentic",
      })
    }

    if (!apiKey || typeof apiKey !== "string" || apiKey.trim().length < 10) {
      return res.status(400).json({
        success: false,
        message: "API key is required and must be at least 10 characters",
      })
    }

    const service = await AiServiceConfig.findOne({ serviceName })

    if (!service) {
      return res.status(404).json({
        success: false,
        message: `${serviceName} service configuration not found`,
      })
    }

    // Update API key
    service.apiKey = apiKey.trim()
    await service.save()

    res.json({
      success: true,
      message: `${serviceName} API key updated successfully`,
      data: {
        serviceName: service.serviceName,
        updatedAt: service.updatedAt,
      },
    })
  } catch (error) {
    console.error("Error updating API key:", error)
    res.status(500).json({
      success: false,
      message: "Internal server error",
      error: error.message,
    })
  }
})

// POST create or update AI service configuration
router.post("/", validateAiServiceConfig, async (req, res) => {
  try {
    const errors = validationResult(req)
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: "Validation failed",
        errors: errors.array(),
      })
    }

    const {
      serviceName,
      displayName,
      apiKey,
      apiUrl,
      isActive = true,
      supportedTasks,
      taskPreferences = {},
      serviceConfig = {},
    } = req.body

    // Check if service already exists
    let service = await AiServiceConfig.findOne({ serviceName })

    if (service) {
      // Update existing service
      service.displayName = displayName
      service.apiKey = apiKey
      service.apiUrl = apiUrl
      service.isActive = isActive
      service.supportedTasks = supportedTasks
      service.taskPreferences = {
        text_extraction: taskPreferences.text_extraction || false,
        analysis: taskPreferences.analysis || false,
        evaluation: taskPreferences.evaluation || false,
      }

      // Update service config for agentic service
      if (serviceName === "agentic") {
        service.serviceConfig = {
          timeout: serviceConfig.timeout || 480,
          includeMarginalia: serviceConfig.includeMarginalia !== undefined ? serviceConfig.includeMarginalia : true,
          includeMetadataInMarkdown:
            serviceConfig.includeMetadataInMarkdown !== undefined ? serviceConfig.includeMetadataInMarkdown : true,
          pages: serviceConfig.pages || null,
        }
      }

      await service.save()

      res.json({
        success: true,
        message: `${serviceName} service configuration updated successfully`,
        data: {
          id: service._id,
          serviceName: service.serviceName,
          displayName: service.displayName,
          apiUrl: service.apiUrl,
          isActive: service.isActive,
          supportedTasks: service.supportedTasks,
          taskPreferences: service.taskPreferences,
          serviceConfig: service.serviceConfig,
          updatedAt: service.updatedAt,
        },
      })
    } else {
      // Create new service
      const newServiceData = {
        serviceName,
        displayName,
        apiKey,
        apiUrl,
        isActive,
        supportedTasks,
        taskPreferences: {
          text_extraction: taskPreferences.text_extraction || false,
          analysis: taskPreferences.analysis || false,
          evaluation: taskPreferences.evaluation || false,
        },
      }

      // Add service config for agentic service
      if (serviceName === "agentic") {
        newServiceData.serviceConfig = {
          timeout: serviceConfig.timeout || 480,
          includeMarginalia: serviceConfig.includeMarginalia !== undefined ? serviceConfig.includeMarginalia : true,
          includeMetadataInMarkdown:
            serviceConfig.includeMetadataInMarkdown !== undefined ? serviceConfig.includeMetadataInMarkdown : true,
          pages: serviceConfig.pages || null,
        }
      }

      service = new AiServiceConfig(newServiceData)
      await service.save()

      res.status(201).json({
        success: true,
        message: `${serviceName} service configuration created successfully`,
        data: {
          id: service._id,
          serviceName: service.serviceName,
          displayName: service.displayName,
          apiUrl: service.apiUrl,
          isActive: service.isActive,
          supportedTasks: service.supportedTasks,
          taskPreferences: service.taskPreferences,
          serviceConfig: service.serviceConfig,
          createdAt: service.createdAt,
        },
      })
    }
  } catch (error) {
    console.error("Error creating/updating AI service configuration:", error)

    if (error.code === 11000) {
      return res.status(409).json({
        success: false,
        message: "Service configuration already exists",
        error: "Duplicate service name",
      })
    }

    res.status(500).json({
      success: false,
      message: "Internal server error",
      error: error.message,
    })
  }
})

// PUT update task preferences for a service
router.put("/:serviceName/preferences", async (req, res) => {
  try {
    const { serviceName } = req.params
    const { taskPreferences } = req.body

    if (!["openai", "gemini", "agentic"].includes(serviceName)) {
      return res.status(400).json({
        success: false,
        message: "Invalid service name. Must be openai, gemini, or agentic",
      })
    }

    if (!taskPreferences || typeof taskPreferences !== "object") {
      return res.status(400).json({
        success: false,
        message: "Task preferences object is required",
      })
    }

    const service = await AiServiceConfig.findOne({ serviceName })

    if (!service) {
      return res.status(404).json({
        success: false,
        message: `${serviceName} service configuration not found`,
      })
    }

    // Update task preferences
    service.taskPreferences = {
      text_extraction: taskPreferences.text_extraction || false,
      analysis: taskPreferences.analysis || false,
      evaluation: taskPreferences.evaluation || false,
    }

    await service.save()

    res.json({
      success: true,
      message: `${serviceName} task preferences updated successfully`,
      data: {
        serviceName: service.serviceName,
        taskPreferences: service.taskPreferences,
        updatedAt: service.updatedAt,
      },
    })
  } catch (error) {
    console.error("Error updating task preferences:", error)
    res.status(500).json({
      success: false,
      message: "Internal server error",
      error: error.message,
    })
  }
})

// PUT update service configuration (for agentic service)
router.put("/:serviceName/config", async (req, res) => {
  try {
    const { serviceName } = req.params
    const { serviceConfig } = req.body

    if (serviceName !== "agentic") {
      return res.status(400).json({
        success: false,
        message: "Service configuration update is only available for agentic service",
      })
    }

    if (!serviceConfig || typeof serviceConfig !== "object") {
      return res.status(400).json({
        success: false,
        message: "Service configuration object is required",
      })
    }

    const service = await AiServiceConfig.findOne({ serviceName })

    if (!service) {
      return res.status(404).json({
        success: false,
        message: `${serviceName} service configuration not found`,
      })
    }

    // Update service configuration
    service.serviceConfig = {
      timeout: serviceConfig.timeout || service.serviceConfig?.timeout || 480,
      includeMarginalia:
        serviceConfig.includeMarginalia !== undefined
          ? serviceConfig.includeMarginalia
          : service.serviceConfig?.includeMarginalia !== undefined
            ? service.serviceConfig.includeMarginalia
            : true,
      includeMetadataInMarkdown:
        serviceConfig.includeMetadataInMarkdown !== undefined
          ? serviceConfig.includeMetadataInMarkdown
          : service.serviceConfig?.includeMetadataInMarkdown !== undefined
            ? service.serviceConfig.includeMetadataInMarkdown
            : true,
      pages: serviceConfig.pages !== undefined ? serviceConfig.pages : service.serviceConfig?.pages || null,
    }

    await service.save()

    res.json({
      success: true,
      message: `${serviceName} service configuration updated successfully`,
      data: {
        serviceName: service.serviceName,
        serviceConfig: service.serviceConfig,
        updatedAt: service.updatedAt,
      },
    })
  } catch (error) {
    console.error("Error updating service configuration:", error)
    res.status(500).json({
      success: false,
      message: "Internal server error",
      error: error.message,
    })
  }
})

// PUT toggle service active status
router.put("/:serviceName/toggle", async (req, res) => {
  try {
    const { serviceName } = req.params

    if (!["openai", "gemini", "agentic"].includes(serviceName)) {
      return res.status(400).json({
        success: false,
        message: "Invalid service name. Must be openai, gemini, or agentic",
      })
    }

    const service = await AiServiceConfig.findOne({ serviceName })

    if (!service) {
      return res.status(404).json({
        success: false,
        message: `${serviceName} service configuration not found`,
      })
    }

    service.isActive = !service.isActive
    await service.save()

    res.json({
      success: true,
      message: `${serviceName} service ${service.isActive ? "activated" : "deactivated"} successfully`,
      data: {
        serviceName: service.serviceName,
        isActive: service.isActive,
        updatedAt: service.updatedAt,
      },
    })
  } catch (error) {
    console.error("Error toggling service status:", error)
    res.status(500).json({
      success: false,
      message: "Internal server error",
      error: error.message,
    })
  }
})

// DELETE AI service configuration
router.delete("/:serviceName", async (req, res) => {
  try {
    const { serviceName } = req.params

    if (!["openai", "gemini", "agentic"].includes(serviceName)) {
      return res.status(400).json({
        success: false,
        message: "Invalid service name. Must be openai, gemini, or agentic",
      })
    }

    const service = await AiServiceConfig.findOneAndDelete({ serviceName })

    if (!service) {
      return res.status(404).json({
        success: false,
        message: `${serviceName} service configuration not found`,
      })
    }

    res.json({
      success: true,
      message: `${serviceName} service configuration deleted successfully`,
    })
  } catch (error) {
    console.error("Error deleting AI service configuration:", error)
    res.status(500).json({
      success: false,
      message: "Internal server error",
      error: error.message,
    })
  }
})

module.exports = router
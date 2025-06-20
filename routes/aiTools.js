const express = require("express")
const router = express.Router()
const AiTool = require("../models/AiTool")
const { body, validationResult } = require("express-validator")

// Validation middleware
const validateAiTool = [
  body("name").isIn(["openai", "gemini"]).withMessage('Name must be either "openai" or "gemini"'),
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
  body("capabilities").optional().isArray().withMessage("Capabilities must be an array"),
]

// Get all AI tools
router.get("/", async (req, res) => {
  try {
    const tools = await AiTool.find().sort({ createdAt: -1 })
    res.json({
      success: true,
      data: tools,
    })
  } catch (error) {
    console.error("Error fetching AI tools:", error)
    res.status(500).json({
      success: false,
      message: "Internal server error",
      error: error.message,
    })
  }
})

// Get active AI tool
router.get("/active", async (req, res) => {
  try {
    const activeTool = await AiTool.getActiveTool()
    if (!activeTool) {
      return res.status(404).json({
        success: false,
        message: "No active AI tool found",
      })
    }
    res.json({
      success: true,
      data: activeTool,
    })
  } catch (error) {
    console.error("Error fetching active AI tool:", error)
    res.status(500).json({
      success: false,
      message: "Internal server error",
      error: error.message,
    })
  }
})

// Create or update AI tool
router.post("/", validateAiTool, async (req, res) => {
  try {
    const errors = validationResult(req)
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: "Invalid input data",
        errors: errors.array(),
      })
    }

    const { name, displayName, apiKey, apiUrl, isActive, capabilities } = req.body

    // Check if tool already exists
    let tool = await AiTool.findOne({ name: name.toLowerCase() })

    if (tool) {
      // Update existing tool
      tool.displayName = displayName
      tool.apiKey = apiKey
      tool.apiUrl = apiUrl
      tool.isActive = isActive || false
      tool.capabilities = capabilities || ["text_extraction", "text_evaluation"]
      await tool.save()

      res.json({
        success: true,
        message: "AI tool updated successfully",
        data: tool,
      })
    } else {
      // Create new tool
      tool = new AiTool({
        name: name.toLowerCase(),
        displayName,
        apiKey,
        apiUrl,
        isActive: isActive || false,
        capabilities: capabilities || ["text_extraction", "text_evaluation"],
      })

      await tool.save()

      res.status(201).json({
        success: true,
        message: "AI tool created successfully",
        data: tool,
      })
    }
  } catch (error) {
    console.error("Error creating/updating AI tool:", error)
    res.status(500).json({
      success: false,
      message: "Internal server error",
      error: error.message,
    })
  }
})

// Set active AI tool
router.patch("/:toolId/activate", async (req, res) => {
  try {
    const { toolId } = req.params

    const tool = await AiTool.findById(toolId)
    if (!tool) {
      return res.status(404).json({
        success: false,
        message: "AI tool not found",
      })
    }

    tool.isActive = true
    await tool.save()

    res.json({
      success: true,
      message: "AI tool activated successfully",
      data: tool,
    })
  } catch (error) {
    console.error("Error activating AI tool:", error)
    res.status(500).json({
      success: false,
      message: "Internal server error",
      error: error.message,
    })
  }
})

// Delete AI tool
router.delete("/:toolId", async (req, res) => {
  try {
    const { toolId } = req.params

    const tool = await AiTool.findById(toolId)
    if (!tool) {
      return res.status(404).json({
        success: false,
        message: "AI tool not found",
      })
    }

    await AiTool.findByIdAndDelete(toolId)

    res.json({
      success: true,
      message: "AI tool deleted successfully",
    })
  } catch (error) {
    console.error("Error deleting AI tool:", error)
    res.status(500).json({
      success: false,
      message: "Internal server error",
      error: error.message,
    })
  }
})

module.exports = router

const express = require("express")
const OpenAI = require("openai")
const router = express.Router()

// Initialize OpenAI client
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
})

// POST /api/chat - Handle chat messages with OpenAI
router.post("/", async (req, res) => {
  try {
    const { messages, summaries } = req.body

    // Validate request
    if (!messages || !Array.isArray(messages)) {
      return res.status(400).json({
        success: false,
        message: "Messages array is required",
      })
    }

    // Check if OpenAI API key is configured
    if (!process.env.OPENAI_API_KEY) {
      return res.status(500).json({
        success: false,
        message: "OpenAI API key not configured",
      })
    }

    // Create context from summaries
    let systemMessage = `You are an intelligent learning assistant. You help students understand their learning materials and answer questions based on the provided context.

Instructions:
- Use the learning materials context provided below to answer questions accurately
- If the question is directly related to the learning materials, provide detailed explanations
- If the question is not covered in the materials, provide general educational assistance
- Be encouraging and supportive in your responses
- Break down complex concepts into simpler terms when needed
- Provide examples when helpful`

    if (summaries && summaries.length > 0) {
      const summaryContext = summaries.map((summary, index) => 
        `Learning Material ${index + 1}:\n${summary.content}`
      ).join('\n\n')
      
      systemMessage += `\n\nLearning Materials Context:\n${summaryContext}`
    }

    // Prepare messages for OpenAI
    const openaiMessages = [
      {
        role: "system",
        content: systemMessage
      },
      ...messages.map(msg => ({
        role: msg.role === "user" ? "user" : "assistant",
        content: msg.content
      }))
    ]

    // Call OpenAI API
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini", // Using gpt-4o-mini for cost efficiency, change to gpt-4o if needed
      messages: openaiMessages,
      max_tokens: 1000,
      temperature: 0.7,
      stream: false
    })

    const response = completion.choices[0].message.content

    res.json({
      success: true,
      message: response,
      timestamp: new Date().toISOString(),
      tokensUsed: completion.usage?.total_tokens || 0
    })

  } catch (error) {
    console.error("Chat API error:", error)
    
    // Handle specific OpenAI errors
    if (error.code === 'insufficient_quota') {
      return res.status(429).json({
        success: false,
        message: "OpenAI quota exceeded. Please try again later.",
      })
    }
    
    if (error.code === 'invalid_api_key') {
      return res.status(401).json({
        success: false,
        message: "Invalid OpenAI API key configuration.",
      })
    }

    res.status(500).json({
      success: false,
      message: "Failed to process chat request. Please try again.",
    })
  }
})

// POST /api/chat/stream - Handle streaming chat messages (optional)
router.post("/stream", async (req, res) => {
  try {
    const { messages, summaries } = req.body

    if (!messages || !Array.isArray(messages)) {
      return res.status(400).json({
        success: false,
        message: "Messages array is required",
      })
    }

    if (!process.env.OPENAI_API_KEY) {
      return res.status(500).json({
        success: false,
        message: "OpenAI API key not configured",
      })
    }

    // Create context from summaries
    let systemMessage = `You are an intelligent learning assistant. You help students understand their learning materials and answer questions based on the provided context.

Instructions:
- Use the learning materials context provided below to answer questions accurately
- If the question is directly related to the learning materials, provide detailed explanations
- If the question is not covered in the materials, provide general educational assistance
- Be encouraging and supportive in your responses
- Break down complex concepts into simpler terms when needed
- Provide examples when helpful`

    if (summaries && summaries.length > 0) {
      const summaryContext = summaries.map((summary, index) => 
        `Learning Material ${index + 1}:\n${summary.content}`
      ).join('\n\n')
      
      systemMessage += `\n\nLearning Materials Context:\n${summaryContext}`
    }

    // Prepare messages for OpenAI
    const openaiMessages = [
      {
        role: "system",
        content: systemMessage
      },
      ...messages.map(msg => ({
        role: msg.role === "user" ? "user" : "assistant",
        content: msg.content
      }))
    ]

    // Set headers for streaming
    res.setHeader('Content-Type', 'text/plain')
    res.setHeader('Cache-Control', 'no-cache')
    res.setHeader('Connection', 'keep-alive')

    // Call OpenAI API with streaming
    const stream = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: openaiMessages,
      max_tokens: 1000,
      temperature: 0.7,
      stream: true
    })

    let fullResponse = ""

    for await (const chunk of stream) {
      const content = chunk.choices[0]?.delta?.content || ""
      if (content) {
        fullResponse += content
        res.write(content)
      }
    }

    res.end()

  } catch (error) {
    console.error("Streaming chat API error:", error)
    res.status(500).json({
      success: false,
      message: "Failed to process streaming chat request.",
    })
  }
})

module.exports = router

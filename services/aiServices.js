const axios = require("axios")
const FormData = require("form-data")
const { AiswbQuestion } = require("../models/AiswbQuestion")
const AiServiceConfig = require("../models/AiServiceConfig")

// Get service configuration for a specific task
const getServiceForTask = async (taskType) => {
  try {
    const service = await AiServiceConfig.getActiveServiceForTask(taskType)
    if (!service) {
      throw new Error(`No active AI service configured for task: ${taskType}`)
    }
    return service
  } catch (error) {
    console.error(`Error getting service for task ${taskType}:`, error)
    throw error
  }
}

// Validate if extracted text is relevant to the question
const validateTextRelevanceToQuestion = async (question, extractedTexts) => {
  if (!extractedTexts || extractedTexts.length === 0) {
    return { isValid: false, reason: "No text extracted from images" }
  }

  // Check if any extracted text has meaningful content
  const hasValidText = extractedTexts.some(
    (text) =>
      text &&
      text.trim().length > 0 &&
      !text.startsWith("Failed to extract text") &&
      !text.startsWith("No readable text found") &&
      !text.includes("Text extraction failed") &&
      text.trim() !== "No readable text found",
  )

  if (!hasValidText) {
    return { isValid: false, reason: "No readable text found in images" }
  }

  const combinedText = extractedTexts.join(" ").toLowerCase()
  const questionText = question.question.toLowerCase()

  // Extract key terms from the question
  const commonWords = [
    "the",
    "a",
    "an",
    "and",
    "or",
    "but",
    "in",
    "on",
    "at",
    "to",
    "for",
    "of",
    "with",
    "by",
    "is",
    "are",
    "was",
    "were",
    "be",
    "been",
    "have",
    "has",
    "had",
    "do",
    "does",
    "did",
    "will",
    "would",
    "could",
    "should",
    "may",
    "might",
    "can",
    "what",
    "when",
    "where",
    "why",
    "how",
    "which",
    "who",
    "whom",
  ]

  const questionWords = questionText
    .replace(/[^\w\s]/g, " ")
    .split(/\s+/)
    .filter((word) => word.length > 2 && !commonWords.includes(word))

  // Check for subject/topic relevance using AI if available
  try {
    const analysisService = await getServiceForTask("analysis")

    const relevancePrompt = `
      Analyze if the following student answer is relevant to the given question. 
      
      QUESTION: ${question.question}
      
      STUDENT ANSWER: ${combinedText}
      
      Please respond with only "RELEVANT" or "NOT_RELEVANT" followed by a brief reason.
      
      Consider the answer relevant if:
      1. It attempts to address the question topic
      2. It contains subject-related content
      3. It shows understanding of the question context
      
      Consider it NOT_RELEVANT if:
      1. It's completely unrelated to the question
      2. It's just random text or numbers
      3. It's clearly not an attempt to answer the question
    `

    let relevanceResponse = null

    if (analysisService.serviceName === "gemini") {
      try {
        const response = await axios.post(
          `${analysisService.apiUrl}?key=${analysisService.apiKey}`,
          {
            contents: [
              {
                parts: [
                  {
                    text: relevancePrompt,
                  },
                ],
              },
            ],
            generationConfig: {
              temperature: 0.1,
              maxOutputTokens: 100,
            },
          },
          {
            headers: { "Content-Type": "application/json" },
            timeout: 15000,
          },
        )

        if (response.data?.candidates?.[0]?.content?.parts?.[0]?.text) {
          relevanceResponse = response.data.candidates[0].content.parts[0].text.trim()
        }
      } catch (geminiError) {
        console.error("Gemini relevance check failed:", geminiError.message)
      }
    } else if (analysisService.serviceName === "openai") {
      try {
        const response = await axios.post(
          analysisService.apiUrl,
          {
            model: "gpt-4o-mini",
            messages: [
              {
                role: "user",
                content: relevancePrompt,
              },
            ],
            max_tokens: 100,
            temperature: 0.1,
          },
          {
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${analysisService.apiKey}`,
            },
            timeout: 15000,
          },
        )

        if (response.data?.choices?.[0]?.message?.content) {
          relevanceResponse = response.data.choices[0].message.content.trim()
        }
      } catch (openaiError) {
        console.error("OpenAI relevance check failed:", openaiError.message)
      }
    }

    if (relevanceResponse) {
      const isRelevant =
        relevanceResponse.toUpperCase().includes("RELEVANT") &&
        !relevanceResponse.toUpperCase().includes("NOT_RELEVANT")

      if (!isRelevant) {
        return {
          isValid: false,
          reason: "Answer content is not relevant to the question",
          aiResponse: relevanceResponse,
        }
      }
    }
  } catch (error) {
    console.error("AI relevance check failed:", error.message)
    // Continue with basic validation if AI check fails
  }

  // Basic keyword matching as fallback
  const matchingWords = questionWords.filter(
    (word) => combinedText.includes(word) || combinedText.includes(word.substring(0, Math.max(4, word.length - 2))),
  )

  // If the answer is very short and has no matching keywords, consider it invalid
  if (combinedText.length < 20 && matchingWords.length === 0) {
    return {
      isValid: false,
      reason: "Answer appears to be too short and unrelated to the question",
    }
  }

  // Additional checks for obviously invalid content
  const invalidPatterns = [
    /^[\d\s\-+*/=().]+$/, // Only numbers and math symbols
    /^[a-z\s]{1,10}$/i, // Very short random letters
    /^(.)\1{5,}$/, // Repeated characters
  ]

  for (const pattern of invalidPatterns) {
    if (pattern.test(combinedText.trim())) {
      return {
        isValid: false,
        reason: "Answer contains invalid or meaningless content",
      }
    }
  }

  return { isValid: true, reason: "Answer appears relevant to the question" }
}

// Extract text from images using Agentic Document Extraction API
const extractTextFromImagesAgentic = async (imageUrls, serviceConfig) => {
  const extractedTexts = []

  for (let i = 0; i < imageUrls.length; i++) {
    const imageUrl = imageUrls[i]
    try {
      console.log(`Processing image ${i + 1}/${imageUrls.length} with Agentic API...`)
      console.log(`Image URL: ${imageUrl}`)
      console.log(`Service Config:`, JSON.stringify(serviceConfig.serviceConfig, null, 2))

      // Create form data for the API request
      const formData = new FormData()

      // Handle different image sources
      if (imageUrl.startsWith("http")) {
        // Download the image first for remote URLs
        const imageResponse = await axios.get(imageUrl, {
          responseType: "stream",
          timeout: 30000,
          headers: {
            "User-Agent": "Mozilla/5.0 (compatible; TextExtractor/1.0)",
          },
        })

        if (imageResponse.status !== 200) {
          throw new Error(`Failed to fetch image: ${imageResponse.status} ${imageResponse.statusText}`)
        }

        // Determine file extension from URL or content type
        let fileExtension = "jpg"
        const contentType = imageResponse.headers["content-type"]
        if (contentType) {
          if (contentType.includes("png")) fileExtension = "png"
          else if (contentType.includes("pdf")) fileExtension = "pdf"
          else if (contentType.includes("webp")) fileExtension = "webp"
        }

        formData.append("image", imageResponse.data, {
          filename: `document_${i + 1}.${fileExtension}`,
          contentType: contentType || "image/jpeg",
        })
      } else {
        // For local files or base64 data
        formData.append("image", imageUrl, {
          filename: `document_${i + 1}.jpg`,
          contentType: "image/jpeg",
        })
      }

      // Add optional parameters from service config (matching API documentation)
      if (serviceConfig.serviceConfig?.includeMarginalia !== undefined) {
        formData.append("include_marginalia", serviceConfig.serviceConfig.includeMarginalia.toString())
      } else {
        formData.append("include_marginalia", "true")
      }

      if (serviceConfig.serviceConfig?.includeMetadataInMarkdown !== undefined) {
        formData.append(
          "include_metadata_in_markdown",
          serviceConfig.serviceConfig.includeMetadataInMarkdown.toString(),
        )
      } else {
        formData.append("include_metadata_in_markdown", "true")
      }

      // Build query parameters
      const queryParams = new URLSearchParams()
      if (serviceConfig.serviceConfig?.pages) {
        queryParams.append("pages", serviceConfig.serviceConfig.pages)
      }
      if (serviceConfig.serviceConfig?.timeout) {
        queryParams.append("timeout", serviceConfig.serviceConfig.timeout.toString())
      }

      // Use the correct API endpoint from documentation
      const apiUrl = `https://api.va.landing.ai/v1/tools/agentic-document-analysis${queryParams.toString() ? `?${queryParams.toString()}` : ""}`

      console.log(`Making request to Agentic API: ${apiUrl}`)
      console.log(`Authorization: Basic ${serviceConfig.apiKey.substring(0, 10)}...`)

      // Make request to Agentic Document Extraction API (using Basic auth as per documentation)
      const agenticResponse = await axios.post(apiUrl, formData, {
        headers: {
          ...formData.getHeaders(),
          Authorization: `Basic ${serviceConfig.apiKey}`,
        },
        timeout: (serviceConfig.serviceConfig?.timeout || 480) * 1000, // Convert to milliseconds
      })

      console.log(`Agentic API Response Status: ${agenticResponse.status}`)
      console.log(`Agentic API Response Headers:`, agenticResponse.headers)

      const responseData = agenticResponse.data

      // Check if response is HTML (indicates redirect/error page)
      if (typeof responseData === "string" && responseData.includes("<!DOCTYPE html>")) {
        console.error("Received HTML response instead of API data - likely authentication or endpoint issue")
        throw new Error("Authentication failed - received HTML redirect page instead of API response")
      }

      // Handle the response format as per API documentation
      if (agenticResponse.status === 200 && responseData && responseData.data) {
        let extractedText = ""
        const apiData = responseData.data

        // Priority: markdown > chunks text > raw text
        if (apiData.markdown && apiData.markdown.trim()) {
          extractedText = apiData.markdown.trim()
          console.log(`Extracted markdown content (${extractedText.length} chars)`)
        } else if (apiData.chunks && Array.isArray(apiData.chunks)) {
          // Extract text from chunks
          const chunkTexts = apiData.chunks
            .filter((chunk) => chunk.text && chunk.text.trim())
            .map((chunk) => chunk.text.trim())

          if (chunkTexts.length > 0) {
            extractedText = chunkTexts.join("\n\n")
            console.log(`Extracted text from ${chunkTexts.length} chunks (${extractedText.length} chars)`)
          }
        }

        if (extractedText && extractedText.length > 0) {
          console.log(`Successfully extracted ${extractedText.length} characters from image ${i + 1} using Agentic API`)
          extractedTexts.push(extractedText)
        } else {
          console.log(`No text found in image ${i + 1} using Agentic API`)
          extractedTexts.push("No readable text found")
        }

        // Log any errors from the API response
        if (responseData.errors && responseData.errors.length > 0) {
          console.warn(`Agentic API warnings for image ${i + 1}:`, responseData.errors)
        }

        // Log extraction errors
        if (responseData.extraction_error) {
          console.warn(`Agentic API extraction error for image ${i + 1}:`, responseData.extraction_error)
        }
      } else {
        throw new Error(`Unexpected response status or format: ${agenticResponse.status}`)
      }
    } catch (error) {
      console.error(`Agentic extraction error for image ${i + 1}:`, error.message)
      console.error(`Error details:`, error.response?.data || error.stack)

      let errorMessage = "Failed to extract text with Agentic API"

      if (error.code === "ECONNABORTED" || error.message.includes("timeout")) {
        errorMessage = "Agentic API extraction timed out - document may be too complex"
      } else if (error.response?.status === 401 || error.message.includes("401")) {
        errorMessage = "Agentic API authentication failed - check API key"
      } else if (error.response?.status === 429 || error.message.includes("429")) {
        errorMessage = "Agentic API rate limit exceeded - please try again later"
      } else if (error.response?.status === 400) {
        errorMessage = "Invalid request to Agentic API - check document format"
      } else if (error.response?.status >= 500) {
        errorMessage = "Agentic API server error - please try again later"
      } else if (error.message.includes("content type")) {
        errorMessage = "Invalid document format for Agentic API"
      }

      extractedTexts.push(`${errorMessage}: ${error.message}`)
    }
  }

  return extractedTexts
}

// Helper function to extract text from JSON structure
const extractTextFromJsonStructure = (jsonData) => {
  let text = ""

  if (typeof jsonData === "string") {
    return jsonData
  }

  if (Array.isArray(jsonData)) {
    return jsonData.map((item) => extractTextFromJsonStructure(item)).join(" ")
  }

  if (typeof jsonData === "object" && jsonData !== null) {
    for (const [key, value] of Object.entries(jsonData)) {
      if (typeof value === "string" && value.trim()) {
        text += value + " "
      } else if (typeof value === "object") {
        text += extractTextFromJsonStructure(value) + " "
      }
    }
  }

  return text.trim()
}

// Extract text from images using configured service
const extractTextFromImages = async (imageUrls) => {
  try {
    const textExtractionService = await getServiceForTask("text_extraction")
    console.log(`Using ${textExtractionService.serviceName} service for text extraction`)

    if (textExtractionService.serviceName === "agentic") {
      return await extractTextFromImagesAgentic(imageUrls, textExtractionService)
    } else if (textExtractionService.serviceName === "openai") {
      return await extractTextFromImagesOpenAI(imageUrls, textExtractionService)
    } else if (textExtractionService.serviceName === "gemini") {
      return await extractTextFromImagesGemini(imageUrls, textExtractionService)
    } else {
      throw new Error(`Unsupported service for text extraction: ${textExtractionService.serviceName}`)
    }
  } catch (error) {
    console.error("Text extraction failed:", error)
    throw error
  }
}

// Extract text from images using OpenAI
const extractTextFromImagesOpenAI = async (imageUrls, serviceConfig) => {
  const extractedTexts = []

  for (let i = 0; i < imageUrls.length; i++) {
    const imageUrl = imageUrls[i]
    try {
      let processedImageUrl = imageUrl
      if (imageUrl.includes("cloudinary.com")) {
        processedImageUrl = imageUrl
      } else {
        const imageResponse = await axios.get(imageUrl, {
          responseType: "arraybuffer",
          timeout: 30000,
          headers: {
            "User-Agent": "Mozilla/5.0 (compatible; TextExtractor/1.0)",
          },
        })
        if (imageResponse.status !== 200) {
          throw new Error(`Failed to fetch image: ${imageResponse.status} ${imageResponse.statusText}`)
        }
        const contentType = imageResponse.headers["content-type"]
        if (!contentType || !contentType.startsWith("image/")) {
          throw new Error(`Invalid content type: ${contentType}`)
        }
        const imageBuffer = Buffer.from(imageResponse.data)
        if (imageBuffer.length === 0) {
          throw new Error("Empty image buffer received")
        }
        const base64Image = imageBuffer.toString("base64")
        let imageFormat = "jpeg"
        if (contentType.includes("png")) imageFormat = "png"
        else if (contentType.includes("webp")) imageFormat = "webp"
        else if (contentType.includes("gif")) imageFormat = "gif"
        processedImageUrl = `data:image/${imageFormat};base64,${base64Image}`
      }

      const visionResponse = await axios.post(
        serviceConfig.apiUrl,
        {
          model: "gpt-4o-mini",
          messages: [
            {
              role: "user",
              content: [
                {
                  type: "text",
                  text: `You are a precise OCR (Optical Character Recognition) system. Your task is to extract ALL text content from this image.

Instructions:
1. Extract ALL visible text exactly as it appears
2. Maintain the original formatting, line breaks, and spacing
3. Include mathematical equations, formulas, and symbols
4. Include any handwritten text if clearly readable
5. Do not add explanations, interpretations, or additional commentary
6. If the text is in multiple languages, extract all of it
7. If there are tables, preserve the table structure
8. If no readable text is found, respond with exactly: "No readable text found"

Return only the extracted text content:`,
                },
                {
                  type: "image_url",
                  image_url: {
                    url: processedImageUrl,
                    detail: "high",
                  },
                },
              ],
            },
          ],
          max_tokens: 2000,
          temperature: 0.1,
        },
        {
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${serviceConfig.apiKey}`,
          },
          timeout: 45000,
        },
      )

      if (!visionResponse.data || !visionResponse.data.choices || visionResponse.data.choices.length === 0) {
        throw new Error("Invalid response structure from OpenAI Vision API")
      }

      const choice = visionResponse.data.choices[0]
      if (!choice.message || !choice.message.content) {
        throw new Error("No content in OpenAI Vision API response")
      }

      const extractedText = choice.message.content.trim()
      if (extractedText === "No readable text found" || extractedText.length === 0) {
        console.log(`No text found in image ${i + 1}`)
        extractedTexts.push("No readable text found")
      } else {
        console.log(`Successfully extracted ${extractedText.length} characters from image ${i + 1}`)
        extractedTexts.push(extractedText)
      }
    } catch (error) {
      let errorMessage = "Failed to extract text"
      if (error.message.includes("timeout")) {
        errorMessage = "Text extraction timed out - image may be too large"
      } else if (error.message.includes("API key")) {
        errorMessage = "API authentication failed"
      } else if (error.message.includes("rate limit")) {
        errorMessage = "Rate limit exceeded - please try again later"
      } else if (error.message.includes("content type")) {
        errorMessage = "Invalid image format"
      }
      extractedTexts.push(`${errorMessage}: ${error.message}`)
    }
  }
  return extractedTexts
}

// Extract text from images using Gemini
const extractTextFromImagesGemini = async (imageUrls, serviceConfig) => {
  const extractedTexts = []
  for (const imageUrl of imageUrls) {
    try {
      const imageResponse = await axios.get(imageUrl, {
        responseType: "arraybuffer",
        timeout: 30000,
      })

      const imageBuffer = Buffer.from(imageResponse.data)
      const base64Image = imageBuffer.toString("base64")
      const contentType = imageResponse.headers["content-type"] || "image/jpeg"

      const response = await axios.post(
        `${serviceConfig.apiUrl}?key=${serviceConfig.apiKey}`,
        {
          contents: [
            {
              parts: [
                {
                  text: "Extract all text content from this image. Return only the text as it appears, maintaining original formatting. If no text is found, respond with 'No readable text found'.",
                },
                {
                  inline_data: {
                    mime_type: contentType,
                    data: base64Image,
                  },
                },
              ],
            },
          ],
          generationConfig: {
            temperature: 0.1,
            maxOutputTokens: 1024,
          },
        },
        {
          headers: { "Content-Type": "application/json" },
          timeout: 30000,
        },
      )

      const extractedText = response.data?.candidates?.[0]?.content?.parts?.[0]?.text || "No readable text found"
      extractedTexts.push(extractedText.trim())
    } catch (error) {
      console.error("Gemini extraction error:", error.message)
      extractedTexts.push(`Failed to extract text: ${error.message}`)
    }
  }
  return extractedTexts
}

// Extract text with fallback mechanism
const extractTextFromImagesWithFallback = async (imageUrls) => {
  if (!imageUrls || imageUrls.length === 0) {
    return []
  }

  try {
    console.log(`Starting text extraction for ${imageUrls.length} images`)
    return await extractTextFromImages(imageUrls)
  } catch (error) {
    console.error("Primary text extraction failed:", error)

    // Try to get a fallback service
    try {
      const activeServices = await AiServiceConfig.getActiveServices()
      const fallbackService = activeServices.find(
        (service) => service.supportedTasks.includes("text_extraction") && !service.taskPreferences.text_extraction,
      )

      if (fallbackService) {
        console.log(`Trying fallback service: ${fallbackService.serviceName}`)
        if (fallbackService.serviceName === "agentic") {
          return await extractTextFromImagesAgentic(imageUrls, fallbackService)
        } else if (fallbackService.serviceName === "openai") {
          return await extractTextFromImagesOpenAI(imageUrls, fallbackService)
        } else if (fallbackService.serviceName === "gemini") {
          return await extractTextFromImagesGemini(imageUrls, fallbackService)
        }
      }
    } catch (fallbackError) {
      console.error("Fallback text extraction also failed:", fallbackError)
    }

    return imageUrls.map(
      (_, index) =>
        `Text extraction failed for image ${index + 1}. Please ensure the image is clear and contains readable text.`,
    )
  }
}

// Generate evaluation prompt for AI
const generateEvaluationPrompt = (question, extractedTexts) => {
  const combinedText = extractedTexts.join("\n\n--- Next Image ---\n\n")

  return `Please evaluate this student's answer to the given question.

QUESTION:
${question.question}

MAXIMUM MARKS: ${question.metadata?.maximumMarks || 10}

STUDENT'S ANSWER (extracted from images):
${combinedText}

Please provide a detailed evaluation in the following format:

ACCURACY: [Score out of 100]
MARKS AWARDED: [Marks out of ${question.metadata?.maximumMarks || 10}]

STRENGTHS:
- [List 2-3 specific strengths]

WEAKNESSES:
- [List 2-3 areas for improvement]

SUGGESTIONS:
- [List 2-3 specific recommendations]

DETAILED FEEDBACK:
[Provide constructive feedback about the answer]

Please be fair, constructive, and specific in your evaluation.`
}

// Parse evaluation response from AI
const parseEvaluationResponse = (evaluationText, question) => {
  try {
    console.log("Parsing evaluation response:", evaluationText.substring(0, 200) + "...")

    const lines = evaluationText
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.length > 0)
    const evaluation = {
      accuracy: 75,
      marks: Math.floor((question.metadata?.maximumMarks || 10) * 0.75),
      strengths: [],
      weaknesses: [],
      suggestions: [],
      feedback: "",
    }

    let currentSection = ""
    const feedbackLines = []

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]

      // Check for section headers
      if (line.toLowerCase().includes("accuracy:") || line.toLowerCase().startsWith("accuracy:")) {
        const match = line.match(/(\d+)/)
        if (match) {
          evaluation.accuracy = Math.min(100, Math.max(0, Number.parseInt(match[1])))
        }
        currentSection = ""
      } else if (line.toLowerCase().includes("marks awarded:") || line.toLowerCase().includes("marks:")) {
        const match = line.match(/(\d+)/)
        if (match) {
          evaluation.marks = Math.min(question.metadata?.maximumMarks || 10, Math.max(0, Number.parseInt(match[1])))
        }
        currentSection = ""
      } else if (line.toLowerCase().includes("strengths:") || line.toLowerCase() === "strengths") {
        currentSection = "strengths"
      } else if (line.toLowerCase().includes("weaknesses:") || line.toLowerCase() === "weaknesses") {
        currentSection = "weaknesses"
      } else if (line.toLowerCase().includes("suggestions:") || line.toLowerCase() === "suggestions") {
        currentSection = "suggestions"
      } else if (line.toLowerCase().includes("detailed feedback:") || line.toLowerCase().includes("feedback:")) {
        currentSection = "feedback"
      } else if (currentSection) {
        // Process content based on current section
        if (currentSection === "feedback") {
          feedbackLines.push(line)
        } else if (line.startsWith("- ") || line.startsWith("• ") || line.match(/^\d+\./)) {
          // Handle bullet points and numbered lists
          const content = line
            .replace(/^[-•]\s*/, "")
            .replace(/^\d+\.\s*/, "")
            .trim()
          if (content && evaluation[currentSection]) {
            evaluation[currentSection].push(content)
          }
        } else if (line.length > 0 && !line.toLowerCase().includes(":")) {
          // Handle lines without bullet points
          if (evaluation[currentSection] && Array.isArray(evaluation[currentSection])) {
            evaluation[currentSection].push(line)
          }
        }
      }
    }

    // Join feedback lines
    evaluation.feedback = feedbackLines.join(" ").trim()

    // Ensure we have at least some default content
    if (evaluation.strengths.length === 0) {
      evaluation.strengths = ["Answer shows understanding of the topic", "Relevant content provided"]
    }

    if (evaluation.weaknesses.length === 0) {
      evaluation.weaknesses = ["Could provide more detailed explanations", "Some areas need improvement"]
    }

    if (evaluation.suggestions.length === 0) {
      evaluation.suggestions = ["Include more specific examples", "Structure the answer more clearly"]
    }

    if (!evaluation.feedback || evaluation.feedback.length === 0) {
      evaluation.feedback =
        "The answer demonstrates understanding but could be enhanced with more detailed explanations and examples."
    }

    // Limit array lengths to avoid overly long responses
    evaluation.strengths = evaluation.strengths.slice(0, 5)
    evaluation.weaknesses = evaluation.weaknesses.slice(0, 5)
    evaluation.suggestions = evaluation.suggestions.slice(0, 5)

    console.log("Parsed evaluation:", JSON.stringify(evaluation, null, 2))
    return evaluation
  } catch (error) {
    console.error("Error parsing evaluation:", error)
    return generateMockEvaluation(question)
  }
}

// Generate mock evaluation (fallback)
const generateMockEvaluation = (question) => {
  const baseAccuracy = Math.floor(Math.random() * 30) + 60 // 60-90%
  const maxMarks = question.metadata?.maximumMarks || 10
  const marks = Math.floor((baseAccuracy / 100) * maxMarks)

  return {
    accuracy: baseAccuracy,
    marks: marks,
    strengths: [
      "Shows understanding of core concepts",
      "Attempts to address the question requirements",
      "Demonstrates basic knowledge of the topic",
    ],
    weaknesses: [
      "Could provide more detailed explanations",
      "Some concepts could be explained more clearly",
      "Missing some key points",
    ],
    suggestions: [
      "Include more specific examples to support your points",
      "Structure your answer with clear sections or headings",
      "Provide more comprehensive coverage of the topic",
    ],
    feedback:
      "The answer shows a good understanding of the topic and addresses the main question. However, it could be improved with more detailed explanations, specific examples, and better organization. Consider expanding on key concepts and providing clearer connections between different points.",
  }
}

// Generate custom evaluation prompt
const generateCustomEvaluationPrompt = (question, extractedTexts, userPrompt, options = {}) => {
  const { includeExtractedText = true, includeQuestionDetails = true, maxMarks } = options

  let prompt = `You are an expert evaluator. Please evaluate this student's answer based on the following custom evaluation criteria:\n\n`

  // Add custom evaluation criteria
  prompt += `EVALUATION CRITERIA:\n${userPrompt}\n\n`

  // Add question details if requested
  if (includeQuestionDetails && question) {
    prompt += `QUESTION DETAILS:\n`
    prompt += `Question: ${question.question}\n`
    if (question.metadata?.difficultyLevel) {
      prompt += `Difficulty Level: ${question.metadata.difficultyLevel}\n`
    }
    if (maxMarks || question.metadata?.maximumMarks) {
      prompt += `Maximum Marks: ${maxMarks || question.metadata.maximumMarks}\n`
    }
    if (question.metadata?.keywords && question.metadata.keywords.length > 0) {
      prompt += `Keywords: ${question.metadata.keywords.join(", ")}\n`
    }
    prompt += "\n"
  }

  // Add extracted text if available and requested
  if (includeExtractedText && extractedTexts && extractedTexts.length > 0) {
    const combinedText = extractedTexts.join("\n\n--- Next Image ---\n\n")
    prompt += `STUDENT'S ANSWER (extracted from images):\n${combinedText}\n\n`
  }

  // Add response format
  prompt += `Please provide a detailed evaluation in the following format:

ACCURACY: [Score out of 100]
MARKS AWARDED: [Marks out of ${maxMarks || question?.metadata?.maximumMarks || 10}]

STRENGTHS:
- [List 2-3 specific strengths based on your evaluation criteria]

WEAKNESSES:
- [List 2-3 areas for improvement based on your evaluation criteria]

SUGGESTIONS:
- [List 2-3 specific recommendations for improvement]

DETAILED FEEDBACK:
[Provide comprehensive feedback based on your custom evaluation criteria]

Please be fair, constructive, and specific in your evaluation according to the provided criteria.`

  return prompt
}

module.exports = {
  validateTextRelevanceToQuestion,
  extractTextFromImages,
  extractTextFromImagesWithFallback,
  generateEvaluationPrompt,
  parseEvaluationResponse,
  generateMockEvaluation,
  generateCustomEvaluationPrompt,
  getServiceForTask,
}

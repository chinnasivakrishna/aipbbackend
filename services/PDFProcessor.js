const axios = require("axios")
const { DataAPIClient } = require("@datastax/astra-db-ts")
const { v4: uuidv4 } = require("uuid")
const { GoogleGenerativeAI } = require("@google/generative-ai")
const pdf = require("pdf-parse")

class EnhancedPDFProcessor {
  constructor(config) {
    this.chunkrApiKey = config.chunkrApiKey
    this.embeddingModelName = config.embeddingModel || "text-embedding-004"
    this.chatModelName = config.chatModel || "gemini-1.5-flash"
    this.vectorDimensions = Number.parseInt(config.vectorDimensions) || 768
    this.chunkSize = Number.parseInt(config.chunkSize) || 200
    this.chunkOverlap = Number.parseInt(config.chunkOverlap) || 30
    this.maxContextChunks = Number.parseInt(config.maxContextChunks) || 5

    // Initialize Gemini AI
    this.genAI = new GoogleGenerativeAI(config.geminiApiKey)
    this.chatModel = this.genAI.getGenerativeModel({ model: this.chatModelName })

    this.astraClient = new DataAPIClient(config.astraToken)
    this.db = this.astraClient.db(config.astraApiEndpoint, {
      keyspace: config.keyspace,
    })
    this.baseCollectionName = config.collectionName || "book_knowledge_base"
  }

  getBookCollectionName(bookId) {
    if (!bookId) {
      throw new Error("Book ID is required for collection name")
    }
    const cleanBookId = bookId.toString().replace(/[^a-zA-Z0-9_]/g, "_")
    return `${this.baseCollectionName}_book_${cleanBookId}`
  }

  async initializeBookDB(bookId) {
    try {
      if (!bookId) {
        throw new Error("Book ID is required for initialization")
      }

      const collectionName = this.getBookCollectionName(bookId)
      const collections = await this.db.listCollections()
      const existingCollection = collections.find((col) => col.name === collectionName)

      if (existingCollection) {
        const existingDimension = existingCollection.options?.vector?.dimension
        if (existingDimension && existingDimension !== this.vectorDimensions) {
          console.log(
            `Adjusting vector dimensions from ${this.vectorDimensions} to ${existingDimension} for existing collection`,
          )
          this.vectorDimensions = existingDimension
        }
      } else {
        const modelDimensions = this.getModelDimensions(this.embeddingModelName)
        if (modelDimensions !== this.vectorDimensions) {
          console.log(`Setting vector dimensions to ${modelDimensions} for model ${this.embeddingModelName}`)
          this.vectorDimensions = modelDimensions
        }
        await this.createBookCollection(collectionName)
      }

      this.collection = this.db.collection(collectionName)
      this.currentBookId = bookId
      this.currentCollectionName = collectionName

      return collectionName
    } catch (error) {
      throw error
    }
  }

  getModelDimensions(modelName) {
    const dimensionMap = {
      "text-embedding-004": 768,
      "embedding-001": 768,
      "text-embedding-3-small": 1536, // Fallback for OpenAI models
      "text-embedding-3-large": 3072,
      "text-embedding-ada-002": 1536,
    }

    return dimensionMap[modelName] || 768
  }

  async createBookCollection(collectionName) {
    await this.db.createCollection(collectionName, {
      vector: { dimension: this.vectorDimensions, metric: "cosine" },
    })
  }

  async processPDFFromURL(pdfUrl, fileName, userId = null, metadata = {}) {
    if (!metadata.bookId) {
      throw new Error("Book ID is required for PDF processing")
    }

    try {
      const response = await axios.get(pdfUrl, {
        responseType: "arraybuffer",
        timeout: 30000,
      })

      const pdfBuffer = Buffer.from(response.data)
      const fileSizeBytes = pdfBuffer.length
      const fileSizeMB = (fileSizeBytes / (1024 * 1024)).toFixed(2)

      return await this.processPDFBuffer(pdfBuffer, fileName, userId, {
        ...metadata,
        fileSizeBytes,
        fileSizeMB,
      })
    } catch (error) {
      throw new Error(`Failed to process PDF from URL: ${error.message}`)
    }
  }

  async processPDFBuffer(pdfBuffer, fileName, userId = null, metadata = {}) {
    const startTime = Date.now()
    const timingMetrics = {
      textExtraction: 0,
      chunking: 0,
      embedding: 0,
      dbInsert: 0,
      total: 0,
    }

    const textExtractionStart = Date.now()
    const pdfData = await pdf(pdfBuffer)
    const totalPages = pdfData.numpages
    const extractedText = pdfData.text
    timingMetrics.textExtraction = Date.now() - textExtractionStart

    if (!metadata.bookId) {
      throw new Error("Book ID is required for PDF processing")
    }

    await this.initializeBookDB(metadata.bookId)

    // Check for existing embeddings first
    const existingDocs = await this.collection
      .find({
        file_name: fileName,
        book_id: metadata.bookId,
        ...(userId && { user_id: userId }),
      })
      .toArray()

    if (existingDocs.length > 0) {
      return {
        taskId: uuidv4(),
        fileName: fileName,
        bookId: metadata.bookId,
        collectionName: this.currentCollectionName,
        totalPages: totalPages,
        fileSizeMB: metadata.fileSizeMB || "N/A",
        timing: {
          textExtraction: timingMetrics.textExtraction,
          chunking: 0,
          embedding: 0,
          dbInsert: 0,
          total: Date.now() - startTime,
        },
        summary: {
          chunks_inserted: existingDocs.length,
          total_words: existingDocs.reduce((sum, doc) => sum + (doc.word_count || 0), 0),
          book_id: metadata.bookId,
          already_exists: true,
        },
        modelUsed: this.embeddingModelName,
        vectorSize: this.vectorDimensions,
        tokensUsed: existingDocs.reduce((sum, doc) => sum + (doc.word_count || 0), 0) * 1.33,
      }
    }

    const chunkingStart = Date.now()
    const chunks = await this.extractTextFromPDFBuffer(pdfBuffer)
    timingMetrics.chunking = Date.now() - chunkingStart

    if (chunks.length === 0) {
      throw new Error("No content could be extracted from PDF")
    }

    const embeddingStart = Date.now()
    const embeddings = await this.generateEmbeddingsWithRetry(chunks)
    timingMetrics.embedding = Date.now() - embeddingStart

    if (embeddings.length !== chunks.length) {
      throw new Error(`Embedding count mismatch: ${embeddings.length} vs ${chunks.length}`)
    }

    const totalWords = chunks.reduce((sum, text) => sum + text.split(/\s+/).length, 0)
    const tokensUsed = Math.round(totalWords * 1.33)

    const documents = chunks.map((text, idx) => ({
      _id: uuidv4(),
      file_name: fileName,
      book_id: metadata.bookId,
      user_id: userId || "anonymous",
      text_content: text,
      $vector: embeddings[idx],
      chunk_index: idx,
      processed_at: new Date().toISOString(),
      word_count: text.split(/\s+/).length,
      char_count: text.length,
      ...metadata,
      is_public: metadata.isPublic || false,
      access_level: metadata.accessLevel || "private",
    }))

    const dbInsertStart = Date.now()
    await this.collection.insertMany(documents)
    timingMetrics.dbInsert = Date.now() - dbInsertStart
    timingMetrics.total = Date.now() - startTime

    return {
      taskId: uuidv4(),
      fileName: fileName,
      bookId: metadata.bookId,
      collectionName: this.currentCollectionName,
      totalPages: totalPages,
      fileSizeMB: metadata.fileSizeMB || "N/A",
      timing: {
        textExtraction: timingMetrics.textExtraction,
        chunking: timingMetrics.chunking,
        embedding: timingMetrics.embedding,
        dbInsert: timingMetrics.dbInsert,
        total: timingMetrics.total,
      },
      summary: {
        chunks_inserted: documents.length,
        total_words: totalWords,
        book_id: metadata.bookId,
      },
      modelUsed: this.embeddingModelName,
      vectorSize: this.vectorDimensions,
      tokensUsed: tokensUsed,
    }
  }

  async answerQuestion(question, fileName = null, userId = null, requireAuth = false, bookId = null) {
    const startTime = Date.now()
    const timingMetrics = {
      retrieval: 0,
      processing: 0,
      generation: 0,
      total: 0,
    }

    if (!bookId) {
      throw new Error("Book ID is required for question answering")
    }

    try {
      await this.initializeBookDB(bookId)

      const searchFilter = { book_id: bookId }
      if (fileName) searchFilter.file_name = fileName
      if (userId && requireAuth) searchFilter.user_id = userId
      if (!requireAuth && !userId) {
        searchFilter.$or = [{ is_public: true }, { access_level: "public" }]
      }

      const retrievalStart = Date.now()
      const allDocs = await this.collection.find(searchFilter).limit(50).toArray()
      timingMetrics.retrieval = Date.now() - retrievalStart

      if (allDocs.length === 0) {
        return {
          answer: `No relevant documents found in this book's knowledge base.`,
          confidence: 0,
          sources: 0,
          timing: timingMetrics,
          modelUsed: this.chatModelName,
          tokensUsed: 0,
        }
      }

      const processingStart = Date.now()
      const relevantResults = await this.performFastRetrieval(question, allDocs)
      timingMetrics.processing = Date.now() - processingStart

      const generationStart = Date.now()
      const answerResult = await this.generateUltraFastAnswer(question, relevantResults, bookId)
      timingMetrics.generation = Date.now() - generationStart
      timingMetrics.total = Date.now() - startTime

      const avgSimilarity = relevantResults.reduce((sum, r) => sum + (r.$similarity || 0.5), 0) / relevantResults.length
      const confidence = Math.max(Math.round(avgSimilarity * 100), 75)

      return {
        answer: answerResult.answer,
        confidence: confidence,
        sources: relevantResults.length,
        timing: timingMetrics,
        bookId: bookId,
        method: "ultra_fast_retrieval",
        modelUsed: this.chatModelName,
        tokensUsed: answerResult.tokensUsed || 0,
      }
    } catch (error) {
      timingMetrics.total = Date.now() - startTime
      return {
        answer: `Error: ${error.message}`,
        confidence: 0,
        sources: 0,
        timing: timingMetrics,
        modelUsed: this.chatModelName,
        tokensUsed: 0,
      }
    }
  }

  async generateUltraFastAnswer(question, relevantChunks, bookId) {
    try {
      const topChunks = relevantChunks.slice(0, 2)
  
      const context = topChunks
        .map((chunk, index) => {
          const similarity = Math.round((chunk.$similarity || 0) * 100)
          return `[${index + 1}] ${chunk.text_content.substring(0, 200)}... (${similarity}% match)`
        })
        .join("\n\n")
  
      // Gemini uses a different message format than OpenAI
      const prompt = `Context: ${context}
  
  Question: ${question}
  
  Answer in 1-2 sentences:`
  
      const result = await this.chatModel.generateContent({
        contents: [
          {
            parts: [
              { text: "You are a helpful AI assistant that provides concise answers in 1-2 sentences." },
              { text: prompt }
            ]
          }
        ]
      })
  
      const response = await result.response
      const answer = response.text()
      
      // Estimate tokens based on text length
      const tokensUsed = Math.round((prompt.length + answer.length) / 4)
  
      return {
        answer: answer,
        method: "ultra-fast-gemini",
        contextUsed: topChunks.length,
        bookId: bookId,
        tokensUsed: tokensUsed,
      }
    } catch (error) {
      console.error("Gemini API error:", error)
      return {
        answer: "Unable to generate response. Please try again.",
        method: "error-fallback",
        bookId: bookId,
        tokensUsed: 0,
      }
    }
  }

  async checkExistingEmbeddings(fileName = null, userId = null, bookId = null) {
    try {
      if (!bookId) {
        throw new Error("Book ID is required to check embeddings")
      }

      await this.initializeBookDB(bookId)

      const searchFilter = { book_id: bookId }
      if (fileName) searchFilter.file_name = fileName
      if (userId) searchFilter.user_id = userId

      const existingDocs = await this.collection.find(searchFilter).toArray()

      return {
        exists: existingDocs.length > 0,
        count: existingDocs.length,
        files: [...new Set(existingDocs.map((doc) => doc.file_name))],
        bookId: bookId,
        collectionName: this.currentCollectionName,
      }
    } catch (error) {
      return {
        exists: false,
        count: 0,
        files: [],
        bookId: bookId,
        error: error.message,
      }
    }
  }

  async deleteExistingEmbeddings(fileName, userId = null, bookId = null) {
    try {
      if (!bookId) {
        throw new Error("Book ID is required to delete embeddings")
      }

      await this.initializeBookDB(bookId)

      const deleteFilter = {
        file_name: fileName,
        book_id: bookId,
      }
      if (userId) deleteFilter.user_id = userId

      const result = await this.collection.deleteMany(deleteFilter)

      return {
        success: true,
        deletedCount: result.deletedCount,
        fileName: fileName,
        bookId: bookId,
      }
    } catch (error) {
      return {
        success: false,
        error: error.message,
        fileName: fileName,
        bookId: bookId,
      }
    }
  }

  async getBookKnowledgeBaseStatus(bookId, userId = null) {
    try {
      if (!bookId) {
        throw new Error("Book ID is required")
      }

      const embeddingStatus = await this.checkExistingEmbeddings(null, userId, bookId)

      return {
        success: true,
        bookId: bookId,
        collectionName: this.getBookCollectionName(bookId),
        totalEmbeddings: embeddingStatus.count,
        availableFiles: embeddingStatus.files,
        hasContent: embeddingStatus.exists,
      }
    } catch (error) {
      return {
        success: false,
        bookId: bookId,
        message: "Failed to get book knowledge base status",
        error: error.message,
      }
    }
  }

  calculateSimilarity(queryEmbedding, docEmbedding) {
    let dotProduct = 0
    let queryMagnitude = 0
    let docMagnitude = 0

    for (let i = 0; i < Math.min(queryEmbedding.length, docEmbedding.length); i++) {
      dotProduct += queryEmbedding[i] * docEmbedding[i]
      queryMagnitude += queryEmbedding[i] * queryEmbedding[i]
      docMagnitude += docEmbedding[i] * docEmbedding[i]
    }

    queryMagnitude = Math.sqrt(queryMagnitude)
    docMagnitude = Math.sqrt(docMagnitude)

    if (queryMagnitude === 0 || docMagnitude === 0) {
      return 0
    }

    return dotProduct / (queryMagnitude * docMagnitude)
  }

  async performFastRetrieval(question, documents) {
    try {
      const queryEmbedding = await this.generateSingleEmbedding(question.substring(0, 500))

      const scoredDocs = documents.map((doc) => ({
        ...doc,
        $similarity: this.calculateSimilarity(queryEmbedding, doc.$vector || []),
      }))

      return scoredDocs.sort((a, b) => b.$similarity - a.$similarity).slice(0, this.maxContextChunks)
    } catch (error) {
      console.error("Error in performFastRetrieval:", error)
      return documents.slice(0, this.maxContextChunks)
    }
  }

  async extractTextFromPDFBuffer(pdfBuffer) {
    try {
      const data = await pdf(pdfBuffer, {
        normalizeWhitespace: true,
        disableCombineTextItems: false,
      })

      const extractedText = data.text
      if (extractedText.length < 100) {
        return ["This PDF contains minimal extractable text."]
      }

      const chunks = this.createFastChunks(extractedText, this.chunkSize, this.chunkOverlap)
      return chunks
    } catch (error) {
      return ["Error processing PDF document: " + error.message]
    }
  }

  preprocessText(text) {
    return text
      .replace(/\f/g, "\n")
      .replace(/\r\n/g, "\n")
      .replace(/\r/g, "\n")
      .replace(/\t/g, " ")
      .replace(/\u00A0/g, " ")
      .replace(/[^\x20-\x7E\n]/g, " ")
      .replace(/\s{2,}/g, " ")
      .replace(/\n{3,}/g, "\n\n")
      .trim()
  }

  createFastChunks(text, chunkSize = 200, overlap = 30) {
    const cleanText = this.preprocessText(text)
    if (cleanText.length < 100) {
      return ["Document contains minimal extractable text content."]
    }

    const chunks = []
    const words = cleanText.split(/\s+/)
    const wordsPerChunk = Math.floor(chunkSize / 5)

    for (let i = 0; i < words.length; i += wordsPerChunk - Math.floor(overlap / 5)) {
      const chunk = words.slice(i, i + wordsPerChunk).join(" ")
      if (chunk.trim().length > 50) {
        chunks.push(chunk.trim())
      }
    }

    return chunks.length > 0 ? chunks : ["Unable to extract meaningful content from this document."]
  }

  async generateSingleEmbedding(text) {
    try {
      const embeddingModel = this.genAI.getGenerativeModel({ model: this.embeddingModelName })
      const result = await embeddingModel.embedContent(text.substring(0, 4000))
      let embedding = result.embedding.values

      // Ensure embedding matches expected dimensions
      if (embedding.length !== this.vectorDimensions) {
        console.log(`Adjusting embedding dimension from ${embedding.length} to ${this.vectorDimensions}`)

        if (embedding.length > this.vectorDimensions) {
          embedding = embedding.slice(0, this.vectorDimensions)
        } else {
          const padding = new Array(this.vectorDimensions - embedding.length).fill(0)
          embedding = [...embedding, ...padding]
        }
      }

      return embedding
    } catch (error) {
      console.error("Error generating single embedding:", error)
      return new Array(this.vectorDimensions).fill(0.001)
    }
  }

  async generateEmbeddingsWithRetry(texts, maxRetries = 1) {
    const embeddings = []
    const batchSize = 5 // Smaller batch size for Gemini

    for (let i = 0; i < texts.length; i += batchSize) {
      const batch = texts.slice(i, i + batchSize)

      try {
        const batchEmbeddings = []
        
        for (const text of batch) {
          const embedding = await this.generateSingleEmbedding(text)
          batchEmbeddings.push(embedding)
          
          // Small delay to avoid rate limiting
          await new Promise((resolve) => setTimeout(resolve, 100))
        }

        embeddings.push(...batchEmbeddings)

        if (i + batchSize < texts.length) {
          await new Promise((resolve) => setTimeout(resolve, 200))
        }
      } catch (error) {
        console.error(`Error generating embeddings for batch ${i}:`, error)
        for (let j = 0; j < batch.length; j++) {
          embeddings.push(new Array(this.vectorDimensions).fill(0.001))
        }
      }
    }

    return embeddings
  }
}

module.exports = EnhancedPDFProcessor
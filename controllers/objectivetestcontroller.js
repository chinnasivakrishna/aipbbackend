const ObjectiveTest = require("../models/ObjectiveTest");
const ObjectiveTestQuestion = require("../models/ObjectiveTestQuestion");
const TestResult = require("../models/TestResult");
const User = require("../models/User");
const UserProfile = require("../models/UserProfile");
const path = require("path");
const {
  generatePresignedUrl,
  generateGetPresignedUrl,
  deleteObject,
} = require("../utils/s3");
const { Client } = require("twilio/lib/base/BaseTwilio");
const { default: mongoose } = require("mongoose");

// Utility function to format completion time
const formatCompletionTime = (milliseconds) => {
  const totalSeconds = Math.floor(milliseconds / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  if (minutes > 0) {
    return `${minutes}m ${seconds}s`;
  } else {
    return `${seconds}s`;
  }
};

exports.uploadImage = async (req, res) => {
  try {
    const businessName = req.user.businessName;
    console.log(businessName);
    const { fileName, contentType } = req.body;

    if (!fileName || !contentType) {
      return res.status(400).json({
        success: false,
        message: "File name and content type are required",
      });
    }

    // Create unique filename with timestamp
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    const ext = path.extname(fileName);
    const key = `${businessName}/test/covers/cover-${uniqueSuffix}${ext}`;
    console.log(key);
    const uploadUrl = await generatePresignedUrl(key, contentType);
    console.log(uploadUrl);
    downloadUrl = await generateGetPresignedUrl(key, 604800);
    console.log(downloadUrl);
    res.status(200).json({
      success: true,
      message: "Image uploaded successfully",
      uploadUrl,
      key,
    });
  } catch (error) {
    console.error("Upload image error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to generate upload URL",
      error: error.message,
    });
  }
};

exports.createTest = async (req, res) => {
  try {
    const {
      name,
      description,
      category,
      subcategory,
      Estimated_time,
      imageKey,
      isTrending,
      isHighlighted,
      isActive,
      instructions,
    } = req.body;
    console.log(req.user.userId);
    const clientId = req.user.userId;
    const client = await User.findOne({ userId: req.user.userId });
    if (!client) {
      return res.status(404).json({
        success: false,
        message: "Client not found",
      });
    }

    // Validate required fields
    if (!name) {
      return res.status(400).json({
        success: false,
        message: "Test name is required",
      });
    }

    // Generate presigned URL for the image if imageKey is provided
    let imageUrl = "";
    if (imageKey) {
      try {
        imageUrl = await generateGetPresignedUrl(imageKey, 604800); // 7 days expiry
      } catch (error) {
        console.error("Error generating presigned URL for image:", error);
        // Continue without image URL if generation fails
      }
    }

    const test = await ObjectiveTest.create({
      name,
      clientId,
      description,
      category,
      subcategory,
      Estimated_time,
      imageKey,
      imageUrl,
      isTrending,
      isHighlighted,
      isActive,
      instructions,
    });

    res.status(201).json({
      success: true,
      message: "Test created successfully",
      test,
    });
  } catch (error) {
    console.error("Create test error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to create test",
      error: error.message,
    });
  }
};

exports.getTest = async (req, res) => {
  try {
    const clientId = req.user.userId;
    console.log(clientId);
    const client = await User.findOne({ userId: clientId });
    if (!client) {
      res.status(400).json({ message: "client not found" });
    }
    const { id } = req.params;

    if (!id) {
      return res.status(400).json({
        success: false,
        message: "Test ID is required",
      });
    }

    const test = await ObjectiveTest.findById(id);

    if (!test) {
      return res.status(404).json({
        success: false,
        message: "Test not found",
      });
    }

    // Generate fresh presigned URL if imageKey exists
    if (test.imageKey) {
      try {
        const freshImageUrl = await generateGetPresignedUrl(
          test.imageKey,
          604800
        );
        test.imageUrl = freshImageUrl;
      } catch (error) {
        console.error("Error generating fresh presigned URL:", error);
        // Keep existing URL if generation fails
      }
    }

    res.status(200).json({
      success: true,
      test,
    });
  } catch (error) {
    console.error("Get test error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to get test",
      error: error.message,
    });
  }
};

exports.getAllTests = async (req, res) => {
  try {
    const clientId = req.user.userId;
    console.log(clientId);
    const client = await User.findOne({ userId: clientId });
    if (!client) {
      res.status(400).json({ message: "client not found" });
    }
    const tests = await ObjectiveTest.find({
      isActive: true,
      clientId: clientId,
    });

    // Generate fresh presigned URLs for all tests with images
    const testsWithUrls = await Promise.all(
      tests.map(async (test) => {
        if (test.imageKey) {
          try {
            const freshImageUrl = await generateGetPresignedUrl(
              test.imageKey,
              604800
            );
            test.imageUrl = freshImageUrl;
          } catch (error) {
            console.error(
              "Error generating presigned URL for test:",
              test._id,
              error
            );
          }
        }
        return test;
      })
    );

    res.status(200).json({
      success: true,
      tests: testsWithUrls,
    });
  } catch (error) {
    console.error("Get all tests error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to get tests",
      error: error.message,
    });
  }
};

exports.getAllTestsForMobile = async (req, res) => {
  try {
    // Use req.clientId (set by middleware) or fallback to req.params.clientId
    const clientId = req.clientId || req.params.clientId;
    const { limit = 10, page = 1, category, subcategory } = req.query;

    console.log("Fetching tests for mobile for client:", clientId);

    // Validate client exists
    const client = await User.findOne({ userId: clientId });
    if (!client) {
      return res.status(400).json({
        success: false,
        message: "Client not found",
      });
    }

    // Calculate pagination
    const skip = (parseInt(page) - 1) * parseInt(limit);

    // Build filter for tests
    const filter = {
      isActive: true,
      clientId: clientId,
    };
    if (category) filter.category = category;
    if (subcategory) filter.subcategory = subcategory;

    // Get all tests for this client (without pagination for categorization)
    const allTests = await ObjectiveTest.find({
      isActive: true,
      clientId: clientId,
    });

    // Generate fresh presigned URLs for all tests with images
    const testsWithUrls = await Promise.all(
      allTests.map(async (test) => {
        if (test.imageKey) {
          try {
            const freshImageUrl = await generateGetPresignedUrl(
              test.imageKey,
              604800
            );
            test.imageUrl = freshImageUrl;
          } catch (error) {
            console.error(
              "Error generating presigned URL for test:",
              test._id,
              error
            );
          }
        }
        return test;
      })
    );

    // Format response for mobile
    const formatTestForMobile = (test) => ({
      test_id: test._id.toString(),
      name: test.name,
      description: test.description,
      category: test.category || "",
      subcategory: test.subcategory || "",
      image: test.imageKey || "",
      image_url: test.imageUrl || "",
      estimated_time: test.Estimated_time,
      instructions: test.instructions,
      is_trending: test.isTrending,
      is_highlighted: test.isHighlighted,
      is_active: test.isActive,
      created_at: test.createdAt,
      updated_at: test.updatedAt,
    });

    // Group tests by category and subcategory
    const groupedTests = {};

    testsWithUrls.forEach((test) => {
      const category = test.category || "Uncategorized";
      const subcategory = test.subcategory || "General";

      if (!groupedTests[category]) {
        groupedTests[category] = {
          category: category,
          subcategories: {},
        };
      }

      if (!groupedTests[category].subcategories[subcategory]) {
        groupedTests[category].subcategories[subcategory] = [];
      }

      groupedTests[category].subcategories[subcategory].push(
        formatTestForMobile(test)
      );
    });

    // Convert to array format and apply pagination
    const categoriesArray = Object.values(groupedTests).map((category) => {
      const subcategoriesArray = Object.entries(category.subcategories).map(
        ([subName, tests]) => ({
          name: subName,
          count: tests.length,
          tests: tests.slice(skip, skip + parseInt(limit)),
        })
      );

      return {
        category: category.category,
        subcategories: subcategoriesArray,
        total_tests: Object.values(category.subcategories).reduce(
          (sum, tests) => sum + tests.length,
          0
        ),
      };
    });

    // Calculate pagination metadata
    const totalTests = testsWithUrls.length;
    const totalPages = Math.ceil(totalTests / parseInt(limit));
    const hasNextPage = parseInt(page) < totalPages;
    const hasPrevPage = parseInt(page) > 1;

    const mobileTestsResponse = {
      success: true,
      data: {
        categories: categoriesArray,
        totalTests: totalTests,
        pagination: {
          current_page: parseInt(page),
          total_pages: totalPages,
          total_items: totalTests,
          items_per_page: parseInt(limit),
          has_next_page: hasNextPage,
          has_prev_page: hasPrevPage,
        },
      },
      meta: {
        clientId,
        timestamp: new Date().toISOString(),
        filters_applied: { category, subcategory },
      },
    };

    res.status(200).json(mobileTestsResponse);
  } catch (error) {
    console.error("Get all tests for mobile error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to get tests",
      error: {
        code: "TESTS_FETCH_ERROR",
        details: error.message,
      },
    });
  }
};

exports.updateTest = async (req, res) => {
  try {
    const clientId = req.user.userId;
    console.log(clientId);
    const client = await User.findOne({ userId: clientId });
    if (!client) {
      res.status(400).json({ message: "client not found" });
    }
    const { id } = req.params;
    const {
      name,
      description,
      Estimated_time,
      imageKey,
      isTrending,
      isHighlighted,
      isActive,
      instructions,
    } = req.body;

    if (!id) {
      return res.status(400).json({
        success: false,
        message: "Test ID is required",
      });
    }

    const test = await ObjectiveTest.findById(id);
    if (!test) {
      return res.status(404).json({
        success: false,
        message: "Test not found",
      });
    }

    // Handle image update
    let imageUrl = test.imageUrl;
    if (imageKey && imageKey !== test.imageKey) {
      // Delete old image if it exists and is different
      if (test.imageKey) {
        try {
          await deleteObject(test.imageKey);
          console.log("Successfully deleted old image from S3:", test.imageKey);
        } catch (error) {
          console.error("Error deleting old image from S3:", error);
        }
      }

      // Generate new presigned URL
      try {
        imageUrl = await generateGetPresignedUrl(imageKey, 604800);
      } catch (error) {
        console.error("Error generating presigned URL for new image:", error);
        return res.status(500).json({
          success: false,
          message: "Failed to generate image URL",
        });
      }
    }

    const updatedTest = await ObjectiveTest.findByIdAndUpdate(
      id,
      {
        name,
        description,
        Estimated_time,
        imageKey,
        imageUrl,
        isTrending,
        isHighlighted,
        isActive,
        instructions,
      },
      { new: true }
    );

    res.status(200).json({
      success: true,
      message: "Test updated successfully",
      test: updatedTest,
    });
  } catch (error) {
    console.error("Update test error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to update test",
      error: error.message,
    });
  }
};

exports.deleteTest = async (req, res) => {
  try {
    const clientId = req.user.userId;
    console.log(clientId);
    const client = await User.findOne({ userId: clientId });
    if (!client) {
      res.status(400).json({ message: "client not found" });
    }
    const { id } = req.params;

    if (!id) {
      return res.status(400).json({
        success: false,
        message: "Test ID is required",
      });
    }

    const test = await ObjectiveTest.findById(id);
    if (!test) {
      return res.status(404).json({
        success: false,
        message: "Test not found",
      });
    }

    // Delete image from S3 if it exists
    if (test.imageKey) {
      try {
        await deleteObject(test.imageKey);
        console.log("Successfully deleted image from S3:", test.imageKey);
      } catch (error) {
        console.error("Error deleting image from S3:", error);
      }
    }

    await ObjectiveTest.findByIdAndDelete(id);

    res.status(200).json({
      success: true,
      message: "Test deleted successfully",
    });
  } catch (error) {
    console.error("Delete test error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to delete test",
      error: error.message,
    });
  }
};

// Submit test with all answers
exports.submitTest = async (req, res) => {
  try {
    const { testId } = req.params;
    const { answers, totalQuestions, answeredQuestions } = req.body;
    const userId = req.user.id;
    const clientId = req.clientId;
    console.log(testId, userId, clientId);

    // Validate test exists
    const test = await ObjectiveTest.findById(testId);
    if (!test) {
      return res.status(404).json({
        success: false,
        message: "Test not found",
      });
    }
    console.log(test);

    // Get all questions for this test
    const questions = await ObjectiveTestQuestion.find({ test: testId });
    console.log(questions);
    if (questions.length === 0) {
      return res.status(400).json({
        success: false,
        message: "No questions found for this test",
      });
    }

    // Find existing test result (should be in_progress)
    const existingResult = await TestResult.findOne({
      userId,
      testId,
      status: "in_progress",
    });

    if (!existingResult) {
      return res.status(400).json({
        success: false,
        message: "Test not started. Please start the test first.",
      });
    }

    // Calculate completion time
    const endTime = new Date();
    const completionTimeMs =
      endTime.getTime() - existingResult.startTime.getTime();
    const completionTimeSeconds = formatCompletionTime(completionTimeMs);

    // Calculate results
    let correctAnswers = 0;
    let levelResults = {
      L1: { total: 0, correct: 0, score: 0 },
      L2: { total: 0, correct: 0, score: 0 },
      L3: { total: 0, correct: 0, score: 0 },
    };

    // Process each question
    questions.forEach((question) => {
      const userAnswer = answers[question._id];
      const isCorrect = userAnswer === question.correctAnswer;
      console.log(userAnswer, question.correctAnswer);
      if (isCorrect) {
        correctAnswers++;
      }

      // Update level breakdown
      const level = question.difficulty || "L1";
      levelResults[level].total++;
      if (isCorrect) {
        levelResults[level].correct++;
      }
    });

    // Calculate scores
    const overallScore = (correctAnswers / totalQuestions) * 100;

    // Calculate level-specific scores
    Object.keys(levelResults).forEach((level) => {
      if (levelResults[level].total > 0) {
        levelResults[level].score =
          (levelResults[level].correct / levelResults[level].total) * 100;
      }
    });

    // Update the existing test result with completion data
    existingResult.answers = answers;
    existingResult.score = Math.round(overallScore * 100) / 100; // Round to 2 decimal places
    existingResult.totalQuestions = totalQuestions;
    existingResult.answeredQuestions = answeredQuestions;
    existingResult.correctAnswers = correctAnswers;
    existingResult.levelBreakdown = levelResults;
    existingResult.completionTime = completionTimeSeconds; // Store in milliseconds
    existingResult.status = "completed";
    existingResult.submittedAt = new Date();

    await existingResult.save();

    // Update user profile with comprehensive test data
    try {
      // Get current user profile
      const userProfile = await UserProfile.findOne({ userId: userId });
      if (!userProfile) {
        console.error("User profile not found for userId:", userId);
        return res.status(404).json({
          success: false,
          message: "User profile not found",
        });
      }

      // Calculate new averages and stats
      const newTotalScore = userProfile.totalTestScore + Math.round(overallScore);
      const newCompletedTests = userProfile.completedTests + 1;
      const newAverageScore = newTotalScore / newCompletedTests;

      // Calculate new accuracy rate
      const newTotalQuestions = userProfile.performanceStats.totalQuestionsAttempted + answeredQuestions;
      const newTotalCorrect = userProfile.performanceStats.totalCorrectAnswers + correctAnswers;
      const newAccuracyRate = newTotalQuestions > 0 ? (newTotalCorrect / newTotalQuestions) * 100 : 0;

      // Update best/worst scores
      const newBestScore = Math.max(userProfile.performanceStats.bestScore, Math.round(overallScore));
      const newWorstScore = Math.min(userProfile.performanceStats.worstScore, Math.round(overallScore));

      // Calculate average completion time
      const currentAvgTime = parseFloat(userProfile.performanceStats.averageCompletionTime) || 0;
      const newAvgTime = newCompletedTests > 1 
        ? ((currentAvgTime * (newCompletedTests - 1)) + parseFloat(completionTimeSeconds)) / newCompletedTests
        : parseFloat(completionTimeSeconds);

      // Update level performance
      const updatedLevelPerformance = { ...userProfile.levelPerformance };
      Object.keys(levelResults).forEach(level => {
        if (levelResults[level].total > 0) {
          const levelStats = updatedLevelPerformance[level];
          const newTotalTests = levelStats.totalTests + 1;
          const newTotalQuestions = levelStats.totalQuestions + levelResults[level].total;
          const newCorrectAnswers = levelStats.correctAnswers + levelResults[level].correct;
          const newAvgScore = newTotalTests > 1 
            ? ((levelStats.averageScore * (newTotalTests - 1)) + levelResults[level].score) / newTotalTests
            : levelResults[level].score;
          const newBestScore = Math.max(levelStats.bestScore, levelResults[level].score);

          updatedLevelPerformance[level] = {
            totalTests: newTotalTests,
            averageScore: newAvgScore,
            bestScore: newBestScore,
            totalQuestions: newTotalQuestions,
            correctAnswers: newCorrectAnswers
          };
        }
      });

      // Update study progress
      const today = new Date();
      const lastTestDate = userProfile.studyProgress.lastTestDate;
      const newTestStreak = lastTestDate && 
        Math.floor((today - new Date(lastTestDate)) / (1000 * 60 * 60 * 24)) === 1 
        ? userProfile.studyProgress.testStreak + 1 
        : 1;

      // Prepare test history entry
      const testHistoryEntry = {
        testId: testId,
        testResultId: existingResult._id,
        score: Math.round(overallScore),
        completionTime: completionTimeSeconds,
        submittedAt: existingResult.submittedAt,
        totalQuestions: totalQuestions,
        correctAnswers: correctAnswers,
        levelBreakdown: levelResults
      };

      // Update user profile with all new data
      await UserProfile.findOneAndUpdate(
        { userId: userId },
        {
          $inc: {
            completedTests: 1,
            totalTestScore: Math.round(overallScore),
          },
          $set: {
            averageTestScore: newAverageScore,
            testId: existingResult._id,
            performanceStats: {
              bestScore: newBestScore,
              worstScore: newWorstScore,
              averageCompletionTime: newAvgTime.toString(),
              totalQuestionsAttempted: newTotalQuestions,
              totalCorrectAnswers: newTotalCorrect,
              accuracyRate: newAccuracyRate
            },
            levelPerformance: updatedLevelPerformance,
            studyProgress: {
              lastTestDate: today,
              testStreak: newTestStreak,
              weeklyGoal: userProfile.studyProgress.weeklyGoal,
              weeklyProgress: userProfile.studyProgress.weeklyProgress + 1,
              monthlyTests: userProfile.studyProgress.monthlyTests + 1,
              yearlyTests: userProfile.studyProgress.yearlyTests + 1
            }
          },
          $push: {
            testHistory: testHistoryEntry
          }
        },
        { new: true } // Return the updated document
      );

      console.log("User profile updated successfully");
    } catch (error) {
      console.error("Error updating user profile:", error);
      // Don't fail the test submission if profile update fails
    }

    res.json({
      success: true,
      message: "Test submitted successfully",
      data: {
        testResultId: existingResult._id,
        score: existingResult.score,
        correctAnswers,
        totalQuestions,
        answeredQuestions,
        levelBreakdown: levelResults,
        startTime: existingResult.startTime,
        completionTime: existingResult.completionTime, // Raw milliseconds
        submittedAt: existingResult.submittedAt,
      },
    });
  } catch (error) {
    console.error("Error submitting test:", error);
    res.status(500).json({
      success: false,
      message: "Failed to submit test",
      error: error.message,
    });
  }
};

// Start test - track when user begins the test
exports.startTest = async (req, res) => {
  try {
    const { testId } = req.params;
    const userId = req.user.id;
    const clientId = req.clientId;

    // Validate test exists
    const test = await ObjectiveTest.findById(testId);
    if (!test) {
      return res.status(404).json({
        success: false,
        message: "Test not found",
      });
    }

    // Check if user already has a result for this test
    const existingResult = await TestResult.findOne({
      userId,
      testId,
      status: { $in: ["completed", "in_progress"] },
    });

    if (existingResult) {
      return res.status(400).json({
        success: false,
        message: "Test already started or completed",
      });
    }

    // Create a new test result with in_progress status
    const testResult = new TestResult({
      userId,
      testId,
      clientId,
      startTime: new Date(),
      status: "in_progress",
    });

    await testResult.save();

    res.json({
      success: true,
      message: "Test started successfully",
      data: {
        testResultId: testResult._id,
        startTime: testResult.startTime,
        testId: testId,
      },
    });
  } catch (error) {
    console.error("Error starting test:", error);
    res.status(500).json({
      success: false,
      message: "Failed to start test",
      error: error.message,
    });
  }
};

// Get user's test results
exports.getUserTestResults = async (req, res) => {
  try {
    const userId = req.user.id;
    const { testId } = req.params;

    console.log(userId, testId);

    // Query with proper structure
    const results = await TestResult.findOne({
      userId: userId,
      testId: testId,
    })
      .populate("testId", "name category subcategory")
      .sort({ submittedAt: -1 });
    
    if (!results) {
      return res.status(404).json({
        success: false,
        message: "Test results not found",
      });
    }
      
    let answers = results.answers;
    console.log(answers);
    
    // Convert Map keys to array of question IDs
    const questionIds = Array.from(answers.keys());
    console.log("Question IDs:", questionIds);
    
    const questions = await ObjectiveTestQuestion.find({
      _id: { $in: questionIds },
    });
    console.log("Questions found:", questions.length);

    res.json({
      success: true,
      data: {
        ...results.toObject(),
        questions: questions,
        userAnswers: Object.fromEntries(answers) // Convert Map to regular object for JSON response
      },
    });
  } catch (error) {
    console.error("Error fetching test results:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch test results",
      error: error.message,
    });
  }
};

// Get test analytics (for admin/client)
exports.getTestAnalytics = async (req, res) => {
  try {
    const { testId } = req.params;
    const clientId = req.user.userId;
    console.log(clientId);

    const results = await TestResult.find({
      testId,
      clientId,
      status: "completed",
    });

    if (results.length === 0) {
      return res.json({
        success: true,
        data: {
          totalAttempts: 0,
          averageScore: 0,
          highestScore: 0,
          lowestScore: 0,
          levelBreakdown: {
            L1: { attempts: 0, averageScore: 0 },
            L2: { attempts: 0, averageScore: 0 },
            L3: { attempts: 0, averageScore: 0 },
          },
        },
      });
    }

    // Calculate analytics
    const totalAttempts = results.length;
    const scores = results.map((r) => r.score);
    const averageScore = scores.reduce((a, b) => a + b, 0) / scores.length;
    const highestScore = Math.max(...scores);
    const lowestScore = Math.min(...scores);

    // Level breakdown
    const levelBreakdown = {
      L1: { attempts: 0, averageScore: 0 },
      L2: { attempts: 0, averageScore: 0 },
      L3: { attempts: 0, averageScore: 0 },
    };

    results.forEach((result) => {
      Object.keys(result.levelBreakdown).forEach((level) => {
        if (result.levelBreakdown[level].total > 0) {
          levelBreakdown[level].attempts++;
          levelBreakdown[level].averageScore +=
            result.levelBreakdown[level].score;
        }
      });
    });

    // Calculate averages
    Object.keys(levelBreakdown).forEach((level) => {
      if (levelBreakdown[level].attempts > 0) {
        levelBreakdown[level].averageScore =
          levelBreakdown[level].averageScore / levelBreakdown[level].attempts;
      }
    });

    res.json({
      success: true,
      data: {
        totalAttempts,
        averageScore: Math.round(averageScore * 100) / 100,
        highestScore: Math.round(highestScore * 100) / 100,
        lowestScore: Math.round(lowestScore * 100) / 100,
        levelBreakdown,
      },
    });
  } catch (error) {
    console.error("Error fetching test analytics:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch test analytics",
      error: error.message,
    });
  }
};



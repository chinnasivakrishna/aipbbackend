const Test = require('../models/ObjectiveTest');
const path = require('path');
const { generatePresignedUrl, generateGetPresignedUrl, deleteObject } = require('../utils/s3');
const { Client } = require('twilio/lib/base/BaseTwilio');
const User = require('../models/User');

exports.uploadImage = async (req, res) => {
   try {
    const businessName = req.user.businessName;
    console.log(businessName)
    const { fileName, contentType } = req.body;
    
    if (!fileName || !contentType) {
        return res.status(400).json({ 
          success: false, 
          message: 'File name and content type are required' 
        });
    }
  
    // Create unique filename with timestamp
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const ext = path.extname(fileName);
    const key = `${businessName}/test/covers/cover-${uniqueSuffix}${ext}`;
    console.log(key)
    const uploadUrl = await generatePresignedUrl(key, contentType);
    console.log(uploadUrl)
    downloadUrl = await generateGetPresignedUrl(key,604800);
    console.log(downloadUrl)
    res.status(200).json({
      success: true, 
      message: "Image uploaded successfully", 
      uploadUrl,
      key
    });
   } 
   catch (error) {
    console.error('Upload image error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to generate upload URL',
      error: error.message
    });
   }
}

exports.createTest = async (req, res) => {
    try {
      const { name, description,category,subcategory, Estimated_time, imageKey, isTrending, isHighlighted, isActive, instructions } = req.body;
      console.log(req.user.userId)
      const clientId = req.user.userId;
      const client = await User.findOne({userId:req.user.userId});
      if(!client){
        return res.status(404).json({
          success: false,
          message: 'Client not found'
        });
      }

      // Validate required fields
      if (!name) {
        return res.status(400).json({
          success: false,
          message: 'Test name is required'
        });
      }

      // Generate presigned URL for the image if imageKey is provided
      let imageUrl = '';
      if (imageKey) {
        try {
          imageUrl = await generateGetPresignedUrl(imageKey, 604800); // 7 days expiry
        } catch (error) {
          console.error('Error generating presigned URL for image:', error);
          // Continue without image URL if generation fails
        }
      }

      const test = await Test.create({
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
        instructions
      });

      res.status(201).json({
        success: true,
        message: "Test created successfully",
        test
      });
    } 
    catch (error) {
      console.error('Create test error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to create test',
        error: error.message
      });
    }
}

exports.getTest = async (req, res) => {
    try {
        const clientId = req.user.userId;
        console.log(clientId);
        const client = await User.findOne({userId:clientId});
        if(!client)
        {
            res.status(400).json({message:"client not found"})
        }
        const { id } = req.params;
        
        if (!id) {
            return res.status(400).json({
                success: false,
                message: 'Test ID is required'
            });
        }

        const test = await Test.findById(id);
        
        if (!test) {
            return res.status(404).json({
                success: false,
                message: 'Test not found'
            });
        }

        // Generate fresh presigned URL if imageKey exists
        if (test.imageKey) {
            try {
                const freshImageUrl = await generateGetPresignedUrl(test.imageKey, 604800);
                test.imageUrl = freshImageUrl;
            } catch (error) {
                console.error('Error generating fresh presigned URL:', error);
                // Keep existing URL if generation fails
            }
        }

        res.status(200).json({
            success: true,
            test
        });
    } catch (error) {
        console.error('Get test error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to get test',
            error: error.message
        });
    }
}

exports.getAllTests = async (req, res) => {
    try {
        const clientId = req.user.userId;
        console.log(clientId);
        const client = await User.findOne({userId:clientId});
        if(!client)
        {
            res.status(400).json({message:"client not found"})
        }
        const tests = await Test.find({ isActive: true,clientId:clientId }).sort({ createdAt: -1 });

        // Generate fresh presigned URLs for all tests with images
        const testsWithUrls = await Promise.all(
            tests.map(async (test) => {
                if (test.imageKey) {
                    try {
                        const freshImageUrl = await generateGetPresignedUrl(test.imageKey, 604800);
                        test.imageUrl = freshImageUrl;
                    } catch (error) {
                        console.error('Error generating presigned URL for test:', test._id, error);
                    }
                }
                return test;
            })
        );

        res.status(200).json({
            success: true,
            tests: testsWithUrls
        });
    } catch (error) {
        console.error('Get all tests error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to get tests',
            error: error.message
        });
    }
}

exports.getAllTestsForMobile = async (req, res) => {
    try {
        // Use req.clientId (set by middleware) or fallback to req.params.clientId
        const clientId = req.clientId || req.params.clientId;
        const { 
            limit = 10, 
            page = 1,
            category, 
            subcategory 
        } = req.query;

        console.log('Fetching tests for mobile for client:', clientId);

        // Validate client exists
        const client = await User.findOne({userId: clientId});
        if (!client) {
            return res.status(400).json({
                success: false,
                message: "Client not found"
            });
        }

        // Calculate pagination
        const skip = (parseInt(page) - 1) * parseInt(limit);

        // Build filter for tests
        const filter = { 
            isActive: true, 
            clientId: clientId 
        };
        if (category) filter.category = category;
        if (subcategory) filter.subcategory = subcategory;

        // Get all tests for this client (without pagination for categorization)
        const allTests = await Test.find({ 
            isActive: true, 
            clientId: clientId 
        }).sort({ createdAt: -1 });

        // Generate fresh presigned URLs for all tests with images
        const testsWithUrls = await Promise.all(
            allTests.map(async (test) => {
                if (test.imageKey) {
                    try {
                        const freshImageUrl = await generateGetPresignedUrl(test.imageKey, 604800);
                        test.imageUrl = freshImageUrl;
                    } catch (error) {
                        console.error('Error generating presigned URL for test:', test._id, error);
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
            category: test.category || '',
            subcategory: test.subcategory || '',
            image: test.imageKey || '',
            image_url: test.imageUrl || '',
            estimated_time: test.Estimated_time,
            instructions: test.instructions,
            is_trending: test.isTrending,
            is_highlighted: test.isHighlighted,
            is_active: test.isActive,
            created_at: test.createdAt,
            updated_at: test.updatedAt
        });

        // Group tests by category and subcategory
        const groupedTests = {};
        
        testsWithUrls.forEach(test => {
            const category = test.category || 'Uncategorized';
            const subcategory = test.subcategory || 'General';
            
            if (!groupedTests[category]) {
                groupedTests[category] = {
                    category: category,
                    subcategories: {}
                };
            }
            
            if (!groupedTests[category].subcategories[subcategory]) {
                groupedTests[category].subcategories[subcategory] = [];
            }
            
            groupedTests[category].subcategories[subcategory].push(formatTestForMobile(test));
        });

        // Convert to array format and apply pagination
        const categoriesArray = Object.values(groupedTests).map(category => {
            const subcategoriesArray = Object.entries(category.subcategories).map(([subName, tests]) => ({
                name: subName,
                count: tests.length,
                tests: tests.slice(skip, skip + parseInt(limit))
            }));

            return {
                category: category.category,
                subcategories: subcategoriesArray,
                total_tests: Object.values(category.subcategories).reduce((sum, tests) => sum + tests.length, 0)
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
                    has_prev_page: hasPrevPage
                }
            },
            meta: {
                clientId,
                timestamp: new Date().toISOString(),
                filters_applied: { category, subcategory }
            }
        };

        res.status(200).json(mobileTestsResponse);

    } catch (error) {
        console.error('Get all tests for mobile error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to get tests',
            error: {
                code: 'TESTS_FETCH_ERROR',
                details: error.message
            }
        });
    }
}

exports.updateTest = async (req, res) => {
    try {
        const clientId = req.user.userId;
        console.log(clientId);
        const client = await User.findOne({userId:clientId});
        if(!client)
        {
            res.status(400).json({message:"client not found"})
        }
        const { id } = req.params;
        const { name, description, Estimated_time, imageKey, isTrending, isHighlighted, isActive, instructions } = req.body;

        if (!id) {
            return res.status(400).json({
                success: false,
                message: 'Test ID is required'
            });
        }

        const test = await Test.findById(id);
        if (!test) {
            return res.status(404).json({
                success: false,
                message: 'Test not found'
            });
        }

        // Handle image update
        let imageUrl = test.imageUrl;
        if (imageKey && imageKey !== test.imageKey) {
            // Delete old image if it exists and is different
            if (test.imageKey) {
                try {
                    await deleteObject(test.imageKey);
                    console.log('Successfully deleted old image from S3:', test.imageKey);
                } catch (error) {
                    console.error('Error deleting old image from S3:', error);
                }
            }

            // Generate new presigned URL
            try {
                imageUrl = await generateGetPresignedUrl(imageKey, 604800);
            } catch (error) {
                console.error('Error generating presigned URL for new image:', error);
                return res.status(500).json({
                    success: false,
                    message: 'Failed to generate image URL'
                });
            }
        }

        const updatedTest = await Test.findByIdAndUpdate(
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
                instructions
            },
            { new: true }
        );

        res.status(200).json({
            success: true,
            message: 'Test updated successfully',
            test: updatedTest
        });
    } catch (error) {
        console.error('Update test error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to update test',
            error: error.message
        });
    }
}

exports.deleteTest = async (req, res) => {
    try {
        const clientId = req.user.userId;
        console.log(clientId);
        const client = await User.findOne({userId:clientId});
        if(!client)
        {
            res.status(400).json({message:"client not found"})
        }
        const { id } = req.params;

        if (!id) {
            return res.status(400).json({
                success: false,
                message: 'Test ID is required'
            });
        }

        const test = await Test.findById(id);
        if (!test) {
            return res.status(404).json({
                success: false,
                message: 'Test not found'
            });
        }

        // Delete image from S3 if it exists
        if (test.imageKey) {
            try {
                await deleteObject(test.imageKey);
                console.log('Successfully deleted image from S3:', test.imageKey);
            } catch (error) {
                console.error('Error deleting image from S3:', error);
            }
        }

        await Test.findByIdAndDelete(id);

        res.status(200).json({
            success: true,
            message: 'Test deleted successfully'
        });
    } catch (error) {
        console.error('Delete test error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to delete test',
            error: error.message
        });
    }
} 
const express = require('express');
const router = express.Router();
const MyWorkbook = require('../models/MyWorkbook');
const Workbook = require('../models/Workbook');
const { authenticateMobileUser, ensureUserBelongsToClient } = require('../middleware/mobileAuth');

// Apply authentication middleware to all routes
router.use(authenticateMobileUser);
router.use(ensureUserBelongsToClient);

// 1. Add Workbook to My Workbooks
// POST /api/clients/:clientId/mobile/myworkbook/add
router.post('/add', async (req, res) => {
  try {
    const { workbook_id } = req.body;
    const userId = req.user.id;
    const clientId = req.user.clientId;

    // Validate required fields
    if (!workbook_id) {
      return res.status(400).json({
        success: false,
        message: 'Missing required parameters.',
        error: {
          code: 'MISSING_PARAMETERS',
          details: 'workbook_id is required'
        }
      });
    }

    // Validate workbook_id format (MongoDB ObjectId)
    if (!workbook_id.match(/^[0-9a-fA-F]{24}$/)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid workbook ID format.',
        error: {
          code: 'INVALID_WORKBOOK_ID',
          details: 'workbook_id must be a valid MongoDB ObjectId'
        }
      });
    }

    // Check if workbook exists and belongs to the same client
    const workbook = await Workbook.findOne({ 
      _id: workbook_id, 
      clientId: clientId 
    });

    if (!workbook) {
      return res.status(404).json({
        success: false,
        message: 'Workbook not found or does not belong to your client.',
        error: {
          code: 'WORKBOOK_NOT_FOUND',
          details: `Workbook with ID ${workbook_id} not found for client ${clientId}`
        }
      });
    }

    // Check if workbook is already in My Workbooks
    const existingMyWorkbook = await MyWorkbook.findOne({
      userId: userId,
      workbookId: workbook_id
    });

    if (existingMyWorkbook) {
      return res.status(200).json({
        success: true,
        message: 'Workbook is already in your My Workbooks collection.',
        error: {
          code: 'WORKBOOK_ALREADY_ADDED',
          details: `Workbook with ID ${workbook_id} is already in your My Workbooks collection`
        }
      });
    }

    // Add workbook to My Workbooks
    const myWorkbook = new MyWorkbook({
      userId: userId,
      workbookId: workbook_id,
      clientId: clientId
    });

    await myWorkbook.save();
    console.log(myWorkbook);

    // Populate workbook details for response
    await myWorkbook.populate({
      path: 'workbookId',
      select: 'title author publisher description coverImage coverImageUrl rating ratingCount mainCategory subCategory exam paper subject tags viewCount createdAt'
    });

    console.log(`Workbook ${workbook_id} added to My Workbooks for user ${userId}`);

    res.status(200).json({
      success: true,
      message: 'Workbook successfully added to My Workbooks.',
      data: {
        myWorkbookId: myWorkbook._id,
        workbookId: myWorkbook.workbookId._id,
        title: myWorkbook.workbookId.title,
        author: myWorkbook.workbookId.author,
        coverImage: myWorkbook.workbookId.coverImage,
        coverImageUrl: myWorkbook.workbookId.coverImageUrl,
        addedAt: myWorkbook.addedAt
      }
    });

  } catch (error) {
    console.error('Add to My Workbooks error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error while adding workbook to My Workbooks.',
      error: {
        code: 'SERVER_ERROR',
        details: error.message
      }
    });
  }
});

// 2. View My Workbooks List
// GET /api/clients/:clientId/mobile/myworkbook/list
router.get('/list', async (req, res) => {
  try {
    const userId = req.user.id;
    const clientId = req.user.clientId;
    
    // Query parameters for pagination and filtering
    const {
      page = 1,
      limit = 20,
      sortBy = 'addedAt',
      sortOrder = 'desc',
      category = null,
      search = null
    } = req.query;

    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const skip = (pageNum - 1) * limitNum;
    
    // Build query
    let query = MyWorkbook.find({ userId, clientId });

    // Apply search filter if provided
    if (search) {
      const workbookQuery = {
        clientId: clientId,
        $or: [
          { title: { $regex: search, $options: 'i' } },
          { author: { $regex: search, $options: 'i' } },
          { description: { $regex: search, $options: 'i' } }
        ]
      };
      
      const matchingWorkbooks = await Workbook.find(workbookQuery).select('_id');
      const workbookIds = matchingWorkbooks.map(workbook => workbook._id);
      
      query = query.where('workbookId').in(workbookIds);
    }

    // Apply category filter if provided
    if (category) {
      const categoryWorkbooks = await Workbook.find({ 
        clientId: clientId, 
        mainCategory: category 
      }).select('_id');
      const categoryWorkbookIds = categoryWorkbooks.map(workbook => workbook._id);
      
      query = query.where('workbookId').in(categoryWorkbookIds);
    }

    // Apply sorting
    const sortDirection = sortOrder === 'desc' ? -1 : 1;
    const sortObj = {};
    sortObj[sortBy] = sortDirection;
    query = query.sort(sortObj);

    // Apply pagination
    query = query.skip(skip).limit(limitNum);

    // Populate workbook details
    query = query.populate({
      path: 'workbookId',
      select: 'title author publisher description coverImage coverImageUrl rating ratingCount mainCategory subCategory exam paper subject tags viewCount createdAt',
      populate: {
        path: 'user',
        select: 'name email userId'
      }
    });

    // Execute query
    const myWorkbooks = await query;

    // Get total count for pagination
    const totalCount = await MyWorkbook.countDocuments({ userId, clientId });

    // Format response and generate cover image URLs
    const formattedWorkbooks = await Promise.all(myWorkbooks.map(async myWorkbook => {
      // Check if workbook exists
      if (!myWorkbook.workbookId) {
        console.warn(`Workbook not found for MyWorkbook entry ${myWorkbook._id}`);
        return null;
      }

      let coverImageUrl = myWorkbook.workbookId.coverImageUrl || null;
      
      // Generate new presigned URL if we have a cover image
      if (myWorkbook.workbookId.coverImage) {
        try {
          // If you have a generateGetPresignedUrl utility for workbooks, use it here
          // coverImageUrl = await generateGetPresignedUrl(myWorkbook.workbookId.coverImage, 31536000);
          // For now, just use the existing coverImageUrl
        } catch (error) {
          console.error('Error generating presigned URL for cover image:', error);
          coverImageUrl = null;
        }
      }

      return {
        myworkbook_id: myWorkbook._id,
        workbook_id: myWorkbook.workbookId._id,
        title: myWorkbook.workbookId.title || '',
        author: myWorkbook.workbookId.author || '',
        publisher: myWorkbook.workbookId.publisher || '',
        description: myWorkbook.workbookId.description || '',
        cover_image: myWorkbook.workbookId.coverImage || '',
        cover_image_url: coverImageUrl || '',
        rating: myWorkbook.workbookId.rating || 0,
        rating_count: myWorkbook.workbookId.ratingCount || 0,
        main_category: myWorkbook.workbookId.mainCategory || '',
        sub_category: myWorkbook.workbookId.subCategory || '',
        exam: myWorkbook.workbookId.exam || '',
        paper: myWorkbook.workbookId.paper || '',
        subject: myWorkbook.workbookId.subject || '',
        tags: myWorkbook.workbookId.tags || [],
        view_count: myWorkbook.workbookId.viewCount || 0,
        added_at: myWorkbook.addedAt,
        last_accessed_at: myWorkbook.lastAccessedAt,
        personal_note: myWorkbook.personalNote || '',
        priority: myWorkbook.priority || 'normal'
      };
    }));

    // Filter out any null entries (workbooks that weren't found)
    const validWorkbooks = formattedWorkbooks.filter(workbook => workbook !== null);

    if (validWorkbooks.length === 0) {
      return res.status(200).json({
        success: true,
        message: 'No workbooks found in your My Workbooks collection.',
        error: {
          code: 'NO_WORKBOOKS_FOUND',
          details: 'Your My Workbooks list is empty'
        }
      });
    }

    console.log(`Retrieved ${validWorkbooks.length} workbooks from My Workbooks for user ${userId}`);

    res.status(200).json({
      success: true,
      message: 'My Workbooks retrieved successfully.',
      data: {
        workbooks: validWorkbooks,
        pagination: {
          current_page: pageNum,
          total_pages: Math.ceil(totalCount / limitNum),
          total_workbooks: totalCount,
          workbooks_per_page: limitNum,
          has_next: pageNum < Math.ceil(totalCount / limitNum),
          has_prev: pageNum > 1
        }
      }
    });

  } catch (error) {
    console.error('Get My Workbooks list error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error while retrieving My Workbooks.',
      error: {
        code: 'SERVER_ERROR',
        details: error.message
      }
    });
  }
});

// 3. Remove Workbook from My Workbooks
// POST /api/clients/:clientId/mobile/myworkbook/remove
router.post('/remove', async (req, res) => {
  try {
    const { workbook_id } = req.body;
    const userId = req.user.id;
    const clientId = req.user.clientId;

    // Validate required fields
    if (!workbook_id) {
      return res.status(400).json({
        success: false,
        message: 'Missing required parameters.',
        error: {
          code: 'MISSING_PARAMETERS',
          details: 'workbook_id is required'
        }
      });
    }

    // Validate workbook_id format
    if (!workbook_id.match(/^[0-9a-fA-F]{24}$/)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid workbook ID format.',
        error: {
          code: 'INVALID_WORKBOOK_ID',
          details: 'workbook_id must be a valid MongoDB ObjectId'
        }
      });
    }

    // Find and remove the workbook from My Workbooks
    const removedMyWorkbook = await MyWorkbook.findOneAndDelete({
      userId: userId,
      workbookId: workbook_id
    }).populate({
      path: 'workbookId',
      select: 'title author coverImage'
    });

    if (!removedMyWorkbook) {
      return res.status(404).json({
        success: false,
        message: 'Workbook not found in your My Workbooks list.',
        error: {
          code: 'WORKBOOK_NOT_IN_MYWORKBOOKS',
          details: `Workbook with ID ${workbook_id} is not in your My Workbooks collection`
        }
      });
    }

    console.log(`Workbook ${workbook_id} removed from My Workbooks for user ${userId}`);

    res.status(200).json({
      success: true,
      message: 'Workbook removed successfully from My Workbooks.',
      data: {
        removedWorkbookId: workbook_id,
        title: removedMyWorkbook.workbookId?.title || 'Unknown',
        author: removedMyWorkbook.workbookId?.author || 'Unknown',
        removedAt: new Date(),
      }
    });

  } catch (error) {
    console.error('Remove from My Workbooks error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error while removing workbook from My Workbooks.',
      error: {
        code: 'SERVER_ERROR',
        details: error.message
      }
    });
  }
});


module.exports = router;
const express = require('express');
const router = express.Router();
const Video = require('../models/Video');
const Book = require('../models/Book');
const Chapter = require('../models/Chapter');
const Topic = require('../models/Topic');
const Subtopic = require('../models/SubTopic');
const { verifyToken } = require('../middleware/auth');

// Helper function to validate item existence
const validateItem = async (itemType, itemId) => {
  let model;
  switch (itemType) {
    case 'book':
      model = Book;
      break;
    case 'chapter':
      model = Chapter;
      break;
    case 'topic':
      model = Topic;
      break;
    case 'subtopic':
      model = Subtopic;
      break;
    default:
      throw new Error('Invalid item type');
  }
  
  const item = await model.findById(itemId);
  if (!item) {
    throw new Error(`${itemType} not found`);
  }
  return item;
};

// Helper function to extract YouTube video ID
const extractYouTubeId = (url) => {
  const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|&v=)([^#&?]*).*/;
  const match = url.match(regExp);
  return (match && match[2].length === 11) ? match[2] : null;
};

// Helper function to validate YouTube URL
const isValidYouTubeUrl = (url) => {
  return url.includes('youtube.com') || url.includes('youtu.be');
};

// Create video for any item type
router.post('/:itemType/:itemId/videos',  verifyToken, async (req, res) => {
  try {
    const { itemType, itemId } = req.params;
    const { 
      title, 
      url, 
      description, 
      duration, 
      thumbnailUrl, 
      fileSize, 
      format, 
      tags, 
      videoType,
      youtubeVideoId,
      embedUrl,
      cloudinaryPublicId 
    } = req.body;

    // Validate required fields
    if (!title || !url) {
      return res.status(400).json({
        success: false,
        message: 'Title and URL are required'
      });
    }

    // Validate item exists
    await validateItem(itemType, itemId);

    // Determine video type if not provided
    let finalVideoType = videoType;
    if (!finalVideoType) {
      finalVideoType = isValidYouTubeUrl(url) ? 'youtube' : 'file';
    }

    // Validate YouTube URL if it's a YouTube video
    if (finalVideoType === 'youtube' && !isValidYouTubeUrl(url)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid YouTube URL'
      });
    }

    // Create video data object
    const videoData = {
      title: title.trim(),
      url: url.trim(),
      description: description?.trim() || '',
      duration: duration || 0,
      thumbnailUrl: thumbnailUrl?.trim() || '',
      fileSize: fileSize || 0,
      format: format?.trim() || '',
      videoType: finalVideoType,
      itemType,
      itemId,
      createdBy: req.user.id,
      tags: tags || []
    };

    // Add YouTube specific fields
    if (finalVideoType === 'youtube') {
      videoData.youtubeVideoId = youtubeVideoId || extractYouTubeId(url);
      videoData.embedUrl = embedUrl || `https://www.youtube.com/embed/${videoData.youtubeVideoId}`;
      
      // Set default thumbnail if not provided
      if (!videoData.thumbnailUrl && videoData.youtubeVideoId) {
        videoData.thumbnailUrl = `https://img.youtube.com/vi/${videoData.youtubeVideoId}/maxresdefault.jpg`;
      }
    } else {
      // Add Cloudinary specific fields for uploaded videos
      videoData.cloudinaryPublicId = cloudinaryPublicId?.trim() || '';
    }

    // Create new video
    const video = new Video(videoData);
    await video.save();
    await video.populate('createdBy', 'username email');

    res.status(201).json({
      success: true,
      message: 'Video created successfully',
      video
    });
  } catch (error) {
    console.error('Error creating video:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to create video'
    });
  }
});

// Get all videos for a specific item
router.get('/:itemType/:itemId/videos',  verifyToken, async (req, res) => {
  try {
    const { itemType, itemId } = req.params;
    const { 
      isWorkbook = false, 
      page = 1, 
      limit = 10, 
      search = '', 
      videoType = null 
    } = req.query;

    // Validate item exists
    await validateItem(itemType, itemId);

    // Build query
    const query = {
      itemType,
      itemId,
      isWorkbook: isWorkbook === 'true',
      status: 'active'
    };

    // Filter by video type if specified
    if (videoType && ['file', 'youtube'].includes(videoType)) {
      query.videoType = videoType;
    }

    // Add search functionality
    if (search) {
      query.$or = [
        { title: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } },
        { tags: { $in: [new RegExp(search, 'i')] } }
      ];
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);

    const videos = await Video.find(query)
      .populate('createdBy', 'username email')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    const total = await Video.countDocuments(query);

    // Add virtual fields to response
    const videosWithVirtuals = videos.map(video => {
      const videoObj = video.toObject({ virtuals: true });
      return videoObj;
    });

    res.json({
      success: true,
      videos: videosWithVirtuals,
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(total / parseInt(limit)),
        totalVideos: total,
        hasNext: skip + videos.length < total,
        hasPrev: parseInt(page) > 1
      }
    });
  } catch (error) {
    console.error('Error fetching videos:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to fetch videos'
    });
  }
});

// Get single video by ID
router.get('/videos/:videoId',  verifyToken, async (req, res) => {
  try {
    const { videoId } = req.params;

    const video = await Video.findById(videoId)
      .populate('createdBy', 'username email');

    if (!video) {
      return res.status(404).json({
        success: false,
        message: 'Video not found'
      });
    }

    res.json({
      success: true,
      video: video.toObject({ virtuals: true })
    });
  } catch (error) {
    console.error('Error fetching video:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch video'
    });
  }
});

// Update video
router.put('/videos/:videoId',  verifyToken, async (req, res) => {
  try {
    const { videoId } = req.params;
    const { 
      title, 
      url, 
      description, 
      duration, 
      thumbnailUrl, 
      fileSize, 
      format, 
      tags, 
      status,
      videoType,
      youtubeVideoId,
      embedUrl
    } = req.body;

    const video = await Video.findById(videoId);
    if (!video) {
      return res.status(404).json({
        success: false,
        message: 'Video not found'
      });
    }

    // Check if user owns the video or is admin
    if (video.createdBy.toString() !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to update this video'
      });
    }

    // Update fields
    if (title) video.title = title.trim();
    if (url) {
      video.url = url.trim();
      // Re-determine video type if URL changes
      video.videoType = isValidYouTubeUrl(url) ? 'youtube' : 'file';
    }
    if (description !== undefined) video.description = description.trim();
    if (duration !== undefined) video.duration = duration;
    if (thumbnailUrl !== undefined) video.thumbnailUrl = thumbnailUrl.trim();
    if (fileSize !== undefined) video.fileSize = fileSize;
    if (format !== undefined) video.format = format.trim();
    if (tags !== undefined) video.tags = tags;
    if (videoType !== undefined) video.videoType = videoType;
    if (youtubeVideoId !== undefined) video.youtubeVideoId = youtubeVideoId;
    if (embedUrl !== undefined) video.embedUrl = embedUrl;
    
    if (status && ['active', 'inactive', 'processing'].includes(status)) {
      video.status = status;
    }

    await video.save();
    await video.populate('createdBy', 'username email');

    res.json({
      success: true,
      message: 'Video updated successfully',
      video: video.toObject({ virtuals: true })
    });
  } catch (error) {
    console.error('Error updating video:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update video'
    });
  }
});

// Delete video
router.delete('/videos/:videoId',  verifyToken, async (req, res) => {
  try {
    const { videoId } = req.params;

    const video = await Video.findById(videoId);
    if (!video) {
      return res.status(404).json({
        success: false,
        message: 'Video not found'
      });
    }

    // Check if user owns the video or is admin
    if (video.createdBy.toString() !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to delete this video'
      });
    }

    await Video.findByIdAndDelete(videoId);

    res.json({
      success: true,
      message: 'Video deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting video:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete video'
    });
  }
});

// Increment view count
router.post('/videos/:videoId/view',  verifyToken, async (req, res) => {
  try {
    const { videoId } = req.params;

    const video = await Video.findById(videoId);
    if (!video) {
      return res.status(404).json({
        success: false,
        message: 'Video not found'
      });
    }

    await video.incrementViewCount();

    res.json({
      success: true,
      message: 'View count updated',
      viewCount: video.viewCount
    });
  } catch (error) {
    console.error('Error updating view count:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update view count'
    });
  }
});

// Get popular videos
router.get('/videos/popular',  verifyToken, async (req, res) => {
  try {
    const { limit = 10 } = req.query;

    const videos = await Video.getPopular(parseInt(limit));

    res.json({
      success: true,
      videos: videos.map(video => video.toObject({ virtuals: true }))
    });
  } catch (error) {
    console.error('Error fetching popular videos:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch popular videos'
    });
  }
});

// Get videos by type (YouTube or uploaded)
router.get('/videos/type/:videoType',  verifyToken, async (req, res) => {
  try {
    const { videoType } = req.params;
    const { limit = 10 } = req.query;

    if (!['file', 'youtube'].includes(videoType)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid video type. Must be "file" or "youtube"'
      });
    }

    const videos = await Video.getByType(videoType, parseInt(limit));

    res.json({
      success: true,
      videos: videos.map(video => video.toObject({ virtuals: true }))
    });
  } catch (error) {
    console.error('Error fetching videos by type:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch videos by type'
    });
  }
});

// Search videos across all items
router.get('/videos/search',  verifyToken, async (req, res) => {
  try {
    const { q, itemType, videoType, page = 1, limit = 10 } = req.query;

    if (!q) {
      return res.status(400).json({
        success: false,
        message: 'Search query is required'
      });
    }

    const query = {
      status: 'active',
      $or: [
        { title: { $regex: q, $options: 'i' } },
        { description: { $regex: q, $options: 'i' } },
        { tags: { $in: [new RegExp(q, 'i')] } }
      ]
    };

    if (itemType) {
      query.itemType = itemType;
    }

    if (videoType && ['file', 'youtube'].includes(videoType)) {
      query.videoType = videoType;
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);

    const videos = await Video.find(query)
      .populate('createdBy', 'username email')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    const total = await Video.countDocuments(query);

    res.json({
      success: true,
      videos: videos.map(video => video.toObject({ virtuals: true })),
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(total / parseInt(limit)),
        totalVideos: total,
        hasNext: skip + videos.length < total,
        hasPrev: parseInt(page) > 1
      }
    });
  } catch (error) {
    console.error('Error searching videos:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to search videos'
    });
  }
});

// Get videos by user
router.get('/user/:userId/videos',  verifyToken, async (req, res) => {
  try {
    const { userId } = req.params;
    const { page = 1, limit = 10, videoType = null } = req.query;

    // Check if user is requesting their own videos or is admin
    if (userId !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to view these videos'
      });
    }

    const query = { 
      createdBy: userId, 
      status: 'active' 
    };

    if (videoType && ['file', 'youtube'].includes(videoType)) {
      query.videoType = videoType;
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);

    const videos = await Video.find(query)
      .populate('createdBy', 'username email')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    const total = await Video.countDocuments(query);

    res.json({
      success: true,
      videos: videos.map(video => video.toObject({ virtuals: true })),
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(total / parseInt(limit)),
        totalVideos: total,
        hasNext: skip + videos.length < total,
        hasPrev: parseInt(page) > 1
      }
    });
  } catch (error) {
    console.error('Error fetching user videos:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch user videos'
    });
  }
});

module.exports = router;
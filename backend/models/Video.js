const mongoose = require('mongoose');

const videoSchema = new mongoose.Schema({
  title: {
    type: String,
    required: true,
    trim: true,
    maxlength: 200
  },
  url: {
    type: String,
    required: true,
    trim: true
  },
  description: {
    type: String,
    trim: true,
    maxlength: 1000
  },
  duration: {
    type: Number, // in seconds
    default: 0
  },
  thumbnailUrl: {
    type: String,
    trim: true
  },
  fileSize: {
    type: Number, // in bytes
    default: 0
  },
  format: {
    type: String,
    trim: true
  },
  // Video type: 'file' for uploaded videos, 'youtube' for YouTube videos
  videoType: {
    type: String,
    enum: ['file', 'youtube'],
    default: 'file'
  },
  // YouTube specific fields
  youtubeVideoId: {
    type: String,
    trim: true
  },
  embedUrl: {
    type: String,
    trim: true
  },
  // Reference fields for hierarchy
  itemType: {
    type: String,
    required: true,
    enum: ['book', 'chapter', 'topic', 'subtopic']
  },
  itemId: {
    type: mongoose.Schema.Types.ObjectId,
    required: true,
    refPath: 'itemType'
  },
  // Workbook flag
  isWorkbook: {
    type: Boolean,
    default: false
  },
  // User who created this video
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  // Tags for better organization
  tags: [{
    type: String,
    trim: true
  }],
  // View count
  viewCount: {
    type: Number,
    default: 0
  },
  // Status
  status: {
    type: String,
    enum: ['active', 'inactive', 'processing'],
    default: 'active'
  },
  // Cloudinary specific fields (for uploaded videos)
  cloudinaryPublicId: {
    type: String,
    trim: true
  },
  cloudinaryResourceType: {
    type: String,
    default: 'video'
  }
}, {
  timestamps: true
});

// Indexes for better query performance
videoSchema.index({ itemType: 1, itemId: 1 });
videoSchema.index({ createdBy: 1 });
videoSchema.index({ createdAt: -1 });
videoSchema.index({ status: 1 });
videoSchema.index({ videoType: 1 });
videoSchema.index({ youtubeVideoId: 1 });

// Virtual for formatted duration
videoSchema.virtual('formattedDuration').get(function() {
  if (!this.duration) return '0:00';
  
  const minutes = Math.floor(this.duration / 60);
  const seconds = this.duration % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
});

// Virtual for formatted file size
videoSchema.virtual('formattedFileSize').get(function() {
  if (!this.fileSize) return '0 B';
  
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(this.fileSize) / Math.log(1024));
  return `${(this.fileSize / Math.pow(1024, i)).toFixed(1)} ${sizes[i]}`;
});

// Virtual to check if video is YouTube
videoSchema.virtual('isYouTube').get(function() {
  return this.videoType === 'youtube' || !!this.youtubeVideoId;
});

// Virtual for display thumbnail
videoSchema.virtual('displayThumbnail').get(function() {
  if (this.thumbnailUrl) {
    return this.thumbnailUrl;
  }
  
  if (this.isYouTube && this.youtubeVideoId) {
    return `https://img.youtube.com/vi/${this.youtubeVideoId}/maxresdefault.jpg`;
  }
  
  return null;
});

// Pre-save middleware
videoSchema.pre('save', function(next) {
  // Extract YouTube video ID from URL if it's a YouTube video
  if (this.videoType === 'youtube' || this.url.includes('youtube.com') || this.url.includes('youtu.be')) {
    this.videoType = 'youtube';
    
    if (!this.youtubeVideoId) {
      const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|&v=)([^#&?]*).*/;
      const match = this.url.match(regExp);
      if (match && match[2].length === 11) {
        this.youtubeVideoId = match[2];
      }
    }
    
    // Set embed URL if not provided
    if (this.youtubeVideoId && !this.embedUrl) {
      this.embedUrl = `https://www.youtube.com/embed/${this.youtubeVideoId}`;
    }
    
    // Set thumbnail URL if not provided
    if (this.youtubeVideoId && !this.thumbnailUrl) {
      this.thumbnailUrl = `https://img.youtube.com/vi/${this.youtubeVideoId}/maxresdefault.jpg`;
    }
  } else {
    // For uploaded videos, extract public ID from Cloudinary URL if not provided
    if (this.url && !this.cloudinaryPublicId && this.url.includes('cloudinary.com')) {
      const urlParts = this.url.split('/');
      const uploadIndex = urlParts.indexOf('upload');
      if (uploadIndex !== -1 && urlParts[uploadIndex + 2]) {
        const publicIdWithExt = urlParts[urlParts.length - 1];
        this.cloudinaryPublicId = publicIdWithExt.split('.')[0];
      }
    }
    
    this.videoType = 'file';
  }
  
  next();
});

// Method to increment view count
videoSchema.methods.incrementViewCount = function() {
  this.viewCount += 1;
  return this.save();
};

// Static method to get videos by item
videoSchema.statics.getByItem = function(itemType, itemId, isWorkbook = false) {
  return this.find({
    itemType,
    itemId,
    isWorkbook,
    status: 'active'
  }).sort({ createdAt: -1 }).populate('createdBy', 'username email');
};

// Static method to get popular videos
videoSchema.statics.getPopular = function(limit = 10) {
  return this.find({ status: 'active' })
    .sort({ viewCount: -1 })
    .limit(limit)
    .populate('createdBy', 'username email');
};

// Static method to get videos by type
videoSchema.statics.getByType = function(videoType, limit = 10) {
  return this.find({ 
    videoType, 
    status: 'active' 
  })
    .sort({ createdAt: -1 })
    .limit(limit)
    .populate('createdBy', 'username email');
};

module.exports = mongoose.model('Video', videoSchema);
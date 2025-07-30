const mongoose = require('mongoose');

const SubjectiveQuestionSchema = new mongoose.Schema({
  question: {
    type: String,
    required: [true, 'Please add the question text'],
  },
  answer: {
    type: String
  },
  keywords: {
    type: String
  },
  difficulty: {
    type: String,
    enum: ['L1', 'L2', 'L3'],
    required: true
  },
  questionSet: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'QuestionSet',
    required: true
  },
  solution: {
    type: {
      type: String,
      enum: ['text', 'video', 'image'],
      default: 'text'
    },
    text: {
      type: String,
      default: ""
    },
    video: {
      url: {
        type: String,
        default: ""
      },
      title: {
        type: String,
        default: ""
      },
      description: {
        type: String,
        default: ""
      },
      duration: {
        type: Number,
        default: 0
      }
    },
    image: {
      url: {
        type: String,
        default: ""
      },
      caption: {
        type: String,
        default: ""
      }
    }
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
});

// Pre-save middleware to update timestamps
SubjectiveQuestionSchema.pre('save', function(next) {
  this.updatedAt = new Date();
  next();
});

// Virtual for getting the difficulty display name
SubjectiveQuestionSchema.virtual('difficultyDisplay').get(function() {
  switch(this.difficulty) {
    case 'L1':
      return 'Beginner';
    case 'L2':
      return 'Intermediate';
    case 'L3':
      return 'Advanced';
    default:
      return this.difficulty;
  }
});

// Virtual for getting solution display info
SubjectiveQuestionSchema.virtual('solutionDisplay').get(function() {
  switch (this.solution.type) {
    case 'text':
      return {
        type: 'text',
        content: this.solution.text,
        hasContent: !!this.solution.text
      };
    case 'video':
      return {
        type: 'video',
        content: this.solution.video,
        hasContent: !!this.solution.video.url
      };
    case 'image':
      return {
        type: 'image',
        content: this.solution.image,
        hasContent: !!this.solution.image.url
      };
    default:
      return {
        type: 'none',
        content: null,
        hasContent: false
      };
  }
});

// Method to set text solution
SubjectiveQuestionSchema.methods.setTextSolution = function(text) {
  this.solution.type = 'text';
  this.solution.text = text;
  this.solution.video = { url: "", title: "", description: "", duration: 0 };
  this.solution.image = { url: "", caption: "" };
  return this.save();
};

// Method to set video solution
SubjectiveQuestionSchema.methods.setVideoSolution = function(videoData) {
  this.solution.type = 'video';
  this.solution.video = {
    url: videoData.url || "",
    title: videoData.title || "",
    description: videoData.description || "",
    duration: videoData.duration || 0
  };
  this.solution.text = "";
  this.solution.image = { url: "", caption: "" };
  return this.save();
};

// Method to set image solution
SubjectiveQuestionSchema.methods.setImageSolution = function(imageData) {
  this.solution.type = 'image';
  this.solution.image = {
    url: imageData.url || "",
    caption: imageData.caption || ""
  };
  this.solution.text = "";
  this.solution.video = { url: "", title: "", description: "", duration: 0 };
  return this.save();
};

// Method to get solution content
SubjectiveQuestionSchema.methods.getSolutionContent = function() {
  switch (this.solution.type) {
    case 'text':
      return this.solution.text;
    case 'video':
      return this.solution.video;
    case 'image':
      return this.solution.image;
    default:
      return null;
  }
};

module.exports = mongoose.model('SubjectiveQuestion', SubjectiveQuestionSchema);

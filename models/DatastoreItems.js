const mongoose = require('mongoose');

const DataStoreItemSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Please add a name'],
    trim: true
  },
  url: {
    type: String,
    required: [true, 'Please add a file URL'],
    trim: true
  },
  fileType: {
    type: String,
    default: 'application/octet-stream'
  },
  // Reference to either a book, chapter, topic, or subtopic
  book: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Book',
    default: null
  },
  chapter: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Chapter',
    default: null
  },
  topic: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Topic',
    default: null
  },
  subtopic: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'SubTopic',
    default: null
  },
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  createdAt: {
    type: Date,
    default: Date.now
  } 
});

module.exports = mongoose.model('DataStore', DataStoreItemSchema);
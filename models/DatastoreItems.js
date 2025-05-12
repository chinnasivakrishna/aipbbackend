const mongoose = require('mongoose');
// DatastoreItems.js - Update the schema
const DatastoreItemsSchema = new mongoose.Schema({
  title: {
    type: String,
    required: [true, 'Please add a title'],
    trim: true,
    maxlength: [100, 'Title cannot be more than 100 characters']
  },
  description: {
    type: String,
    maxlength: [1000, 'Description cannot be more than 1000 characters']
  },
  url: {
    type: String,
    required: [true, 'URL is required'],
    trim: true
  },
  type: {
    type: String,
    required: [true, 'Type is required'],
    enum: ['pdf', 'image', 'video', 'url', 'youtube', 'website'],
    default: 'url'
  },
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  book: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Book'
  },
  chapter: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Chapter'
  },
  topic: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Topic'
  },
  isGlobal: {
    type: Boolean,
    default: false
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

DatastoreItemsSchema.index({ user: 1 });
DatastoreItemsSchema.index({ book: 1 });
DatastoreItemsSchema.index({ chapter: 1 });
DatastoreItemsSchema.index({ topic: 1 });
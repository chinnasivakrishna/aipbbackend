const DatastoreItem = require('../models/DatastoreItems');
const mongoose = require('mongoose');
exports.getDatastoreItems = async (req, res) => {
  try {
    const { book, chapter, topic } = req.query;
    
    const query = { user: req.user.id };
    
    if (book) {
      if (!mongoose.Types.ObjectId.isValid(book)) {
        return res.status(400).json({
          success: false,
          message: 'Invalid book ID format'
        });
      }
      query.book = book;
    }
    
    if (chapter) {
      if (!mongoose.Types.ObjectId.isValid(chapter)) {
        return res.status(400).json({
          success: false,
          message: 'Invalid chapter ID format'
        });
      }
      query.chapter = chapter;
    }
    
    if (topic) {
      if (!mongoose.Types.ObjectId.isValid(topic)) {
        return res.status(400).json({
          success: false,
          message: 'Invalid topic ID format'
        });
      }
      query.topic = topic;
    }
    
    const items = await DatastoreItem.find(query);
    
    res.status(200).json({
      success: true,
      count: items.length,
      items
    });
  } catch (error) {
    console.error('Error in getDatastoreItems:', error);
    res.status(500).json({
      success: false,
      message: 'Server error fetching datastore items'
    });
  }
};
exports.getDatastoreItem = async (req, res) => {
  try {
    const item = await DatastoreItem.findById(req.params.id);
    if (!item) {
      return res.status(404).json({
        success: false,
        message: 'Datastore item not found'
      });
    }
    if (item.user.toString() !== req.user.id) {
      return res.status(403).json({
        success: false,
        message: 'User not authorized to access this item'
      });
    }
    res.status(200).json({
      success: true,
      item
    });
  } catch (error) {
    console.error('Error in getDatastoreItem:', error);
    if (error.kind === 'ObjectId') {
      return res.status(404).json({
        success: false,
        message: 'Datastore item not found'
      });
    }
    res.status(500).json({
      success: false,
      message: 'Server error fetching datastore item'
    });
  }
};
exports.createDatastoreItem = async (req, res) => {
  try {
    req.body.user = req.user.id;
    const item = await DatastoreItem.create(req.body);
    res.status(201).json({
      success: true,
      message: 'Datastore item created successfully',
      datastoreItem: item
    });
  } catch (error) {
    console.error('Error in createDatastoreItem:', error);
    if (error.name === 'ValidationError') {
      const messages = Object.values(error.errors).map(val => val.message);
      return res.status(400).json({
        success: false,
        message: messages[0]
      });
    }
    res.status(500).json({
      success: false,
      message: 'Server error creating datastore item'
    });
  }
};
exports.updateDatastoreItem = async (req, res) => {
  try {
    let item = await DatastoreItem.findById(req.params.id);
    if (!item) {
      return res.status(404).json({
        success: false,
        message: 'Datastore item not found'
      });
    }
    if (item.user.toString() !== req.user.id) {
      return res.status(403).json({
        success: false,
        message: 'User not authorized to update this item'
      });
    }
    req.body.updatedAt = Date.now();
    item = await DatastoreItem.findByIdAndUpdate(req.params.id, req.body, {
      new: true,
      runValidators: true
    });
    res.status(200).json({
      success: true,
      message: 'Datastore item updated successfully',
      datastoreItem: item
    });
  } catch (error) {
    console.error('Error in updateDatastoreItem:', error);
    if (error.name === 'ValidationError') {
      const messages = Object.values(error.errors).map(val => val.message);
      return res.status(400).json({
        success: false,
        message: messages[0]
      });
    }
    if (error.kind === 'ObjectId') {
      return res.status(404).json({
        success: false,
        message: 'Datastore item not found'
      });
    }
    res.status(500).json({
      success: false,
      message: 'Server error updating datastore item'
    });
  }
};
exports.deleteDatastoreItem = async (req, res) => {
  try {
    const item = await DatastoreItem.findById(req.params.id);
    if (!item) {
      return res.status(404).json({
        success: false,
        message: 'Datastore item not found'
      });
    }
    if (item.user.toString() !== req.user.id) {
      return res.status(403).json({
        success: false,
        message: 'User not authorized to delete this item'
      });
    }
    await item.deleteOne();
    res.status(200).json({
      success: true,
      message: 'Datastore item removed successfully'
    });
  } catch (error) {
    console.error('Error in deleteDatastoreItem:', error);
    if (error.kind === 'ObjectId') {
      return res.status(404).json({
        success: false,
        message: 'Datastore item not found'
      });
    }
    res.status(500).json({
      success: false,
      message: 'Server error deleting datastore item'
    });
  }
};
exports.getBookDatastoreItems = async (req, res) => {
  try {
    const { bookId } = req.params;
    if (!mongoose.Types.ObjectId.isValid(bookId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid book ID format'
      });
    }
    const items = await DatastoreItem.find({ 
      user: req.user.id,
      book: bookId 
    });
    res.status(200).json({
      success: true,
      count: items.length,
      items
    });
  } catch (error) {
    console.error('Error in getBookDatastoreItems:', error);
    res.status(500).json({
      success: false,
      message: 'Server error fetching book datastore items'
    });
  }
};
exports.getChapterDatastoreItems = async (req, res) => {
  try {
    const { chapterId } = req.params;
    if (!mongoose.Types.ObjectId.isValid(chapterId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid chapter ID format'
      });
    }
    const items = await DatastoreItem.find({ 
      user: req.user.id,
      chapter: chapterId 
    });
    res.status(200).json({
      success: true,
      count: items.length,
      items
    });
  } catch (error) {
    console.error('Error in getChapterDatastoreItems:', error);
    res.status(500).json({
      success: false,
      message: 'Server error fetching chapter datastore items'
    });
  }
};
exports.getTopicDatastoreItems = async (req, res) => {
  try {
    const { topicId } = req.params;
    if (!mongoose.Types.ObjectId.isValid(topicId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid topic ID format'
      });
    }
    const items = await DatastoreItem.find({ 
      user: req.user.id,
      topic: topicId 
    });
    res.status(200).json({
      success: true,
      count: items.length,
      items
    });
  } catch (error) {
    console.error('Error in getTopicDatastoreItems:', error);
    res.status(500).json({
      success: false,
      message: 'Server error fetching topic datastore items'
    });
  }
};
exports.assignDatastoreItem = async (req, res) => {
  try {
    const { book, chapter, topic } = req.body;
    const itemId = req.params.id;
    
    if (!book && !chapter && !topic) {
      return res.status(400).json({
        success: false,
        message: 'Please provide at least one assignment (book, chapter, or topic)'
      });
    }

    let item = await DatastoreItem.findById(itemId);
    if (!item) {
      return res.status(404).json({
        success: false,
        message: 'Datastore item not found'
      });
    }

    if (item.user.toString() !== req.user.id) {
      return res.status(403).json({
        success: false,
        message: 'User not authorized to assign this item'
      });
    }

    const updateData = { updatedAt: Date.now() };
    
    if (book) {
      if (!mongoose.Types.ObjectId.isValid(book)) {
        return res.status(400).json({
          success: false,
          message: 'Invalid book ID format'
        });
      }
      updateData.book = book;
      updateData.chapter = null;
      updateData.topic = null;
    } else if (chapter) {
      if (!mongoose.Types.ObjectId.isValid(chapter)) {
        return res.status(400).json({
          success: false,
          message: 'Invalid chapter ID format'
        });
      }
      // Verify the chapter exists and belongs to user
      const chapterDoc = await Chapter.findById(chapter).populate('book');
      if (!chapterDoc || chapterDoc.book.user.toString() !== req.user.id) {
        return res.status(400).json({
          success: false,
          message: 'Invalid chapter assignment'
        });
      }
      updateData.chapter = chapter;
      updateData.book = chapterDoc.book._id;
      updateData.topic = null;
    } else if (topic) {
      if (!mongoose.Types.ObjectId.isValid(topic)) {
        return res.status(400).json({
          success: false,
          message: 'Invalid topic ID format'
        });
      }
      // Verify the topic exists and belongs to user
      const topicDoc = await Topic.findById(topic).populate({
        path: 'chapter',
        populate: {
          path: 'book'
        }
      });
      if (!topicDoc || topicDoc.chapter.book.user.toString() !== req.user.id) {
        return res.status(400).json({
          success: false,
          message: 'Invalid topic assignment'
        });
      }
      updateData.topic = topic;
      updateData.chapter = topicDoc.chapter._id;
      updateData.book = topicDoc.chapter.book._id;
    }

    item = await DatastoreItem.findByIdAndUpdate(itemId, updateData, {
      new: true,
      runValidators: true
    }).populate('book chapter topic');
    
    res.status(200).json({
      success: true,
      message: 'Datastore item assigned successfully',
      datastoreItem: item
    });
  } catch (error) {
    console.error('Error in assignDatastoreItem:', error);
    res.status(500).json({
      success: false,
      message: 'Server error assigning datastore item'
    });
  }
};
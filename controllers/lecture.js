const Book = require("../models/Book");
const Course = require("../models/Course");
const Lecture = require("../models/Lectures");


const createlecture = async (req, res) => {
  try {
    const { bookId, courseId } = req.params;
    const {
      lectureNumber,
      lectureName,
      lectureDescription,
      topics,
    } = req.body;
    const book = await Book.findById(bookId);
    if (!book) {
      return res
        .status(404)
        .json({ success: false, message: "Book not found" });
    }
    const course = await Course.findById(courseId);
    if (!course) {
      return res
        .status(404)
        .json({ success: false, message: "Course not found" });
    }

    // Enforce unique topicName within topics array
    const topicNames = (topics || []).map(t => t.topicName);
    if (new Set(topicNames).size !== topicNames.length) {
      return res.status(400).json({ success: false, message: "Duplicate topicName in topics array" });
    }

    const lecture = await Lecture.create({
      lectureNumber,
      lectureName,
      lectureDescription,
      courseId:courseId,
      topics
    });
    res
      .status(200)
      .json({
        success: true,
        message: "Lecture created successfully",
        lecture,
      });
  } 
    catch (error) {
    console.log(error);
    res.status(500).json(
      { 
      success: false, 
      message:error.message || "server error"
      });
  }
};

const getlecture  = async (req,res) => {
  try {
    const { bookId, courseId } = req.params;
    const book = await Book.findById(bookId);
    if(!book){
      return res.status(404).json({ success: false, message: "Book not found" });
    }
    const course = await Course.findById(courseId);
    if(!course){
      return res.status(404).json({ success: false, message: "Course not found" });
    }
    const lecture = await Lecture.find({courseId:courseId});
    res.status(200).json({ success: true, message: "Lecture fetched successfully", lecture });
  }
  catch (error) {
    console.log(error);
    res.status(500).json({ success: false, message: "Server error" });
  }
}

const updatelecture = async (req,res) => {
  try {
    const { bookId, courseId, lectureId } = req.params;
    const { lectureNumber, lectureName, lectureDescription, topics } = req.body;
    const book = await Book.findById(bookId);
    if(!book){
      return res.status(404).json({ success: false, message: "Book not found" });
    }
    const course = await Course.findById(courseId); 
    if(!course){
      return res.status(404).json({ success: false, message: "Course not found" });
    }
    const lecture = await Lecture.findById(lectureId);
    if(!lecture){
      return res.status(404).json({ success: false, message: "Lecture not found" });
    } 
    const updatedLecture = await Lecture.findByIdAndUpdate(lectureId, { lectureNumber, lectureName, lectureDescription, topics }, { new: true });
   
    res.status(200).json({ success: true, message: "Lecture updated successfully", updatedLecture });
  } 
  catch (error) {
    console.log(error);
    res.status(500).json({ success: false, message: "Server error" });
  }
}

const deletelecture = async (req,res) => {
  try {
    const { bookId, courseId, lectureId } = req.params;
    const book = await Book.findById(bookId);
    if(!book){
      return res.status(404).json({ success: false, message: "Book not found" });
    }
    const course = await Course.findById(courseId);
    if(!course){  
      return res.status(404).json({ success: false, message: "Course not found" });
    }
    const lecture = await Lecture.findById(lectureId);
    if(!lecture){
      return res.status(404).json({ success: false, message: "Lecture not found" });
    } 
    await Lecture.findByIdAndDelete(lectureId);
    res.status(200).json({ success: true, message: "Lecture deleted successfully" });
  } 
  catch (error) {
    console.log(error);
    res.status(500).json({ success: false, message: "Server error" });
  }
}

module.exports = { createlecture , getlecture , updatelecture , deletelecture };
const Book = require("../models/Book");
const Course = require("../models/Course");
const Lecture = require("../models/Lectures");


const createlecture = async (req, res) => {
  try {
    const { bookId, courseId } = req.params;
    const {
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

    // Find the max lectureNumber for this course
    const lastLecture = await Lecture.findOne({ courseId }).sort({ lectureNumber: -1 });
    const nextLectureNumber = lastLecture ? lastLecture.lectureNumber + 1 : 1;

    const lecture = await Lecture.create({
      lectureName,
      lectureDescription,
      courseId:courseId,
      topics,
      lectureNumber: nextLectureNumber
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
    res.status(200).json({ success: true, message: "Lecture fetched successfully",        lectureId:lecture._id,
      lecture });
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
   
    res.status(200).json({ success: true, message: "Lecture updated successfully",        lectureId:lecture._id,
      updatedLecture });
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
    res.status(200).json({ success: true, message: "Lecture deleted successfully" ,        lectureId:lecture._id,
    });
  } 
  catch (error) {
    console.log(error);
    res.status(500).json({ success: false, message: "Server error" });
  }
}

module.exports = { createlecture , getlecture , updatelecture , deletelecture };
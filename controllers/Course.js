const path = require('path');
const Book = require("../models/Book");
const User = require("../models/User");
const Course = require("../models/Course");
const MobileUser = require("../models/MobileUser");
const { generatePresignedUrl, generateGetPresignedUrl, deleteObject } = require("../utils/s3");

// Get presigned URL for cover image upload
const getuploadurl = async (req, res) => {
    try {
      const user = req.user;
      console.log(user.businessName)
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
      const key = `${user.businessName}/courses/course-${uniqueSuffix}${ext}`;
  
      // Generate presigned URL
      const uploadUrl = await generatePresignedUrl(key, contentType);
  
      return res.status(200).json({
        success: true,
        uploadUrl,
        key
      });
    } catch (error) {
      console.error('Get cover image upload URL error:', error);
      return res.status(500).json({ success: false, message: 'Server Error' });
    }
};

const createcourse = async (req, res) => {
  try {
    const { name, overview, details, cover_imageKey, faculty } = req.body;
    const { bookId } = req.params;

    // Optional: Check if the book exists
    const book = await Book.findById(bookId);
    if (!book) {
      return res
        .status(404)
        .json({ success: false, message: "Book not found" });
    }

    const currentUser = await User.findById(req.user.id);
    if (!currentUser) {
      return res
        .status(404)
        .json({ success: false, message: "User not found" });
    }

    const cover_imageUrl = await generateGetPresignedUrl(cover_imageKey);

    // Process each faculty member
    const processedFaculty = await Promise.all(
      (faculty || []).map(async (fac) => ({
        ...fac,
        faculty_imageUrl: fac.faculty_imageKey
          ? await generateGetPresignedUrl(fac.faculty_imageKey)
          : undefined,
      }))
    );

    const course = await Course.create({
      name,
      overview,
      details,
      cover_imageKey,
      cover_imageUrl,
      faculty: processedFaculty,
      bookId,
    });

    res.status(200).json({
      success: true,
      message: "course created successfully",
      course,
    });
  } catch (error) {
    console.log(error);
    res.status(500).json({ success: false, message: "Server Error" });
  }
};

const getcourses = async (req, res) => {
  try {
    const { bookId } = req.params;
    // Optional: Check if the book exists
    const book = await Book.findById(bookId);
    if (!book) {
      return res
        .status(404)
        .json({ success: false, message: "Book not found" });
    }
    
    const course = await Course.find({bookId});

    if(course.length === 0)
    {
      return res
      .status(200)
      .json({success:true, message:`Course not found in this Book ${bookId}`})
    }

    res.status(200).json({
        success:true,
        message:"course retrieved successfully",
        course:course
    })
  } catch (error) {
    console.log(error)
  }
};

const updatecourse = async (req, res) => {
    try {
        const { bookId, courseId } = req.params;
        const { name, overview, details, cover_imageKey, faculty } = req.body;

        // Optional: Check if the book exists
        const book = await Book.findById(bookId);
        if (!book) {
            return res.status(404).json({ success: false, message: "Book not found" });
        }
        

        // Find and update the course
        const updatedCourse = await Course.findById(courseId);

        if (!updatedCourse) {
            return res.status(404).json({ success: false, message: "Course not found" });
        }
        if(updatedCourse.cover_imageKey && updatedCourse.cover_imageUrl){
            await deleteObject(updatedCourse.cover_imageKey);
        }
        if(updatedCourse.faculty.faculty_imageKey && updatedCourse.faculty.faculty_imageUrl){
            await deleteObject(updatedCourse.faculty.faculty_imageKey);
        }
        const cover_imageUrl = await generateGetPresignedUrl(cover_imageKey);
        const faculty_imageUrl = await generateGetPresignedUrl(faculty.faculty_imageKey);
        updatedCourse.name = name;
        updatedCourse.overview = overview;
        updatedCourse.details = details;
        updatedCourse.cover_imageKey = cover_imageKey;
        updatedCourse.cover_imageUrl = cover_imageUrl;
        updatedCourse.faculty = faculty;
        updatedCourse.faculty.faculty_imageUrl = faculty_imageUrl;
        await updatedCourse.save();

        res.status(200).json({
            success: true,
            message: "Course updated successfully",
            course: updatedCourse
        });
    } catch (error) {
        console.log(error);
        res.status(500).json({ success: false, message: "Server error" });
    }
}

const deletecourse = async (req,res) =>
    {
        try {
            const { bookId } = req.params;
            const { courseId } = req.params;
            // Optional: Check if the book exists
            const book = await Book.findById(bookId);
            if (!book) {
              return res
                .status(404)
                .json({ success: false, message: "Book not found" });
            }
            const course = await Course.findById(courseId) ;
            if(!course){
                return res
                .status(404)
                .json({ success: false, message: "Course not found" });
            }
            if(course.cover_imageKey && course.cover_imageUrl){
                await deleteObject(course.cover_imageKey);
            }
            if(course.faculty.faculty_imageKey && course.faculty.faculty_imageUrl){
                await deleteObject(course.faculty.faculty_imageKey);
            }
            await course.deleteOne();
            res.status(200).json({
                success:true,
                message:"course deleted successfully",
                courseId:courseId,
                course:course
            })
        } 
        catch (error) {
          console.log(error);
          res.status(500).json({ success: false, message: "Server error" });        }
    }
module.exports = { createcourse, getcourses, deletecourse, updatecourse, getuploadurl };

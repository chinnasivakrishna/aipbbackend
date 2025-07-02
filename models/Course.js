const mongoose = require("mongoose");

const courseSchema = mongoose.Schema({
  bookId:{type:String,required:true},
  name: { type: String, required: true },
  overview: { type: String, required: true },
  details: { type: String, required: true },
  cover_imageKey: { type: String },
  cover_imageUrl: { type: String },
  faculty: [{
    name: { type: String, required: true },
    about: { type: String, required: true },
    faculty_imageKey: { type: String },
    faculty_imageUrl: { type: String },
  }]
});

module.exports = mongoose.model("Course", courseSchema);

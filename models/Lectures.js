const mongoose = require("mongoose");

const lectureSchema = new mongoose.Schema({
    courseId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Course",
        required: true,
    },
    lectureNumber: {
        type: Number,
    },
    lectureName: {
        type: String,
        required: true,
    },
    topics:[{
        topicName: {
            type: String,
            required: true,
        },
        topicDescription: {
            type: String,
            required: true,
        },
        VideoUrl: {
            type: String,
            required: true,
        },
    }],
    lectureDescription: {
        type: String,
        required: true,
    },
});


module.exports = mongoose.model("Lecture", lectureSchema);
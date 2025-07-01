const mongoose = require("mongoose");

const lectureSchema = new mongoose.Schema({
    courseId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Course",
        required: true,
    },
    lectureNumber: {
        type: Number,
        required: true,
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

lectureSchema.index({ courseId: 1, lectureNumber: 1 }, { unique: true });
lectureSchema.index({ courseId: 1, lectureName: 1 }, { unique: true });
// Note: topicName uniqueness within topics array is enforced in the controller, not via schema.

module.exports = mongoose.model("Lecture", lectureSchema);
const express = require('express');
const { verifyToken } = require('../middleware/auth');
const { createcourse, getcourses, updatecourse, deletecourse, getuploadurl } = require('../controllers/Course');
const { createlecture, getlecture, updatelecture, deletelecture} = require('../controllers/lecture');

const router = express.Router();

router.post('/upload-url',verifyToken, getuploadurl);

router.post('/:bookId/course',verifyToken, createcourse);

router.get('/:bookId/course', getcourses);

router.put('/:bookId/course/:courseId',verifyToken, updatecourse);

router.delete('/:bookId/course/:courseId',verifyToken, deletecourse);

router.post('/:bookId/course/:courseId/topic',verifyToken,createlecture);

router.get('/:bookId/course/:courseId/topic',getlecture);

router.put('/:bookId/course/:courseId/topic/:lectureId',verifyToken,updatelecture);

router.delete('/:bookId/course/:courseId/topic/:lectureId',verifyToken,deletelecture);

module.exports = router

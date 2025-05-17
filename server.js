const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const dotenv = require('dotenv');
const path = require('path');
const authRoutes = require('./routes/auth');
const adminRoutes = require('./routes/admin');
const clientRoutes = require('./routes/client');
const userRoutes = require('./routes/user');
const datastoreRoutess = require('./routes/datastores');
const bookRoutes = require('./routes/books');
const subtopicsRoutes = require('./routes/subtopics');
const qrcodeRoutes = require('./routes/qrcode');
const pdfSplitsRoutes = require('./routes/pdfSplits');

dotenv.config();
const app = express();

app.use(cors({
  origin: 'http://localhost:3000',
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true
}));

app.use(express.json());
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

mongoose.connect(process.env.MONGODB_URI)
  .then(() => console.log('Connected to MongoDB'))
  .catch(err => console.error('MongoDB connection error:', err));

app.use('/api/auth', authRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/client', clientRoutes);
app.use('/api/user', userRoutes);
app.use('/api/datastores', datastoreRoutess);
app.use('/api/books', bookRoutes);
app.use('/api/qrcode', qrcodeRoutes);
app.use('/api/books', pdfSplitsRoutes);

// Mount subtopics routes with nested path parameters
app.use('/api/books/:bookId/chapters/:chapterId/topics/:topicId/subtopics', subtopicsRoutes);

app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ success: false, message: 'Internal server error' });
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
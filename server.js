import 'dotenv/config';
import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import path from 'path';
import fs from 'fs';
import compression from "compression";

// Configuration imports
import connectDB from './config/db.js';
import { initSocket } from './sockets/socketHandler.js';
import Message from './models/Message.js';

// Route imports
import authRoutes from './routes/authRoutes.js';
import userRoutes from './routes/userRoutes.js';
import friendRoutes from './routes/friendRoutes.js';
import messageRoutes from './routes/messageRoutes.js';

// Connect to MongoDB
connectDB();

const app = express();
const server = http.createServer(app);

// Configure CORS
const allowedOrigins = [
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  process.env.CLIENT_URL,
  process.env.CLIENT_URL_ALT,
].filter(Boolean);
app.use(
  cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (like mobile apps or curl)
      if (!origin || allowedOrigins.indexOf(origin) !== -1) {
        callback(null, true);
      } else {
        callback(new Error('Not allowed by CORS'));
      }
    },
    credentials: true,
  })
);

// Apply Security and Parsing Middleware
app.use(
  helmet({
    crossOriginResourcePolicy: { policy: 'cross-origin' }, // Allows loading images from server in frontend
  })
);
app.use(compression());

app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true, limit: "1mb" }));
app.use(cookieParser());


// Static folder for local file uploads
const uploadsDir = path.resolve('uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}
app.use(
  "/uploads",
  express.static(uploadsDir, {
    maxAge: "7d",
    etag: true,
  })
);
// Attach APIs
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/friends', friendRoutes);
app.use('/api/messages', messageRoutes);

// Base route / health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'healthy', timestamp: new Date() });
});

// 404 Route handler
app.use((req, res, next) => {
  res.status(404).json({ success: false, message: 'Resource not found' });
});

// Global Error Handler
app.use((err, req, res, next) => {
  console.error('Unhandled Server Error:', err.message);
  res.status(500).json({
    success: false,
    message: err.message || 'Internal Server Error',
  });
});

// Initialize Socket.IO
const io = new Server(server, {
  cors: {
    origin: allowedOrigins,
    credentials: true,
    methods: ['GET', 'POST'],
  },
  cookie: true, // Parse socket handshake cookies
});

// Set global socket instance
global.ioInstance = io;

initSocket(io);

// Redundant Cleanup Cron: run every hour to delete messages older than 24 hours (86400000 ms)
const CLEANUP_INTERVAL = 60 * 60 * 1000; // 1 hour
setInterval(async () => {
  console.log('Running scheduled message cleanup cron...');
  try {
    const cutoffTime = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const result = await Message.deleteMany({ createdAt: { $lt: cutoffTime } });
    console.log(`Pruned ${result.deletedCount} expired messages successfully.`);
  } catch (error) {
    console.error('Error running message cleanup job:', error);
  }
}, CLEANUP_INTERVAL);

// Start Server
const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`Server running in ${process.env.NODE_ENV || 'development'} mode on port ${PORT}`);
});

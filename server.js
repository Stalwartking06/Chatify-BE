import "dotenv/config";

import http from "http";
import { Server } from "socket.io";

import connectDB from "./config/db.js";
import app from "./app.js";

import { initSocket } from "./sockets/socketHandler.js";

// Database

await connectDB();

// Server

const server = http.createServer(app);

// Socket

const allowedOrigins = [
  "http://localhost:5173",
  "http://127.0.0.1:5173",
  process.env.CLIENT_URL,
  process.env.CLIENT_URL_ALT,
].filter(Boolean);

const io = new Server(server, {
  cors: {
    origin: allowedOrigins,
    credentials: true,
    methods: ["GET", "POST"],
  },
  cookie: true,
});

global.ioInstance = io;

initSocket(io);

// Start

const PORT = process.env.PORT || 5000;

server.listen(PORT, () => {
  console.log(
    `Server running in ${
      process.env.NODE_ENV || "development"
    } mode on port ${PORT}`,
  );
});

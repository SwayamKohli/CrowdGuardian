const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
require('dotenv').config(); // Load environment variables from .env file

const { Pool } = require('pg'); // Use Pool for efficient connection management

// --- Database Connection Setup ---
const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 5432,
  database: process.env.DB_NAME || 'crowdguardian',
  user: process.env.DB_USER || 'cg_user',
  password: process.env.DB_PASSWORD || 'your_strong_app_password', // Use the password from .env
});

// Test the database connection
pool.query('SELECT NOW()', (err, res) => {
  if (err) {
    console.error('Database connection error:', err.stack);
  } else {
    console.log('Connected to PostgreSQL database successfully!');
    console.log('Current time from DB:', res.rows[0].now);
  }
});

// --- Express App Setup ---
const app = express();
const port = process.env.PORT || 3000;

// Middleware
app.use(cors()); // Enable CORS for all routes
app.use(express.json()); // Parse incoming JSON requests

// Basic route for testing
app.get('/', (req, res) => {
  res.send('CrowdGuardian Backend API is running!');
});

// --- API Routes (Placeholder for now, will add specific routes later) ---
// Example: app.use('/api/choke-points', chokePointsRouter);
// We'll define these routers next

// --- Socket.IO Setup ---
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: "http://localhost:5173", // Allow requests from Vite dev server
    methods: ["GET", "POST"]
  }
});

io.on('connection', (socket) => {
  console.log('A user connected:', socket.id);

  socket.on('disconnect', () => {
    console.log('A user disconnected:', socket.id);
  });
});

// Start the server
server.listen(port, () => {
  console.log(`CrowdGuardian Backend server listening at http://localhost:${port}`);
});

// Export pool and io for use in other files (like route handlers)
module.exports = { pool, io };
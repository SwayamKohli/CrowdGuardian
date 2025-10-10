const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
const { spawn } = require('child_process');
require('dotenv').config();

const { Pool } = require('pg');

// Initialize PostgreSQL connection pool using environment variables
const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 5432,
  database: process.env.DB_NAME || 'crowdguardian',
  user: process.env.DB_USER || 'cg_user',
  password: process.env.DB_PASSWORD || 'your_strong_app_password',
});

// Verify database connection upon startup
pool.query('SELECT NOW()', (err, res) => {
  if (err) {
    console.error('Database connection error:', err.stack);
  } else {
    console.log('Connected to PostgreSQL database successfully!');
    console.log('Current time from DB:', res.rows[0].now);
  }
});

const app = express();
const port = process.env.PORT || 3000;

// Configure middleware
app.use(cors());
app.use(express.json());

// Base API route for health check
app.get('/', (req, res) => {
  res.send('CrowdGuardian Backend API is running!');
});

// Setup API routers and inject the database pool
const createChokePointsRouter = require('./routes/chokePoints');
const chokePointsRouter = createChokePointsRouter(pool);
app.use('/api/choke-points', chokePointsRouter);

const createZoneMetricsRouter = require('./routes/zoneMetrics');
const zoneMetricsRouter = createZoneMetricsRouter(pool);
app.use('/api/zone-metrics', zoneMetricsRouter);

const createAlertsRouter = require('./routes/alerts');
const alertsRouter = createAlertsRouter(pool);
app.use('/api/alerts', alertsRouter);

const createHistoricalDataRouter = require('./routes/incidents');
const historicalDataRouter = createHistoricalDataRouter(pool);
app.use('/api/historical-data', historicalDataRouter);

const createEvacuationRoutesRouter = require('./routes/evacuationRoutes');
const evacuationRoutesRouter = createEvacuationRoutesRouter(pool);
app.use('/api/evacuation-routes', evacuationRoutesRouter);

// ----------------------------------------------------------------------
// ML MODEL AND ALGORITHM ROUTES
// ----------------------------------------------------------------------

/**
 * POST /api/predict-risk: Executes the ML model via a Python subprocess.
 * Input: JSON features (crowd_density, avg_flow_speed, rate_of_change_density, hour_of_day).
 * Output: Predicted risk level (e.g., 'Low', 'High').
 */
app.post('/api/predict-risk', async (req, res) => {
  const { crowd_density, avg_flow_speed, rate_of_change_density, hour_of_day } = req.body;

  // Validate required input
  if (crowd_density === undefined || avg_flow_speed === undefined || 
      rate_of_change_density === undefined || hour_of_day === undefined) {
    return res.status(400).json({ error: 'Missing required ML features.' });
  }

  // Prepare the input data object for the Python script
  const inputData = {
    crowd_density: parseFloat(crowd_density),
    avg_flow_speed: parseFloat(avg_flow_speed),
    rate_of_change_density: parseFloat(rate_of_change_density),
    hour_of_day: parseInt(hour_of_day),
  };

  const pythonScriptPath = './python_scripts/predict_risk.py';
  const inputJsonString = JSON.stringify(inputData);

  // Spawn the Python process, passing input data as a command-line argument
  const pythonProcess = spawn('python', [pythonScriptPath, inputJsonString]);

  let outputData = '';
  let errorData = '';

  // Capture prediction result from stdout
  pythonProcess.stdout.on('data', (data) => {
    outputData += data.toString();
  });

  // Capture errors from stderr
  pythonProcess.stderr.on('data', (data) => {
    errorData += data.toString();
  });

  // Handle process closure
  pythonProcess.on('close', (code) => {
    if (code !== 0) {
      console.error(`Python script exited with code ${code}. Error: ${errorData}`);
      return res.status(500).json({ error: `Python script error: ${errorData || 'Unknown error'}` });
    }

    const predictionResult = outputData.trim();

    // Validate and send the result
    if (!['Low', 'Medium', 'High', 'Critical'].includes(predictionResult)) {
        console.error(`Python script returned unexpected result: ${predictionResult}`);
        return res.status(500).json({ error: `Python script returned unexpected result: ${predictionResult}` });
    }

    res.json({ predicted_risk_level: predictionResult, input_used: inputData });
  });

  // Handle errors (e.g., Python not found)
  pythonProcess.on('error', (err) => {
    console.error('Failed to start Python process:', err);
    res.status(500).json({ error: 'Failed to start ML prediction process' });
  });
});

/**
 * POST /api/calculate-evacuation-route: Placeholder for running the ADA algorithm.
 * This route will eventually execute a Python script or service dedicated to route planning.
 */
app.post('/api/calculate-evacuation-route', (req, res) => {
  console.log("Received request to calculate evacuation route.");
  // Response indicates implementation is pending
  res.status(501).json({ error: 'Evacuation route calculation is not yet implemented (requires ADA algorithm).' });
});

// ----------------------------------------------------------------------
// SERVER & SOCKET SETUP
// ----------------------------------------------------------------------

const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: "http://localhost:5173",
    methods: ["GET", "POST"]
  }
});

// --- Socket.IO Test Logic (Temporary) ---
const testInterval = setInterval(() => {
  io.emit('server_time_update', { serverTime: new Date().toISOString(), message: 'This is a periodic update from the server.' });
}, 10000);

// Handle Socket.IO connections
io.on('connection', (socket) => {
  console.log('A user connected:', socket.id);

  // Emit a test event to the newly connected client
  socket.emit('server_hello', { message: `Hello from server! Your ID is ${socket.id}` });

  socket.on('disconnect', () => {
    console.log('A user disconnected:', socket.id);
  });
});

// Start the server
server.listen(port, () => {
  console.log(`CrowdGuardian Backend server listening at http://localhost:${port}`);
});

// Export pool and io for use in other files
module.exports = { pool, io };
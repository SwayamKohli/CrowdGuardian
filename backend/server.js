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
 * POST /api/predict-risk: Executes the ML model via a Python subprocess (Manual/On-Demand).
 * Input: JSON features (crowd_density, avg_flow_speed, rate_of_change_density, hour_of_day).
 */
app.post('/api/predict-risk', async (req, res) => {
  const { crowd_density, avg_flow_speed, rate_of_change_density, hour_of_day } = req.body;

  if (crowd_density === undefined || avg_flow_speed === undefined ||
      rate_of_change_density === undefined || hour_of_day === undefined) {
    return res.status(400).json({ error: 'Missing required ML features.' });
  }

  const inputData = {
    crowd_density: parseFloat(crowd_density),
    avg_flow_speed: parseFloat(avg_flow_speed),
    rate_of_change_density: parseFloat(rate_of_change_density),
    hour_of_day: parseInt(hour_of_day)
  };

  const pythonScriptPath = './python_scripts/predict_risk.py';
  const inputJsonString = JSON.stringify(inputData);

  const pythonProcess = spawn('python', [pythonScriptPath, inputJsonString]);

  let outputData = '';
  let errorData = '';

  pythonProcess.stdout.on('data', (data) => {
    outputData += data.toString();
  });

  pythonProcess.stderr.on('data', (data) => {
    errorData += data.toString();
  });

  pythonProcess.on('close', (code) => {
    if (code !== 0) {
      console.error(`Python script exited with code ${code}. Error: ${errorData}`);
      return res.status(500).json({ error: `Python script error: ${errorData || 'Unknown error'}` });
    }

    const predictionResult = outputData.trim();
    console.log(`Manual API: Prediction result from Python: ${predictionResult}`);

    if (!['Low', 'Medium', 'High', 'Critical'].includes(predictionResult)) {
        console.error(`Python script returned unexpected result: ${predictionResult}`);
        return res.status(500).json({ error: `Python script returned unexpected result: ${predictionResult}` });
    }

    res.json({ predicted_risk_level: predictionResult, input_used: inputData });
  });

  pythonProcess.on('error', (err) => {
    console.error('Failed to start Python process:', err);
    res.status(500).json({ error: 'Failed to start ML prediction process' });
  });
});

/**
 * POST /api/calculate-evacuation-route: Placeholder for running the ADA algorithm.
 * This route is for future implementation and dynamic route planning.
 */
app.post('/api/calculate-evacuation-route', (req, res) => {
  console.log("Received request to calculate evacuation route.");
  res.status(501).json({ error: 'Evacuation route calculation is not yet implemented (requires ADA algorithm).' });
});

// ----------------------------------------------------------------------
// AUTOMATIC RISK PREDICTION LOGIC (INTELLIGENT WARNING SYSTEM)
// ----------------------------------------------------------------------

/**
 * Periodically fetches latest zone metrics, calculates required features,
 * runs the ML model, and emits risk alerts via Socket.IO.
 */
async function runAutomaticRiskPrediction() {
  try {
    console.log("Automatic Risk Prediction: Fetching latest zone metrics...");
    
    // Query to get the 10 most recent zone metrics across all zones
    const result = await pool.query(`
      SELECT zone_id, density, avg_speed, flow_direction, choke_point_id, timestamp
      FROM zone_metrics
      ORDER BY timestamp DESC
      LIMIT 10
    `);

    if (result.rows.length === 0) {
        console.log("Automatic Risk Prediction: No recent zone metrics found.");
        return;
    }

    // --- Feature Calculation (Simplified) ---
    const latestMetric = result.rows[0];
    let rate_of_change_density = 0;
    
    const sameZoneMetrics = result.rows.filter(row => row.zone_id === latestMetric.zone_id)
                                      .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

    // Calculate density rate of change if at least two data points exist for the same zone
    if (sameZoneMetrics.length >= 2) {
        const recent = sameZoneMetrics[0];
        const previous = sameZoneMetrics[1];
        const timeDiffSeconds = (new Date(recent.timestamp) - new Date(previous.timestamp)) / 1000;

        if (timeDiffSeconds > 0) {
            rate_of_change_density = (recent.density - previous.density) / timeDiffSeconds;
        }
    }

    const hour_of_day = new Date(latestMetric.timestamp).getHours();

    // Prepare input data for the Python script
    const inputData = {
      crowd_density: latestMetric.density || 0,
      avg_flow_speed: latestMetric.avg_speed || 0,
      rate_of_change_density: rate_of_change_density,
      hour_of_day: hour_of_day,
    };

    // --- Call Python Script ---
    const pythonScriptPath = './python_scripts/predict_risk.py';
    const inputJsonString = JSON.stringify(inputData);

    const pythonProcess = spawn('python', [pythonScriptPath, inputJsonString]);

    let outputData = '';
    let errorData = '';

    pythonProcess.stdout.on('data', (data) => { outputData += data.toString(); });
    pythonProcess.stderr.on('data', (data) => { errorData += data.toString(); });

    pythonProcess.on('close', (code) => {
      if (code !== 0) {
        console.error(`Python script (Auto) exited with code ${code}. Error: ${errorData}`);
        return;
      }

      const predictionResult = outputData.trim();
      console.log(`Auto Prediction: Result for Zone ${latestMetric.zone_id}: ${predictionResult}`);

      if (!['Low', 'Medium', 'High', 'Critical'].includes(predictionResult)) { return; }

      // --- Emit Risk Alert via Socket.IO ---
      const alertData = {
          type: 'RISK_PREDICTION',
          zone_id: latestMetric.zone_id,
          severity_level: predictionResult, // Use prediction as severity
          message: `Predicted ${predictionResult} risk in Zone ${latestMetric.zone_id} based on metrics.`,
          generated_at: new Date().toISOString(),
          input_data_used: inputData
      };

      io.emit('risk_alert_generated', alertData);
    });

    pythonProcess.on('error', (err) => {
      console.error('Failed to start Python process (Auto):', err);
    });

  } catch (err) {
    console.error('Error during automatic risk prediction:', err);
  }
}

// Schedule Automatic Risk Prediction to run every 30 seconds
const predictionInterval = setInterval(runAutomaticRiskPrediction, 30000); 

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

// Handle Socket.IO connections
io.on('connection', (socket) => {
  console.log('A user connected:', socket.id);
  socket.emit('server_hello', { message: `Hello from server! Your ID is ${socket.id}` }); // Test event
  
  socket.on('disconnect', () => {
    console.log('A user disconnected:', socket.id);
  });
});

// Start the server
server.listen(port, () => {
  console.log(`CrowdGuardian Backend server listening at http://localhost:${port}`);
});

// --- Graceful Shutdown ---
process.on('SIGINT', () => {
  console.log('Shutting down server...');
  clearInterval(predictionInterval);
  server.close(() => {
    console.log('Server closed.');
    process.exit(0);
  });
});

module.exports = { pool, io };
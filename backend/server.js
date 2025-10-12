const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
const { spawn } = require('child_process');
require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 5432,
  database: process.env.DB_NAME || 'crowdguardian',
  user: process.env.DB_USER || 'cg_user',
  password: process.env.DB_PASSWORD || 'your_strong_app_password',
});

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

app.use(cors());
app.use(express.json());

app.get('/', (req, res) => {
  res.send('CrowdGuardian Backend API is running!');
});

// Routers
const createChokePointsRouter = require('./routes/chokePoints');
app.use('/api/choke-points', createChokePointsRouter(pool));

const createZoneMetricsRouter = require('./routes/zoneMetrics');
app.use('/api/zone-metrics', createZoneMetricsRouter(pool));

const createAlertsRouter = require('./routes/alerts');
app.use('/api/alerts', createAlertsRouter(pool));

const createHistoricalDataRouter = require('./routes/incidents');
app.use('/api/historical-data', createHistoricalDataRouter(pool));

const createEvacuationRoutesRouter = require('./routes/evacuationRoutes');
app.use('/api/evacuation-routes', createEvacuationRoutesRouter(pool));

// --- ML Manual Risk Prediction ---
app.post('/api/predict-risk', async (req, res) => {
  const { crowd_density, avg_flow_speed, rate_of_change_density, hour_of_day } = req.body;

  if (crowd_density === undefined || avg_flow_speed === undefined || rate_of_change_density === undefined || hour_of_day === undefined) {
    return res.status(400).json({ error: 'crowd_density, avg_flow_speed, rate_of_change_density, and hour_of_day are required.' });
  }

  const inputData = {
    crowd_density: parseFloat(crowd_density),
    avg_flow_speed: parseFloat(avg_flow_speed),
    rate_of_change_density: parseFloat(rate_of_change_density),
    hour_of_day: parseInt(hour_of_day),
  };

  const pythonScriptPath = './python_scripts/predict_risk.py';
  const pythonProcess = spawn('python', [pythonScriptPath, JSON.stringify(inputData)]);

  let outputData = '', errorData = '';

  pythonProcess.stdout.on('data', (data) => { outputData += data.toString(); });
  pythonProcess.stderr.on('data', (data) => { errorData += data.toString(); });

  pythonProcess.on('close', (code) => {
    if (code !== 0) {
      console.error(`Python script (ML) exited with code ${code}. Error: ${errorData}`);
      return res.status(500).json({ error: `Python script error: ${errorData || 'Unknown error'}` });
    }

    const predictionResult = outputData.trim();
    console.log(`Manual Prediction Result: ${predictionResult}`);

    if (!['Low', 'Medium', 'High', 'Critical'].includes(predictionResult)) {
      return res.status(500).json({ error: `Unexpected result from Python script: ${predictionResult}` });
    }

    res.json({ predicted_risk_level: predictionResult, input_used: inputData });
  });

  pythonProcess.on('error', (err) => {
    console.error('Failed to start Python process (ML):', err);
    res.status(500).json({ error: 'Failed to start ML prediction process' });
  });
});

// --- NEW: Dynamic Evacuation Route Calculation ---
app.post('/api/calculate-evacuation-route', async (req, res) => {
  const { start_lat, start_lng, end_lat, end_lng, city_name = "New Delhi, India" } = req.body;

  if ([start_lat, start_lng, end_lat, end_lng].some(v => v === undefined)) {
    return res.status(400).json({ error: 'start_lat, start_lng, end_lat, and end_lng are required.' });
  }

  const numericStartLat = parseFloat(start_lat);
  const numericStartLng = parseFloat(start_lng);
  const numericEndLat = parseFloat(end_lat);
  const numericEndLng = parseFloat(end_lng);

  if ([numericStartLat, numericStartLng, numericEndLat, numericEndLng].some(isNaN)) {
    return res.status(400).json({ error: 'Latitude and longitude values must be numeric.' });
  }

  const pythonScriptPath = './python_scripts/calculate_evacuation_route.py';
  const args = [
    pythonScriptPath,
    numericStartLat.toString(),
    numericStartLng.toString(),
    numericEndLat.toString(),
    numericEndLng.toString(),
    city_name
  ];

  const pythonProcess = spawn('python', args);
  let outputData = '', errorData = '';

  pythonProcess.stdout.on('data', (data) => { outputData += data.toString(); });
  pythonProcess.stderr.on('data', (data) => { errorData += data.toString(); });

  pythonProcess.on('close', (code) => {
    if (code !== 0) {
      let errorMessage = `Python script error: ${errorData || 'Unknown error'}`;
      try {
        const errorJson = JSON.parse(errorData);
        if (errorJson.message) errorMessage = errorJson.message;
      } catch (_) {}
      return res.status(500).json({ error: errorMessage });
    }

    try {
      const result = JSON.parse(outputData.trim());
      if (result.status !== 'success' || !Array.isArray(result.route_coordinates)) {
        return res.status(500).json({ error: 'Unexpected result structure from evacuation script.' });
      }
      res.json(result);
    } catch (err) {
      console.error('Failed to parse Python script output:', err);
      res.status(500).json({ error: 'Failed to parse result from evacuation route script.' });
    }
  });

  pythonProcess.on('error', (err) => {
    console.error('Failed to start Python process (Evacuation):', err);
    res.status(500).json({ error: 'Failed to start evacuation route calculation process' });
  });
});

// --- Automatic Risk Prediction ---
async function runAutomaticRiskPrediction() {
  try {
    const result = await pool.query(`
      SELECT zone_id, density, avg_speed, flow_direction, choke_point_id, timestamp
      FROM zone_metrics
      ORDER BY timestamp DESC
      LIMIT 10
    `);

    if (result.rows.length === 0) return;

    const latest = result.rows[0];
    let rate_of_change_density = 0;

    const sameZoneMetrics = result.rows.filter(row => row.zone_id === latest.zone_id)
                                       .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

    if (sameZoneMetrics.length >= 2) {
      const recent = sameZoneMetrics[0];
      const previous = sameZoneMetrics[1];
      const timeDiff = (new Date(recent.timestamp) - new Date(previous.timestamp)) / 1000;
      if (timeDiff > 0) {
        rate_of_change_density = (recent.density - previous.density) / timeDiff;
      }
    }

    const hour_of_day = new Date(latest.timestamp).getHours();

    const inputData = {
      crowd_density: latest.density || 0,
      avg_flow_speed: latest.avg_speed || 0,
      rate_of_change_density,
      hour_of_day
    };

    const pythonScriptPath = './python_scripts/predict_risk.py';
    const pythonProcess = spawn('python', [pythonScriptPath, JSON.stringify(inputData)]);

    let outputData = '', errorData = '';

    pythonProcess.stdout.on('data', (data) => { outputData += data.toString(); });
    pythonProcess.stderr.on('data', (data) => { errorData += data.toString(); });

    pythonProcess.on('close', (code) => {
      if (code !== 0) return;

      const result = outputData.trim();
      if (!['Low', 'Medium', 'High', 'Critical'].includes(result)) return;

      const alertData = {
        type: 'RISK_PREDICTION',
        zone_id: latest.zone_id,
        severity_level: result,
        message: `Predicted ${result} risk in Zone ${latest.zone_id}.`,
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

const predictionInterval = setInterval(runAutomaticRiskPrediction, 30000); // 30 seconds

// --- Server + Socket.IO Setup ---
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: "http://localhost:5173",
    methods: ["GET", "POST"]
  }
});

io.on('connection', (socket) => {
  console.log('A user connected:', socket.id);
  socket.emit('server_hello', { message: `Hello from server! Your ID is ${socket.id}` });

  socket.on('disconnect', () => {
    console.log('A user disconnected:', socket.id);
  });
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

server.listen(port, () => {
  console.log(`CrowdGuardian Backend server listening at http://localhost:${port}`);
});

module.exports = { pool, io };

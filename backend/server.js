const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
const { spawn } = require('child_process');
require('dotenv').config();

const { Pool } = require('pg');

// Initialize PostgreSQL connection pool
const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 5432,
  database: process.env.DB_NAME || 'crowdguardian',
  user: process.env.DB_USER || 'cg_user',
  password: process.env.DB_PASSWORD || 'your_strong_app_password',
});

// Verify DB connection
pool.query('SELECT NOW()', (err, res) => {
  if (err) console.error('Database connection error:', err.stack);
  else console.log('Connected to PostgreSQL database. Current time:', res.rows[0].now);
});

const app = express();
const port = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

// Base route
app.get('/', (req, res) => res.send('CrowdGuardian Backend API is running!'));

// API routers
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

// ----------------------------------------------------------------------
// ML MODEL AND ALGORITHM UTILITIES
// ----------------------------------------------------------------------

function runPythonPrediction(scriptPath, inputData, callback) {
  const inputJsonString = JSON.stringify(inputData);
  const pythonProcess = spawn('python', [scriptPath, inputJsonString]);

  let outputData = '';
  let errorData = '';

  pythonProcess.stdout.on('data', (data) => { outputData += data.toString(); });
  pythonProcess.stderr.on('data', (data) => { errorData += data.toString(); });

  pythonProcess.on('close', (code) => {
    if (code !== 0) return callback(new Error(`Python script exited with code ${code}. Error: ${errorData || 'Unknown error'}`));
    const predictionResult = outputData.trim();
    if (!['Low', 'Medium', 'High', 'Critical'].includes(predictionResult)) {
      return callback(new Error(`Python script returned unexpected result: ${predictionResult}`));
    }
    callback(null, predictionResult);
  });

  pythonProcess.on('error', (err) => callback(new Error(`Failed to start Python process: ${err.message}`)));
}

// ----------------------------------------------------------------------
// API ENDPOINTS
// ----------------------------------------------------------------------

// POST /api/predict-risk
app.post('/api/predict-risk', async (req, res) => {
  const { crowd_density, avg_flow_speed, rate_of_change_density, hour_of_day } = req.body;
  if (crowd_density === undefined || avg_flow_speed === undefined || rate_of_change_density === undefined || hour_of_day === undefined) {
    return res.status(400).json({ error: 'Missing required ML features.' });
  }

  const inputData = {
    crowd_density: parseFloat(crowd_density),
    avg_flow_speed: parseFloat(avg_flow_speed),
    rate_of_change_density: parseFloat(rate_of_change_density),
    hour_of_day: parseInt(hour_of_day)
  };

  runPythonPrediction('./python_scripts/predict_risk.py', inputData, (err, predictionResult) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ predicted_risk_level: predictionResult, input_used: inputData });
  });
});

// POST /api/calculate-evacuation-route
app.post('/api/calculate-evacuation-route', async (req, res) => {
  const { start_lat, start_lng, end_lat, end_lng, city_name = "New Delhi, India" } = req.body;
  if ([start_lat, start_lng, end_lat, end_lng].some(v => v === undefined)) {
    return res.status(400).json({ error: 'start/end coordinates are required.' });
  }

  const [numericStartLat, numericStartLng, numericEndLat, numericEndLng] = [start_lat, start_lng, end_lat, end_lng].map(parseFloat);
  if ([numericStartLat, numericStartLng, numericEndLat, numericEndLng].some(isNaN)) {
    return res.status(400).json({ error: 'Coordinates must be numeric values.' });
  }

  const pythonScriptPath = './python_scripts/calculate_evacuation_route.py';
  const args = [pythonScriptPath, numericStartLat.toString(), numericStartLng.toString(), numericEndLat.toString(), numericEndLng.toString(), city_name];
  const pythonProcess = spawn('python', args);

  let outputData = '', errorData = '';
  pythonProcess.stdout.on('data', (data) => { outputData += data.toString(); });
  pythonProcess.stderr.on('data', (data) => { errorData += data.toString(); });

  pythonProcess.on('close', (code) => {
    if (code !== 0) return res.status(500).json({ error: `Python script error: ${errorData || 'Unknown error'}` });
    try {
      const result = JSON.parse(outputData.trim());
      if (result.status !== 'success' || !Array.isArray(result.route_coordinates)) {
        return res.status(500).json({ error: 'Python script returned unexpected result structure' });
      }
      res.json(result);
    } catch {
      res.status(500).json({ error: 'Error parsing result from evacuation route calculation script' });
    }
  });

  pythonProcess.on('error', (err) => res.status(500).json({ error: 'Failed to start evacuation route calculation process' }));
});

// ----------------------------------------------------------------------
// AUTOMATIC RISK PREDICTION LOGIC
// ----------------------------------------------------------------------

const SAFE_ZONE_COORDINATES = { lat: 28.6050, lng: 77.2000 };
const EVACUATION_TRIGGER_LEVELS = ['High', 'Critical'];

// --- UPDATED ZONE COORDINATE MAPPING (actual zone_ids) ---
const ZONE_COORDINATE_MAPPING = {
  'Z01_CP': { lat: 28.6316, lng: 77.2180 },
  'Z02_IG': { lat: 28.6129, lng: 77.2274 },
  'Z03_LT': { lat: 28.5535, lng: 77.2588 },
  'Z04_RF': { lat: 28.6562, lng: 77.2410 },
  'Z05_HK': { lat: 28.5530, lng: 77.2090 },
  'Z06_SF': { lat: 28.5520, lng: 77.1950 },
  'Z07_SCW': { lat: 28.5355, lng: 77.2405 },
  'Z08_QM': { lat: 28.5285, lng: 77.1372 },
  'Z09_KB': { lat: 28.6475, lng: 77.1950 },
  'Z10_IGI': { lat: 28.5663, lng: 77.1009 },
  'Z11_DWK': { lat: 28.5833, lng: 77.0425 },
  'Z12_AKS': { lat: 28.6140, lng: 77.2764 },
  'Z13_NDA': { lat: 28.5770, lng: 77.3235 },
  'Z14_AVB': { lat: 28.6465, lng: 77.3190 },
  'Z15_RHI': { lat: 28.7300, lng: 77.1105 },
  'Z16_NSP': { lat: 28.6942, lng: 77.1420 },
  'Z17_CC': { lat: 28.6565, lng: 77.2300 },
  'Z18_LJN': { lat: 28.5700, lng: 77.2340 },
  'Z19_DK': { lat: 28.5900, lng: 77.1400 },
  'Z20_DU': { lat: 28.6872, lng: 77.2084 },
};

// Process risk per zone
const processZoneRisk = async (zoneId, zoneMetrics) => {
  const latestMetric = zoneMetrics[0];
  let rate_of_change_density = 0;
  if (zoneMetrics.length >= 2) {
    const recent = zoneMetrics[0];
    const previous = zoneMetrics[1];
    const timeDiffSeconds = (new Date(recent.timestamp) - new Date(previous.timestamp)) / 1000;
    if (timeDiffSeconds > 0) rate_of_change_density = (recent.density - previous.density) / timeDiffSeconds;
  }
  const hour_of_day = new Date(latestMetric.timestamp).getHours();

  const inputData = {
    crowd_density: latestMetric.density || 0,
    avg_flow_speed: latestMetric.avg_speed || 0,
    rate_of_change_density,
    hour_of_day,
  };

  runPythonPrediction('./python_scripts/predict_risk.py', inputData, (err, predictionResult) => {
    if (err) return console.error(`Auto Prediction Error for zone ${zoneId}: ${err.message}`);

    const alertTimestampIso = new Date().toISOString();
    const alertData = {
      type: 'RISK_PREDICTION',
      zone_id: zoneId,
      severity_level: predictionResult,
      message: `Predicted ${predictionResult} risk in Zone ${zoneId}.`,
      timestamp: alertTimestampIso,
      generated_at: alertTimestampIso,
      input_data_used: inputData
    };
    io.emit('risk_alert_generated', alertData);

    if (EVACUATION_TRIGGER_LEVELS.includes(predictionResult)) {
      console.log(`Automatic Evacuation: High risk detected in zone ${zoneId}. Triggering route calculation...`);

      const startCoord = ZONE_COORDINATE_MAPPING[zoneId];
      if (!startCoord) {
        console.log(`No mapped start coordinates for zone ${zoneId}. Skipping route calculation.`);
        return;
      }

      const evacArgs = [
        './python_scripts/calculate_evacuation_route.py',
        startCoord.lat.toString(),
        startCoord.lng.toString(),
        SAFE_ZONE_COORDINATES.lat.toString(),
        SAFE_ZONE_COORDINATES.lng.toString(),
        "New Delhi, India"
      ];

      const evacProcess = spawn('python', evacArgs);
      let evacOutputData = '', evacErrorData = '';
      evacProcess.stdout.on('data', (data) => { evacOutputData += data.toString(); });
      evacProcess.stderr.on('data', (data) => { evacErrorData += data.toString(); });

      evacProcess.on('close', (evacCode) => {
        if (evacCode !== 0) {
          console.error(`Evacuation route calculation failed for zone ${zoneId}: ${evacErrorData}`);
          io.emit('evacuation_error', { error: evacErrorData, zone_id: zoneId });
          return;
        }
        try {
          const evacResult = JSON.parse(evacOutputData.trim());
          if (evacResult.status !== 'success' || !Array.isArray(evacResult.route_coordinates)) {
            throw new Error(evacResult.message || 'Unexpected result structure');
          }
          io.emit('evacuation_route_calculated', {
            type: 'EVACUATION_ROUTE_CALCULATED',
            zone_id: zoneId,
            risk_level_that_triggered: predictionResult,
            path_coordinates: JSON.stringify(evacResult.route_coordinates),
            distance_kms: evacResult.distance_kms,
            start_point: evacResult.start_point,
            end_point: evacResult.end_point,
            calculated_at: new Date().toISOString()
          });
        } catch (err) {
          console.error('Error parsing evacuation route result:', err.message);
          io.emit('evacuation_error', { error: err.message, zone_id: zoneId });
        }
      });
    }
  });
};

// Automatic risk prediction loop
async function runAutomaticRiskPrediction() {
  try {
    const result = await pool.query(`
      SELECT DISTINCT ON (zone_id)
        zone_id, density, avg_speed, flow_direction, choke_point_id, timestamp
      FROM zone_metrics
      ORDER BY zone_id, timestamp DESC
    `);
    if (!result.rows.length) return;

    const metricsByZone = {};
    result.rows.forEach(row => {
      if (!metricsByZone[row.zone_id]) metricsByZone[row.zone_id] = [];
      metricsByZone[row.zone_id].push(row);
    });

    for (const zoneId of Object.keys(metricsByZone)) {
      processZoneRisk(zoneId, metricsByZone[zoneId]);
    }
  } catch (err) {
    console.error('Error during automatic risk prediction:', err);
  }
}

// ----------------------------------------------------------------------
// SERVER & SOCKET.IO SETUP
// ----------------------------------------------------------------------

const server = http.createServer(app);
const io = socketIo(server, { cors: { origin: "http://localhost:5173", methods: ["GET","POST"] } });

// Emit latest zone metrics
async function emitLatestZoneMetrics() {
  try {
    const result = await pool.query(`
      SELECT DISTINCT ON (zm.zone_id)
        zm.zone_id,
        zm.density,
        zm.avg_speed,
        zm.flow_direction,
        zm.choke_point_id,
        zm.timestamp,
        zm.latitude,
        zm.longitude
      FROM zone_metrics zm
      WHERE zm.latitude IS NOT NULL AND zm.longitude IS NOT NULL
      ORDER BY zm.zone_id, zm.timestamp DESC
    `);
    if (result.rows.length) io.emit('zone_metrics_update', result.rows);
  } catch (err) {
    console.error('Error emitting latest zone metrics:', err);
  }
}

// Schedule automatic tasks
const predictionInterval = setInterval(runAutomaticRiskPrediction, 10000);
const metricsEmissionInterval = setInterval(emitLatestZoneMetrics, 3000);

// Socket.IO connection
io.on('connection', (socket) => {
  console.log('A user connected:', socket.id);
  socket.emit('server_hello', { message: `Hello from server! Your ID is ${socket.id}` });
  socket.on('disconnect', () => console.log('A user disconnected:', socket.id));
});

// Start server
server.listen(port, () => console.log(`CrowdGuardian Backend listening at http://localhost:${port}`));

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('Shutting down server...');
  clearInterval(predictionInterval);
  clearInterval(metricsEmissionInterval);
  server.close(() => {
    console.log('Server closed.');
    process.exit(0);
  });
});

module.exports = { pool, io };
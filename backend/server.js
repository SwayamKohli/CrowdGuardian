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
    if (code !== 0) {
      return callback(new Error(`Python script exited with code ${code}. Error: ${errorData || 'Unknown error'}`));
    }
    const predictionResult = outputData.trim();
    if (!['Low', 'Medium', 'High', 'Critical'].includes(predictionResult)) {
      return callback(new Error(`Python script returned unexpected result: ${predictionResult}`));
    }
    callback(null, predictionResult);
  });

  pythonProcess.on('error', (err) => {
    callback(new Error(`Failed to start Python process: ${err.message}`));
  });
}

// ----------------------------------------------------------------------
// API ENDPOINTS
// ----------------------------------------------------------------------

// POST /api/predict-risk
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

  runPythonPrediction('./python_scripts/predict_risk.py', inputData, (err, predictionResult) => {
    if (err) {
      console.error(`Manual API Prediction Error: ${err.message}`);
      return res.status(500).json({ error: err.message });
    }
    res.json({ predicted_risk_level: predictionResult, input_used: inputData });
  });
});

// POST /api/calculate-evacuation-route
app.post('/api/calculate-evacuation-route', async (req, res) => {
  const { start_lat, start_lng, end_lat, end_lng, city_name = "New Delhi, India" } = req.body;

  if (start_lat === undefined || start_lng === undefined || end_lat === undefined || end_lng === undefined) {
    return res.status(400).json({ error: 'start/end coordinates are required.' });
  }

  const numericStartLat = parseFloat(start_lat);
  const numericStartLng = parseFloat(start_lng);
  const numericEndLat = parseFloat(end_lat);
  const numericEndLng = parseFloat(end_lng);

  if (isNaN(numericStartLat) || isNaN(numericStartLng) || isNaN(numericEndLat) || isNaN(numericEndLng)) {
      return res.status(400).json({ error: 'Coordinates must be numeric values.' });
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

  let outputData = '';
  let errorData = '';

  pythonProcess.stdout.on('data', (data) => { outputData += data.toString(); });
  pythonProcess.stderr.on('data', (data) => { errorData += data.toString(); });

  pythonProcess.on('close', (code) => {
    if (code !== 0) {
      console.error(`Python script (Evacuation) exited with code ${code}. Error: ${errorData}`);
      return res.status(500).json({ error: `Python script error: ${errorData || 'Unknown error'}` });
    }

    try {
      const result = JSON.parse(outputData.trim());
      
      if (result.status === 'error') {
          console.error(`Python script (Evacuation) returned an error: ${result.message}`);
          return res.status(500).json({ error: result.message });
      }

      if (result.status !== 'success' || !Array.isArray(result.route_coordinates)) {
          console.error(`Python script (Evacuation) returned unexpected result structure: `, result);
          return res.status(500).json({ error: 'Python script returned unexpected result structure' });
      }

      res.json(result);
    } catch (parseError) {
      console.error('Error parsing JSON output from Python script (Evacuation):', parseError);
      res.status(500).json({ error: 'Error parsing result from evacuation route calculation script' });
    }
  });

  pythonProcess.on('error', (err) => {
    console.error('Failed to start Python process (Evacuation):', err);
    res.status(500).json({ error: 'Failed to start evacuation route calculation process' });
  });
});

// ----------------------------------------------------------------------
// AUTOMATIC RISK PREDICTION LOGIC
// ----------------------------------------------------------------------

const SAFE_ZONE_COORDINATES = { lat: 28.6050, lng: 77.2000 };
const EVACUATION_TRIGGER_LEVELS = ['High', 'Critical'];

// Zone coordinate mapping
const ZONE_COORDINATE_MAPPING = {
    'Z1': { lat: 28.6316, lng: 77.2180 },
    'Z2': { lat: 28.6129, lng: 77.2274 },
    'Z3': { lat: 28.5535, lng: 77.2588 },
    'Z4': { lat: 28.6575, lng: 77.2340 }
};

const processZoneRisk = async (zoneId, zoneMetrics) => {
  const latestMetric = zoneMetrics[0]; 
  let rate_of_change_density = 0;
  
  if (zoneMetrics.length >= 2) {
    const recent = zoneMetrics[0];
    const previous = zoneMetrics[1];
    const timeDiffSeconds = (new Date(recent.timestamp) - new Date(previous.timestamp)) / 1000;
    
    if (timeDiffSeconds > 0) {
      rate_of_change_density = (recent.density - previous.density) / timeDiffSeconds;
    }
  }

  const hour_of_day = new Date(latestMetric.timestamp).getHours();

  const inputData = {
    crowd_density: latestMetric.density || 0,
    avg_flow_speed: latestMetric.avg_speed || 0,
    rate_of_change_density,
    hour_of_day,
  };

  runPythonPrediction('./python_scripts/predict_risk.py', inputData, (err, predictionResult) => {
    if (err) {
      console.error(`Auto Prediction Error for zone ${zoneId}: ${err.message}`);
      return;
    }

    const alertTimestampIso = new Date().toISOString();
    const alertData = {
      type: 'RISK_PREDICTION',
      zone_id: zoneId,
      severity_level: predictionResult,
      message: `Predicted ${predictionResult} risk in Zone ${zoneId} based on metrics.`,
      timestamp: alertTimestampIso,
      generated_at: alertTimestampIso,
      input_data_used: inputData
    };
    io.emit('risk_alert_generated', alertData);

    if (EVACUATION_TRIGGER_LEVELS.includes(predictionResult)) {
      console.log(`Automatic Evacuation: High risk detected in zone ${zoneId}. Triggering route calculation...`);

      const startCoord = ZONE_COORDINATE_MAPPING[zoneId];
      if (!startCoord) {
        console.log(`Start coordinates for zone ${zoneId} unknown. Skipping route calculation.`);
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
            route_coordinates: evacResult.route_coordinates,
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

async function runAutomaticRiskPrediction() {
  try {
    // Get latest metric per zone
    const result = await pool.query(`
      SELECT DISTINCT ON (zone_id)
        zone_id, density, avg_speed, flow_direction, choke_point_id, timestamp
      FROM zone_metrics
      ORDER BY zone_id, timestamp DESC
    `);

    if (result.rows.length === 0) return;

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
// SERVER & SOCKET SETUP
// ----------------------------------------------------------------------

const server = http.createServer(app);
const io = socketIo(server, {
  cors: { origin: "http://localhost:5173", methods: ["GET", "POST"] }
});

// Emit latest zone metrics including coordinates
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
        zp.latitude AS latitude,
        zp.longitude AS longitude
      FROM zone_metrics zm
      JOIN choke_points zp ON zm.choke_point_id = zp.id
      ORDER BY zm.zone_id, zm.timestamp DESC
    `);

    if (result.rows.length > 0) {
      io.emit('zone_metrics_update', result.rows);
    } else {
      console.log("No zone metrics found to emit.");
    }
  } catch (err) {
    console.error('Error fetching/emitting latest zone metrics:', err);
  }
}

// Schedule jobs
const predictionInterval = setInterval(runAutomaticRiskPrediction, 10000);
const metricsEmissionInterval = setInterval(emitLatestZoneMetrics, 3000);

io.on('connection', (socket) => {
  console.log('A user connected:', socket.id);
  socket.emit('server_hello', { message: `Hello from server! Your ID is ${socket.id}` });
  socket.on('disconnect', () => console.log('A user disconnected:', socket.id));
});

server.listen(port, () => {
  console.log(`CrowdGuardian Backend server listening at http://localhost:${port}`);
});

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
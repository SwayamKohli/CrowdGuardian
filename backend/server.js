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

/**
 * Executes a Python script via child_process.spawn to perform risk prediction.
 * @param {string} scriptPath - Path to the Python script.
 * @param {Object} inputData - JSON object of features for the model.
 * @param {Function} callback - Callback(err, predictionResult).
 */
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

/**
 * POST /api/predict-risk: Executes the ML model via Python subprocess (Manual/On-Demand).
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

  runPythonPrediction('./python_scripts/predict_risk.py', inputData, (err, predictionResult) => {
    if (err) {
      console.error(`Manual API Prediction Error: ${err.message}`);
      return res.status(500).json({ error: err.message });
    }
    res.json({ predicted_risk_level: predictionResult, input_used: inputData });
  });
});

/**
 * POST /api/calculate-evacuation-route: Executes the ADA algorithm for dynamic route planning.
 */
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
// AUTOMATIC RISK PREDICTION LOGIC (INTELLIGENT WARNING SYSTEM)
// ----------------------------------------------------------------------

const SAFE_ZONE_COORDINATES = { lat: 28.6050, lng: 77.2000 };
const EVACUATION_TRIGGER_LEVELS = ['High', 'Critical'];

// Zone coordinate mapping (synchronized with MapView.jsx for visualization)
const ZONE_COORDINATE_MAPPING = {
    'Z1': { lat: 28.6316, lng: 77.2180 }, // Connaught Place Area
    'Z2': { lat: 28.6129, lng: 77.2274 }, // India Gate Area
    'Z3': { lat: 28.5535, lng: 77.2588 }, // Lotus Temple Vicinity
    'Z4': { lat: 28.6575, lng: 77.2340 }   // Red Fort Area
};

/**
 * Executes ML prediction and, if necessary, the evacuation calculation for a single zone.
 * This function isolates the asynchronous logic to prevent closure errors in the main loop.
 * @param {string} zoneId - The zone currently being processed.
 * @param {Object[]} zoneMetrics - List of recent metrics for this zone.
 */
const processZoneRisk = async (zoneId, zoneMetrics) => {
    const latestMetric = zoneMetrics[0]; 

    // Calculate features for THIS zone
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
        rate_of_change_density: rate_of_change_density,
        hour_of_day: hour_of_day,
    };

    // Execute ML Prediction for THIS zone
    runPythonPrediction('./python_scripts/predict_risk.py', inputData, (err, predictionResult) => {
        if (err) {
            console.error(`Auto Prediction Error for zone ${zoneId}: ${err.message}`);
            return;
        }

        // Emit Risk Alert via Socket.IO
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

        // Trigger Evacuation Route Calculation on High/Critical Risk
        if (EVACUATION_TRIGGER_LEVELS.includes(predictionResult)) {
            console.log(`Automatic Evacuation: High risk detected in zone ${zoneId}. Triggering route calculation...`);

            const startCoord = ZONE_COORDINATE_MAPPING[zoneId];

            if (!startCoord) {
                console.log(`Automatic Evacuation: Start coordinates for zone ${zoneId} unknown. Skipping route calculation.`);
                return;
            }

            const start_lat = startCoord.lat;
            const start_lng = startCoord.lng;
            const end_lat = SAFE_ZONE_COORDINATES.lat;
            const end_lng = SAFE_ZONE_COORDINATES.lng;
            const city_name = "New Delhi, India";

            const evacScriptPath = './python_scripts/calculate_evacuation_route.py';
            const evacArgs = [
                evacScriptPath,
                start_lat.toString(),
                start_lng.toString(),
                end_lat.toString(),
                end_lng.toString(),
                city_name
            ];

            const evacProcess = spawn('python', evacArgs);

            let evacOutputData = '';
            let evacErrorData = '';

            evacProcess.stdout.on('data', (data) => { evacOutputData += data.toString(); });
            evacProcess.stderr.on('data', (data) => { evacErrorData += data.toString(); });

            evacProcess.on('close', (evacCode) => {
                if (evacCode !== 0) {
                    console.error(`Python script (Evacuation Auto) for zone ${zoneId} exited with code ${evacCode}. Error: ${evacErrorData}`);
                    io.emit('evacuation_error', { error: `Evacuation route calculation error: ${evacErrorData || 'Unknown error'}`, zone_id: zoneId });
                    return;
                }

                try {
                    const evacResult = JSON.parse(evacOutputData.trim());
                    if (evacResult.status !== 'success' || !Array.isArray(evacResult.route_coordinates)) {
                        throw new Error(evacResult.message || 'Unexpected result structure');
                    }

                    // Emit Evacuation Route via Socket.IO
                    const routeData = {
                        type: 'EVACUATION_ROUTE_CALCULATED',
                        zone_id: zoneId,
                        risk_level_that_triggered: predictionResult,
                        route_coordinates: evacResult.route_coordinates,
                        distance_kms: evacResult.distance_kms,
                        start_point: evacResult.start_point,
                        end_point: evacResult.end_point,
                        calculated_at: new Date().toISOString()
                    };

                    console.log(`Automatic Evacuation: Emitting Socket.IO event 'evacuation_route_calculated' for zone ${zoneId}`);
                    io.emit('evacuation_route_calculated', routeData);
                } catch (evacParseError) {
                    console.error('Error handling evacuation route output:', evacParseError.message);
                    io.emit('evacuation_error', { error: `Error parsing evacuation route result: ${evacParseError.message}`, zone_id: zoneId });
                }
            });

            evacProcess.on('error', (err) => {
                console.error(`Failed to start Python process (Evacuation Auto) for zone ${zoneId}:`, err);
                io.emit('evacuation_error', { error: 'Failed to start evacuation route calculation process (Auto)', zone_id: zoneId });
            });
        } else {
            console.log(`Automatic Risk Prediction: Risk level (${predictionResult}) for zone ${zoneId} is not high enough to trigger evacuation.`);
        }
    });
};


/**
 * Periodically fetches recent zone metrics for EACH ZONE, calculates required features,
 * runs the ML model for EACH ZONE, and emits risk alerts and evacuation routes via Socket.IO.
 */
async function runAutomaticRiskPrediction() {
  try {
    const timeWindowMinutes = 10;
    
    // 1. Get recent metrics for all zones within the last N minutes
    const result = await pool.query(`
      SELECT zone_id, density, avg_speed, flow_direction, choke_point_id, timestamp
      FROM zone_metrics
      WHERE timestamp >= NOW() - INTERVAL '${timeWindowMinutes} minutes'
      ORDER BY zone_id, timestamp DESC
    `);

    if (result.rows.length === 0) {
        console.log(`Automatic Risk Prediction: No recent zone metrics found within the last ${timeWindowMinutes} minutes.`);
        return;
    }

    // 2. Group metrics by zone_id (first row of each group is the latest metric for that zone)
    const metricsByZone = {};
    result.rows.forEach(row => {
        if (!metricsByZone[row.zone_id]) {
            metricsByZone[row.zone_id] = [];
        }
        metricsByZone[row.zone_id].push(row);
    });

    console.log(`Automatic Risk Prediction: Found data for zones: ${Object.keys(metricsByZone).join(', ')}`);

    // 3. Process each zone individually using the scoped processing function
    for (const zoneId of Object.keys(metricsByZone)) {
        processZoneRisk(zoneId, metricsByZone[zoneId]);
    }

  } catch (err) {
    console.error('Error during automatic risk prediction loop:', err);
  }
}

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

// Schedule Automatic Risk Prediction to run every 10 seconds
const predictionInterval = setInterval(runAutomaticRiskPrediction, 10000);

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
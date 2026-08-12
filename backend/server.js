const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
const { spawn } = require('child_process');
require('dotenv').config();

const path = require('path');
const PYTHON_PATH = path.join(__dirname, 'venv', 'bin', 'python');

const pg = require('pg');
const { Pool } = pg;

// Force pg client to parse TIMESTAMP (without time zone) columns as UTC
pg.types.setTypeParser(1114, function(stringValue) {
  return stringValue ? new Date(stringValue.replace(' ', 'T') + 'Z') : null;
});

// Initialize PostgreSQL connection pool
const pool = new Pool(
  process.env.DATABASE_URL
    ? {
        connectionString: process.env.DATABASE_URL,
        ssl: {
          rejectUnauthorized: false,
        },
      }
    : {
        host: process.env.DB_HOST || 'localhost',
        port: process.env.DB_PORT || 5432,
        database: process.env.DB_NAME || 'crowdguardian',
        user: process.env.DB_USER || 'cg_user',
        password: process.env.DB_PASSWORD || 'your_strong_app_password',
      }
);

// Verify DB connection
pool.query('SELECT NOW()', (err, res) => {
  if (err) console.error('Database connection error:', err.stack);
  else console.log('Connected to PostgreSQL database. Current time:', res.rows[0].now);
});

const app = express();
const port = process.env.PORT || 3456;

app.use(cors());
app.use(express.json());
app.get('/', (req, res) => res.send('CrowdGuardian Backend API is running!'));

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
  const pythonProcess = spawn(PYTHON_PATH, [scriptPath, inputJsonString]);

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
  const pythonProcess = spawn(PYTHON_PATH, args);

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
const EVACUATION_TRIGGER_LEVELS = ['Medium', 'High', 'Critical'];

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

  runPythonPrediction('./python_scripts/predict_risk.py', inputData, async (err, predictionResult) => {
    if (err) return console.error(`Auto Prediction Error for zone ${zoneId}: ${err.message}`);

    let alertType = 'LOW_RISK';
    if (predictionResult === 'Critical') alertType = 'HIGH_RISK';
    else if (predictionResult === 'High') alertType = 'PANIC_DETECTED';
    else if (predictionResult === 'Medium') alertType = 'CHOKE_POINT_ALERT';

    const alertTimestampIso = new Date().toISOString();
    const baseAlertData = {
      alert_type: alertType,
      zone_id: zoneId,
      severity_level: predictionResult,
      message: `Predicted ${predictionResult} risk in Zone ${zoneId}.`,
      generated_at: alertTimestampIso,
      resolved: false
    };

    let alertData = { ...baseAlertData, id: Date.now() };

    try {
      const insertResult = await pool.query(
        `INSERT INTO alerts (alert_type, severity_level, message, generated_at, zone_id, resolved)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING id`,
        [alertType, predictionResult, baseAlertData.message, alertTimestampIso, zoneId, false]
      );
      alertData.id = insertResult.rows[0].id;
    } catch (dbErr) {
      console.error('Failed to save alert to DB:', dbErr);
    }

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

      const evacProcess = spawn(PYTHON_PATH, evacArgs);
      let evacOutputData = '', evacErrorData = '';
      evacProcess.stdout.on('data', (data) => { evacOutputData += data.toString(); });
      evacProcess.stderr.on('data', (data) => { evacErrorData += data.toString(); });

      evacProcess.on('close', (evacCode) => {
        if (evacCode !== 0) {
          console.error(`Evacuation route calculation failed for zone ${zoneId}: ${evacErrorData}`);
          io.emit('evacuation_error', { error: evacErrorData, zone_id: zoneId });
          return;
        }
        // Inside evacProcess.on('close', (evacCode) => { ... })
      try {
        const evacResult = JSON.parse(evacOutputData.trim());
        if (evacResult.status !== 'success' || !Array.isArray(evacResult.route_coordinates)) {
          throw new Error(evacResult.message || 'Unexpected result structure');
        }

        // 🔥 ADD THIS LOG
        console.log(`✅ Evacuation route SUCCESS for zone ${zoneId}. Emitting to frontend...`);

        io.emit('evacuation_route_calculated', {
          type: 'EVACUATION_ROUTE_CALCULATED',
          zone_id: zoneId,
          risk_level_that_triggered: predictionResult,
          path_coordinates: evacResult.route_coordinates, // raw array
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

    // Process only 5 random zones per cycle to prevent CPU overload
    const allZoneIds = Object.keys(metricsByZone);
    const shuffled = allZoneIds.sort(() => 0.5 - Math.random());
    const zonesToProcess = shuffled.slice(0, 5);
    console.log(`Processing ${zonesToProcess.length}/${allZoneIds.length} zones this cycle:`, zonesToProcess.join(', '));
    for (const zoneId of zonesToProcess) {
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
const io = socketIo(server, { cors: { origin: ["http://localhost:5173", "http://localhost:5174", "http://localhost:5175"], methods: ["GET","POST"] } });

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
        zm.longitude,
        zm.description
      FROM zone_metrics zm
      WHERE zm.latitude IS NOT NULL AND zm.longitude IS NOT NULL
      ORDER BY zm.zone_id, zm.timestamp DESC
    `);
    if (result.rows.length) io.emit('zone_metrics_update', result.rows);
  } catch (err) {
    console.error('Error emitting latest zone metrics:', err);
  }
}

async function simulateLiveCrowdData() {
  try {
    const zoneResult = await pool.query('SELECT DISTINCT zone_id, choke_point_id FROM zone_metrics');
    const chokeResult = await pool.query('SELECT id, capacity FROM choke_points');

    let zones = zoneResult.rows;
    if (zones.length === 0) {
      zones = Object.keys(ZONE_COORDINATE_MAPPING).map(zoneId => {
        const numPart = zoneId.substring(1, 3);
        const cpId = parseInt(numPart, 10);
        return { zone_id: zoneId, choke_point_id: cpId };
      });
    }
    const chokePoints = chokeResult.rows;

    for (const zone of zones) {
      // Skip zones without fixed coordinates
      const coord = ZONE_COORDINATE_MAPPING[zone.zone_id];
      if (!coord) continue;

      const baseDensity = Math.random() * 3 + 2; // 2–5
      const variation = (Math.random() - 0.5) * 1.5; // ±0.75
      const density = Math.max(0.5, Math.min(6.0, baseDensity + variation));
      const avgSpeed = Math.max(0.1, 2.0 - (density * 0.3)); // slower when dense

      await pool.query(`
        INSERT INTO zone_metrics 
          (zone_id, density, avg_speed, flow_direction, choke_point_id, latitude, longitude, description)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      `, [
        zone.zone_id,
        density.toFixed(2),
        avgSpeed.toFixed(2),
        Math.floor(Math.random() * 360),
        zone.choke_point_id,
        coord.lat,
        coord.lng,
        `${zone.zone_id} Updated`
      ]);
    }

    for (const cp of chokePoints) {
      const baseUtil = cp.capacity * (0.4 + Math.random() * 0.5);
      const variation = (Math.random() - 0.5) * 30;
      const utilization = Math.max(0, Math.min(cp.capacity, baseUtil + variation));

      await pool.query(`
        UPDATE choke_points 
        SET current_utilization = $1 
        WHERE id = $2
      `, [Math.round(utilization), cp.id]);
    }

    console.log('Simulated live crowd data updated');

    // Cleanup: Keep only the latest 500 rows per zone to prevent DB bloat
    await pool.query(`
      DELETE FROM zone_metrics
      WHERE id NOT IN (
        SELECT id FROM (
          SELECT id, ROW_NUMBER() OVER (PARTITION BY zone_id ORDER BY timestamp DESC) as rn
          FROM zone_metrics
        ) ranked WHERE rn <= 25
      )
    `);
    console.log('Old zone_metrics data cleaned up');

    // Emit updated data to frontend
    await emitLatestZoneMetrics();

  } catch (err) {
    console.error('Error simulating crowd data:', err);
  }
}

// Run once on startup to seed initial data, then schedule intervals
simulateLiveCrowdData().then(() => {
  console.log('Initial data simulation completed on startup.');
  runAutomaticRiskPrediction();
  emitLatestZoneMetrics();
}).catch(err => {
  console.error('Error during initial startup data simulation:', err);
});

// Schedule simulation every 120 seconds
const simulationInterval = setInterval(simulateLiveCrowdData, 120000); // 120 sec

// ----------------------------------------------------------------------
// INTERVALS & SOCKET EVENTS
// ----------------------------------------------------------------------
const predictionInterval = setInterval(runAutomaticRiskPrediction, 60000);
const metricsEmissionInterval = setInterval(emitLatestZoneMetrics, 15000);

io.on('connection', (socket) => {
  console.log('A user connected:', socket.id);
  socket.emit('server_hello', { message: `Hello from server! Your ID is ${socket.id}` });
  socket.on('disconnect', () => console.log('A user disconnected:', socket.id));
});

server.listen(port, () => console.log(`CrowdGuardian Backend listening at http://localhost:${port}`));

// ----------------------------------------------------------------------
// Graceful Shutdown
// ----------------------------------------------------------------------
process.on('SIGINT', () => {
  console.log('Shutting down server...');
  clearInterval(predictionInterval);
  clearInterval(metricsEmissionInterval);
  clearInterval(simulationInterval); 
  server.close(() => {
    console.log('Server closed.');
    process.exit(0);
  });
});

module.exports = { pool, io };
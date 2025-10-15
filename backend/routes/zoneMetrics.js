const express = require('express');

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

module.exports = (pool) => {
  const router = express.Router();

  /**
   * GET /api/zone-metrics
   * Supports optional query parameters: ?zoneId=[ID]&limit=[N].
   * Only returns metrics with valid coordinates.
   */
  router.get('/', async (req, res) => {
    const { zoneId, limit = 100 } = req.query;
    
    try {
      let query = `
        SELECT 
          id, 
          zone_id, 
          timestamp, 
          density, 
          avg_speed, 
          flow_direction, 
          choke_point_id,
          latitude,
          longitude
        FROM zone_metrics
        WHERE latitude IS NOT NULL AND longitude IS NOT NULL
      `;
      const queryParams = [];
      let paramIndex = 1;

      if (zoneId) {
        query += ` AND zone_id = $${paramIndex} `;
        queryParams.push(zoneId);
        paramIndex++;
      }

      query += ` ORDER BY timestamp DESC LIMIT $${paramIndex}`;
      queryParams.push(parseInt(limit));

      const result = await pool.query(query, queryParams);
      res.json(result.rows);
    } catch (err) {
      console.error('Error fetching zone metrics:', err);
      res.status(500).json({ error: 'Internal Server Error' });
    }
  });

  return router;
};
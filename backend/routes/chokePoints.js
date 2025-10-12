const express = require('express');

module.exports = (pool) => {
  const router = express.Router();

  /**
   * Parses the location object returned by the 'pg' library's POINT type into a Leaflet-compatible array.
   * Input: { x: longitude, y: latitude }
   * Output: [latitude, longitude] array
   */
  function parsePoint(pointObject) {
    if (pointObject && typeof pointObject === 'object' && 'x' in pointObject && 'y' in pointObject) {
      const longitude = parseFloat(pointObject.x);
      const latitude = parseFloat(pointObject.y);

      if (!isNaN(longitude) && !isNaN(latitude)) {
        return [latitude, longitude];
      } else {
        console.error(`Parsed coordinates are not valid numbers: x=${pointObject.x}, y=${pointObject.y}`);
      }
    } else {
      console.error(`Location object does not have expected 'x' and 'y' properties:`, pointObject);
    }
    return null;
  }

  router.get('/', async (req, res) => {
    try {
      // FIX: Include the current_utilization column in the query
      const result = await pool.query('SELECT id, name, description, capacity, current_utilization, location FROM choke_points ORDER BY name ASC');
      
      // Process database rows to transform the POINT object into a standard [lat, lng] array
      const processedRows = result.rows.map(row => ({
        ...row,
        location: parsePoint(row.location),
      }));
      
      // The processedRows array now correctly includes the current_utilization field.
      res.json(processedRows);
    } catch (err) {
      console.error('Error fetching choke points:', err);
      res.status(500).json({ error: 'Internal Server Error' });
    }
  });

  return router;
};
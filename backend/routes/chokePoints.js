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
      }
    }
    return null;
  }

  router.get('/', async (req, res) => {
    try {
      // Select choke_points WITH location (point type)
      const query = `
        SELECT 
          cp.id, 
          cp.name, 
          cp.description, 
          cp.capacity, 
          cp.current_utilization, 
          cp.location,
          MAX(zm.zone_id) AS primary_zone_id
        FROM choke_points cp
        LEFT JOIN zone_metrics zm ON cp.id = zm.choke_point_id
        GROUP BY cp.id
        ORDER BY cp.name ASC;
      `;
      
      const result = await pool.query(query);
      
      const processedRows = result.rows.map(row => ({
        ...row,
        location: parsePoint(row.location),
      }));
      
      res.json(processedRows);
    } catch (err) {
      console.error('Error fetching choke points:', err);
      res.status(500).json({ error: 'Internal Server Error' });
    }
  });

  return router;
};
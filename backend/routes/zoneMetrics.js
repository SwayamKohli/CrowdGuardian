const express = require('express');

module.exports = (pool) => {
  const router = express.Router();

  /**
   * GET /api/zone-metrics - Fetches recent zone metrics from the database.
   * Supports optional query parameters: ?zoneId=[ID]&limit=[N].
   */
  router.get('/', async (req, res) => {
    // Extract optional query parameters: zoneId and limit
    const { zoneId, limit = 100 } = req.query;
    
    try {
      let query = 'SELECT id, zone_id, timestamp, density, avg_speed, flow_direction, choke_point_id FROM zone_metrics ';
      const queryParams = [];
      let paramIndex = 1; // Start index for PostgreSQL parameterized queries ($1, $2, ...)

      // Conditionally build the WHERE clause based on zoneId
      if (zoneId) {
        query += `WHERE zone_id = $${paramIndex} `;
        queryParams.push(zoneId);
        paramIndex++;
      }

      // Append ORDER BY and LIMIT clauses
      query += 'ORDER BY timestamp DESC LIMIT $' + paramIndex;
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
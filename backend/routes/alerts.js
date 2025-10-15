const express = require('express');

module.exports = (pool) => {
  const router = express.Router();

  router.get('/', async (req, res) => {
    const { severity, resolved, zoneId, limit = 50 } = req.query;

    try {
      let query = 'SELECT id, alert_type, severity_level, message, generated_at, resolved, resolved_at, zone_id FROM alerts ';
      const queryParams = [];
      let paramIndex = 1;
      const whereConditions = [];

      if (severity) {
        whereConditions.push(`severity_level = $${paramIndex}`);
        queryParams.push(severity);
        paramIndex++;
      }
      
      if (resolved !== undefined) {
        const resolvedBool = resolved === 'true';
        whereConditions.push(`resolved = $${paramIndex}`);
        queryParams.push(resolvedBool);
        paramIndex++;
      }

      if (zoneId) {
        whereConditions.push(`zone_id = $${paramIndex}`);
        queryParams.push(zoneId);
        paramIndex++;
      }

      if (whereConditions.length > 0) {
        query += 'WHERE ' + whereConditions.join(' AND ') + ' ';
      }

      query += 'ORDER BY generated_at DESC LIMIT $' + paramIndex;
      queryParams.push(parseInt(limit));

      const result = await pool.query(query, queryParams);
      res.json(result.rows);
    } catch (err) {
      console.error('Error fetching alerts:', err);
      res.status(500).json({ error: 'Internal Server Error' });
    }
  });

  return router;
};
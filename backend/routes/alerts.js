const express = require('express');

module.exports = (pool) => {
  const router = express.Router();

  /**
   * GET /api/alerts - Fetches recent alerts from the database, supporting filters and limits.
   * Optional query parameters: ?severity=[LEVEL]&resolved=[true/false]&limit=[N].
   */
  router.get('/', async (req, res) => {
    // Extract optional query parameters
    const { severity, resolved, limit = 50 } = req.query;

    try {
      let query = 'SELECT id, alert_type, severity_level, message, generated_at, resolved, resolved_at FROM alerts ';
      const queryParams = [];
      let paramIndex = 1; // Start index for parameterized queries ($1, $2, ...)
      const whereConditions = [];

      // Conditionally build WHERE clause based on severity filter
      if (severity) {
        whereConditions.push(`severity_level = $${paramIndex}`);
        queryParams.push(severity);
        paramIndex++;
      }
      
      // Conditionally build WHERE clause based on resolved status
      if (resolved !== undefined) {
        // Convert string 'true'/'false' query parameter to boolean
        const resolvedBool = resolved === 'true';
        whereConditions.push(`resolved = $${paramIndex}`);
        queryParams.push(resolvedBool);
        paramIndex++;
      }

      // Append WHERE clause if any conditions exist
      if (whereConditions.length > 0) {
        query += 'WHERE ' + whereConditions.join(' AND ') + ' ';
      }

      // Add ORDER BY (newest first) and LIMIT clauses
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
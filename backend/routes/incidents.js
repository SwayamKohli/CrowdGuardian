// backend/routes/incidents.js
const express = require('express');

module.exports = (pool) => {
  const router = express.Router();

  /**
   * GET /api/incidents - Fetches historical incident reports, supporting filtering by cause and limiting results.
   * Optional query parameters: ?cause=[CAUSE]&limit=[N].
   */
  router.get('/', async (req, res) => {
    // Extract optional query parameters
    const { cause, limit = 20 } = req.query;

    try {
      let query = 'SELECT id, location, description, reported_at, cause, casualties FROM incidents ';
      const queryParams = [];
      let paramIndex = 1; // Start index for parameterized queries ($1, $2, ...)

      // Conditionally build the WHERE clause based on optional cause
      if (cause) {
        query += `WHERE cause = $${paramIndex} `;
        queryParams.push(cause);
        paramIndex++;
      }

      // Add ORDER BY (most recent first) and LIMIT clauses
      query += 'ORDER BY reported_at DESC LIMIT $' + paramIndex;
      queryParams.push(parseInt(limit));

      const result = await pool.query(query, queryParams);

      // Note: The 'location' POINT field is returned as {x: lng, y: lat}.
      // Frontend processing (similar to chokePoints) may be required if Leaflet rendering is needed.
      res.json(result.rows);
    } catch (err) {
      console.error('Error fetching incidents:', err);
      res.status(500).json({ error: 'Internal Server Error' });
    }
  });

  return router;
};
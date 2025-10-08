const express = require('express');

module.exports = (pool) => {
  const router = express.Router();

  /**
   * GET /api/evacuation-routes - Fetches evacuation routes based on filters and limits.
   * Optional query parameters: ?start_zone_id=[ID]&end_zone_id=[ID]&is_active=[true/false]&limit=[N].
   */
  router.get('/', async (req, res) => {
    // Extract optional query parameters
    const { start_zone_id, end_zone_id, is_active, limit = 10 } = req.query;

    try {
      let query = 'SELECT id, start_zone_id, end_zone_id, path_coordinates, estimated_time, calculated_at, is_active FROM evacuation_routes ';
      const queryParams = [];
      let paramIndex = 1; // Start index for parameterized queries ($1, $2, ...)
      const whereConditions = [];

      // Conditionally build WHERE clause for start_zone_id
      if (start_zone_id) {
        whereConditions.push(`start_zone_id = $${paramIndex}`);
        queryParams.push(start_zone_id);
        paramIndex++;
      }
      
      // Conditionally build WHERE clause for end_zone_id
      if (end_zone_id) {
        whereConditions.push(`end_zone_id = $${paramIndex}`);
        queryParams.push(end_zone_id);
        paramIndex++;
      }
      
      // Conditionally build WHERE clause for active status
      if (is_active !== undefined) {
        // Convert string 'true'/'false' query parameter to boolean
        const isActiveBool = is_active === 'true';
        whereConditions.push(`is_active = $${paramIndex}`);
        queryParams.push(isActiveBool);
        paramIndex++;
      }

      // Append WHERE clause if any conditions exist
      if (whereConditions.length > 0) {
        query += 'WHERE ' + whereConditions.join(' AND ') + ' ';
      }

      // Add ORDER BY (most recent calculation first) and LIMIT clauses
      query += 'ORDER BY calculated_at DESC LIMIT $' + paramIndex;
      queryParams.push(parseInt(limit));

      const result = await pool.query(query, queryParams);

      // Note: If path_coordinates are stored as JSON strings in the DB, parsing may be needed here.
      res.json(result.rows);
    } catch (err) {
      console.error('Error fetching evacuation routes:', err);
      res.status(500).json({ error: 'Internal Server Error' });
    }
  });

  return router;
};
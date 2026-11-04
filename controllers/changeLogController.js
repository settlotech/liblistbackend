const { query } = require('../db');

/**
 * GET /api/change-logs
 * Returns recent change logs, optionally filtered by entity_type or department.
 */
async function getChangeLogs(req, res, next) {
  try {
    const { entity_type, limit = 50 } = req.query;

    let conditions = [];
    let params = [];
    let idx = 1;

    if (entity_type) {
      conditions.push(`entity_type = $${idx++}`);
      params.push(entity_type);
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    params.push(parseInt(limit));

    const result = await query(
      `SELECT * FROM change_logs ${where} ORDER BY timestamp DESC LIMIT $${idx};`,
      params
    );
    res.json(result.rows);
  } catch (err) {
    next(err);
  }
}

module.exports = { getChangeLogs };


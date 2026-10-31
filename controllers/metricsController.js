const { query } = require('../db');

/**
 * GET /api/dashboard-metrics
 * Returns operational performance metrics, optionally filtered by department.
 */
async function getDashboardMetrics(req, res, next) {
  try {
    const { department_id } = req.query;

    let conditions = [];
    let params = [];

    if (department_id && department_id !== 'all') {
      conditions.push(`department_id = $1`);
      params.push(department_id);
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const result = await query(
      `SELECT om.*, d.name AS department_name
       FROM operational_metrics om
       LEFT JOIN departments d ON d.id = om.department_id
       ${where}
       ORDER BY om.sla_status ASC, om.updated_at DESC;`,
      params
    );
    res.json(result.rows);
  } catch (err) {
    next(err);
  }
}

module.exports = { getDashboardMetrics };


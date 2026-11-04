const { query } = require('../db');

/**
 * GET /api/hierarchy
 * Returns the full department hierarchy tree with policy counts.
 */
async function getHierarchy(req, res, next) {
  try {
    const result = await query(`
      SELECT
        d.id, d.name, d.icon, d.parent_id, d.hierarchy_level, d.sort_order,
        COUNT(p.id) FILTER (WHERE p.status NOT IN ('draft')) AS policy_count
      FROM departments d
      LEFT JOIN policies p ON p.department_id = d.id
      GROUP BY d.id
      ORDER BY d.sort_order ASC, d.name ASC;
    `);
    res.json({ departments: result.rows });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/departments
 * Creates a new department partition.
 */
async function createDepartment(req, res, next) {
  try {
    const { name, icon = 'folder', parent_id = null, hierarchy_level = 'section', created_by = 'System Administrator' } = req.body;
    if (!name) return res.status(400).json({ error: 'Department name is required' });

    const id = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
    const existing = await query('SELECT id FROM departments WHERE id = $1', [id]);
    if (existing.rows.length > 0) return res.status(409).json({ error: 'Department already exists', id });

    const result = await query(
      `INSERT INTO departments (id, name, icon, parent_id, hierarchy_level, created_by)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *;`,
      [id, name, icon, parent_id, hierarchy_level, created_by]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    next(err);
  }
}

module.exports = { getHierarchy, createDepartment };


const { query } = require('../db');

/**
 * GET /api/templates
 * Returns all dynamic policy starter templates.
 */
async function getTemplates(req, res, next) {
  try {
    const { department_id } = req.query;
    let sql = 'SELECT * FROM policy_templates WHERE is_active = TRUE';
    let params = [];

    if (department_id && department_id !== 'all') {
      sql += ' AND (department_id = $1 OR department_id IS NULL)';
      params.push(department_id);
    }

    sql += ' ORDER BY created_at ASC;';

    const result = await query(sql, params);
    res.json(result.rows);
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/templates/:id
 * Get single template with sections and phases.
 */
async function getTemplateById(req, res, next) {
  try {
    const { id } = req.params;
    const result = await query('SELECT * FROM policy_templates WHERE id = $1', [id]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Template not found' });
    res.json(result.rows[0]);
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/templates
 * Create or save a new dynamic template.
 */
async function createTemplate(req, res, next) {
  try {
    const {
      name,
      title,
      department_id = 'company-policies',
      summary = '',
      sla = '4 Hours',
      daily = '$25,000 AUD',
      cap = '$100,000 AUD',
      sections = [],
      phases = [],
      created_by = 'Bank Owner'
    } = req.body;

    if (!name || !title) {
      return res.status(400).json({ error: 'Template name and title are required' });
    }

    const id = `template-${name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${Date.now().toString().slice(-4)}`;

    const result = await query(
      `INSERT INTO policy_templates 
        (id, name, title, department_id, summary, sla, daily_limit, officer_cap, sections, phases, is_active, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, TRUE, $11)
       RETURNING *;`,
      [
        id,
        name,
        title,
        department_id,
        summary,
        sla,
        daily,
        cap,
        JSON.stringify(sections),
        JSON.stringify(phases),
        created_by
      ]
    );

    res.status(201).json(result.rows[0]);
  } catch (err) {
    next(err);
  }
}

module.exports = {
  getTemplates,
  getTemplateById,
  createTemplate
};


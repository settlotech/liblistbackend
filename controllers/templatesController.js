const { query } = require('../db');

const DEFAULT_POLICY_TEMPLATES = [
  {
    id: 'template-standard-policy',
    name: 'Template 1',
    title: 'Policy Template',
    department_id: 'company-policies',
    summary: 'Short description of the policy',
    sla: '4 Hours',
    daily_limit: '$25,000 AUD',
    officer_cap: '$100,000 AUD',
    sections: [
      {
        id: 'sec-purpose',
        title: '1. Purpose',
        content: 'Purpose statement of the policy',
        type: 'section'
      },
      {
        id: 'sec-scope',
        title: '2. Scope/Coverage',
        content: 'Applicability of the policy. It can be based on lines of business, geographical restrictions, customer segmentation etc',
        type: 'section'
      },
      {
        id: 'sec-details',
        title: '3. Details/Description',
        content: 'Details of the policy is described in this section. It can cover multiple sections, tables, images',
        type: 'section'
      },
      {
        id: 'sec-dependencies',
        title: '4. Pre-requisites /Dependencies',
        content: 'Explain cross references to the policies',
        type: 'section'
      },
      {
        id: 'sec-controls',
        title: '5. Controls',
        content: 'This section describes key monitoring requirements. It can have a sub section for data quality',
        type: 'section'
      },
      {
        id: 'sec-reporting',
        title: '6. Reporting',
        content: 'Define key metrics for continuous monitoring activities. It also defines the report layout, refer to the report id.',
        type: 'section'
      },
      {
        id: 'sec-approval-chain',
        title: '7. Approval Chain',
        content: 'Provide the approval chain of this policy',
        type: 'section'
      }
    ]
  },
  {
    id: 'template-02-exec',
    name: 'Template 2',
    title: 'Executive Summary',
    department_id: 'company-policies',
    summary: 'Executive governance charter setting forth board-level mandates and delegated authorities.',
    sla: '24 Hours',
    daily_limit: '$100,000 AUD',
    officer_cap: '$500,000 AUD',
    sections: [
      { id: 'sec-exec-1', title: '1. Executive Summary & Statutory Purpose', content: 'Outlines statutory intent under APRA CPS 230.' }
    ]
  }
];


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
    if (result.rows && result.rows.length > 0) {
      // Ensure standard template is always present and at top
      const hasStandard = result.rows.some(r => r.id === 'template-standard-policy' || r.id === 'template-01-pdf');
      const finalTemplates = hasStandard ? result.rows : [DEFAULT_POLICY_TEMPLATES[0], ...result.rows];
      return res.json(finalTemplates);
    }
    res.json(DEFAULT_POLICY_TEMPLATES);
  } catch (err) {
    console.warn('DB error in getTemplates, using default fallback templates:', err.message);
    res.json(DEFAULT_POLICY_TEMPLATES);
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


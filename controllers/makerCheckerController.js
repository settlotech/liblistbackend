const { query } = require('../db');

/**
 * GET /api/maker-checker
 * Returns pending + history of maker-checker governance requests,
 * plus all saved drafts from the policies table.
 */
async function getMakerCheckerItems(req, res, next) {
  try {
    const result = await query(`
      SELECT * FROM maker_checker_requests
      ORDER BY
        CASE WHEN status = 'pending' AND is_closed = FALSE THEN 0 ELSE 1 END,
        created_at DESC
      LIMIT 100;
    `);

    const pending = result.rows.filter(r => r.status === 'pending' && !r.is_closed);
    const history = result.rows.filter(r => r.status !== 'pending' || r.is_closed);

    // Fetch all draft policies directly from the database
    const draftsRes = await query(`
      SELECT p.*, d.name AS department_name
      FROM policies p
      LEFT JOIN departments d ON d.id = p.department_id
      WHERE p.status = 'draft'
      ORDER BY p.updated_at DESC;
    `);

    res.json({
      pendingCount: pending.length,
      pending,
      history,
      drafts: draftsRes.rows
    });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/maker-checker
 * Creates a new maker-checker governance request.
 */
async function createMakerCheckerItem(req, res, next) {
  try {
    const {
      policy_id = null,
      policy_title = null,
      title = 'Change Request',
      type = 'update_policy',
      department_name = null,
      department = 'General',
      maker_name = 'Staff Submitter',
      requested_by = 'Bank Employee',
      change_details = '',
      status = 'pending',
      proposed_changes = null
    } = req.body;

    const polTitle = policy_title || title || 'Policy Amendment';
    const deptName = department_name || department || 'General';
    const maker = maker_name || requested_by || 'Staff Submitter';
    const changes = typeof proposed_changes === 'object' && proposed_changes !== null
      ? { ...proposed_changes, submission_note: req.body.submission_note || change_details || proposed_changes.submission_note }
      : { type, details: change_details, title: polTitle, submission_note: req.body.submission_note || change_details };

    const result = await query(
      `INSERT INTO maker_checker_requests
         (policy_id, policy_title, department_name, maker_name, maker_role, proposed_changes, status)
       VALUES ($1, $2, $3, $4, 'Bank Employee (Maker)', $5, $6)
       RETURNING *;`,
      [
        policy_id,
        polTitle,
        deptName,
        maker,
        JSON.stringify(changes),
        status
      ]
    );

    // If attached to a policy, set policy status to pending_approval if currently draft
    if (policy_id) {
      await query(
        `UPDATE policies SET status = CASE WHEN status = 'draft' THEN 'pending_approval' ELSE status END, updated_at = CURRENT_TIMESTAMP WHERE id = $1;`,
        [policy_id]
      );
    }

    res.status(201).json(result.rows[0]);
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/maker-checker/:id/action
 * Approves or rejects a maker-checker request.
 * On approval: synchronizes policy to 'active', updates parameters/clauses,
 * records a snapshot in policy_versions, and logs audit in change_logs.
 */
async function actionMakerChecker(req, res, next) {
  try {
    const { id } = req.params;
    const { action, checker_name = 'Bank Owner', comments = '' } = req.body;

    if (!['approve', 'reject'].includes(action)) {
      return res.status(400).json({ error: 'Action must be approve or reject' });
    }

    const newStatus = action === 'approve' ? 'approved' : 'rejected';
    const result = await query(
      `UPDATE maker_checker_requests
       SET status = $1, checker_name = $2, checker_comments = $3, reviewed_at = CURRENT_TIMESTAMP
       WHERE id = $4 RETURNING *;`,
      [newStatus, checker_name, comments, id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Maker-checker item not found' });

    const item = result.rows[0];

    // If approved and linked to a policy, activate the policy and apply changes
    if (action === 'approve' && item.policy_id) {
      let changes = item.proposed_changes;
      if (typeof changes === 'string') {
        try { changes = JSON.parse(changes); } catch (_) {}
      }

      const updatePolRes = await query(
        `UPDATE policies 
         SET status = 'active', 
             title = COALESCE($1, title),
             content = COALESCE($2, content),
             parameters = CASE WHEN $3::jsonb IS NOT NULL THEN $3::jsonb ELSE parameters END,
             updated_at = CURRENT_TIMESTAMP 
         WHERE id = $4
         RETURNING *;`,
        [
          changes?.title || null,
          changes?.content || null,
          changes?.parameters ? JSON.stringify(changes.parameters) : null,
          item.policy_id
        ]
      );

      const updatedPol = updatePolRes.rows[0];

      // Record snapshot in policy_versions
      if (updatedPol) {
        await query(
          `INSERT INTO policy_versions (policy_id, version_number, content, parameters, changed_by, change_summary)
           VALUES ($1, $2, $3, $4, $5, $6);`,
          [
            item.policy_id,
            updatedPol.version || '1.0',
            updatedPol.content,
            JSON.stringify(updatedPol.parameters || {}),
            checker_name,
            `Approved via Maker-Checker CR #${id}: ${comments || 'Manager approved'}`
          ]
        );
      }
    }

    await query(
      `INSERT INTO change_logs (entity_type, entity_id, user_name, action, section_name, details)
       VALUES ('maker_checker', $1, $2, $3, $4, $5);`,
      [String(id), checker_name, action.toUpperCase() + 'D',
       item.department_name, `${item.policy_title}: ${action}d by ${checker_name}. Comments: ${comments}`]
    );

    res.json({ success: true, item: result.rows[0] });
  } catch (err) {
    next(err);
  }
}

/**
 * PATCH /api/maker-checker/:id/close
 * Closes a maker-checker item (agreed/acknowledged).
 */
async function closeMakerCheckerItem(req, res, next) {
  try {
    const { id } = req.params;
    const result = await query(
      `UPDATE maker_checker_requests SET is_closed = TRUE WHERE id = $1 RETURNING *;`,
      [id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Item not found' });
    res.json({ success: true, item: result.rows[0] });
  } catch (err) {
    next(err);
  }
}

module.exports = { getMakerCheckerItems, createMakerCheckerItem, actionMakerChecker, closeMakerCheckerItem };

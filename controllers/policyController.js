const { query } = require('../db');

/**
 * GET /api/policies
 * Lightweight list — does NOT return content column. Supports filtering by department, search, and role.
 */
async function getPolicies(req, res, next) {
  try {
    const { department_id, search, user_role = 'employee' } = req.query;

    let conditions = [];
    let params = [];
    let idx = 1;

    // Role-based visibility: employees see all active, inactive, pending_approval, and drafts
    if (user_role === 'employee') {
      conditions.push(`p.status IN ('active', 'inactive', 'pending_approval', 'draft')`);
    }

    if (department_id && department_id !== 'all') {
      conditions.push(`p.department_id = $${idx++}`);
      params.push(department_id);
    }

    if (search) {
      conditions.push(`(p.title ILIKE $${idx} OR p.summary ILIKE $${idx})`);
      params.push(`%${search}%`);
      idx++;
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const result = await query(`
      SELECT
        p.id, p.department_id, p.title, p.summary, p.version, p.status, p.is_masked,
        p.created_by, p.created_at, p.updated_at, p.content, p.parameters,
        d.name AS department_name,
        p.parameters->>'turnaround_sla'   AS turnaround_sla,
        p.parameters->>'daily_limit'      AS daily_limit,
        p.parameters->'approval_limits'   AS approval_limits,
        p.parameters->'compliance_tags'   AS compliance_tags,
        jsonb_array_length(COALESCE(p.parameters->'phases', '[]'::jsonb)) AS phase_count
      FROM policies p
      LEFT JOIN departments d ON d.id = p.department_id
      ${whereClause}
      ORDER BY
        CASE WHEN p.status = 'draft' THEN 0 ELSE 1 END,
        p.updated_at DESC;
    `, params);

    res.json(result.rows);
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/policies/:id
 * Full lazy-load: returns content + phases + versions + artifacts.
 */
async function getPolicyById(req, res, next) {
  try {
    const { id } = req.params;
    const { user_role = 'employee' } = req.query;

    const result = await query(
      `SELECT p.*, d.name AS department_name
       FROM policies p
       LEFT JOIN departments d ON d.id = p.department_id
       WHERE p.id = $1;`,
      [id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Policy not found' });

    const policy = result.rows[0];

    // Mask content for employees on masked docs
    if (policy.is_masked && user_role === 'employee') {
      policy.content = '[CONFIDENTIAL — Access restricted. Contact your Bank Owner to request access.]';
    }

    // Parse parameters if string
    if (typeof policy.parameters === 'string') {
      try { policy.parameters = JSON.parse(policy.parameters); } catch (_) {}
    }

    // Version history
    const versions = await query(
      `SELECT id, version_number, changed_by, change_summary, created_at
       FROM policy_versions WHERE policy_id = $1 ORDER BY created_at DESC LIMIT 20;`,
      [id]
    );
    policy.versions = versions.rows;

    // Contextual artifacts (training sessions, reports, faqs)
    const artifacts = await query(
      `SELECT * FROM contextual_artifacts WHERE policy_id = $1 AND is_active = TRUE ORDER BY tab_type, created_at DESC;`,
      [id]
    );
    policy.artifacts = artifacts.rows;

    res.json(policy);
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/policies
 * Creates a new policy. Role-aware: employees create as 'draft', managers/admins as 'active'.
 */
async function createPolicy(req, res, next) {
  try {
    const {
      department_id,
      title,
      summary = '',
      content = '',
      parameters = {},
      created_by = 'Staff Submitter',
      creation_mode = 'manual',
      user_role = 'employee',
      user_name = 'Staff User',
      status: overrideStatus
    } = req.body;

    if (!title) return res.status(400).json({ error: 'Policy title is required' });
    if (!department_id) return res.status(400).json({ error: 'Department ID is required' });

    // Role-based status determination
    const statusMap = { manager: 'active', admin: 'active', employee: 'draft' };
    const resolvedStatus = overrideStatus || statusMap[user_role] || 'draft';

    // Generate clean ID from title
    const baseId = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '').substring(0, 80);
    const suffix = Math.floor(Math.random() * 9000) + 1000;
    const id = `${baseId}-${suffix}`;

    // Auto-extract phases from content if not provided
    let phases = Array.isArray(parameters.phases) ? parameters.phases : [];
    if (phases.length === 0 && content) {
      const phaseRegex = /###\s*Phase\s*(\d+)[:\s-]*([^\n]*)/gi;
      let m;
      while ((m = phaseRegex.exec(content)) !== null) {
        phases.push({
          id: `phase-${m[1]}`,
          phase_number: parseInt(m[1]),
          title: m[2].trim() || `Phase ${m[1]}`,
          summary: '',
          key_rules: [],
          content: ''
        });
      }
    }

    const finalParams = { ...parameters, phases };

    const result = await query(
      `INSERT INTO policies (id, department_id, title, summary, content, parameters, status, created_by, version)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, '1.0') RETURNING *;`,
      [id, department_id, title, summary, content, JSON.stringify(finalParams), resolvedStatus, created_by]
    );
    const newPolicy = result.rows[0];

    // Record initial version snapshot
    await query(
      `INSERT INTO policy_versions (policy_id, version_number, content, parameters, changed_by, change_summary)
       VALUES ($1, '1.0', $2, $3, $4, $5)
       ON CONFLICT DO NOTHING;`,
      [id, content, JSON.stringify(finalParams), user_name, `Initial ${creation_mode} creation — Status: ${resolvedStatus}`]
    );

    // Change log
    await query(
      `INSERT INTO change_logs (entity_type, entity_id, user_name, action, section_name, details)
       VALUES ('policy', $1, $2, 'CREATED', $3, $4);`,
      [id, user_name, department_id, `Policy "${title}" created via ${creation_mode}. Status: ${resolvedStatus}`]
    );

    res.status(201).json(newPolicy);
  } catch (err) {
    next(err);
  }
}

/**
 * PUT /api/policies/:id
 * Updates policy content, clauses, and parameters.
 * - If status is 'draft', any author can save changes directly.
 * - If status is 'active' and submitted by 'employee', creates a Maker-Checker change request.
 * - If submitted by 'manager' or 'admin', updates directly and bumps version.
 */
async function updatePolicy(req, res, next) {
  try {
    const { id } = req.params;
    const {
      title,
      summary,
      content,
      parameters = {},
      user_name = 'Staff User',
      updated_by = 'Staff User',
      user_role = 'employee',
      justification = 'Operational amendment',
      change_summary = 'Parameters updated',
      status: requestedStatus,
      version: requestedVersion
    } = req.body;

    const currentRes = await query('SELECT * FROM policies WHERE id = $1', [id]);
    if (currentRes.rows.length === 0) return res.status(404).json({ error: 'Policy not found' });

    const current = currentRes.rows[0];
    const authorName = updated_by || user_name;

    // Case 1: Active policy updated by Bank Employee -> routes to Maker-Checker queue
    // Case 0: Saving an Active policy as a Draft revision (e.g. employee or manager configured copy)
    if (current.status === 'active' && requestedStatus === 'draft') {
      const baseId = (title || current.title).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '').substring(0, 80);
      const suffix = Math.floor(Math.random() * 9000) + 1000;
      const draftId = `${baseId}-${suffix}`;
      const draftVer = requestedVersion || '1.0';
      const insertDraft = await query(
        `INSERT INTO policies (id, department_id, title, summary, content, parameters, status, created_by, version)
         VALUES ($1, $2, $3, $4, $5, $6, 'draft', $7, $8) RETURNING *;`,
        [draftId, current.department_id, title || current.title, summary || current.summary, content || current.content, parameters ? JSON.stringify(parameters) : JSON.stringify(current.parameters || {}), authorName, draftVer]
      );
      await query(
        `INSERT INTO policy_versions (policy_id, version_number, content, parameters, changed_by, change_summary)
         VALUES ($1, $2, $3, $4, $5, $6) ON CONFLICT DO NOTHING;`,
        [draftId, draftVer, content || current.content, parameters ? JSON.stringify(parameters) : JSON.stringify(current.parameters || {}), authorName, `Created draft revision from active policy by ${authorName}`]
      ).catch(() => {});
      return res.json(insertDraft.rows[0]);
    }

    if (current.status === 'active' && user_role === 'employee' && requestedStatus !== 'draft') {
      const mcRes = await query(
        `INSERT INTO maker_checker_requests
           (policy_id, policy_title, department_name, maker_name, maker_role, proposed_changes, status, is_closed)
         VALUES ($1, $2, $3, $4, 'Bank Employee (Maker)', $5, 'pending', false)
         RETURNING id;`,
        [
          id,
          title || current.title,
          current.department_id,
          authorName,
          JSON.stringify({ title, summary, content, parameters, justification })
        ]
      );

      await query(
        `INSERT INTO change_logs (entity_type, entity_id, user_name, action, section_name, details)
         VALUES ('maker_checker', $1, $2, 'SUBMITTED', $3, $4);`,
        [id, authorName, current.department_id, `Maker submitted amendments for '${current.title}'. Pending Manager sign-off.`]
      );

      try {
        const notificationService = require('../services/notification.service');
        await notificationService.sendNotificationToSingle({
          userId: 'u_cba_marcus',
          title: `Governance Review: ${title || current.title}`,
          body: `${authorName} submitted change proposal for "${title || current.title}". Pending Manager sign-off.`,
          data: {
            policyId: id,
            type: 'maker_checker_submission'
          },
          clickAction: '/changelogs'
        });
      } catch (notifErr) {
        console.warn('[PolicyController] Notification notice:', notifErr.message);
      }

      return res.json({
        maker_checker: true,
        requestId: mcRes.rows[0].id,
        message: 'Change proposal submitted to Department Manager for Maker-Checker review.'
      });
    }

    // Case 2: Saving a Draft policy (stays draft, preserves version or keeps v0.9/v1.0)
    if (current.status === 'draft') {
      const draftVer = requestedVersion || current.version || '1.0';
      const result = await query(
        `UPDATE policies
         SET title = COALESCE($1, title),
             summary = COALESCE($2, summary),
             content = COALESCE($3, content),
             parameters = COALESCE($4::jsonb, parameters),
             version = $5,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = $6 RETURNING *;`,
        [title, summary, content, parameters ? JSON.stringify(parameters) : null, draftVer, id]
      );

      await query(
        `INSERT INTO policy_versions (policy_id, version_number, content, parameters, changed_by, change_summary)
         VALUES ($1, $2, $3, $4, $5, $6);`,
        [id, draftVer, content || current.content, parameters ? JSON.stringify(parameters) : JSON.stringify(current.parameters || {}), authorName, justification || change_summary || 'Draft clauses and parameters updated']
      ).catch(() => {});

      await query(
        `INSERT INTO change_logs (entity_type, entity_id, user_name, action, section_name, details)
         VALUES ('policy', $1, $2, 'DRAFT_UPDATED', $3, $4);`,
        [id, authorName, current.department_id, `Draft "${title || current.title}" (${draftVer}) updated by ${authorName}.`]
      );

      return res.json(result.rows[0]);
    }

    // Case 3: Direct Manager/Admin Update on Active Policy (bumps minor version)
    const parts = (current.version || '1.0').split('.');
    const newMinor = parseInt(parts[1] || '0') + 1;
    const newVersion = `${parts[0]}.${newMinor}`;

    const result = await query(
      `UPDATE policies
       SET title = COALESCE($1, title),
           summary = COALESCE($2, summary),
           content = COALESCE($3, content),
           parameters = COALESCE($4::jsonb, parameters),
           version = $5,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $6 RETURNING *;`,
      [title, summary, content, parameters ? JSON.stringify(parameters) : null, newVersion, id]
    );

    // Record new version in policy_versions
    await query(
      `INSERT INTO policy_versions (policy_id, version_number, content, parameters, changed_by, change_summary)
       VALUES ($1, $2, $3, $4, $5, $6);`,
      [id, newVersion, content || current.content, JSON.stringify(parameters || current.parameters), authorName, justification || change_summary]
    );

    // Record change log
    await query(
      `INSERT INTO change_logs (entity_type, entity_id, user_name, action, section_name, details)
       VALUES ('policy', $1, $2, 'CONFIGURED', $3, $4);`,
      [id, authorName, current.department_id, `Policy "${result.rows[0].title}" updated to v${newVersion}: ${justification}`]
    );

    res.json(result.rows[0]);
  } catch (err) {
    next(err);
  }
}

/**
 * PATCH /api/policies/:id/status
 * Toggles policy status: active ↔ inactive, or draft → active (publish).
 */
async function togglePolicyStatus(req, res, next) {
  try {
    const { id } = req.params;
    const { status, user_name = 'Bank Approver' } = req.body;

    const currentRes = await query('SELECT * FROM policies WHERE id = $1', [id]);
    if (currentRes.rows.length === 0) return res.status(404).json({ error: 'Policy not found' });
    const current = currentRes.rows[0];

    const result = await query(
      `UPDATE policies SET status = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2 RETURNING *;`,
      [status, id]
    );
    const p = result.rows[0];

    // When publishing from draft -> active, record snapshot in policy_versions
    if (current.status === 'draft' && status === 'active') {
      await query(
        `INSERT INTO policy_versions (policy_id, version_number, content, parameters, changed_by, change_summary)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT DO NOTHING;`,
        [id, p.version || '1.0', p.content, JSON.stringify(p.parameters || {}), user_name, `Published as Active Policy by ${user_name}`]
      );
    }

    const actionMap = { active: 'ACTIVATED', inactive: 'ARCHIVED', draft: 'DRAFTED' };
    await query(
      `INSERT INTO change_logs (entity_type, entity_id, user_name, action, section_name, details)
       VALUES ('policy', $1, $2, $3, $4, $5);`,
      [id, user_name, actionMap[status] || 'STATUS_CHANGED', p.department_id,
       `Policy "${p.title}" status changed to: ${status}`]
    );

    res.json({ success: true, status: p.status, message: `Policy is now ${status}` });
  } catch (err) {
    next(err);
  }
}

/**
 * PATCH /api/policies/:id/mask
 * Toggles document masking (confidential flag).
 */
async function togglePolicyMasking(req, res, next) {
  try {
    const { id } = req.params;
    const { is_masked, user_name = 'System' } = req.body;

    const result = await query(
      `UPDATE policies SET is_masked = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2 RETURNING *;`,
      [is_masked, id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Policy not found' });

    const action = is_masked ? 'MASKED' : 'UNMASKED';
    await query(
      `INSERT INTO change_logs (entity_type, entity_id, user_name, action, section_name, details)
       VALUES ('policy', $1, $2, $3, $4, $5);`,
      [id, user_name, action, result.rows[0].department_id, `Policy "${result.rows[0].title}" document masking set to: ${is_masked}`]
    );

    res.json({ success: true, is_masked: result.rows[0].is_masked });
  } catch (err) {
    next(err);
  }
}

/**
 * DELETE /api/policies/:id
 * Deletes a policy. Draft policies can be deleted by author; active policies require manager/admin.
 */
async function deletePolicy(req, res, next) {
  try {
    const { id } = req.params;
    const userRole = req.body?.user_role || req.query?.user_role || req.userRole || 'employee';

    const currentRes = await query('SELECT * FROM policies WHERE id = $1', [id]);
    if (currentRes.rows.length === 0) return res.status(404).json({ error: 'Policy not found' });

    if (currentRes.rows[0].status !== 'draft' && !['manager', 'admin'].includes(userRole)) {
      return res.status(403).json({ error: 'Only managers or admins can delete active policies' });
    }

    const result = await query('DELETE FROM policies WHERE id = $1 RETURNING id, title;', [id]);
    res.json({ success: true, deleted: result.rows[0] });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/policies/:id/artifacts
 * Adds a contextual artifact (training session, report, FAQ, regulatory link) to a policy document.
 */
async function addContextualArtifact(req, res, next) {
  try {
    const { id: policy_id } = req.params;
    const {
      tab_type = 'training',
      title,
      description = '',
      url_or_file = '',
      user_name = 'Bank Approver'
    } = req.body;

    if (!title) {
      return res.status(400).json({ error: 'Artifact / Training title is required' });
    }

    const result = await query(
      `INSERT INTO contextual_artifacts (policy_id, tab_type, title, description, url_or_file, is_active)
       VALUES ($1, $2, $3, $4, $5, TRUE)
       RETURNING *;`,
      [policy_id, tab_type, title.trim(), description.trim(), url_or_file.trim()]
    );

    // Audit log
    await query(
      `INSERT INTO change_logs (entity_type, entity_id, user_name, action, section_name, details)
       VALUES ('artifact', $1, $2, 'CREATED', $3, $4);`,
      [policy_id, user_name, tab_type, `New ${tab_type} module "${title}" added by ${user_name}`]
    );

    res.status(201).json(result.rows[0]);
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/policies/:id/artifacts
 * Retrieves all contextual artifacts for a given policy.
 */
async function getContextualArtifacts(req, res, next) {
  try {
    const { id: policy_id } = req.params;
    const { tab_type } = req.query;

    let sql = 'SELECT * FROM contextual_artifacts WHERE policy_id = $1 AND is_active = TRUE';
    const params = [policy_id];

    if (tab_type) {
      sql += ' AND tab_type = $2';
      params.push(tab_type);
    }
    sql += ' ORDER BY created_at DESC;';

    const result = await query(sql, params);
    res.json(result.rows);
  } catch (err) {
    next(err);
  }
}

module.exports = {
  getPolicies,
  getPolicyById,
  createPolicy,
  updatePolicy,
  togglePolicyStatus,
  togglePolicyMasking,
  deletePolicy,
  addContextualArtifact,
  getContextualArtifacts
};

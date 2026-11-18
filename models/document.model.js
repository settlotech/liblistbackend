const { query } = require('../config/db');

const create = async ({
    library_id,
    document_name,
    description = null,
    document_type = 'policy',
    status = 'draft',
    source_type = 'template',
    original_file_name = null,
    original_file_key = null,
    original_mime_type = null,
    original_file_size = null,
    created_by = null,
    updated_by = null,
    requested_by = null,
    approved_by = null,
    approved_at = null,
    sections = [],
}) => {
    const text = `
    INSERT INTO document_management.documents (
      library_id,
      document_name,
      root_document_name,
      description,
      document_type,
      status,
      source_type,
      original_file_name,
      original_file_key,
      original_mime_type,
      original_file_size,
      created_by,
      updated_by,
      requested_by,
      approved_by,
      approved_at
    )
    VALUES ($1, $2, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
    RETURNING *;
  `;
    const values = [
        library_id,
        document_name,
        description,
        document_type,
        status,
        source_type,
        original_file_name,
        original_file_key,
        original_mime_type,
        original_file_size,
        created_by,
        updated_by,
        requested_by || created_by,
        approved_by,
        approved_at,
    ];
    const res = await query(text, values);
    const doc = res.rows[0];

    // If sections provided, persist them in document_management.document_sections
    if (sections && Array.isArray(sections) && sections.length > 0) {
        for (let i = 0; i < sections.length; i++) {
            const sec = sections[i];
            const secText = `
                INSERT INTO document_management.document_sections (
                    document_id,
                    section_title,
                    section_number,
                    section_order,
                    content,
                    created_by,
                    updated_by
                )
                VALUES ($1, $2, $3, $4, $5, $6, $7)
                RETURNING *;
            `;
            const content = typeof sec.content === 'object' ? JSON.stringify(sec.content) : (sec.content || '{"type":"doc","content":[]}');
            await query(secText, [
                doc.id,
                sec.title || sec.section_title || `Section ${i + 1}`,
                sec.section_number || `${i + 1}`,
                sec.order !== undefined ? sec.order : i,
                content,
                created_by,
                updated_by,
            ]);
        }
    }

    return doc;
};

const findById = async (id) => {
    const text = `
    SELECT 
      d.*,
      COALESCE(d.root_document_name, d.document_name) AS root_policy_name,
      l.library_name,
      u_req.name AS requested_by_name,
      u_req.email AS requested_by_email,
      u_app.name AS approved_by_name,
      u_rev.name AS pending_revision_by_name,
      v.version_number AS current_version_number,
      v.commit_hash AS current_commit_hash,
      v.committed_at AS current_version_committed_at,
      pv.version_number AS pending_version_number
    FROM document_management.documents d
    JOIN document_management.libraries l ON d.library_id = l.id
    LEFT JOIN public.users u_req ON d.requested_by = u_req.id OR d.created_by = u_req.id
    LEFT JOIN public.users u_app ON d.approved_by = u_app.id
    LEFT JOIN public.users u_rev ON d.pending_revision_by = u_rev.id
    LEFT JOIN document_management.document_versions v ON COALESCE(d.live_version_id, d.current_version_id) = v.id
    LEFT JOIN document_management.document_versions pv ON d.pending_revision_id = pv.id
    WHERE d.id = $1 AND d.deleted_at IS NULL;
  `;
    const res = await query(text, [id]);
    return res.rows[0] || null;
};

const findAll = async ({
    library_id,
    status = 'all',
    document_type,
    search,
    user_id = null,
    isSuperAdmin = false,
    canApprove = false,
    isChangeManagement = false,
    limit = 50,
    offset = 0,
} = {}) => {
    const conditions = ['d.deleted_at IS NULL', 'l.deleted_at IS NULL', "d.status != 'suspended'"];
    const values = [];

    // ── Policy Access Control: Can View Check ──
    // If a policy has can_view = FALSE explicitly configured for this user in policy_user_access,
    // they MUST NOT see or access this policy in the Master Library tree, search, or document lists.
    if (!isSuperAdmin && user_id) {
        values.push(user_id);
        const puaIdx = values.length;
        conditions.push(`NOT EXISTS (
            SELECT 1 FROM document_management.policy_user_access pua
            WHERE pua.document_id = d.id AND pua.user_id = $${puaIdx} AND pua.can_view = FALSE
        )`);
    }

    if (isChangeManagement) {
        // Change Management Scope: Except Super Admin, users only see policies they authored or are revising
        if (!isSuperAdmin && user_id) {
            values.push(user_id);
            const uIdx = values.length;
            conditions.push(`(d.created_by = $${uIdx} OR d.requested_by = $${uIdx} OR d.pending_revision_by = $${uIdx})`);
        }
    } else {
        // General / Master Library Tree Scope:
        // Super Admin & Approvers see all.
        // Other users see all published active/approved policies PLUS their own drafts/revisions.
        if (!isSuperAdmin && !canApprove && user_id) {
            values.push(user_id);
            const uIdx = values.length;
            conditions.push(`(d.created_by = $${uIdx} OR d.requested_by = $${uIdx} OR d.pending_revision_by = $${uIdx} OR d.status IN ('active', 'approved'))`);
        }
    }

    if (library_id) {
        values.push(library_id);
        conditions.push(`d.library_id = $${values.length}`);
    }

    if (status && status !== 'all') {
        values.push(status);
        conditions.push(`d.status = $${values.length}`);
    }

    if (document_type) {
        values.push(document_type);
        conditions.push(`d.document_type = $${values.length}`);
    }

    if (search) {
        values.push(`%${search}%`);
        conditions.push(`(d.document_name ILIKE $${values.length} OR d.description ILIKE $${values.length})`);
    }

    const whereClause = `WHERE ${conditions.join(' AND ')}`;

    const countText = `
    SELECT COUNT(*)::int AS total
    FROM document_management.documents d
    JOIN document_management.libraries l ON d.library_id = l.id
    ${whereClause};
  `;
    const countRes = await query(countText, values);
    const total = countRes.rows[0]?.total || 0;

    values.push(limit);
    const limitParam = `$${values.length}`;
    values.push(offset);
    const offsetParam = `$${values.length}`;

    const dataText = `
    SELECT 
      d.*,
      COALESCE(d.root_document_name, d.document_name) AS root_policy_name,
      l.library_name,
      u_req.name AS requested_by_name,
      u_req.email AS requested_by_email,
      u_app.name AS approved_by_name,
      v.version_number AS current_version_number,
      v.commit_hash AS current_commit_hash,
      pv.version_number AS pending_version_number,
      pv.commit_message AS pending_revision_commit_message,
      pv.parent_version_id AS pending_revision_parent_version_id,
      lv.version_number AS live_version_number,
      lv.commit_message AS live_version_commit_message,
      root_v.version_number AS parent_version_number,
      parent_v.commit_message AS parent_commit_message,
      root_v.id AS parent_version_id,
      (SELECT COUNT(*)::int FROM document_management.document_sections s WHERE s.document_id = d.id AND s.deleted_at IS NULL) AS section_count,
      (SELECT COUNT(*)::int FROM document_management.document_versions ver WHERE ver.document_id = d.id) AS version_count
    FROM document_management.documents d
    JOIN document_management.libraries l ON d.library_id = l.id
    LEFT JOIN public.users u_req ON d.requested_by = u_req.id OR d.created_by = u_req.id
    LEFT JOIN public.users u_app ON d.approved_by = u_app.id
    LEFT JOIN document_management.document_versions v ON COALESCE(d.live_version_id, d.current_version_id) = v.id
    LEFT JOIN document_management.document_versions pv ON d.pending_revision_id = pv.id
    LEFT JOIN document_management.document_versions lv ON d.live_version_id = lv.id
    LEFT JOIN document_management.document_versions root_v ON root_v.document_id = d.id AND root_v.version_number = '1.0'
    LEFT JOIN document_management.document_versions parent_v ON root_v.id = parent_v.id
    ${whereClause}
    ORDER BY d.updated_at DESC
    LIMIT ${limitParam} OFFSET ${offsetParam};
  `;

    const dataRes = await query(dataText, values);
    return {
        documents: dataRes.rows,
        total,
    };
};

const update = async (id, data, updated_by = null) => {
    const allowed = ['document_name', 'description', 'document_type', 'status'];
    const sets = [];
    const values = [];

    for (const key of allowed) {
        if (data[key] !== undefined) {
            values.push(data[key]);
            sets.push(`${key} = $${values.length}`);
        }
    }

    if (sets.length === 0) {
        return findById(id);
    }

    values.push(updated_by);
    sets.push(`updated_by = $${values.length}`);
    sets.push(`updated_at = NOW()`);

    values.push(id);
    const idParam = `$${values.length}`;

    const text = `
    UPDATE document_management.documents
    SET ${sets.join(', ')}
    WHERE id = ${idParam} AND deleted_at IS NULL
    RETURNING *;
  `;
    const res = await query(text, values);
    return res.rows[0] || null;
};

const softDelete = async (id, updated_by = null) => {
    const text = `
    UPDATE document_management.documents
    SET deleted_at = NOW(), updated_by = $2
    WHERE id = $1 AND deleted_at IS NULL
    RETURNING *;
  `;
    const res = await query(text, [id, updated_by]);
    return res.rows[0] || null;
};

const move = async (documentId, targetLibraryId, updated_by = null) => {
    const text = `
    UPDATE document_management.documents
    SET library_id = $2, updated_by = $3, updated_at = NOW()
    WHERE id = $1 AND deleted_at IS NULL
    RETURNING *;
  `;
    const res = await query(text, [documentId, targetLibraryId, updated_by]);
    return res.rows[0] || null;
};

const getCompleteMetadata = async (id, userId = null, isSuperAdmin = false) => {
    const doc = await findById(id);
    if (!doc) return null;

    const sectionsQuery = `
    SELECT id, parent_section_id, section_title, section_number, section_order, content, draft_content, page_start, page_end, lock_version, created_at, updated_at
    FROM document_management.document_sections
    WHERE document_id = $1 AND deleted_at IS NULL
    ORDER BY parent_section_id NULLS FIRST, section_order ASC;
  `;

    const assetsQuery = `
    SELECT id, file_name, mime_type, file_size, storage_key, width, height, created_at
    FROM document_management.document_assets
    WHERE document_id = $1 AND deleted_at IS NULL
    ORDER BY created_at DESC;
  `;

    const versionsQuery = `
    SELECT id, version_number, version_tag, commit_hash, commit_message, committed_by, committed_at
    FROM document_management.document_versions
    WHERE document_id = $1
    ORDER BY version_number DESC
    LIMIT 10;
  `;

    // Query policy_user_access for this specific user
    let userAccessQuery = 'SELECT can_view, can_edit, can_delete FROM document_management.policy_user_access WHERE document_id = $1 AND user_id = $2;';
    let pinnedQuery = 'SELECT 1 FROM document_management.user_pinned_policies WHERE document_id = $1 AND user_id = $2;';

    const [sectionsRes, assetsRes, versionsRes, accessRes, pinnedRes] = await Promise.all([
        query(sectionsQuery, [id]),
        query(assetsQuery, [id]),
        query(versionsQuery, [id]),
        userId ? query(userAccessQuery, [id, userId]) : Promise.resolve({ rows: [] }),
        userId ? query(pinnedQuery, [id, userId]) : Promise.resolve({ rows: [] }),
    ]);

    const specificAccess = accessRes.rows[0];
    const can_edit = isSuperAdmin || (specificAccess ? specificAccess.can_edit === true : false);
    const can_view = isSuperAdmin || (specificAccess ? specificAccess.can_view !== false : true);
    const can_delete = isSuperAdmin || (specificAccess ? specificAccess.can_delete === true : false);
    const is_pinned = Boolean(pinnedRes?.rows?.length > 0);

    return {
        ...doc,
        sections: sectionsRes.rows,
        assets: assetsRes.rows,
        recent_versions: versionsRes.rows,
        can_edit,
        can_view,
        can_delete,
        is_pinned,
    };
};

const updateStatus = async (id, { status, approved_by = null, rejection_reason = null }) => {
    const isApproved = status === 'active' || status === 'approved';
    const text = `
        UPDATE document_management.documents
        SET
            status = $1,
            approved_by = $2,
            approved_at = ${isApproved ? 'NOW()' : 'approved_at'},
            rejection_reason = $3,
            updated_at = NOW()
        WHERE id = $4 AND deleted_at IS NULL
        RETURNING *;
    `;
    const res = await query(text, [status, approved_by || null, rejection_reason || null, id]);
    return res.rows[0] || null;
};

// ── Policy-Specific User-Level Access Controls (Navbar -> Bank Users & Access) ──
const getPolicyUserAccess = async (documentId) => {
    const text = `
        SELECT 
            pua.id,
            pua.document_id,
            pua.user_id,
            pua.can_view,
            pua.can_edit,
            pua.can_delete,
            u.name AS user_name,
            u.email AS user_email,
            COALESCE(
                (SELECT r.role_name 
                 FROM public.user_roles ur 
                 JOIN public.roles r ON r.id = ur.role_id AND r.is_active = TRUE 
                 WHERE ur.user_id = u.id 
                 ORDER BY r.id ASC 
                 LIMIT 1), 
                'User'
            ) AS role_name
        FROM document_management.policy_user_access pua
        JOIN public.users u ON pua.user_id = u.id
        WHERE pua.document_id = $1
        ORDER BY u.name ASC;
    `;
    const res = await query(text, [documentId]);
    return res.rows;
};

const setPolicyUserAccess = async (documentId, userId, { can_view = true, can_edit = false, can_delete = false, granted_by = null }) => {
    const text = `
        INSERT INTO document_management.policy_user_access (
            document_id, user_id, can_view, can_edit, can_delete, granted_by, updated_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, NOW())
        ON CONFLICT (document_id, user_id)
        DO UPDATE SET
            can_view = EXCLUDED.can_view,
            can_edit = EXCLUDED.can_edit,
            can_delete = EXCLUDED.can_delete,
            granted_by = EXCLUDED.granted_by,
            updated_at = NOW()
        RETURNING *;
    `;
    const res = await query(text, [documentId, userId, can_view, can_edit, can_delete, granted_by]);
    return res.rows[0];
};

const removePolicyUserAccess = async (documentId, userId) => {
    const text = `
        DELETE FROM document_management.policy_user_access
        WHERE document_id = $1 AND user_id = $2
        RETURNING *;
    `;
    const res = await query(text, [documentId, userId]);
    return res.rows[0] || null;
};

// ── User-centric: get ALL policies with this user's access flags (for Policy Access Control UI) ──
const getUserPolicyAccess = async (userId) => {
    const text = `
        SELECT
            d.id              AS document_id,
            d.document_name,
            d.document_type,
            d.status,
            l.library_name,
            COALESCE(pua.can_view, TRUE)   AS can_view,
            COALESCE(pua.can_edit, FALSE)  AS can_edit,
            COALESCE(pua.can_delete, FALSE) AS can_delete,
            (pua.id IS NOT NULL)           AS has_explicit_grant
        FROM document_management.documents d
        LEFT JOIN document_management.libraries l ON d.library_id = l.id AND l.deleted_at IS NULL
        LEFT JOIN document_management.policy_user_access pua
            ON pua.document_id = d.id AND pua.user_id = $1
        WHERE d.deleted_at IS NULL AND d.status != 'suspended'
        ORDER BY l.library_name ASC, d.document_name ASC;
    `;
    const res = await query(text, [userId]);
    return res.rows;
};

// ── Set all policy accesses for a user in bulk (upsert list) ──
const bulkSetUserPolicyAccess = async (userId, policyList, grantedBy = null) => {
    // policyList: [{ document_id, can_view, can_edit, can_delete }, ...]
    if (!policyList || policyList.length === 0) return [];

    const results = [];
    for (const item of policyList) {
        const { document_id, can_view = true, can_edit = false, can_delete = false } = item;
        const text = `
            INSERT INTO document_management.policy_user_access
                (document_id, user_id, can_view, can_edit, can_delete, granted_by, updated_at)
            VALUES ($1, $2, $3, $4, $5, $6, NOW())
            ON CONFLICT (document_id, user_id)
            DO UPDATE SET
                can_view   = EXCLUDED.can_view,
                can_edit   = EXCLUDED.can_edit,
                can_delete = EXCLUDED.can_delete,
                granted_by = EXCLUDED.granted_by,
                updated_at = NOW()
            RETURNING *;
        `;
        const res = await query(text, [document_id, userId, can_view, can_edit, can_delete, grantedBy]);
        results.push(res.rows[0]);
    }
    return results;
};

const crypto = require('crypto');

// ── VERSION CONTROL ──

// Create a new version snapshot of a document and its sections
const createVersionSnapshot = async (documentId, userId, { commit_message = 'Policy revision', version_tag = 'draft', bumpType = 'minor', isLiveApproval = false } = {}) => {
    // Fetch current doc with version number
    const docRes = await query(
        `SELECT d.*, v.version_number AS current_version_number
         FROM document_management.documents d
         LEFT JOIN document_management.document_versions v ON COALESCE(d.live_version_id, d.current_version_id) = v.id
         WHERE d.id = $1 AND d.deleted_at IS NULL`,
        [documentId]
    );
    const doc = docRes.rows[0];
    if (!doc) throw new Error('Document not found');

    // Capture the original policy title before any approved revision can rename it.
    await query(
        `UPDATE document_management.documents
         SET root_document_name = COALESCE(root_document_name, document_name)
         WHERE id = $1`,
        [documentId]
    );

    // Fetch all live sections
    const sectionsRes = await query(
        `SELECT id, section_title, content, draft_content, section_order
         FROM document_management.document_sections
         WHERE document_id = $1 AND deleted_at IS NULL
         ORDER BY section_order ASC`,
        [documentId]
    );
    const sections = sectionsRes.rows;

    // Calculate new version number, avoid conflicts with existing versions
    const existingVerRes = await query(
        `SELECT version_number FROM document_management.document_versions WHERE document_id = $1 ORDER BY committed_at DESC`,
        [documentId]
    );
    const usedVersions = new Set(existingVerRes.rows.map(r => r.version_number));

    const currentVer = String(doc.current_version_number || '1.0');
    const parts = currentVer.replace(/^v/i, '').split('.').map(Number);
    const major = !isNaN(parts[0]) && parts[0] > 0 ? parts[0] : 1;
    let minor = parts[1] !== undefined && !isNaN(parts[1]) ? parts[1] : 0;

    let newVersionNumber;
    if (bumpType === 'major') {
        let newMajor = major + 1;
        newVersionNumber = `${newMajor}.0`;
        while (usedVersions.has(newVersionNumber)) { newMajor++; newVersionNumber = `${newMajor}.0`; }
    } else {
        minor += 1;
        newVersionNumber = `${major}.${minor}`;
        while (usedVersions.has(newVersionNumber)) { minor++; newVersionNumber = `${major}.${minor}`; }
    }

    // For approval: use draft_content if available, otherwise content
    const getEffectiveContent = (s) => {
        if (isLiveApproval && s.draft_content) return s.draft_content;
        return s.content;
    };

    // Generate commit hash
    const contentStr = JSON.stringify(sections.map(s => ({ id: s.id, content: getEffectiveContent(s) }))) + Date.now().toString();
    const commitHash = crypto.createHash('sha256').update(contentStr).digest('hex');

    const parentVersionId = doc.live_version_id || doc.current_version_id || null;

    // Insert document version
    const versionRes = await query(
        `INSERT INTO document_management.document_versions
            (document_id, parent_version_id, version_number, version_tag, commit_hash, commit_message, committed_by, committed_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
         RETURNING *`,
        [documentId, parentVersionId, newVersionNumber, version_tag, commitHash, commit_message, userId]
    );
    const newVersion = versionRes.rows[0];

    // Snapshot each section
    for (const sec of sections) {
        const effectiveContent = getEffectiveContent(sec);
        const contentJson = typeof effectiveContent === 'string'
            ? effectiveContent
            : JSON.stringify(effectiveContent || { type: 'doc', content: [] });

        const contentHash = crypto.createHash('sha256').update(contentJson + sec.id).digest('hex');

        const secVerRes = await query(
            `INSERT INTO document_management.document_section_versions
                (section_id, section_title, content, content_hash, created_by, created_at)
             VALUES ($1, $2, $3::jsonb, $4, $5, NOW())
             ON CONFLICT (section_id, content_hash) DO UPDATE SET section_title = EXCLUDED.section_title
             RETURNING id`,
            [sec.id, sec.section_title, contentJson, contentHash, userId]
        );
        const secVerId = secVerRes.rows[0]?.id;

        if (secVerId) {
            await query(
                `INSERT INTO document_management.document_version_sections
                    (document_version_id, section_id, section_version_id)
                 VALUES ($1, $2, $3)
                 ON CONFLICT DO NOTHING`,
                [newVersion.id, sec.id, secVerId]
            );
        }
    }

    if (isLiveApproval) {
        // Upon Super Admin Approval:
        // 1. Promote draft_content to content across all sections and clear draft_content
        await query(
            `UPDATE document_management.document_sections
             SET content = COALESCE(draft_content, content),
                 draft_content = NULL
             WHERE document_id = $1`,
            [documentId]
        );

        // 2. Point live_version_id and current_version_id to this new version
        await query(
            `UPDATE document_management.documents
             SET current_version_id = $1,
                 live_version_id = $1,
                 has_pending_revision = false,
                 revision_status = NULL,
                 pending_revision_by = NULL,
                 pending_revision_version = NULL,
                 pending_revision_id = NULL,
                 updated_at = NOW()
             WHERE id = $2`,
            [newVersion.id, documentId]
        );
    } else {
        // When user creates a revision draft (via Configure):
        // Keep live_version_id untouched!
        // Mark has_pending_revision = true and store pending version details in 'draft' status
        await query(
            `UPDATE document_management.documents
             SET has_pending_revision = true,
                 revision_status = 'draft',
                 pending_revision_by = $1,
                 pending_revision_version = $2,
                 pending_revision_id = $3,
                 updated_at = NOW()
             WHERE id = $4`,
            [userId, newVersionNumber, newVersion.id, documentId]
        );

        // Initialize draft_content from content for each section so author can edit without affecting live viewers
        await query(
            `UPDATE document_management.document_sections
             SET draft_content = content
             WHERE document_id = $1 AND draft_content IS NULL`,
            [documentId]
        );
    }

    return { ...newVersion, sections_snapshotted: sections.length };
};

// Get full version history for a document
const getVersionHistory = async (documentId) => {
    const res = await query(
        `SELECT v.*, u.name AS committed_by_name, u.email AS committed_by_email
         FROM document_management.document_versions v
         LEFT JOIN public.users u ON v.committed_by = u.id
         WHERE v.document_id = $1
         ORDER BY v.committed_at DESC`,
        [documentId]
    );
    return res.rows;
};

// Update sections directly (draft editing)
const updateSections = async (documentId, sections, updatedBy, isDraftOnly = false) => {
    const results = [];
    for (const sec of sections) {
        const { sectionId, content, section_title } = sec;
        const contentStr = typeof content === 'object'
            ? JSON.stringify(content)
            : (content || '{"type":"doc","content":[]}');
        
        let queryText;
        let queryParams;

        if (isDraftOnly) {
            // Write only to draft_content so live content is completely unaffected for all users!
            queryText = `
                UPDATE document_management.document_sections
                SET draft_content = $1::jsonb,
                    updated_at = NOW(),
                    updated_by = $2
                WHERE id = $3 AND document_id = $4 AND deleted_at IS NULL
                RETURNING id, section_title
            `;
            queryParams = [contentStr, updatedBy, sectionId, documentId];
        } else {
            // Permanent live overwrite (e.g. after approval)
            queryText = `
                UPDATE document_management.document_sections
                SET content = $1::jsonb,
                    draft_content = NULL,
                    section_title = COALESCE($2, section_title),
                    updated_at = NOW(),
                    updated_by = $3
                WHERE id = $4 AND document_id = $5 AND deleted_at IS NULL
                RETURNING id, section_title
            `;
            queryParams = [contentStr, section_title || null, updatedBy, sectionId, documentId];
        }

        const res = await query(queryText, queryParams);
        if (res.rows[0]) results.push(res.rows[0]);
    }
    return results;
};

// Get sections for a specific historical version
const getVersionSections = async (versionId) => {
    const res = await query(
        `SELECT dsv.id, dsv.section_id, dsv.section_title, dsv.content, dsv.created_at,
                dvs.document_version_id, dvs.section_order
         FROM document_management.document_version_sections dvs
         JOIN document_management.document_section_versions dsv ON dvs.section_version_id = dsv.id
         WHERE dvs.document_version_id = $1
         ORDER BY dvs.section_order ASC, dsv.section_title ASC`,
        [versionId]
    );
    return res.rows;
};

// Reject a pending revision without affecting the live published policy
const rejectPendingRevision = async (documentId, rejectionReason = null) => {
    // 1. Reset draft_content back to NULL across all sections
    await query(
        `UPDATE document_management.document_sections
         SET draft_content = NULL
         WHERE document_id = $1`,
        [documentId]
    );

    // 2. Mark the pending version snapshot as 'rejected'
    await query(
        `UPDATE document_management.document_versions
         SET version_tag = 'rejected',
             commit_message = commit_message || ' [Rejected: ' || COALESCE($2, 'Feedback provided') || ']'
         WHERE id = (SELECT pending_revision_id FROM document_management.documents WHERE id = $1)`,
        [documentId, rejectionReason]
    );

    // 3. Clear pending revision flags on document so live version stays clean and active
    await query(
        `UPDATE document_management.documents
         SET has_pending_revision = false,
             revision_status = 'rejected',
             pending_document_name = NULL,
             pending_revision_by = NULL,
             pending_revision_version = NULL,
             pending_revision_id = NULL,
             rejection_reason = $2,
             updated_at = NOW()
         WHERE id = $1`,
        [documentId, rejectionReason]
    );
};

// Approve pending revision or initial draft and promote to live published version
const approveRevision = async (documentId, approvedByUserId, { commit_message } = {}) => {
    // 1. Fetch current doc
    const docRes = await query(
        `SELECT d.*, v.version_number AS current_version_number
         FROM document_management.documents d
         LEFT JOIN document_management.document_versions v ON COALESCE(d.live_version_id, d.current_version_id) = v.id
         WHERE d.id = $1 AND d.deleted_at IS NULL`,
        [documentId]
    );
    const doc = docRes.rows[0];
    if (!doc) throw new Error('Document not found');

    // 2. Fetch sections
    const secRes = await query(
        `SELECT id, section_title, content, draft_content, section_order
         FROM document_management.document_sections
         WHERE document_id = $1 AND deleted_at IS NULL
         ORDER BY section_order ASC`,
        [documentId]
    );
    const sections = secRes.rows;

    let targetVersionId = doc.pending_revision_id;
    let targetVersionNumber = doc.pending_revision_version;

    if (!targetVersionId) {
        // CASE A: Initial document approval (Draft -> Published v1.0)
        targetVersionNumber = '1.0';
        const contentStr = JSON.stringify(sections.map(s => ({ id: s.id, content: s.draft_content || s.content }))) + Date.now().toString();
        const commitHash = crypto.createHash('sha256').update(contentStr).digest('hex');
        const commitMsg = commit_message || 'Initial approved release v1.0';

        const vRes = await query(
            `INSERT INTO document_management.document_versions
                (document_id, parent_version_id, version_number, version_tag, commit_hash, commit_message, committed_by, committed_at)
             VALUES ($1, NULL, $2, 'active', $3, $4, $5, NOW())
             ON CONFLICT (document_id, version_number)
             DO UPDATE SET version_tag = 'active', commit_message = EXCLUDED.commit_message, committed_at = NOW()
             RETURNING id, version_number`,
            [documentId, targetVersionNumber, commitHash, commitMsg, approvedByUserId]
        );
        targetVersionId = vRes.rows[0].id;
    } else {
        // CASE B: Existing revision draft being approved
        // Preserve the revision's commit message. The approval message is only a
        // fallback for older revisions that were created without one.
        await query(
            `UPDATE document_management.document_versions
             SET version_tag = 'active',
                 commit_message = COALESCE(commit_message, $1),
                 committed_at = NOW()
             WHERE id = $2`,
            [commit_message || `Approved & published by Super Admin`, targetVersionId]
        );
    }

    // Snapshot sections for this approved version
    for (const sec of sections) {
        const effectiveContent = sec.draft_content !== null && sec.draft_content !== undefined
            ? sec.draft_content
            : sec.content;
        const contentJson = typeof effectiveContent === 'string'
            ? effectiveContent
            : JSON.stringify(effectiveContent || { type: 'doc', content: [] });
        const contentHash = crypto.createHash('sha256').update(contentJson + sec.id).digest('hex');

        const secVerRes = await query(
            `INSERT INTO document_management.document_section_versions
                (section_id, section_title, content, content_hash, created_by, created_at)
             VALUES ($1, $2, $3::jsonb, $4, $5, NOW())
             ON CONFLICT (section_id, content_hash) DO UPDATE SET section_title = EXCLUDED.section_title
             RETURNING id`,
            [sec.id, sec.section_title, contentJson, contentHash, approvedByUserId]
        );
        const secVerId = secVerRes.rows[0]?.id;
        if (secVerId) {
            await query(
                `INSERT INTO document_management.document_version_sections
                    (document_version_id, section_id, section_version_id, section_order)
                 VALUES ($1, $2, $3, $4)
                 ON CONFLICT DO NOTHING`,
                [targetVersionId, sec.id, secVerId, sec.section_order]
            );
        }
    }

    // Promote draft_content to content across all sections and clear draft_content
    await query(
        `UPDATE document_management.document_sections
         SET content = COALESCE(draft_content, content),
             draft_content = NULL
         WHERE document_id = $1`,
        [documentId]
    );

    // Update documents table
    const updatedRes = await query(
        `UPDATE document_management.documents
         SET current_version_id = $1,
             live_version_id = $1,
             root_document_name = COALESCE(root_document_name, document_name),
             document_name = COALESCE(pending_document_name, document_name),
             pending_document_name = NULL,
             has_pending_revision = false,
             revision_status = NULL,
             pending_revision_by = NULL,
             pending_revision_version = NULL,
             pending_revision_id = NULL,
             status = 'active',
             approved_by = $2,
             approved_at = NOW(),
             rejection_reason = NULL,
             updated_at = NOW()
         WHERE id = $3
         RETURNING *`,
        [targetVersionId, approvedByUserId, documentId]
    );

    return updatedRes.rows[0];
};

// Discard an in-progress revision draft and revert document to published live state
const discardPendingRevision = async (documentId) => {
    // 1. Fetch pending_revision_id
    const docRes = await query(
        `SELECT pending_revision_id, has_pending_revision, revision_status
         FROM document_management.documents
         WHERE id = $1 AND deleted_at IS NULL`,
        [documentId]
    );
    const doc = docRes.rows[0];
    if (!doc || !doc.has_pending_revision) return null;

    const pendingRevId = doc.pending_revision_id;

    // 2. Clear draft_content on all sections
    await query(
        `UPDATE document_management.document_sections
         SET draft_content = NULL
         WHERE document_id = $1`,
        [documentId]
    );

    // 3. Remove version snapshot and version sections if it was in draft status
    if (pendingRevId) {
        await query(
            `DELETE FROM document_management.document_version_sections
             WHERE document_version_id = $1`,
            [pendingRevId]
        );
        await query(
            `DELETE FROM document_management.document_versions
             WHERE id = $1`,
            [pendingRevId]
        );
    }

    // 4. Reset document revision flags
    const updatedRes = await query(
        `UPDATE document_management.documents
         SET has_pending_revision = false,
             revision_status = NULL,
             pending_document_name = NULL,
             pending_revision_by = NULL,
             pending_revision_version = NULL,
             pending_revision_id = NULL,
             updated_at = NOW()
         WHERE id = $1
         RETURNING *`,
        [documentId]
    );

    return updatedRes.rows[0];
};

// ── Policy Removal Workflow (Maker-Checker) ──

// Request policy removal: sets pending_removal = true, records reason & requester
const requestPolicyRemoval = async (documentId, userId, reason) => {
    const res = await query(
        `UPDATE document_management.documents
         SET pending_removal        = TRUE,
             removal_requested_by   = $2,
             removal_reason         = $3,
             removal_requested_at   = NOW(),
             removal_reviewed_by    = NULL,
             removal_reviewed_at    = NULL,
             removal_review_feedback = NULL,
             updated_at             = NOW()
         WHERE id = $1 AND deleted_at IS NULL
         RETURNING *`,
        [documentId, userId, reason]
    );
    return res.rows[0] || null;
};

// Review policy removal: approve → status = 'suspended'; reject → reset pending_removal
const reviewPolicyRemoval = async (documentId, reviewerId, { action, feedback = null }) => {
    if (action === 'approve') {
        const res = await query(
            `UPDATE document_management.documents
             SET status                  = 'suspended',
                 pending_removal         = FALSE,
                 removal_reviewed_by     = $2,
                 removal_reviewed_at     = NOW(),
                 removal_review_feedback = $3,
                 updated_at              = NOW()
             WHERE id = $1 AND deleted_at IS NULL
             RETURNING *`,
            [documentId, reviewerId, feedback]
        );
        return res.rows[0] || null;
    } else {
        const res = await query(
            `UPDATE document_management.documents
             SET pending_removal         = FALSE,
                 removal_reviewed_by     = $2,
                 removal_reviewed_at     = NOW(),
                 removal_review_feedback = $3,
                 updated_at              = NOW()
             WHERE id = $1 AND deleted_at IS NULL
             RETURNING *`,
            [documentId, reviewerId, feedback]
        );
        return res.rows[0] || null;
    }
};

// Get all policies with pending_removal = true (for Change Management)
const getPendingPolicyRemovals = async () => {
    const res = await query(
        `SELECT
             d.id,
             d.document_name,
             d.status,
             d.removal_reason,
             d.removal_requested_at,
             d.removal_reviewed_at,
             d.removal_review_feedback,
             l.library_name,
             u.name  AS requested_by_name,
             u.email AS requested_by_email
         FROM document_management.documents d
         LEFT JOIN document_management.libraries l ON d.library_id = l.id AND l.deleted_at IS NULL
         LEFT JOIN public.users u ON d.removal_requested_by = u.id
         WHERE d.pending_removal = TRUE AND d.deleted_at IS NULL
         ORDER BY d.removal_requested_at DESC`
    );
    return res.rows;
};

// ── USER PINNED POLICIES ──

const getPinnedPolicies = async (userId) => {
    const text = `
        SELECT 
            d.id,
            d.document_name,
            d.library_id,
            d.document_type,
            d.status,
            d.updated_at,
            l.library_name,
            COALESCE(v.version_number, '1.0') AS current_version_number,
            upp.created_at AS pinned_at
        FROM document_management.user_pinned_policies upp
        JOIN document_management.documents d ON upp.document_id = d.id
        JOIN document_management.libraries l ON d.library_id = l.id
        LEFT JOIN document_management.document_versions v ON COALESCE(d.live_version_id, d.current_version_id) = v.id
        WHERE upp.user_id = $1 AND d.deleted_at IS NULL
        ORDER BY upp.created_at DESC;
    `;
    const res = await query(text, [userId]);
    return res.rows;
};

const pinPolicy = async (userId, documentId) => {
    const text = `
        INSERT INTO document_management.user_pinned_policies (user_id, document_id)
        VALUES ($1, $2)
        ON CONFLICT (user_id, document_id) DO NOTHING
        RETURNING *;
    `;
    const res = await query(text, [userId, documentId]);
    return res.rows[0] || { user_id: userId, document_id: documentId };
};

const unpinPolicy = async (userId, documentId) => {
    const text = `
        DELETE FROM document_management.user_pinned_policies
        WHERE user_id = $1 AND document_id = $2
        RETURNING *;
    `;
    const res = await query(text, [userId, documentId]);
    return res.rowCount > 0;
};

const isPolicyPinned = async (userId, documentId) => {
    if (!userId || !documentId) return false;
    const text = `
        SELECT 1 FROM document_management.user_pinned_policies
        WHERE user_id = $1 AND document_id = $2;
    `;
    const res = await query(text, [userId, documentId]);
    return res.rowCount > 0;
};

module.exports = {
    create,
    findById,
    findAll,
    update,
    updateStatus,
    softDelete,
    move,
    getCompleteMetadata,
    getPolicyUserAccess,
    setPolicyUserAccess,
    removePolicyUserAccess,
    getUserPolicyAccess,
    bulkSetUserPolicyAccess,
    createVersionSnapshot,
    getVersionHistory,
    updateSections,
    getVersionSections,
    rejectPendingRevision,
    approveRevision,
    discardPendingRevision,
    requestPolicyRemoval,
    reviewPolicyRemoval,
    getPendingPolicyRemovals,
    getPinnedPolicies,
    pinPolicy,
    unpinPolicy,
    isPolicyPinned,
};

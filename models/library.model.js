const { query } = require('../config/db');

const create = async ({
    parent_library_id = null,
    library_name,
    description = null,
    display_order = 0,
    created_by = null,
    updated_by = null,
}) => {
    const text = `
    INSERT INTO document_management.libraries (
      parent_library_id,
      library_name,
      description,
      display_order,
      status,
      created_by,
      updated_by
    )
    VALUES ($1, $2, $3, $4, 'active', $5, $6)
    RETURNING *;
  `;
    const values = [
        parent_library_id,
        library_name,
        description,
        display_order,
        created_by,
        updated_by,
    ];
    const res = await query(text, values);
    return res.rows[0];
};

const findById = async (id) => {
    const text = `
    SELECT *
    FROM document_management.libraries
    WHERE id = $1 AND deleted_at IS NULL;
  `;
    const res = await query(text, [id]);
    return res.rows[0] || null;
};

const findAll = async ({
    parent_library_id,
    status = 'active',
    search,
    limit = 20,
    offset = 0,
} = {}) => {
    const conditions = ['deleted_at IS NULL'];
    const values = [];

    if (status) {
        values.push(status);
        conditions.push(`status = $${values.length}`);
    }

    if (parent_library_id !== undefined) {
        if (parent_library_id === null || parent_library_id === 'null' || parent_library_id === '') {
            conditions.push(`parent_library_id IS NULL`);
        } else {
            values.push(parent_library_id);
            conditions.push(`parent_library_id = $${values.length}`);
        }
    }

    if (search) {
        values.push(`%${search}%`);
        conditions.push(`(library_name ILIKE $${values.length} OR description ILIKE $${values.length})`);
    }

    const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    const countText = `SELECT COUNT(*)::int AS total FROM document_management.libraries ${whereClause};`;
    const countRes = await query(countText, values);
    const total = countRes.rows[0]?.total || 0;

    values.push(limit);
    const limitParam = `$${values.length}`;
    values.push(offset);
    const offsetParam = `$${values.length}`;

    const dataText = `
    SELECT 
      l.*,
      (SELECT COUNT(*)::int FROM document_management.libraries sub WHERE sub.parent_library_id = l.id AND sub.deleted_at IS NULL) AS sublibrary_count,
      (SELECT COUNT(*)::int FROM document_management.documents d WHERE d.library_id = l.id AND d.deleted_at IS NULL) AS document_count
    FROM document_management.libraries l
    ${whereClause}
    ORDER BY l.display_order ASC, l.library_name ASC
    LIMIT ${limitParam} OFFSET ${offsetParam};
  `;

    const dataRes = await query(dataText, values);
    return {
        libraries: dataRes.rows,
        total,
    };
};

const update = async (id, data, updated_by = null) => {
    const allowed = ['library_name', 'description', 'display_order', 'status'];
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
    UPDATE document_management.libraries
    SET ${sets.join(', ')}
    WHERE id = ${idParam} AND deleted_at IS NULL
    RETURNING *;
  `;
    const res = await query(text, values);
    return res.rows[0] || null;
};

const softDelete = async (id, updated_by = null) => {
    const text = `
    UPDATE document_management.libraries
    SET deleted_at = NOW(), updated_by = $2
    WHERE id = $1 AND deleted_at IS NULL
    RETURNING *;
  `;
    const res = await query(text, [id, updated_by]);
    return res.rows[0] || null;
};

const getHierarchy = async (rootLibraryId = null) => {
    const text = `
    WITH RECURSIVE library_tree AS (
      SELECT 
        id, parent_library_id, library_name, description, display_order, status, created_at, updated_at,
        pending_removal, removal_reason,
        0 AS depth,
        ARRAY[id] AS path
      FROM document_management.libraries
      WHERE ${rootLibraryId ? 'id = $1' : 'parent_library_id IS NULL'} AND deleted_at IS NULL AND status = 'active'

      UNION ALL

      SELECT 
        l.id, l.parent_library_id, l.library_name, l.description, l.display_order, l.status, l.created_at, l.updated_at,
        l.pending_removal, l.removal_reason,
        lt.depth + 1,
        path || l.id
      FROM document_management.libraries l
      INNER JOIN library_tree lt ON l.parent_library_id = lt.id
      WHERE l.deleted_at IS NULL AND l.status = 'active' AND NOT (l.id = ANY(lt.path))
    )
    SELECT * FROM library_tree ORDER BY depth ASC, display_order ASC, library_name ASC;
  `;
    const params = rootLibraryId ? [rootLibraryId] : [];
    const res = await query(text, params);
    return res.rows;
};

const getDepartmentHierarchy = async (userId, rootLibraryId = null) => {
    const text = `
    WITH RECURSIVE library_tree AS (
      SELECT id, parent_library_id, library_name, description, display_order, status, created_at, updated_at,
             pending_removal, removal_reason, 0 AS depth, ARRAY[id] AS path
      FROM document_management.libraries
      WHERE (($2::uuid IS NULL AND parent_library_id IS NULL) OR id = $2)
        AND deleted_at IS NULL AND status = 'active'
      UNION ALL
      SELECT l.id, l.parent_library_id, l.library_name, l.description, l.display_order, l.status, l.created_at, l.updated_at,
             l.pending_removal, l.removal_reason, parent.depth + 1, parent.path || l.id
      FROM document_management.libraries l
      JOIN library_tree parent ON l.parent_library_id = parent.id
      WHERE l.deleted_at IS NULL AND l.status = 'active' AND NOT (l.id = ANY(parent.path))
    ), visible_tree AS (
      SELECT node.*
      FROM library_tree node
      CROSS JOIN LATERAL (
        WITH RECURSIVE ancestors AS (
          SELECT id, parent_library_id, 0 AS depth
          FROM document_management.libraries WHERE id = node.id
          UNION ALL
          SELECT parent.id, parent.parent_library_id, child.depth + 1
          FROM document_management.libraries parent
          JOIN ancestors child ON parent.id = child.parent_library_id
        )
        SELECT dua.can_view
        FROM ancestors a
        JOIN document_management.department_user_access dua ON dua.library_id = a.id
        WHERE dua.user_id = $1
        ORDER BY a.depth
        LIMIT 1
      ) effective_access
      WHERE effective_access.can_view = TRUE
    )
    SELECT * FROM visible_tree ORDER BY depth ASC, display_order ASC, library_name ASC;
    `;
    const result = await query(text, [userId, rootLibraryId]);
    return result.rows;
};

const isDescendant = async (libraryId, targetParentId) => {
    if (!targetParentId) return false;
    if (libraryId === targetParentId) return true;

    const text = `
    WITH RECURSIVE descendants AS (
      SELECT id, parent_library_id
      FROM document_management.libraries
      WHERE id = $1 AND deleted_at IS NULL
      
      UNION ALL
      
      SELECT l.id, l.parent_library_id
      FROM document_management.libraries l
      INNER JOIN descendants d ON l.parent_library_id = d.id
      WHERE l.deleted_at IS NULL
    )
    SELECT 1 FROM descendants WHERE id = $2;
  `;
    const res = await query(text, [libraryId, targetParentId]);
    return res.rowCount > 0;
};

const move = async (libraryId, targetParentId, updated_by = null) => {
    const text = `
    UPDATE document_management.libraries
    SET parent_library_id = $2, updated_by = $3, updated_at = NOW()
    WHERE id = $1 AND deleted_at IS NULL
    RETURNING *;
  `;
    const res = await query(text, [libraryId, targetParentId, updated_by]);
    return res.rows[0] || null;
};

// ── Library Removal Workflow (Maker-Checker) ──

// User requests library removal with justification
const requestRemoval = async (libraryId, userId, reason = null) => {
    const text = `
        UPDATE document_management.libraries
        SET pending_removal = true,
            removal_requested_by = $2,
            removal_reason = $3,
            removal_requested_at = NOW(),
            updated_at = NOW()
        WHERE id = $1 AND deleted_at IS NULL
        RETURNING *;
    `;
    const res = await query(text, [libraryId, userId, reason]);
    return res.rows[0] || null;
};

// Super Admin reviews removal: approve (status -> 'suspended') or reject (remains 'active')
const reviewRemoval = async (libraryId, reviewerId, { action, feedback = null } = {}) => {
    const newStatus = action === 'approve' ? 'suspended' : 'active';
    const text = `
        UPDATE document_management.libraries
        SET status = $2,
            pending_removal = false,
            removal_reviewed_by = $3,
            removal_reviewed_at = NOW(),
            removal_review_feedback = $4,
            updated_at = NOW()
        WHERE id = $1 AND deleted_at IS NULL
        RETURNING *;
    `;
    const res = await query(text, [libraryId, newStatus, reviewerId, feedback]);
    return res.rows[0] || null;
};

// Fetch pending library removal requests for Change Management
const getPendingRemovals = async () => {
    const text = `
        SELECT 
            l.*,
            u.name AS requested_by_name,
            u.email AS requested_by_email,
            (SELECT COUNT(*)::int FROM document_management.documents d WHERE d.library_id = l.id AND d.deleted_at IS NULL) AS document_count
        FROM document_management.libraries l
        LEFT JOIN public.users u ON l.removal_requested_by = u.id
        WHERE l.pending_removal = true AND l.deleted_at IS NULL
        ORDER BY l.removal_requested_at DESC;
    `;
    const res = await query(text);
    return res.rows;
};

module.exports = {
    create,
    findById,
    findAll,
    update,
    softDelete,
    getHierarchy,
    getDepartmentHierarchy,
    isDescendant,
    move,
    requestRemoval,
    reviewRemoval,
    getPendingRemovals,
};

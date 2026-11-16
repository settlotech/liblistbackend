const { query } = require('../config/db');

/**
 * Document Annotations Model
 */

const create = async ({
    document_id,
    section_id = null,
    asset_id = null,
    version_id = null,
    annotation_type = 'TEXT', // 'TEXT' | 'IMAGE'
    category = 'NOTES',       // 'NOTES' | 'ACTION' | 'CDE' | 'REGULATORY' | 'REVISION'
    anchor_data = {},
    annotation_text,
    label = null,
    color = '#0057B8',
    reference_code = null,
    status = 'open',
    created_by = null,
}) => {
    const text = `
        INSERT INTO document_management.document_annotations (
            document_id, section_id, asset_id, version_id,
            annotation_type, category, anchor_data, annotation_text,
            label, color, reference_code, status, created_by, updated_by, created_at, updated_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $13, NOW(), NOW())
        RETURNING *;
    `;
    const res = await query(text, [
        document_id,
        section_id,
        asset_id,
        version_id,
        annotation_type,
        category,
        anchor_data,
        annotation_text,
        label,
        color,
        reference_code,
        status,
        created_by,
    ]);
    return res.rows[0];
};

const findByDocument = async (documentId, { version_id = null, category = null, annotation_type = null, user_id = null } = {}) => {
    let text = `
        SELECT 
            a.*,
            u.name  AS author_name,
            u.email AS author_email
        FROM document_management.document_annotations a
        LEFT JOIN public.users u ON a.created_by = u.id
        WHERE a.document_id = $1 AND a.deleted_at IS NULL
    `;
    const params = [documentId];

    if (user_id) {
        params.push(user_id);
        text += ` AND a.created_by = $${params.length}`;
    }
    if (version_id) {
        params.push(version_id);
        text += ` AND (a.version_id = $${params.length} OR a.version_id IS NULL)`;
    }
    if (category) {
        params.push(category);
        text += ` AND a.category = $${params.length}`;
    }
    if (annotation_type) {
        params.push(annotation_type);
        text += ` AND a.annotation_type = $${params.length}`;
    }

    text += ` ORDER BY a.created_at ASC;`;
    const res = await query(text, params);
    return res.rows;
};

const findByUser = async (userId, { annotation_type = null, category = null, search = null, page = 1, limit = 20 } = {}) => {
    let text = `
        SELECT 
            a.*,
            d.document_name,
            l.library_name,
            u.name  AS author_name,
            u.email AS author_email
        FROM document_management.document_annotations a
        JOIN document_management.documents d ON a.document_id = d.id AND d.deleted_at IS NULL
        LEFT JOIN document_management.libraries l ON d.library_id = l.id AND l.deleted_at IS NULL
        LEFT JOIN public.users u ON a.created_by = u.id
        WHERE a.created_by = $1 AND a.deleted_at IS NULL
    `;
    const params = [userId];

    if (annotation_type) {
        params.push(annotation_type);
        text += ` AND a.annotation_type = $${params.length}`;
    }
    if (category) {
        params.push(category);
        text += ` AND a.category = $${params.length}`;
    }
    if (search) {
        params.push(`%${search.trim().toLowerCase()}%`);
        text += ` AND (LOWER(a.annotation_text) LIKE $${params.length} OR LOWER(a.label) LIKE $${params.length} OR LOWER(d.document_name) LIKE $${params.length})`;
    }

    const countText = text.replace(/SELECT[\s\S]*?FROM document_management\.document_annotations a/, 'SELECT COUNT(*)::int AS total FROM document_management.document_annotations a').replace(/\s+ORDER BY a\.created_at DESC;?$/, '');
    const countRes = await query(countText, params);
    const total = countRes.rows[0]?.total || 0;
    const safePage = Math.max(1, Number(page) || 1);
    const safeLimit = Math.min(100, Math.max(1, Number(limit) || 20));
    params.push(safeLimit, (safePage - 1) * safeLimit);
    text += ` ORDER BY a.created_at DESC LIMIT $${params.length - 1} OFFSET $${params.length};`;
    const res = await query(text, params);
    return { items: res.rows, pagination: { page: safePage, limit: safeLimit, total, totalPages: Math.ceil(total / safeLimit) } };
};

const findById = async (id) => {
    const text = `
        SELECT a.*, u.name AS author_name, u.email AS author_email
        FROM document_management.document_annotations a
        LEFT JOIN public.users u ON a.created_by = u.id
        WHERE a.id = $1 AND a.deleted_at IS NULL;
    `;
    const res = await query(text, [id]);
    return res.rows[0] || null;
};

const update = async (id, { annotation_text, label, color, status, anchor_data, updated_by = null }) => {
    const text = `
        UPDATE document_management.document_annotations
        SET
            annotation_text = COALESCE($1, annotation_text),
            label           = COALESCE($2, label),
            color           = COALESCE($3, color),
            status          = COALESCE($4, status),
            anchor_data     = COALESCE($5, anchor_data),
            updated_by      = COALESCE($6, updated_by),
            updated_at      = NOW()
        WHERE id = $7 AND deleted_at IS NULL
        RETURNING *;
    `;
    const res = await query(text, [
        annotation_text,
        label,
        color,
        status,
        anchor_data ? JSON.stringify(anchor_data) : null,
        updated_by,
        id,
    ]);
    return res.rows[0] || null;
};

const softDelete = async (id, userId = null) => {
    const text = `
        UPDATE document_management.document_annotations
        SET deleted_at = NOW(), updated_by = $2
        WHERE id = $1 AND deleted_at IS NULL
        RETURNING *;
    `;
    const res = await query(text, [id, userId]);
    return res.rows[0] || null;
};

module.exports = {
    create,
    findByDocument,
    findByUser,
    findById,
    update,
    softDelete,
};

const { query } = require('../config/db');

const create = async ({
    template_name,
    template_id = null,
    description = null,
    category = 'General',
    structure = { sections: [] },
    status = 'approved',
    created_by = null,
    requested_by = null,
    approved_by = null,
    approved_at = null,
}) => {
    const text = `
        INSERT INTO document_management.document_templates (
            template_name,
            template_id,
            description,
            category,
            structure,
            status,
            created_by,
            requested_by,
            approved_by,
            approved_at,
            is_active
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, TRUE)
        RETURNING *;
    `;
    const values = [
        template_name,
        template_id,
        description,
        category,
        structure,
        status,
        created_by,
        requested_by,
        approved_by,
        approved_at,
    ];
    const res = await query(text, values);
    return res.rows[0];
};

const findById = async (id) => {
    const text = `
        SELECT 
            t.*,
            creator.name AS created_by_name,
            creator.email AS created_by_email,
            requester.name AS requested_by_name,
            requester.email AS requested_by_email,
            approver.name AS approved_by_name,
            approver.email AS approved_by_email
        FROM document_management.document_templates t
        LEFT JOIN users creator ON creator.id = t.created_by
        LEFT JOIN users requester ON requester.id = t.requested_by
        LEFT JOIN users approver ON approver.id = t.approved_by
        WHERE t.id = $1 AND t.deleted_at IS NULL;
    `;
    const res = await query(text, [id]);
    return res.rows[0] || null;
};

const findAll = async ({ category, status, search, limit = 50, offset = 0 } = {}) => {
    const conditions = ['t.deleted_at IS NULL'];
    const values = [];

    if (category) {
        values.push(category);
        conditions.push(`t.category = $${values.length}`);
    }

    if (status) {
        values.push(status);
        conditions.push(`t.status = $${values.length}`);
    }

    if (search) {
        values.push(`%${search}%`);
        conditions.push(`(t.template_name ILIKE $${values.length} OR t.description ILIKE $${values.length})`);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const countQuery = `
        SELECT COUNT(*) AS total
        FROM document_management.document_templates t
        ${whereClause};
    `;
    const countRes = await query(countQuery, values);
    const total = parseInt(countRes.rows[0].total, 10);

    const dataQuery = `
        SELECT 
            t.*,
            creator.name AS created_by_name,
            creator.email AS created_by_email,
            requester.name AS requested_by_name,
            requester.email AS requested_by_email,
            approver.name AS approved_by_name,
            approver.email AS approved_by_email
        FROM document_management.document_templates t
        LEFT JOIN users creator ON creator.id = t.created_by
        LEFT JOIN users requester ON requester.id = t.requested_by
        LEFT JOIN users approver ON approver.id = t.approved_by
        ${whereClause}
        ORDER BY t.created_at DESC
        LIMIT $${values.length + 1} OFFSET $${values.length + 2};
    `;
    const dataRes = await query(dataQuery, [...values, limit, offset]);

    return {
        templates: dataRes.rows,
        total,
    };
};

const update = async (id, { template_name, category, description, structure, updated_by }) => {
    const text = `
        UPDATE document_management.document_templates
        SET
            template_name = COALESCE($1, template_name),
            category = COALESCE($2, category),
            description = COALESCE($3, description),
            structure = COALESCE($4, structure),
            updated_by = $5,
            updated_at = NOW()
        WHERE id = $6 AND deleted_at IS NULL
        RETURNING *;
    `;
    const res = await query(text, [
        template_name || null,
        category || null,
        description !== undefined ? description : null,
        structure ? JSON.stringify(structure) : null,
        updated_by || null,
        id,
    ]);
    return res.rows[0] || null;
};

const updateStatus = async (id, { status, approved_by = null, rejection_reason = null }) => {
    const isApproved = status === 'approved';
    const text = `
        UPDATE document_management.document_templates
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

const softDelete = async (id) => {
    const text = `
        UPDATE document_management.document_templates
        SET deleted_at = NOW(), updated_at = NOW()
        WHERE id = $1 AND deleted_at IS NULL
        RETURNING *;
    `;
    const res = await query(text, [id]);
    return res.rows[0] || null;
};

/**
 * Get distinct categories from existing templates.
 * Optionally filter by search term for autocomplete.
 */
const findCategories = async (search = '') => {
    const values = [];
    let whereClause = "WHERE deleted_at IS NULL AND is_active = TRUE";

    if (search && search.trim()) {
        values.push(`%${search.trim()}%`);
        whereClause += ` AND category ILIKE $1`;
    }

    const text = `
        SELECT DISTINCT category
        FROM document_management.document_templates
        ${whereClause}
        ORDER BY category ASC
        LIMIT 20;
    `;
    const res = await query(text, values);
    return res.rows.map(r => r.category);
};

module.exports = {
    create,
    findById,
    findAll,
    findCategories,
    update,
    updateStatus,
    softDelete,
};

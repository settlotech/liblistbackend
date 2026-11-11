const { query } = require('../config/db');

const create = async ({
    document_id,
    section_id = null,
    asset_id = null,
    annotation_type,
    category = 'NOTES',
    anchor_data,
    annotation_text,
    reference_code = null,
    reference_id = null,
    created_by = null,
}) => {
    const finalRefCode = reference_code || reference_id || null;

    const text = `
    INSERT INTO document_management.document_annotations (
      document_id,
      section_id,
      asset_id,
      annotation_type,
      category,
      anchor_data,
      annotation_text,
      reference_code,
      status,
      created_by,
      updated_by
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'open', $9, $9)
    RETURNING *;
  `;
    const values = [
        document_id,
        section_id,
        asset_id,
        annotation_type,
        category,
        JSON.stringify(anchor_data || {}),
        annotation_text,
        finalRefCode,
        created_by,
    ];

    try {
        const res = await query(text, values);
        return res.rows[0];
    } catch (err) {
        // If legacy DB schema has chk_annotation_category restricted to ('NOTES', 'ACTION'),
        // gracefully fallback category to 'ACTION' or 'NOTES' so it never fails
        if (err.constraint === 'chk_annotation_category') {
            const fallbackCategory = ['ACTION', 'NOTES'].includes(category) ? category : 'ACTION';
            values[4] = fallbackCategory;
            const fallbackRes = await query(text, values);
            return fallbackRes.rows[0];
        }
        throw err;
    }
};

const findById = async (id) => {
    const text = `
    SELECT 
      a.*,
      s.section_title,
      ast.file_name AS asset_file_name,
      ast.storage_key AS asset_storage_key
    FROM document_management.document_annotations a
    LEFT JOIN document_management.document_sections s ON a.section_id = s.id
    LEFT JOIN document_management.document_assets ast ON a.asset_id = ast.id
    WHERE a.id = $1 AND a.deleted_at IS NULL;
  `;
    const res = await query(text, [id]);
    return res.rows[0] || null;
};

const findByDocumentId = async (
    documentId,
    { annotation_type, category, status = 'open', reference_code, limit = 50, offset = 0 } = {}
) => {
    const conditions = ['a.document_id = $1', 'a.deleted_at IS NULL'];
    const values = [documentId];

    if (annotation_type) {
        values.push(annotation_type);
        conditions.push(`a.annotation_type = $${values.length}`);
    }

    if (category) {
        values.push(category);
        conditions.push(`a.category = $${values.length}`);
    }

    if (status && status !== 'all') {
        values.push(status);
        conditions.push(`a.status = $${values.length}`);
    }

    if (reference_code) {
        values.push(reference_code);
        conditions.push(`a.reference_code = $${values.length}`);
    }

    const whereClause = `WHERE ${conditions.join(' AND ')}`;

    const countText = `
    SELECT COUNT(*)::int AS total
    FROM document_management.document_annotations a
    ${whereClause};
  `;
    const countRes = await query(countText, values);
    const total = countRes.rows[0]?.total || 0;

    values.push(limit);
    const limitParam = `$${values.length}`;
    values.push(offset);
    const offsetParam = `$${values.length}`;

    const text = `
    SELECT 
      a.*,
      s.section_title,
      ast.file_name AS asset_file_name,
      ast.storage_key AS asset_storage_key
    FROM document_management.document_annotations a
    LEFT JOIN document_management.document_sections s ON a.section_id = s.id
    LEFT JOIN document_management.document_assets ast ON a.asset_id = ast.id
    ${whereClause}
    ORDER BY a.created_at ASC
    LIMIT ${limitParam} OFFSET ${offsetParam};
  `;
    const res = await query(text, values);
    return {
        annotations: res.rows,
        total,
    };
};

const findBySectionId = async (sectionId) => {
    const text = `
    SELECT *
    FROM document_management.document_annotations
    WHERE section_id = $1 AND deleted_at IS NULL
    ORDER BY created_at ASC;
  `;
    const res = await query(text, [sectionId]);
    return res.rows;
};

const findByReferenceCode = async (referenceCode) => {
    const text = `
    SELECT *
    FROM document_management.document_annotations
    WHERE reference_code = $1 AND deleted_at IS NULL;
  `;
    const res = await query(text, [referenceCode]);
    return res.rows;
};

const update = async (id, data, updated_by = null) => {
    const allowed = ['annotation_text', 'category', 'status'];
    const sets = [];
    const values = [];

    for (const key of allowed) {
        if (data[key] !== undefined) {
            values.push(data[key]);
            sets.push(`${key} = $${values.length}`);
        }
    }

    if (data.anchor_data !== undefined) {
        values.push(JSON.stringify(data.anchor_data));
        sets.push(`anchor_data = $${values.length}`);
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
    UPDATE document_management.document_annotations
    SET ${sets.join(', ')}
    WHERE id = ${idParam} AND deleted_at IS NULL
    RETURNING *;
  `;
    const res = await query(text, values);
    return res.rows[0] || null;
};

const softDelete = async (id, updated_by = null) => {
    const text = `
    UPDATE document_management.document_annotations
    SET deleted_at = NOW(), updated_by = $2
    WHERE id = $1 AND deleted_at IS NULL
    RETURNING *;
  `;
    const res = await query(text, [id, updated_by]);
    return res.rows[0] || null;
};

module.exports = {
    create,
    findById,
    findByDocumentId,
    findBySectionId,
    findByReferenceCode,
    update,
    softDelete,
};

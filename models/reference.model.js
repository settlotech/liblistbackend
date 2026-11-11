const { query } = require('../config/db');

const create = async ({
    document_id,
    reference_code,
    title,
    description = null,
    source_type = null,
    target_url = null,
    metadata = {},
    created_by = null,
}) => {
    const text = `
    INSERT INTO document_management.document_references (
      document_id,
      reference_code,
      title,
      description,
      source_type,
      target_url,
      metadata,
      created_by,
      updated_by
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $8)
    RETURNING *;
  `;
    const values = [
        document_id,
        reference_code.trim().toUpperCase(),
        title.trim(),
        description,
        source_type,
        target_url,
        JSON.stringify(metadata || {}),
        created_by,
    ];
    const res = await query(text, values);
    return res.rows[0];
};

const findById = async (id) => {
    const text = `
    SELECT *
    FROM document_management.document_references
    WHERE id = $1 AND deleted_at IS NULL;
  `;
    const res = await query(text, [id]);
    return res.rows[0] || null;
};

const findByDocumentId = async (documentId) => {
    const text = `
    SELECT 
      r.*,
      (SELECT COUNT(*)::int FROM document_management.document_annotations a WHERE a.reference_code = r.reference_code AND a.deleted_at IS NULL) AS linked_annotations_count
    FROM document_management.document_references r
    WHERE r.document_id = $1 AND r.deleted_at IS NULL
    ORDER BY r.reference_code ASC;
  `;
    const res = await query(text, [documentId]);
    return res.rows;
};

const generateNextReferenceCode = async (documentId, prefix = 'REF') => {
    const text = `
    SELECT reference_code
    FROM document_management.document_references
    WHERE document_id = $1 AND reference_code ~* $2
    ORDER BY id DESC
    LIMIT 1;
  `;
    const pattern = `^${prefix}-[0-9]+$`;
    const res = await query(text, [documentId, pattern]);

    let nextNumber = 1;
    if (res.rows.length > 0) {
        const lastCode = res.rows[0].reference_code;
        const match = lastCode.match(/(\d+)$/);
        if (match) {
            nextNumber = parseInt(match[1], 10) + 1;
        }
    }

    const paddedNumber = String(nextNumber).padStart(3, '0');
    return `${prefix}-${paddedNumber}`;
};

const update = async (id, data, updated_by = null) => {
    const allowed = ['title', 'description', 'source_type', 'target_url'];
    const sets = [];
    const values = [];

    for (const key of allowed) {
        if (data[key] !== undefined) {
            values.push(data[key]);
            sets.push(`${key} = $${values.length}`);
        }
    }

    if (data.metadata !== undefined) {
        values.push(JSON.stringify(data.metadata));
        sets.push(`metadata = $${values.length}`);
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
    UPDATE document_management.document_references
    SET ${sets.join(', ')}
    WHERE id = ${idParam} AND deleted_at IS NULL
    RETURNING *;
  `;
    const res = await query(text, values);
    return res.rows[0] || null;
};

const softDelete = async (id, updated_by = null) => {
    const text = `
    UPDATE document_management.document_references
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
    generateNextReferenceCode,
    update,
    softDelete,
};

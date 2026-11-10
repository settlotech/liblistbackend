const { query } = require('../config/db');

const create = async ({
    document_id,
    section_id = null,
    file_name,
    mime_type,
    file_size,
    storage_key,
    file_hash = null,
    width = null,
    height = null,
    uploaded_by = null,
}) => {
    const text = `
    INSERT INTO document_management.document_assets (
      document_id,
      section_id,
      file_name,
      storage_key,
      mime_type,
      file_size,
      file_hash,
      width,
      height,
      uploaded_by
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
    RETURNING *;
  `;
    const values = [
        document_id,
        section_id,
        file_name,
        storage_key,
        mime_type,
        file_size,
        file_hash,
        width,
        height,
        uploaded_by,
    ];
    const res = await query(text, values);
    return res.rows[0];
};

const findById = async (id) => {
    const text = `
    SELECT *
    FROM document_management.document_assets
    WHERE id = $1 AND deleted_at IS NULL;
  `;
    const res = await query(text, [id]);
    return res.rows[0] || null;
};

const findByDocumentId = async (documentId, { mime_type, file_type } = {}) => {
    const conditions = ['document_id = $1', 'deleted_at IS NULL'];
    const values = [documentId];

    const typeFilter = mime_type || file_type;
    if (typeFilter) {
        values.push(`%${typeFilter}%`);
        conditions.push(`mime_type ILIKE $${values.length}`);
    }

    const text = `
    SELECT *
    FROM document_management.document_assets
    WHERE ${conditions.join(' AND ')}
    ORDER BY created_at DESC;
  `;
    const res = await query(text, values);
    return res.rows;
};

const updateMetadata = async (id, data = {}, updated_by = null) => {
    const text = `
    UPDATE document_management.document_assets
    SET width = COALESCE($1, width), height = COALESCE($2, height)
    WHERE id = $3 AND deleted_at IS NULL
    RETURNING *;
  `;
    const res = await query(text, [data.width || null, data.height || null, id]);
    return res.rows[0] || null;
};

const softDelete = async (id) => {
    const text = `
    UPDATE document_management.document_assets
    SET deleted_at = NOW()
    WHERE id = $1 AND deleted_at IS NULL
    RETURNING *;
  `;
    const res = await query(text, [id]);
    return res.rows[0] || null;
};

module.exports = {
    create,
    findById,
    findByDocumentId,
    updateMetadata,
    softDelete,
};

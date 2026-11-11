const { query } = require('../config/db');

const create = async ({
    library_id,
    document_name,
    description = null,
    document_type = null,
    source_type = 'manual',
    original_file_name = null,
    original_file_key = null,
    original_mime_type = null,
    original_file_size = null,
    created_by = null,
    updated_by = null,
}) => {
    const text = `
    INSERT INTO document_management.documents (
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
      updated_by
    )
    VALUES ($1, $2, $3, $4, 'draft', $5, $6, $7, $8, $9, $10, $11)
    RETURNING *;
  `;
    const values = [
        library_id,
        document_name,
        description,
        document_type,
        source_type,
        original_file_name,
        original_file_key,
        original_mime_type,
        original_file_size,
        created_by,
        updated_by,
    ];
    const res = await query(text, values);
    return res.rows[0];
};

const findById = async (id) => {
    const text = `
    SELECT 
      d.*,
      l.library_name,
      v.version_number AS current_version_number,
      v.commit_hash AS current_commit_hash,
      v.committed_at AS current_version_committed_at
    FROM document_management.documents d
    JOIN document_management.libraries l ON d.library_id = l.id
    LEFT JOIN document_management.document_versions v ON d.current_version_id = v.id
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
    limit = 20,
    offset = 0,
} = {}) => {
    const conditions = ['d.deleted_at IS NULL', 'l.deleted_at IS NULL'];
    const values = [];

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
      l.library_name,
      v.version_number AS current_version_number,
      v.commit_hash AS current_commit_hash,
      (SELECT COUNT(*)::int FROM document_management.document_sections s WHERE s.document_id = d.id AND s.deleted_at IS NULL) AS section_count,
      (SELECT COUNT(*)::int FROM document_management.document_versions ver WHERE ver.document_id = d.id) AS version_count
    FROM document_management.documents d
    JOIN document_management.libraries l ON d.library_id = l.id
    LEFT JOIN document_management.document_versions v ON d.current_version_id = v.id
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

const getCompleteMetadata = async (id) => {
    const doc = await findById(id);
    if (!doc) return null;

    const sectionsQuery = `
    SELECT id, parent_section_id, section_title, section_number, section_order, page_start, page_end, lock_version, created_at, updated_at
    FROM document_management.document_sections
    WHERE document_id = $1 AND deleted_at IS NULL
    ORDER BY parent_section_id NULLS FIRST, section_order ASC;
  `;

    const assetsQuery = `
    SELECT id, file_name, file_type, mime_type, file_size, storage_key, created_at
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

    const [sectionsRes, assetsRes, versionsRes] = await Promise.all([
        query(sectionsQuery, [id]),
        query(assetsQuery, [id]),
        query(versionsQuery, [id]),
    ]);

    return {
        ...doc,
        sections: sectionsRes.rows,
        assets: assetsRes.rows,
        recent_versions: versionsRes.rows,
    };
};

module.exports = {
    create,
    findById,
    findAll,
    update,
    softDelete,
    move,
    getCompleteMetadata,
};

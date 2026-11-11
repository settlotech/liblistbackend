const { query, withTransaction } = require('../config/db');
const AppError = require('../utils/appError');

const create = async ({
    document_id,
    parent_section_id = null,
    section_title,
    section_number = null,
    section_order = 0,
    content = { type: 'doc', content: [] },
    page_start = null,
    page_end = null,
    created_by = null,
    updated_by = null,
}, client = null) => {
    const text = `
    INSERT INTO document_management.document_sections (
      document_id,
      parent_section_id,
      section_title,
      section_number,
      section_order,
      content,
      page_start,
      page_end,
      lock_version,
      created_by,
      updated_by
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 1, $9, $10)
    RETURNING *;
  `;
    const values = [
        document_id,
        parent_section_id,
        section_title,
        section_number,
        section_order,
        typeof content === 'string'
            ? (content.startsWith('{') || content.startsWith('[') ? content : JSON.stringify({ text: content }))
            : JSON.stringify(content || { type: 'doc', content: [] }),
        page_start,
        page_end,
        created_by,
        updated_by,
    ];
    const executor = client || { query };
    const res = await executor.query(text, values);
    return res.rows[0];
};

const findById = async (id, client = null) => {
    const text = `
    SELECT 
      s.*,
      p.section_title AS parent_section_title
    FROM document_management.document_sections s
    LEFT JOIN document_management.document_sections p ON s.parent_section_id = p.id
    WHERE s.id = $1 AND s.deleted_at IS NULL;
  `;
    const executor = client || { query };
    const res = await executor.query(text, [id]);
    return res.rows[0] || null;
};

const findByDocumentId = async (
    documentId,
    { include_content = false, parent_section_id } = {}
) => {
    const conditions = ['s.document_id = $1', 's.deleted_at IS NULL'];
    const values = [documentId];

    if (parent_section_id !== undefined) {
        if (parent_section_id === null || parent_section_id === 'null' || parent_section_id === '') {
            conditions.push(`s.parent_section_id IS NULL`);
        } else {
            values.push(parent_section_id);
            conditions.push(`s.parent_section_id = $${values.length}`);
        }
    }

    const selectColumns = include_content
        ? `s.*`
        : `
      s.id,
      s.document_id,
      s.parent_section_id,
      s.section_title,
      s.section_number,
      s.section_order,
      s.page_start,
      s.page_end,
      s.is_active,
      s.lock_version,
      s.created_by,
      s.updated_by,
      s.created_at,
      s.updated_at
    `;

    const text = `
    SELECT 
      ${selectColumns},
      (SELECT COUNT(*)::int FROM document_management.document_sections c WHERE c.parent_section_id = s.id AND c.deleted_at IS NULL) AS child_count
    FROM document_management.document_sections s
    WHERE ${conditions.join(' AND ')}
    ORDER BY s.parent_section_id NULLS FIRST, s.section_order ASC, s.created_at ASC;
  `;

    const res = await query(text, values);
    return res.rows;
};

const isDescendant = async (sectionId, targetParentSectionId) => {
    if (!targetParentSectionId) return false;
    if (sectionId === targetParentSectionId) return true;

    const text = `
    WITH RECURSIVE descendants AS (
      SELECT id, parent_section_id
      FROM document_management.document_sections
      WHERE id = $1 AND deleted_at IS NULL
      
      UNION ALL
      
      SELECT s.id, s.parent_section_id
      FROM document_management.document_sections s
      INNER JOIN descendants d ON s.parent_section_id = d.id
      WHERE s.deleted_at IS NULL
    )
    SELECT 1 FROM descendants WHERE id = $2;
  `;
    const res = await query(text, [sectionId, targetParentSectionId]);
    return res.rowCount > 0;
};

const updateMetadata = async (id, data, expectedLockVersion, updated_by = null) => {
    const allowed = ['section_title', 'section_number', 'section_order', 'page_start', 'page_end', 'is_active'];
    const sets = [];
    const values = [];

    for (const key of allowed) {
        if (data[key] !== undefined) {
            values.push(data[key]);
            sets.push(`${key} = $${values.length}`);
        }
    }

    if (data.content !== undefined) {
        const formattedContent = typeof data.content === 'string'
            ? (data.content.startsWith('{') || data.content.startsWith('[') ? data.content : JSON.stringify({ text: data.content }))
            : JSON.stringify(data.content);
        values.push(formattedContent);
        sets.push(`content = $${values.length}`);
    }

    sets.push(`lock_version = lock_version + 1`);
    values.push(updated_by);
    sets.push(`updated_by = $${values.length}`);
    sets.push(`updated_at = NOW()`);

    values.push(id);
    const idParam = `$${values.length}`;

    let whereClause = `WHERE id = ${idParam} AND deleted_at IS NULL`;
    if (expectedLockVersion !== undefined && expectedLockVersion !== null) {
        values.push(expectedLockVersion);
        whereClause += ` AND lock_version = $${values.length}`;
    }

    const text = `
    UPDATE document_management.document_sections
    SET ${sets.join(', ')}
    ${whereClause}
    RETURNING *;
  `;

    const res = await query(text, values);
    if (res.rowCount === 0) {
        const current = await findById(id);
        if (!current) {
            throw new AppError('Section not found.', 404);
        }
        throw new AppError(
            'Concurrency Conflict: This section has been updated by another user or session. Please reload the latest content before saving.',
            409,
            { current_lock_version: current.lock_version }
        );
    }
    return res.rows[0];
};

const updateContent = async (id, content, expectedLockVersion, updated_by = null) => {
    const formattedContent = typeof content === 'string'
        ? (content.startsWith('{') || content.startsWith('[') ? content : JSON.stringify({ text: content }))
        : JSON.stringify(content);

    const values = [formattedContent, updated_by, id];
    let whereClause = `WHERE id = $3 AND deleted_at IS NULL`;

    if (expectedLockVersion !== undefined && expectedLockVersion !== null) {
        values.push(expectedLockVersion);
        whereClause += ` AND lock_version = $${values.length}`;
    }

    const text = `
    UPDATE document_management.document_sections
    SET 
      content = $1,
      lock_version = lock_version + 1,
      updated_by = $2,
      updated_at = NOW()
    ${whereClause}
    RETURNING *;
  `;
    const res = await query(text, values);

    if (res.rowCount === 0) {
        const current = await findById(id);
        if (!current) {
            throw new AppError('Section not found.', 404);
        }
        throw new AppError(
            'Concurrency Conflict: Section content has been updated by another user. Reload latest content before overwriting.',
            409,
            { current_lock_version: current.lock_version }
        );
    }
    return res.rows[0];
};

const move = async (sectionId, targetParentSectionId, sectionOrder = 0, expectedLockVersion, updated_by = null) => {
    const text = `
    UPDATE document_management.document_sections
    SET 
      parent_section_id = $1,
      section_order = $2,
      lock_version = lock_version + 1,
      updated_by = $3,
      updated_at = NOW()
    WHERE id = $4 AND lock_version = $5 AND deleted_at IS NULL
    RETURNING *;
  `;
    const values = [targetParentSectionId, sectionOrder, updated_by, sectionId, expectedLockVersion];
    const res = await query(text, values);

    if (res.rowCount === 0) {
        const current = await findById(sectionId);
        if (!current) {
            throw new AppError('Section not found.', 404);
        }
        throw new AppError(
            'Concurrency Conflict: Section has been modified. Please reload before moving.',
            409,
            { current_lock_version: current.lock_version }
        );
    }
    return res.rows[0];
};

const reorderBatch = async (documentId, items, updated_by = null) => {
    return withTransaction(async (client) => {
        const updatedSections = [];
        for (const item of items) {
            const text = `
        UPDATE document_management.document_sections
        SET 
          section_order = $1,
          parent_section_id = COALESCE($2, parent_section_id),
          updated_by = $3,
          updated_at = NOW()
        WHERE id = $4 AND document_id = $5 AND deleted_at IS NULL
        RETURNING id, document_id, parent_section_id, section_order, lock_version;
      `;
            const values = [
                item.section_order,
                item.parent_section_id !== undefined ? item.parent_section_id : null,
                updated_by,
                item.id,
                documentId,
            ];
            const res = await client.query(text, values);
            if (res.rows[0]) {
                updatedSections.push(res.rows[0]);
            }
        }
        return updatedSections;
    });
};

const softDeleteRecursive = async (sectionId, updated_by = null) => {
    return withTransaction(async (client) => {
        const text = `
      WITH RECURSIVE section_subtree AS (
        SELECT id FROM document_management.document_sections
        WHERE id = $1 AND deleted_at IS NULL
        UNION ALL
        SELECT s.id FROM document_management.document_sections s
        INNER JOIN section_subtree sub ON s.parent_section_id = sub.id
        WHERE s.deleted_at IS NULL
      )
      UPDATE document_management.document_sections
      SET deleted_at = NOW(), updated_by = $2
      WHERE id IN (SELECT id FROM section_subtree)
      RETURNING id, section_title;
    `;
        const res = await client.query(text, [sectionId, updated_by]);
        return res.rows;
    });
};

const getHierarchy = async (sectionId) => {
    const text = `
    WITH RECURSIVE section_tree AS (
      SELECT 
        s.id, s.document_id, s.parent_section_id, s.section_title, s.section_number, s.section_order,
        s.page_start, s.page_end, s.is_active, s.lock_version, s.created_at, s.updated_at,
        0 AS depth,
        ARRAY[s.id] AS path
      FROM document_management.document_sections s
      WHERE s.id = $1 AND s.deleted_at IS NULL

      UNION ALL

      SELECT 
        child.id, child.document_id, child.parent_section_id, child.section_title, child.section_number, child.section_order,
        child.page_start, child.page_end, child.is_active, child.lock_version, child.created_at, child.updated_at,
        st.depth + 1,
        st.path || child.id
      FROM document_management.document_sections child
      INNER JOIN section_tree st ON child.parent_section_id = st.id
      WHERE child.deleted_at IS NULL AND NOT (child.id = ANY(st.path))
    )
    SELECT * FROM section_tree ORDER BY depth ASC, section_order ASC, created_at ASC;
  `;
    const res = await query(text, [sectionId]);
    return res.rows;
};

module.exports = {
    create,
    findById,
    findByDocumentId,
    isDescendant,
    updateMetadata,
    updateContent,
    move,
    reorderBatch,
    softDeleteRecursive,
    getHierarchy,
};

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
        0 AS depth,
        ARRAY[id] AS path
      FROM document_management.libraries
      WHERE ${rootLibraryId ? 'id = $1' : 'parent_library_id IS NULL'} AND deleted_at IS NULL

      UNION ALL

      SELECT 
        l.id, l.parent_library_id, l.library_name, l.description, l.display_order, l.status, l.created_at, l.updated_at,
        lt.depth + 1,
        path || l.id
      FROM document_management.libraries l
      INNER JOIN library_tree lt ON l.parent_library_id = lt.id
      WHERE l.deleted_at IS NULL AND NOT (l.id = ANY(lt.path))
    )
    SELECT * FROM library_tree ORDER BY depth ASC, display_order ASC, library_name ASC;
  `;
    const params = rootLibraryId ? [rootLibraryId] : [];
    const res = await query(text, params);
    return res.rows;
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

module.exports = {
    create,
    findById,
    findAll,
    update,
    softDelete,
    getHierarchy,
    isDescendant,
    move,
};

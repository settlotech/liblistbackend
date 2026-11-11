const { query } = require('../config/db');

const create = async ({
    template_name,
    description = null,
    category = null,
    structure = { sections: [] },
    created_by = null,
}) => {
    const text = `
    INSERT INTO document_management.document_templates (
      template_name,
      description,
      category,
      structure,
      is_active,
      created_by,
      updated_by
    )
    VALUES ($1, $2, $3, $4, TRUE, $5, $5)
    RETURNING *;
  `;
    const values = [
        template_name.trim(),
        description,
        category,
        JSON.stringify(structure || { sections: [] }),
        created_by,
    ];
    const res = await query(text, values);
    return res.rows[0];
};

const findById = async (id) => {
    const text = `
    SELECT *
    FROM document_management.document_templates
    WHERE id = $1 AND deleted_at IS NULL;
  `;
    const res = await query(text, [id]);
    return res.rows[0] || null;
};

const findAll = async ({ category, search, limit = 50, offset = 0 } = {}) => {
    const conditions = ['deleted_at IS NULL', 'is_active = TRUE'];
    const values = [];

    if (category) {
        values.push(category);
        conditions.push(`category = $${values.length}`);
    }

    if (search) {
        values.push(`%${search}%`);
        conditions.push(`(template_name ILIKE $${values.length} OR description ILIKE $${values.length})`);
    }

    const whereClause = `WHERE ${conditions.join(' AND ')}`;

    const countText = `
    SELECT COUNT(*)::int AS total
    FROM document_management.document_templates
    ${whereClause};
  `;
    const countRes = await query(countText, values);
    const total = countRes.rows[0]?.total || 0;

    values.push(limit);
    const limitParam = `$${values.length}`;
    values.push(offset);
    const offsetParam = `$${values.length}`;

    const text = `
    SELECT *
    FROM document_management.document_templates
    ${whereClause}
    ORDER BY template_name ASC
    LIMIT ${limitParam} OFFSET ${offsetParam};
  `;
    const res = await query(text, values);
    return {
        templates: res.rows,
        total,
    };
};

const update = async (id, data, updated_by = null) => {
    const allowed = ['template_name', 'description', 'category', 'is_active'];
    const sets = [];
    const values = [];

    for (const key of allowed) {
        if (data[key] !== undefined) {
            values.push(data[key]);
            sets.push(`${key} = $${values.length}`);
        }
    }

    if (data.structure !== undefined) {
        values.push(JSON.stringify(data.structure));
        sets.push(`structure = $${values.length}`);
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
    UPDATE document_management.document_templates
    SET ${sets.join(', ')}
    WHERE id = ${idParam} AND deleted_at IS NULL
    RETURNING *;
  `;
    const res = await query(text, values);
    return res.rows[0] || null;
};

const softDelete = async (id, updated_by = null) => {
    const text = `
    UPDATE document_management.document_templates
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
    findAll,
    update,
    softDelete,
};

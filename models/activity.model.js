const { query } = require('../config/db');

/**
 * Log an activity entry.
 *
 * Accepts both the old parameter names (activity_type, description, metadata)
 * and the canonical DB column names (event_type, details) so that all
 * controllers continue to work without changes.
 *
 * DB schema (document_management.document_activity_logs):
 *   id, document_id, library_id, section_id,
 *   event_type, entity_type, entity_id,
 *   details (JSONB), actor_id, created_at
 */
const logActivity = async ({
    document_id = null,
    library_id  = null,
    section_id  = null,
    // Accept either canonical name (event_type) or legacy name (activity_type)
    event_type    = null,
    activity_type = null,
    // entity info
    entity_type = null,
    entity_id   = null,
    // Accept either canonical name (details) or legacy names (metadata / description)
    details     = null,
    metadata    = null,
    description = null,
    actor_id    = null,
}, client = null) => {
    // Resolve event_type
    const resolvedEventType = event_type || activity_type || 'UNKNOWN';

    // Resolve entity_id — must be a UUID; fall back to document_id/library_id if missing
    const resolvedEntityId = entity_id || document_id || library_id || null;

    // Resolve entity_type
    const resolvedEntityType = entity_type || 'unknown';

    // Build a details JSONB object from whatever was supplied
    let resolvedDetails;
    if (details && typeof details === 'object') {
        resolvedDetails = details;
    } else if (metadata && typeof metadata === 'object') {
        resolvedDetails = description
            ? { ...metadata, description }
            : metadata;
    } else if (description) {
        resolvedDetails = { description };
    } else {
        resolvedDetails = {};
    }

    const text = `
    INSERT INTO document_management.document_activity_logs (
      document_id,
      library_id,
      section_id,
      event_type,
      entity_type,
      entity_id,
      details,
      actor_id
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
    RETURNING *;
  `;

    const values = [
        document_id,
        library_id,
        section_id,
        resolvedEventType,
        resolvedEntityType,
        resolvedEntityId,
        JSON.stringify(resolvedDetails),
        actor_id,
    ];

    const executor = client ? client : { query };
    const res = await executor.query(text, values);
    return res.rows[0];
};

const findByDocumentId = async (documentId, { limit = 50, offset = 0 } = {}) => {
    const text = `
    SELECT *
    FROM document_management.document_activity_logs
    WHERE document_id = $1
    ORDER BY created_at DESC
    LIMIT $2 OFFSET $3;
  `;
    const res = await query(text, [documentId, limit, offset]);
    return res.rows;
};

const findByLibraryId = async (libraryId, { limit = 50, offset = 0 } = {}) => {
    const text = `
    SELECT *
    FROM document_management.document_activity_logs
    WHERE library_id = $1
    ORDER BY created_at DESC
    LIMIT $2 OFFSET $3;
  `;
    const res = await query(text, [libraryId, limit, offset]);
    return res.rows;
};

const findByUserId = async (actorId, { limit = 50, offset = 0 } = {}) => {
    const text = `
    SELECT *
    FROM document_management.document_activity_logs
    WHERE actor_id = $1
    ORDER BY created_at DESC
    LIMIT $2 OFFSET $3;
  `;
    const res = await query(text, [actorId, limit, offset]);
    return res.rows;
};

const findAll = async ({
    document_id,
    library_id,
    actor_id,
    activity_type,
    event_type,
    start_date,
    end_date,
    limit  = 50,
    offset = 0,
} = {}) => {
    const conditions = [];
    const values = [];

    if (document_id) {
        values.push(document_id);
        conditions.push(`document_id = $${values.length}`);
    }

    if (library_id) {
        values.push(library_id);
        conditions.push(`library_id = $${values.length}`);
    }

    if (actor_id) {
        values.push(actor_id);
        conditions.push(`actor_id = $${values.length}`);
    }

    // Accept both names
    const eventTypeFilter = event_type || activity_type;
    if (eventTypeFilter) {
        values.push(eventTypeFilter);
        conditions.push(`event_type = $${values.length}`);
    }

    if (start_date) {
        values.push(start_date);
        conditions.push(`created_at >= $${values.length}`);
    }

    if (end_date) {
        values.push(end_date);
        conditions.push(`created_at <= $${values.length}`);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const countText = `
    SELECT COUNT(*)::int AS total
    FROM document_management.document_activity_logs
    ${whereClause};
  `;
    const countRes = await query(countText, values);
    const total = countRes.rows[0]?.total || 0;

    values.push(limit);
    const limitParam  = `$${values.length}`;
    values.push(offset);
    const offsetParam = `$${values.length}`;

    const text = `
    SELECT *
    FROM document_management.document_activity_logs
    ${whereClause}
    ORDER BY created_at DESC
    LIMIT ${limitParam} OFFSET ${offsetParam};
  `;
    const res = await query(text, values);
    return {
        activities: res.rows,
        total,
    };
};

module.exports = {
    logActivity,
    findByDocumentId,
    findByLibraryId,
    findByUserId,
    findAll,
};

const { query } = require('../config/db');

/**
 * Lock the document row for the duration of a transaction.
 */
const lockDocumentForUpdate = async (documentId, client) => {
    const text = `
    SELECT id, library_id, current_version_id, status
    FROM document_management.documents
    WHERE id = $1 AND deleted_at IS NULL
    FOR UPDATE;
  `;
    const res = await client.query(text, [documentId]);
    return res.rows[0] || null;
};

/**
 * Content-addressable snapshot of a single section.
 * Deduplicates by (section_id, content_hash).
 *
 * DB columns: section_id, section_title, content, annotations_snapshot, content_hash, created_by
 * Note: section_number, page_start, page_end are NOT in document_section_versions.
 */
const createOrFindSectionSnapshot = async ({
    section_id,
    content_hash,
    section_title,
    content,
    created_by,
}, client) => {
    const insertText = `
    INSERT INTO document_management.document_section_versions (
      section_id,
      content_hash,
      section_title,
      content,
      annotations_snapshot,
      created_by
    )
    VALUES ($1, $2, $3, $4, $5::jsonb, $6)
    ON CONFLICT (section_id, content_hash) DO UPDATE
      SET section_title = EXCLUDED.section_title
    RETURNING *;
  `;
    const values = [
        section_id,
        content_hash,
        section_title,
        JSON.stringify(content),
        '[]',
        created_by,
    ];
    const res = await client.query(insertText, values);
    return res.rows[0];
};

/**
 * Update the annotations_snapshot of a section_version after all annotations
 * for that section have been fetched.
 */
const updateSectionVersionAnnotationsSnapshot = async (sectionVersionId, annotations, client) => {
    const text = `
    UPDATE document_management.document_section_versions
    SET annotations_snapshot = $1::jsonb
    WHERE id = $2
    RETURNING *;
  `;
    const res = await client.query(text, [JSON.stringify(annotations), sectionVersionId]);
    return res.rows[0];
};

/**
 * Create a version record (the commit).
 * DB columns: document_id, parent_version_id, version_number, version_tag,
 *             commit_hash, commit_message, committed_by
 */
const createVersion = async ({
    document_id,
    parent_version_id = null,
    version_number,
    version_tag = null,
    commit_hash,
    commit_message,
    committed_by = null,
}, client) => {
    const text = `
    INSERT INTO document_management.document_versions (
      document_id,
      parent_version_id,
      version_number,
      version_tag,
      commit_hash,
      commit_message,
      committed_by
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7)
    RETURNING *;
  `;
    const values = [
        document_id,
        parent_version_id,
        version_number,
        version_tag,
        commit_hash,
        commit_message,
        committed_by,
    ];
    const res = await client.query(text, values);
    return res.rows[0];
};

/**
 * Insert manifest links — which section_versions belonged to this commit.
 * DB PK: (document_version_id, section_id)
 * DB columns: document_version_id, section_id, section_version_id, parent_section_id, section_order, section_number
 */
const createVersionManifest = async (versionId, manifestEntries, client) => {
    if (!manifestEntries || manifestEntries.length === 0) return [];

    const valuePlaceholders = [];
    const values = [];

    manifestEntries.forEach((entry, idx) => {
        const offset = idx * 5;
        valuePlaceholders.push(
            `($${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4}, $${offset + 5})`
        );
        values.push(
            versionId,
            entry.section_id,
            entry.section_version_id,
            entry.parent_section_id || null,
            entry.section_order
        );
    });

    const text = `
    INSERT INTO document_management.document_version_sections (
      document_version_id,
      section_id,
      section_version_id,
      parent_section_id,
      section_order
    )
    VALUES ${valuePlaceholders.join(', ')}
    ON CONFLICT (document_version_id, section_id) DO UPDATE
      SET section_version_id = EXCLUDED.section_version_id,
          section_order      = EXCLUDED.section_order
    RETURNING *;
  `;
    const res = await client.query(text, values);
    return res.rows;
};

/**
 * Record what changed in this commit (ADDED / UPDATED / DELETED / MOVED).
 * DB columns: document_version_id, section_id, change_type,
 *             old_section_version_id, new_section_version_id, change_summary
 */
const recordVersionChanges = async (versionId, changes, client) => {
    if (!changes || changes.length === 0) return [];

    const valuePlaceholders = [];
    const values = [];

    changes.forEach((change, idx) => {
        const offset = idx * 6;
        valuePlaceholders.push(
            `($${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4}, $${offset + 5}, $${offset + 6})`
        );
        values.push(
            versionId,
            change.section_id,
            change.change_type,
            change.old_section_version_id || null,
            change.new_section_version_id || null,
            change.change_summary || null
        );
    });

    const text = `
    INSERT INTO document_management.document_version_changes (
      document_version_id,
      section_id,
      change_type,
      old_section_version_id,
      new_section_version_id,
      change_summary
    )
    VALUES ${valuePlaceholders.join(', ')}
    RETURNING *;
  `;
    const res = await client.query(text, values);
    return res.rows;
};

/**
 * Snapshot active annotations for each section_version in this commit.
 * The schema stores annotations inside document_section_versions.annotations_snapshot (JSONB array).
 * There is no separate document_version_annotations table.
 *
 * We group annotations by section_id and update each section_version's snapshot.
 */
const snapshotAnnotationsForVersion = async (versionId, liveAnnotations, client) => {
    if (!liveAnnotations || liveAnnotations.length === 0) return;

    // Group annotations by section_id
    const bySection = new Map();
    for (const ann of liveAnnotations) {
        const key = ann.section_id || '__doc__';
        if (!bySection.has(key)) bySection.set(key, []);
        bySection.get(key).push(ann);
    }

    // For each section in this version's manifest, update the annotation snapshot
    for (const [sectionId, annotations] of bySection.entries()) {
        if (sectionId === '__doc__') continue; // skip document-level annotations

        // Find the section_version_id for this section in the manifest
        const lookupRes = await client.query(
            `SELECT section_version_id
             FROM document_management.document_version_sections
             WHERE document_version_id = $1 AND section_id = $2;`,
            [versionId, sectionId]
        );
        if (lookupRes.rows.length === 0) continue;

        const sectionVersionId = lookupRes.rows[0].section_version_id;
        await client.query(
            `UPDATE document_management.document_section_versions
             SET annotations_snapshot = $1::jsonb
             WHERE id = $2;`,
            [JSON.stringify(annotations), sectionVersionId]
        );
    }
};

/**
 * Update the document's current_version_id pointer and set status to 'active'.
 */
const updateDocumentCurrentVersion = async (documentId, versionId, updated_by, client) => {
    const text = `
    UPDATE document_management.documents
    SET current_version_id = $1, status = 'active', updated_by = $2, updated_at = NOW()
    WHERE id = $3
    RETURNING *;
  `;
    const res = await client.query(text, [versionId, updated_by, documentId]);
    return res.rows[0];
};

/**
 * Find a version by ID with its parent info.
 */
const findById = async (id, client = null) => {
    const text = `
    SELECT 
      v.*,
      p.version_number AS parent_version_number,
      p.commit_hash    AS parent_commit_hash
    FROM document_management.document_versions v
    LEFT JOIN document_management.document_versions p ON v.parent_version_id = p.id
    WHERE v.id = $1;
  `;
    const executor = client || { query };
    const res = await executor.query(text, [id]);
    return res.rows[0] || null;
};

/**
 * List all versions for a document, most recent first.
 */
const findByDocumentId = async (documentId, { limit = 20, offset = 0 } = {}) => {
    const countText = `
    SELECT COUNT(*)::int AS total
    FROM document_management.document_versions
    WHERE document_id = $1;
  `;
    const countRes = await query(countText, [documentId]);
    const total = countRes.rows[0]?.total || 0;

    const text = `
    SELECT 
      v.*,
      p.version_number AS parent_version_number,
      p.commit_hash    AS parent_commit_hash,
      (SELECT COUNT(*)::int
       FROM document_management.document_version_sections dvs
       WHERE dvs.document_version_id = v.id) AS section_count,
      (SELECT COUNT(*)::int
       FROM document_management.document_version_changes dvc
       WHERE dvc.document_version_id = v.id) AS changes_count
    FROM document_management.document_versions v
    LEFT JOIN document_management.document_versions p ON v.parent_version_id = p.id
    WHERE v.document_id = $1
    ORDER BY v.version_number DESC
    LIMIT $2 OFFSET $3;
  `;
    const res = await query(text, [documentId, limit, offset]);
    return {
        versions: res.rows,
        total,
    };
};

/**
 * Get the manifest (section list) for a specific version.
 */
const getVersionManifest = async (versionId, client = null) => {
    const text = `
    SELECT 
      dvs.document_version_id AS version_id,
      dvs.section_id,
      dvs.parent_section_id,
      dvs.section_order,
      sv.id              AS section_version_id,
      sv.content_hash,
      sv.section_title,
      sv.content
    FROM document_management.document_version_sections dvs
    JOIN document_management.document_section_versions sv
      ON dvs.section_version_id = sv.id
    WHERE dvs.document_version_id = $1
    ORDER BY dvs.parent_section_id NULLS FIRST, dvs.section_order ASC;
  `;
    const executor = client || { query };
    const res = await executor.query(text, [versionId]);
    return res.rows;
};

/**
 * Get the change log for a specific version.
 */
const getVersionChanges = async (versionId) => {
    const text = `
    SELECT 
      c.*,
      old_sv.section_title AS old_section_title,
      new_sv.section_title AS new_section_title
    FROM document_management.document_version_changes c
    LEFT JOIN document_management.document_section_versions old_sv
      ON c.old_section_version_id = old_sv.id
    LEFT JOIN document_management.document_section_versions new_sv
      ON c.new_section_version_id = new_sv.id
    WHERE c.document_version_id = $1
    ORDER BY c.created_at ASC;
  `;
    const res = await query(text, [versionId]);
    return res.rows;
};

module.exports = {
    lockDocumentForUpdate,
    createOrFindSectionSnapshot,
    updateSectionVersionAnnotationsSnapshot,
    createVersion,
    createVersionManifest,
    recordVersionChanges,
    snapshotAnnotationsForVersion,
    updateDocumentCurrentVersion,
    findById,
    findByDocumentId,
    getVersionManifest,
    getVersionChanges,
};

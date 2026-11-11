const { query } = require('../config/db');

const createJob = async ({
    document_id = null,
    source_file_name,
    source_storage_key,
    source_mime_type,
    source_file_size,
    requested_by = null,
}) => {
    const text = `
    INSERT INTO document_management.document_import_jobs (
      document_id,
      source_file_name,
      source_storage_key,
      source_mime_type,
      source_file_size,
      status,
      processing_stage,
      progress_percent,
      requested_by
    )
    VALUES ($1, $2, $3, $4, $5, 'queued', 'pending_extraction', 0, $6)
    RETURNING *;
  `;
    const values = [
        document_id,
        source_file_name,
        source_storage_key,
        source_mime_type,
        source_file_size,
        requested_by,
    ];
    const res = await query(text, values);
    return res.rows[0];
};

const findById = async (id) => {
    const text = `
    SELECT *
    FROM document_management.document_import_jobs
    WHERE id = $1;
  `;
    const res = await query(text, [id]);
    return res.rows[0] || null;
};

const updateProgress = async (id, {
    status,
    processing_stage,
    progress_percent,
    error_message,
    extracted_structure,
    started_at,
    completed_at,
}) => {
    const sets = [];
    const values = [];

    if (status !== undefined) {
        values.push(status);
        sets.push(`status = $${values.length}`);
    }

    if (processing_stage !== undefined) {
        values.push(processing_stage);
        sets.push(`processing_stage = $${values.length}`);
    }

    if (progress_percent !== undefined) {
        values.push(progress_percent);
        sets.push(`progress_percent = $${values.length}`);
    }

    if (error_message !== undefined) {
        values.push(error_message);
        sets.push(`error_message = $${values.length}`);
    }

    if (extracted_structure !== undefined) {
        values.push(JSON.stringify(extracted_structure));
        sets.push(`extracted_structure = $${values.length}`);
    }

    if (started_at !== undefined) {
        values.push(started_at);
        sets.push(`started_at = $${values.length}`);
    }

    if (completed_at !== undefined) {
        values.push(completed_at);
        sets.push(`completed_at = $${values.length}`);
    }

    sets.push(`updated_at = NOW()`);

    values.push(id);
    const idParam = `$${values.length}`;

    const text = `
    UPDATE document_management.document_import_jobs
    SET ${sets.join(', ')}
    WHERE id = ${idParam}
    RETURNING *;
  `;
    const res = await query(text, values);
    return res.rows[0] || null;
};

module.exports = {
    createJob,
    findById,
    updateProgress,
};

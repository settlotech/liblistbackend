const pool = require('../config/db');

let ensureTablePromise = null;

const ensureUserNotesTable = async () => {
    if (!ensureTablePromise) {
        ensureTablePromise = (async () => {
            await pool.query(`
                CREATE TABLE IF NOT EXISTS user_notes (
                    id SERIAL PRIMARY KEY,
                    client_id VARCHAR(120) NOT NULL,
                    user_id VARCHAR(255) NOT NULL,
                    item_type VARCHAR(30) NOT NULL DEFAULT 'note',
                    note_number INTEGER NOT NULL,
                    title VARCHAR(500) NOT NULL,
                    content TEXT NOT NULL DEFAULT '',
                    category VARCHAR(100) NOT NULL DEFAULT 'Policy Note',
                    policy_id VARCHAR(255),
                    policy_title VARCHAR(500),
                    department_name VARCHAR(255),
                    target_type VARCHAR(60) DEFAULT 'section',
                    target_anchor JSONB NOT NULL DEFAULT '{}'::jsonb,
                    pinned BOOLEAN NOT NULL DEFAULT FALSE,
                    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                    UNIQUE (user_id, client_id)
                );
            `);
            await pool.query(`
                CREATE INDEX IF NOT EXISTS idx_user_notes_user_type_num
                ON user_notes (user_id, item_type, note_number);
            `);
            await pool.query(`
                CREATE INDEX IF NOT EXISTS idx_user_notes_policy
                ON user_notes (user_id, policy_id);
            `);
        })().catch((err) => {
            ensureTablePromise = null;
            throw err;
        });
    }
    return ensureTablePromise;
};

const mapRow = (row) => {
    if (!row) return null;
    let anchor = row.target_anchor || {};
    if (typeof anchor === 'string') {
        try {
            anchor = JSON.parse(anchor);
        } catch {
            anchor = {};
        }
    }
    return {
        id: row.client_id || String(row.id),
        dbId: row.id,
        clientId: row.client_id,
        userId: row.user_id,
        itemType: row.item_type === 'annotation' ? 'annotation' : 'note',
        noteNumber: Number(row.note_number),
        title: row.title || '',
        content: row.content || '',
        category: row.category || 'Policy Note',
        policyId: row.policy_id || null,
        policyTitle: row.policy_title || '',
        departmentName: row.department_name || '',
        targetType: row.target_type || 'section',
        targetAnchor: anchor,
        pinned: Boolean(row.pinned),
        createdAt: row.created_at ? new Date(row.created_at).toISOString() : new Date().toISOString(),
        updatedAt: row.updated_at ? new Date(row.updated_at).toISOString() : new Date().toISOString(),
    };
};

const listByUser = async (userId, { itemType, policyId } = {}) => {
    await ensureUserNotesTable();
    const conditions = ['user_id = $1'];
    const values = [String(userId)];

    if (itemType && ['note', 'annotation'].includes(itemType)) {
        values.push(itemType);
        conditions.push(`item_type = $${values.length}`);
    }
    if (policyId) {
        values.push(String(policyId));
        conditions.push(`policy_id = $${values.length}`);
    }

    const res = await pool.query(
        `SELECT * FROM user_notes
         WHERE ${conditions.join(' AND ')}
         ORDER BY pinned DESC, updated_at DESC, note_number DESC`,
        values
    );
    return res.rows.map(mapRow);
};

const createForUser = async (userId, payload = {}) => {
    await ensureUserNotesTable();
    const uid = String(userId);
    const itemType = payload.itemType === 'annotation' ? 'annotation' : 'note';
    const clientId = String(
        payload.clientId ||
        payload.id ||
        `${itemType}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
    );

    const row = await pool.withTransaction(async (client) => {
        // Check if client_id already exists for this user (idempotent sync)
        const existingRes = await client.query(
            `SELECT * FROM user_notes WHERE user_id = $1 AND client_id = $2 LIMIT 1`,
            [uid, clientId]
        );
        if (existingRes.rows[0]) {
            return existingRes.rows[0];
        }

        // Per-user per-type sequential lock so note_number (1, 2, 3...) never collides
        await client.query(`SELECT pg_advisory_xact_lock(hashtext($1))`, [`${uid}:${itemType}`]);
        const maxRes = await client.query(
            `SELECT COALESCE(MAX(note_number), 0) AS max_num FROM user_notes WHERE user_id = $1 AND item_type = $2`,
            [uid, itemType]
        );
        const nextNum = Number(maxRes.rows[0]?.max_num || 0) + 1;

        const insertRes = await client.query(
            `INSERT INTO user_notes (
                client_id, user_id, item_type, note_number, title, content, category,
                policy_id, policy_title, department_name, target_type, target_anchor, pinned
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12::jsonb, $13)
            RETURNING *`,
            [
                clientId,
                uid,
                itemType,
                nextNum,
                String(payload.title || (itemType === 'annotation' ? `Annotation #${nextNum}` : `Note #${nextNum}`)).slice(0, 500),
                String(payload.content || ''),
                String(payload.category || (itemType === 'annotation' ? 'Visual Annotation' : 'Policy Note')).slice(0, 100),
                payload.policyId ? String(payload.policyId) : null,
                payload.policyTitle ? String(payload.policyTitle).slice(0, 500) : '',
                payload.departmentName ? String(payload.departmentName).slice(0, 255) : '',
                String(payload.targetType || (itemType === 'annotation' ? 'graph' : 'section')).slice(0, 60),
                JSON.stringify(payload.targetAnchor || {}),
                Boolean(payload.pinned),
            ]
        );
        return insertRes.rows[0];
    });

    return mapRow(row);
};

const updateForUser = async (userId, idOrClientId, updates = {}) => {
    await ensureUserNotesTable();
    const uid = String(userId);
    const key = String(idOrClientId);

    const sets = ['updated_at = NOW()'];
    const values = [uid, key];

    if (updates.title !== undefined) {
        values.push(String(updates.title).slice(0, 500));
        sets.push(`title = $${values.length}`);
    }
    if (updates.content !== undefined) {
        values.push(String(updates.content));
        sets.push(`content = $${values.length}`);
    }
    if (updates.category !== undefined) {
        values.push(String(updates.category).slice(0, 100));
        sets.push(`category = $${values.length}`);
    }
    if (updates.pinned !== undefined) {
        values.push(Boolean(updates.pinned));
        sets.push(`pinned = $${values.length}`);
    }
    if (updates.targetAnchor !== undefined) {
        values.push(JSON.stringify(updates.targetAnchor || {}));
        sets.push(`target_anchor = $${values.length}::jsonb`);
    }

    const numericId = /^\d+$/.test(key) ? Number(key) : -1;
    values.push(numericId);

    const res = await pool.query(
        `UPDATE user_notes
         SET ${sets.join(', ')}
         WHERE user_id = $1 AND (client_id = $2 OR id = $${values.length})
         RETURNING *`,
        values
    );
    return mapRow(res.rows[0] || null);
};

const deleteForUser = async (userId, idOrClientId) => {
    await ensureUserNotesTable();
    const uid = String(userId);
    const key = String(idOrClientId);
    const numericId = /^\d+$/.test(key) ? Number(key) : -1;

    const res = await pool.query(
        `DELETE FROM user_notes
         WHERE user_id = $1 AND (client_id = $2 OR id = $3)
         RETURNING client_id`,
        [uid, key, numericId]
    );
    return res.rowCount > 0;
};

module.exports = {
    ensureUserNotesTable,
    listByUser,
    createForUser,
    updateForUser,
    deleteForUser,
};

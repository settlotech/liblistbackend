const pool = require('../config/db');


const createTask = async (taskData) => {
    let { title, description = null, category = 'general', library_id = null, section_id = null, created_by, assigned_to = null, participants = [] } = taskData;
    library_id = library_id || taskData.linked_policy_id || taskData.policy_id || null;

    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        // Resolve assigned_to to a user in users table if needed
        let resolvedAssignee = null;
        if (assigned_to) {
            const userCheck = await client.query(
                `SELECT id FROM users WHERE id = $1 OR LOWER(name) = LOWER($1) OR LOWER(email) = LOWER($1) LIMIT 1`,
                [assigned_to]
            );
            if (userCheck.rowCount > 0) {
                resolvedAssignee = userCheck.rows[0].id;
            } else {
                const looseCheck = await client.query(
                    `SELECT id FROM users WHERE LOWER(name) LIKE $1 LIMIT 1`,
                    [`%${assigned_to.toLowerCase()}%`]
                );
                if (looseCheck.rowCount > 0) {
                    resolvedAssignee = looseCheck.rows[0].id;
                }
            }
        }

        // Resolve created_by to a user in users table
        let resolvedCreator = created_by;
        if (created_by) {
            const creatorCheck = await client.query(
                `SELECT id FROM users WHERE id = $1 OR LOWER(name) = LOWER($1) OR LOWER(email) = LOWER($1) LIMIT 1`,
                [created_by]
            );
            if (creatorCheck.rowCount > 0) {
                resolvedCreator = creatorCheck.rows[0].id;
            }
        }
        if (!resolvedCreator) {
            const fallback = await client.query(`SELECT id FROM users LIMIT 1`);
            if (fallback.rowCount > 0) resolvedCreator = fallback.rows[0].id;
        }

        // 1. Insert task
        const taskResult = await client.query(
            `INSERT INTO tasks
                (title, description, category, created_from, library_id, section_id,
                 created_by, assigned_to, status)
             VALUES ($1, $2, $3, 'task_pane', $4, $5, $6, $7, 'pending')
             RETURNING *`,
            [title, description, category, library_id, section_id, resolvedCreator, resolvedAssignee]
        );
        const task = taskResult.rows[0];

        // 2. Log creation
        await client.query(
            `INSERT INTO task_logs (task_id, action, performed_by, new_value)
             VALUES ($1, 'created', $2, $3)`,
            [task.id, resolvedCreator, title]
        );

        // 3. Log initial assignment if provided
        if (resolvedAssignee) {
            await client.query(
                `INSERT INTO task_logs (task_id, action, performed_by, new_value)
                 VALUES ($1, 'assigned', $2, $3)`,
                [task.id, resolvedCreator, resolvedAssignee]
            );
        }

        // 4. Insert participants
        for (const p of participants) {
            let pUserId = p.user_id;
            const pCheck = await client.query(`SELECT id FROM users WHERE id = $1 OR LOWER(name) = LOWER($1) LIMIT 1`, [pUserId]);
            if (pCheck.rowCount > 0) {
                pUserId = pCheck.rows[0].id;
                await client.query(
                    `INSERT INTO task_participants (task_id, user_id, role)
                     VALUES ($1, $2, $3)
                     ON CONFLICT (task_id, user_id, role) DO NOTHING`,
                    [task.id, pUserId, p.role]
                );
            }
        }

        await client.query('COMMIT');
        return task;
    } catch (err) {
        await client.query('ROLLBACK');
        throw err;
    } finally {
        client.release();
    }
};


const getTasksForUser = async ({ userId, search = '', page = 1, limit = 20 }) => {
    const offset = (page - 1) * limit;
    const searchParam = search ? `%${search}%` : null;

    const query = `
        WITH user_pins AS (
            SELECT task_id FROM user_task_pins WHERE user_id = $1
        ),
        base_tasks AS (
            SELECT
                t.*,
                cb.name  AS created_by_name,
                at2.name AS assigned_to_name,
                CASE
                    WHEN t.id IN (SELECT task_id FROM user_pins) THEN 'pinned'
                    WHEN t.category = 'common'  THEN 'common'
                    ELSE 'general'
                END AS display_category,
                (SELECT MAX(tl.created_at)
                   FROM task_logs tl
                  WHERE tl.task_id = t.id) AS last_activity_at
            FROM tasks t
            LEFT JOIN users cb  ON cb.id  = t.created_by
            LEFT JOIN users at2 ON at2.id = t.assigned_to
            WHERE
                -- Common tasks: visible to all
                t.category = 'common'
                OR
                -- Pinned tasks for this user (regardless of category)
                t.id IN (SELECT task_id FROM user_pins)
                OR
                -- General tasks: only own or assigned
                (t.category = 'general' AND (t.created_by = $1 OR t.assigned_to = $1))
                OR
                -- Tasks where user is a participant
                EXISTS (
                    SELECT 1 FROM task_participants tp
                    WHERE tp.task_id = t.id AND tp.user_id = $1
                )
        )
        SELECT *
        FROM base_tasks
        WHERE ($2::TEXT IS NULL
               OR LOWER(title)       LIKE LOWER($2)
               OR LOWER(description) LIKE LOWER($2)
               OR LOWER(task_code)   LIKE LOWER($2))
        ORDER BY
            CASE display_category
                WHEN 'common'  THEN 1
                WHEN 'pinned'  THEN 2
                ELSE 3
            END,
            COALESCE(last_activity_at, created_at) DESC
        LIMIT $3 OFFSET $4
    `;

    const countQuery = `
        SELECT COUNT(*) FROM tasks t
        WHERE t.category = 'common'
           OR t.id IN (SELECT task_id FROM user_task_pins WHERE user_id = $1)
           OR (t.category = 'general' AND (t.created_by = $1 OR t.assigned_to = $1))
           OR EXISTS (SELECT 1 FROM task_participants tp WHERE tp.task_id = t.id AND tp.user_id = $1)
    `;

    const [tasksResult, countResult] = await Promise.all([
        pool.query(query, [userId, searchParam, limit, offset]),
        pool.query(countQuery, [userId])
    ]);

    return {
        tasks: tasksResult.rows,
        total: parseInt(countResult.rows[0].count, 10),
        page,
        limit
    };
};


const getCommonTasks = async ({ userId, search = '', page = 1, limit = 20 }) => {
    const offset = (page - 1) * limit;
    const searchParam = search ? `%${search}%` : null;

    const result = await pool.query(
        `SELECT t.*, cb.name AS created_by_name, at2.name AS assigned_to_name
         FROM tasks t
         LEFT JOIN users cb  ON cb.id  = t.created_by
         LEFT JOIN users at2 ON at2.id = t.assigned_to
         WHERE t.category = 'common'
           AND ($2::TEXT IS NULL OR LOWER(t.title) LIKE LOWER($2) OR LOWER(t.task_code) LIKE LOWER($2))
         ORDER BY COALESCE((SELECT MAX(tl.created_at) FROM task_logs tl WHERE tl.task_id = t.id), t.created_at) DESC
         LIMIT $3 OFFSET $4`,
        [userId, searchParam, limit, offset]
    );
    return result.rows;
};


const getPinnedTasks = async ({ userId, search = '', page = 1, limit = 20 }) => {
    const offset = (page - 1) * limit;
    const searchParam = search ? `%${search}%` : null;

    const result = await pool.query(
        `SELECT t.*, cb.name AS created_by_name, at2.name AS assigned_to_name, utp.pinned_at
         FROM tasks t
         INNER JOIN user_task_pins utp ON utp.task_id = t.id AND utp.user_id = $1
         LEFT JOIN users cb  ON cb.id  = t.created_by
         LEFT JOIN users at2 ON at2.id = t.assigned_to
         WHERE ($2::TEXT IS NULL OR LOWER(t.title) LIKE LOWER($2) OR LOWER(t.task_code) LIKE LOWER($2))
         ORDER BY utp.pinned_at DESC
         LIMIT $3 OFFSET $4`,
        [userId, searchParam, limit, offset]
    );
    return result.rows;
};


const getGeneralTasks = async ({ userId, search = '', page = 1, limit = 20 }) => {
    const offset = (page - 1) * limit;
    const searchParam = search ? `%${search}%` : null;

    const result = await pool.query(
        `SELECT t.*, cb.name AS created_by_name, at2.name AS assigned_to_name
         FROM tasks t
         LEFT JOIN users cb  ON cb.id  = t.created_by
         LEFT JOIN users at2 ON at2.id = t.assigned_to
         WHERE t.category = 'general'
           AND (t.created_by = $1 OR t.assigned_to = $1
                OR EXISTS (SELECT 1 FROM task_participants tp WHERE tp.task_id = t.id AND tp.user_id = $1))
           AND ($2::TEXT IS NULL OR LOWER(t.title) LIKE LOWER($2) OR LOWER(t.task_code) LIKE LOWER($2))
         ORDER BY COALESCE((SELECT MAX(tl.created_at) FROM task_logs tl WHERE tl.task_id = t.id), t.created_at) DESC
         LIMIT $3 OFFSET $4`,
        [userId, searchParam, limit, offset]
    );
    return result.rows;
};


const getTaskById = async (taskId, userId) => {
    const result = await pool.query(
        `SELECT
            t.*,
            cb.name  AS created_by_name,
            at2.name AS assigned_to_name,
            EXISTS(SELECT 1 FROM user_task_pins utp WHERE utp.task_id = t.id AND utp.user_id = $2) AS is_pinned
         FROM tasks t
         LEFT JOIN users cb  ON cb.id  = t.created_by
         LEFT JOIN users at2 ON at2.id = t.assigned_to
         WHERE t.id = $1`,
        [taskId, userId]
    );
    return result.rows[0] || null;
};


const updateTask = async (taskId, updates, performedBy) => {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        const existing = await client.query('SELECT * FROM tasks WHERE id = $1', [taskId]);
        if (existing.rowCount === 0) return null;
        const current = existing.rows[0];

        const setClauses = [];
        const values = [];
        let idx = 1;

        if (updates.title !== undefined) {
            setClauses.push(`title = $${idx++}`);
            values.push(updates.title);
        }
        if (updates.description !== undefined) {
            setClauses.push(`description = $${idx++}`);
            values.push(updates.description);
        }
        if (updates.category !== undefined) {
            setClauses.push(`category = $${idx++}`);
            values.push(updates.category);
        }

        if (setClauses.length === 0) return current;

        values.push(taskId);
        const result = await client.query(
            `UPDATE tasks SET ${setClauses.join(', ')}, updated_at = NOW()
             WHERE id = $${idx}
             RETURNING *`,
            values
        );

        await client.query(
            `INSERT INTO task_logs (task_id, action, performed_by, old_value, new_value)
             VALUES ($1, 'updated', $2, $3, $4)`,
            [taskId, performedBy, current.title, updates.title || current.title]
        );

        await client.query('COMMIT');
        return result.rows[0];
    } catch (err) {
        await client.query('ROLLBACK');
        throw err;
    } finally {
        client.release();
    }
};


const deleteTask = async (taskId, performedBy) => {
    const result = await pool.query(
        'DELETE FROM tasks WHERE id = $1 RETURNING *',
        [taskId]
    );
    return result.rows[0] || null;
};


//Assign task to a user (initial assignment) 
const assignTask = async (taskId, assignedTo, performedBy) => {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        const result = await client.query(
            `UPDATE tasks SET assigned_to = $1, updated_at = NOW()
             WHERE id = $2 RETURNING *`,
            [assignedTo, taskId]
        );
        if (result.rowCount === 0) {
            await client.query('ROLLBACK');
            return null;
        }

        await client.query(
            `INSERT INTO task_logs (task_id, action, performed_by, new_value)
             VALUES ($1, 'assigned', $2, $3)`,
            [taskId, performedBy, assignedTo]
        );

        await client.query('COMMIT');
        return result.rows[0];
    } catch (err) {
        await client.query('ROLLBACK');
        throw err;
    } finally {
        client.release();
    }
};

// Reassign task – preserves old assignee in task_logs
const reassignTask = async (taskId, newAssignedTo, performedBy) => {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        const existing = await client.query('SELECT assigned_to FROM tasks WHERE id = $1', [taskId]);
        if (existing.rowCount === 0) {
            await client.query('ROLLBACK');
            return null;
        }
        const oldAssignee = existing.rows[0].assigned_to;

        const result = await client.query(
            `UPDATE tasks SET assigned_to = $1, updated_at = NOW()
             WHERE id = $2 RETURNING *`,
            [newAssignedTo, taskId]
        );

        await client.query(
            `INSERT INTO task_logs (task_id, action, performed_by, old_value, new_value)
             VALUES ($1, 'reassigned', $2, $3, $4)`,
            [taskId, performedBy, oldAssignee, newAssignedTo]
        );

        await client.query('COMMIT');
        return result.rows[0];
    } catch (err) {
        await client.query('ROLLBACK');
        throw err;
    } finally {
        client.release();
    }
};


const VALID_STATUS_TRANSITIONS = {
    pending:   ['in_progress', 'responded', 'completed', 'cancelled'],
    in_progress: ['responded', 'completed', 'cancelled', 'pending'],
    responded: ['completed', 'cancelled', 'in_progress', 'pending'],
    completed: ['approved', 'cancelled', 'pending', 'in_progress'],
    approved:  ['pending', 'completed'],
    cancelled: ['pending']
};


const updateTaskStatus = async (taskId, newStatus, performedBy, comment = null) => {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        const existing = await client.query('SELECT * FROM tasks WHERE id = $1', [taskId]);
        if (existing.rowCount === 0) {
            await client.query('ROLLBACK');
            return { error: 'Task not found', status: 404 };
        }
        const task = existing.rows[0];
        const allowed = VALID_STATUS_TRANSITIONS[task.status] || [];
        if (!allowed.includes(newStatus)) {
            await client.query('ROLLBACK');
            return {
                error: `Invalid status transition: ${task.status} → ${newStatus}`,
                status: 422
            };
        }

        const result = await client.query(
            `UPDATE tasks SET status = $1, updated_at = NOW()
             WHERE id = $2 RETURNING *`,
            [newStatus, taskId]
        );

        // Determine action type for the log
        const actionMap = {
            responded: 'responded',
            completed: 'completed',
            approved:  'approved',
            cancelled: 'cancelled'
        };
        const logAction = actionMap[newStatus] || 'status_changed';

        await client.query(
            `INSERT INTO task_logs (task_id, action, performed_by, old_value, new_value, comment)
             VALUES ($1, $2, $3, $4, $5, $6)`,
            [taskId, logAction, performedBy, task.status, newStatus, comment]
        );

        await client.query('COMMIT');
        return { task: result.rows[0] };
    } catch (err) {
        await client.query('ROLLBACK');
        throw err;
    } finally {
        client.release();
    }
};


const getParticipants = async (taskId) => {
    const result = await pool.query(
        `SELECT tp.*, u.name AS user_name, u.email
         FROM task_participants tp
         INNER JOIN users u ON u.id = tp.user_id
         WHERE tp.task_id = $1
         ORDER BY tp.created_at ASC`,
        [taskId]
    );
    return result.rows;
};

const addParticipant = async (taskId, userId, role, performedBy) => {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        const result = await client.query(
            `INSERT INTO task_participants (task_id, user_id, role)
             VALUES ($1, $2, $3)
             ON CONFLICT (task_id, user_id, role) DO NOTHING
             RETURNING *`,
            [taskId, userId, role]
        );

        if (result.rowCount > 0) {
            await client.query(
                `INSERT INTO task_logs (task_id, action, performed_by, new_value, comment)
                 VALUES ($1, 'updated', $2, $3, $4)`,
                [taskId, performedBy, userId, `Added participant with role: ${role}`]
            );
            await client.query('UPDATE tasks SET updated_at = NOW() WHERE id = $1', [taskId]);
        }

        await client.query('COMMIT');
        return result.rows[0] || null;
    } catch (err) {
        await client.query('ROLLBACK');
        throw err;
    } finally {
        client.release();
    }
};

const removeParticipant = async (taskId, participantId, performedBy) => {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        const result = await client.query(
            'DELETE FROM task_participants WHERE id = $1 AND task_id = $2 RETURNING *',
            [participantId, taskId]
        );

        if (result.rowCount > 0) {
            await client.query(
                `INSERT INTO task_logs (task_id, action, performed_by, comment)
                 VALUES ($1, 'updated', $2, 'Participant removed')`,
                [taskId, performedBy]
            );
            await client.query('UPDATE tasks SET updated_at = NOW() WHERE id = $1', [taskId]);
        }

        await client.query('COMMIT');
        return result.rows[0] || null;
    } catch (err) {
        await client.query('ROLLBACK');
        throw err;
    } finally {
        client.release();
    }
};


const pinTask = async (taskId, userId) => {
    const result = await pool.query(
        `INSERT INTO user_task_pins (task_id, user_id)
         VALUES ($1, $2)
         ON CONFLICT (task_id, user_id) DO NOTHING
         RETURNING *`,
        [taskId, userId]
    );
    return result.rows[0] || null;
};

const unpinTask = async (taskId, userId) => {
    const result = await pool.query(
        'DELETE FROM user_task_pins WHERE task_id = $1 AND user_id = $2 RETURNING *',
        [taskId, userId]
    );
    return result.rows[0] || null;
};


const getTaskLogs = async (taskId) => {
    const result = await pool.query(
        `SELECT tl.*, u.name AS performed_by_name
         FROM task_logs tl
         INNER JOIN users u ON u.id = tl.performed_by
         WHERE tl.task_id = $1
         ORDER BY tl.created_at DESC`,
        [taskId]
    );
    return result.rows;
};

const addComment = async (taskId, comment, performedBy) => {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        const result = await client.query(
            `INSERT INTO task_logs (task_id, action, performed_by, comment)
             VALUES ($1, 'commented', $2, $3)
             RETURNING *`,
            [taskId, performedBy, comment]
        );
        await client.query('UPDATE tasks SET updated_at = NOW() WHERE id = $1', [taskId]);

        await client.query('COMMIT');
        return result.rows[0];
    } catch (err) {
        await client.query('ROLLBACK');
        throw err;
    } finally {
        client.release();
    }
};


const canUserAccessTask = async (taskId, userId) => {
    const result = await pool.query(
        `SELECT 1 FROM tasks t
         WHERE t.id = $1
           AND (
               t.category = 'common'
               OR t.created_by  = $2
               OR t.assigned_to = $2
               OR EXISTS (
                   SELECT 1 FROM task_participants tp
                   WHERE tp.task_id = $1 AND tp.user_id = $2
               )
               OR EXISTS (
                   SELECT 1 FROM user_task_pins utp
                   WHERE utp.task_id = $1 AND utp.user_id = $2
               )
           )`,
        [taskId, userId]
    );
    return result.rowCount > 0;
};


const isParticipantWithRole = async (taskId, userId, role) => {
    const result = await pool.query(
        `SELECT 1 FROM task_participants
         WHERE task_id = $1 AND user_id = $2 AND role = $3`,
        [taskId, userId, role]
    );
    return result.rowCount > 0;
};


const getAssignableUsers = async () => {
    const result = await pool.query(
        `SELECT id, name, email, is_active
         FROM users
         WHERE is_active = TRUE
         ORDER BY name ASC`
    );
    return result.rows;
};

module.exports = {
    getAssignableUsers,
    createTask,
    getTasksForUser,
    getCommonTasks,
    getPinnedTasks,
    getGeneralTasks,
    getTaskById,
    updateTask,
    deleteTask,
    assignTask,
    reassignTask,
    updateTaskStatus,
    getParticipants,
    addParticipant,
    removeParticipant,
    pinTask,
    unpinTask,
    getTaskLogs,
    addComment,
    canUserAccessTask,
    isParticipantWithRole,
    VALID_STATUS_TRANSITIONS
};

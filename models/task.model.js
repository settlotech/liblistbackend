const pool = require('../config/db');

const taskModel = {
    // ── GET ASSIGNABLE USERS (Search-aware) ──────────────────────────────
    async getAssignableUsers(search = '') {
        const params = [];
        let searchClause = '';
        if (search && search.trim()) {
            params.push(`%${search.trim().toLowerCase()}%`);
            searchClause = ` AND (LOWER(u.name) LIKE $${params.length} OR LOWER(u.email) LIKE $${params.length})`;
        }

        const query = `
            SELECT u.id, u.name, u.email,
                   COALESCE(array_agg(r.role_name) FILTER (WHERE r.role_name IS NOT NULL), '{}') as roles
            FROM users u
            LEFT JOIN user_roles ur ON u.id = ur.user_id
            LEFT JOIN roles r ON ur.role_id = r.id
            WHERE u.is_active = TRUE ${searchClause}
            GROUP BY u.id, u.name, u.email
            ORDER BY u.name ASC
            LIMIT 50
        `;
        const res = await pool.query(query, params);
        return res.rows;
    },

    // ── CREATE TASK (Multi-Assignee & Reusable Group support) ─────────────
    async createTask({ title, description, category = 'general', due_date, library_id, section_id, created_by, assigned_to, assignees, participants = [] }) {
        const client = await pool.connect();
        try {
            await client.query('BEGIN');

            // Collect all assignee IDs
            const assigneeIds = Array.isArray(assignees) && assignees.length > 0
                ? assignees
                : (Array.isArray(assigned_to) ? assigned_to : (assigned_to ? [assigned_to] : []));
            const primaryAssignee = assigneeIds[0] || null;

            const insertTaskQ = `
                INSERT INTO tasks (title, description, category, due_date, status, library_id, section_id, created_by, assigned_to)
                VALUES ($1, $2, $3, $4, 'responded', $5, $6, $7, $8)
                RETURNING id, title, description, category, due_date, status, library_id, section_id, created_by, assigned_to, created_at, updated_at
            `;
            const taskRes = await client.query(insertTaskQ, [
                title,
                description || null,
                category || 'general',
                due_date || null,
                library_id || null,
                section_id || null,
                created_by || null,
                primaryAssignee
            ]);
            const task = taskRes.rows[0];
            const taskSeq = `TSK-${String(task.id).padStart(3, '0')}`;
            await client.query('UPDATE tasks SET task_seq = $1 WHERE id = $2', [taskSeq, task.id]);
            task.task_seq = taskSeq;

            // Insert into task_assignees for multi-assignee support
            if (assigneeIds.length > 0) {
                for (const uid of assigneeIds) {
                    await client.query(
                        `INSERT INTO task_assignees (task_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
                        [task.id, uid]
                    );
                }
            }

            // Insert participants if any
            if (Array.isArray(participants) && participants.length > 0) {
                for (const p of participants) {
                    if (p.user_id && p.role) {
                        await client.query(
                            `INSERT INTO task_participants (task_id, user_id, role) VALUES ($1, $2, $3)`,
                            [task.id, p.user_id, p.role]
                        );
                    }
                }
            }

            // Insert initial history log (Image 4 format)
            const initialStatus = primaryAssignee ? (primaryAssignee === created_by ? 'Self' : 'Reassigned') : 'Self';
            const logComment = description ? description.substring(0, 150) : (library_id ? `Context: library ${library_id}` : 'Task created');
            await client.query(
                `INSERT INTO task_logs (task_id, status, assigned_to, comment, actor_id, created_at)
                 VALUES ($1, $2, $3, $4, $5, NOW())`,
                [task.id, initialStatus, primaryAssignee || created_by, logComment, created_by]
            );

            await client.query('COMMIT');
            return task;
        } catch (err) {
            await client.query('ROLLBACK');
            throw err;
        } finally {
            client.release();
        }
    },

    // ── GET TASKS (PAGINATED & GROUPED) ──────────────────────────────────
    async getTasks({ category = 'all', search = '', page = 1, limit = 20, userId = null } = {}) {
        const offset = (Math.max(1, parseInt(page, 10)) - 1) * Math.max(1, parseInt(limit, 10));
        const conditions = [];
        const params = [];

        if (category === 'common') {
            params.push('common');
            conditions.push(`t.category = $${params.length}`);
        } else if (category === 'general') {
            params.push('general');
            conditions.push(`t.category = $${params.length}`);
        } else if (category === 'pinned' && userId) {
            params.push(userId);
            conditions.push(`EXISTS (SELECT 1 FROM task_pins tp WHERE tp.task_id = t.id AND tp.user_id = $${params.length})`);
        }

        if (search && search.trim()) {
            params.push(`%${search.trim().toLowerCase()}%`);
            conditions.push(`(
                LOWER(t.title) LIKE $${params.length} OR
                LOWER(COALESCE(t.description, '')) LIKE $${params.length} OR
                LOWER(COALESCE(t.task_seq, '')) LIKE $${params.length}
            )`);
        }

        const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

        const countQuery = `SELECT COUNT(*) FROM tasks t ${whereClause}`;
        const countRes = await pool.query(countQuery, params);
        const total = parseInt(countRes.rows[0].count, 10);

        const queryParams = [...params, limit, offset];
        const tasksQuery = `
            SELECT t.id,
                   t.task_seq,
                   t.title,
                   t.description,
                   t.category,
                   t.status,
                   t.due_date,
                   t.library_id,
                   d_policy.document_name AS policy_title,
                   t.section_id,
                   t.created_by,
                   t.assigned_to,
                   t.created_at,
                   t.updated_at,
                   u_creator.name as creator_name,
                   u_creator.email as creator_email,
                   u_assigned.name as assigned_name,
                   u_assigned.email as assigned_email,
                   CASE WHEN tp_curr.user_id IS NOT NULL THEN TRUE ELSE FALSE END as is_pinned,
                   (
                       SELECT COALESCE(json_agg(json_build_object(
                           'id', u_ass.id,
                           'name', u_ass.name,
                           'email', u_ass.email
                       )), '[]'::json)
                       FROM task_assignees ta
                       JOIN users u_ass ON ta.user_id = u_ass.id
                       WHERE ta.task_id = t.id
                   ) as assignees,
                   (
                       SELECT json_agg(json_build_object(
                           'id', tl.id,
                           'date', tl.created_at,
                           'status', tl.status,
                           'owner', COALESCE(u_log.name, '@self'),
                           'comment', tl.comment
                       ) ORDER BY tl.created_at DESC)
                       FROM task_logs tl
                       LEFT JOIN users u_log ON tl.assigned_to = u_log.id
                       WHERE tl.task_id = t.id
                   ) as history_logs,
                   (
                       SELECT COALESCE(json_agg(json_build_object(
                           'id', u_ass.id,
                           'name', u_ass.name,
                           'email', u_ass.email
                       )), '[]'::json)
                       FROM task_assignees ta
                       JOIN users u_ass ON ta.user_id = u_ass.id
                       WHERE ta.task_id = t.id
                   ) as assignees,
                   (
                       SELECT json_agg(json_build_object(
                           'id', part.id,
                           'user_id', part.user_id,
                           'name', u_part.name,
                           'email', u_part.email,
                           'role', part.role
                       ))
                       FROM task_participants part
                       LEFT JOIN users u_part ON part.user_id = u_part.id
                       WHERE part.task_id = t.id
                   ) as participants
            FROM tasks t
            LEFT JOIN document_management.documents d_policy ON d_policy.id::text = t.library_id
            LEFT JOIN users u_creator ON t.created_by = u_creator.id
            LEFT JOIN users u_assigned ON t.assigned_to = u_assigned.id
            LEFT JOIN task_pins tp_curr ON t.id = tp_curr.task_id AND tp_curr.user_id = $${userId ? params.length + 3 : 0 || 1}
            ${whereClause}
            ORDER BY t.created_at DESC
            LIMIT $${params.length + 1} OFFSET $${params.length + 2}
        `;

        // If userId is provided, ensure parameter matching
        const actualParams = userId ? [...params, limit, offset, userId] : [...params, limit, offset];
        const res = await pool.query(
            userId ? tasksQuery.replace(`$${params.length + 3}`, `$${actualParams.length}`) : tasksQuery.replace(/AND tp_curr\.user_id = \$\d+/, 'AND 1=0'),
            actualParams
        );

        return {
            tasks: res.rows,
            pagination: {
                page: parseInt(page, 10),
                limit: parseInt(limit, 10),
                total,
                totalPages: Math.ceil(total / limit)
            }
        };
    },

    // ── GET TASK BY ID ───────────────────────────────────────────────────
    async getTaskById(taskId, userId = null) {
        const query = `
            SELECT t.*,
                   d_policy.document_name AS policy_title,
                   u_creator.name as creator_name,
                   u_creator.email as creator_email,
                   u_assigned.name as assigned_name,
                   u_assigned.email as assigned_email,
                   CASE WHEN tp_curr.user_id IS NOT NULL THEN TRUE ELSE FALSE END as is_pinned,
                   (
                       SELECT COALESCE(json_agg(json_build_object(
                           'id', u_ass.id,
                           'name', u_ass.name,
                           'email', u_ass.email
                       )), '[]'::json)
                       FROM task_assignees ta
                       JOIN users u_ass ON ta.user_id = u_ass.id
                       WHERE ta.task_id = t.id
                   ) as assignees,
                   (
                       SELECT json_agg(json_build_object(
                           'id', tl.id,
                           'date', tl.created_at,
                           'status', tl.status,
                           'owner', COALESCE(u_log.name, '@self'),
                           'comment', tl.comment
                       ) ORDER BY tl.created_at DESC)
                       FROM task_logs tl
                       LEFT JOIN users u_log ON tl.assigned_to = u_log.id
                       WHERE tl.task_id = t.id
                   ) as history_logs,
                   (
                       SELECT COALESCE(json_agg(json_build_object(
                           'id', u_ass.id,
                           'name', u_ass.name,
                           'email', u_ass.email
                       )), '[]'::json)
                       FROM task_assignees ta
                       JOIN users u_ass ON ta.user_id = u_ass.id
                       WHERE ta.task_id = t.id
                   ) as assignees,
                   (
                       SELECT json_agg(json_build_object(
                           'id', part.id,
                           'user_id', part.user_id,
                           'name', u_part.name,
                           'email', u_part.email,
                           'role', part.role
                       ))
                       FROM task_participants part
                       LEFT JOIN users u_part ON part.user_id = u_part.id
                       WHERE part.task_id = t.id
                   ) as participants
            FROM tasks t
            LEFT JOIN document_management.documents d_policy ON d_policy.id::text = t.library_id
            LEFT JOIN users u_creator ON t.created_by = u_creator.id
            LEFT JOIN users u_assigned ON t.assigned_to = u_assigned.id
            LEFT JOIN task_pins tp_curr ON t.id = tp_curr.task_id AND tp_curr.user_id = $2
            WHERE t.id = $1
        `;
        const res = await pool.query(query, [taskId, userId]);
        return res.rows[0] || null;
    },

    // ── UPDATE TASK ──────────────────────────────────────────────────────
    async updateTask(taskId, { title, description, category, due_date }) {
        const updates = [];
        const params = [taskId];

        if (title !== undefined) {
            params.push(title);
            updates.push(`title = $${params.length}`);
        }
        if (description !== undefined) {
            params.push(description);
            updates.push(`description = $${params.length}`);
        }
        if (category !== undefined) {
            params.push(category);
            updates.push(`category = $${params.length}`);
        }
        if (due_date !== undefined) {
            params.push(due_date || null);
            updates.push(`due_date = $${params.length}`);
        }

        if (updates.length === 0) return null;
        updates.push('updated_at = NOW()');

        const query = `
            UPDATE tasks
            SET ${updates.join(', ')}
            WHERE id = $1
            RETURNING *
        `;
        const res = await pool.query(query, params);
        return res.rows[0];
    },

    // ── DELETE TASK ──────────────────────────────────────────────────────
    async deleteTask(taskId) {
        const res = await pool.query('DELETE FROM tasks WHERE id = $1 RETURNING id', [taskId]);
        return res.rowCount > 0;
    },

    // ── REASSIGN TASK ────────────────────────────────────────────────────
    async assignTask(taskId, assignedTo, actorId, comment = null) {
        const client = await pool.connect();
        try {
            await client.query('BEGIN');

            const taskRes = await client.query('SELECT * FROM tasks WHERE id = $1', [taskId]);
            if (taskRes.rows.length === 0) throw new Error('Task not found');
            const task = taskRes.rows[0];

            let newOwnerName = '@self';
            if (assignedTo) {
                const userRes = await client.query('SELECT name FROM users WHERE id = $1', [assignedTo]);
                newOwnerName = userRes.rows[0]?.name || `@user`;
            }

            await client.query(
                `UPDATE tasks SET assigned_to = $1, updated_at = NOW() WHERE id = $2`,
                [assignedTo || null, taskId]
            );

            // Add history log (Image 4: Reassigned)
            await client.query(
                `INSERT INTO task_logs (task_id, status, assigned_to, comment, actor_id, created_at)
                 VALUES ($1, 'Reassigned', $2, $3, $4, NOW())`,
                [taskId, assignedTo || null, comment || `Reassigned to ${newOwnerName}`, actorId]
            );

            await client.query('COMMIT');
            return true;
        } catch (err) {
            await client.query('ROLLBACK');
            throw err;
        } finally {
            client.release();
        }
    },

    // ── UPDATE STATUS ────────────────────────────────────────────────────
    async updateStatus(taskId, status, comment = null, actorId = null) {
        const client = await pool.connect();
        try {
            await client.query('BEGIN');

            const taskRes = await client.query('SELECT * FROM tasks WHERE id = $1', [taskId]);
            if (taskRes.rows.length === 0) throw new Error('Task not found');
            const task = taskRes.rows[0];

            await client.query(
                `UPDATE tasks SET status = $1, updated_at = NOW() WHERE id = $2`,
                [status, taskId]
            );

            // Capitalize for log display (e.g. Completed, Approved, Cancelled, Responded)
            const displayStatus = status.charAt(0).toUpperCase() + status.slice(1);
            await client.query(
                `INSERT INTO task_logs (task_id, status, assigned_to, comment, actor_id, created_at)
                 VALUES ($1, $2, $3, $4, $5, NOW())`,
                [taskId, displayStatus, task.assigned_to, comment || `Status changed to ${displayStatus}`, actorId]
            );

            await client.query('COMMIT');
            return true;
        } catch (err) {
            await client.query('ROLLBACK');
            throw err;
        } finally {
            client.release();
        }
    },

    // ── PIN / UNPIN ──────────────────────────────────────────────────────
    async pinTask(taskId, userId) {
        await pool.query(
            `INSERT INTO task_pins (task_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
            [taskId, userId]
        );
        return true;
    },

    async unpinTask(taskId, userId) {
        await pool.query(
            `DELETE FROM task_pins WHERE task_id = $1 AND user_id = $2`,
            [taskId, userId]
        );
        return true;
    },

    // ── LOGS & COMMENTS ──────────────────────────────────────────────────
    async getTaskLogs(taskId) {
        const res = await pool.query(
            `SELECT tl.id,
                    tl.task_id,
                    tl.status,
                    tl.comment,
                    tl.created_at as date,
                    COALESCE(u.name, '@self') as owner,
                    u_actor.name as actor_name
             FROM task_logs tl
             LEFT JOIN users u ON tl.assigned_to = u.id
             LEFT JOIN users u_actor ON tl.actor_id = u_actor.id
             WHERE tl.task_id = $1
             ORDER BY tl.created_at DESC`,
            [taskId]
        );
        return res.rows;
    },

    async addComment(taskId, comment, actorId) {
        const taskRes = await pool.query('SELECT assigned_to FROM tasks WHERE id = $1', [taskId]);
        const assignedTo = taskRes.rows[0]?.assigned_to || null;

        const res = await pool.query(
            `INSERT INTO task_logs (task_id, status, assigned_to, comment, actor_id, created_at)
             VALUES ($1, 'Comment', $2, $3, $4, NOW())
             RETURNING *`,
            [taskId, assignedTo, comment, actorId]
        );
        return res.rows[0];
    },

    // ── PARTICIPANTS ─────────────────────────────────────────────────────
    async getParticipants(taskId) {
        const res = await pool.query(
            `SELECT tp.id, tp.task_id, tp.user_id, tp.role, tp.created_at,
                    u.name, u.email
             FROM task_participants tp
             JOIN users u ON tp.user_id = u.id
             WHERE tp.task_id = $1
             ORDER BY tp.created_at ASC`,
            [taskId]
        );
        return res.rows;
    },

    async addParticipant(taskId, userId, role) {
        const res = await pool.query(
            `INSERT INTO task_participants (task_id, user_id, role)
             VALUES ($1, $2, $3)
             RETURNING *`,
            [taskId, userId, role]
        );
        return res.rows[0];
    },

    async removeParticipant(taskId, participantId) {
        const res = await pool.query(
            `DELETE FROM task_participants WHERE task_id = $1 AND id = $2 RETURNING id`,
            [taskId, participantId]
        );
        return res.rowCount > 0;
    },

    // ── ASSIGNEE GROUPS (Reusable Teams) ─────────────────────────────────
    async createAssigneeGroup({ name, description, created_by, member_ids = [] }) {
        const client = await pool.connect();
        try {
            await client.query('BEGIN');
            const res = await client.query(
                `INSERT INTO task_assignee_groups (name, description, created_by)
                 VALUES ($1, $2, $3)
                 RETURNING *`,
                [name, description || null, created_by]
            );
            const group = res.rows[0];

            if (Array.isArray(member_ids) && member_ids.length > 0) {
                for (const uid of member_ids) {
                    await client.query(
                        `INSERT INTO task_assignee_group_members (group_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
                        [group.id, uid]
                    );
                }
            }

            await client.query('COMMIT');
            return await this.getAssigneeGroupById(group.id);
        } catch (err) {
            await client.query('ROLLBACK');
            throw err;
        } finally {
            client.release();
        }
    },

    async getAssigneeGroups() {
        const query = `
            SELECT g.id, g.name, g.description, g.created_by, g.created_at,
                   COALESCE(
                       (SELECT json_agg(json_build_object(
                           'id', u.id,
                           'name', u.name,
                           'email', u.email
                       ))
                       FROM task_assignee_group_members gm
                       JOIN users u ON gm.user_id = u.id
                       WHERE gm.group_id = g.id),
                       '[]'::json
                   ) as members
            FROM task_assignee_groups g
            ORDER BY g.name ASC
        `;
        const res = await pool.query(query);
        return res.rows;
    },

    async getAssigneeGroupById(groupId) {
        const query = `
            SELECT g.id, g.name, g.description, g.created_by, g.created_at,
                   COALESCE(
                       (SELECT json_agg(json_build_object(
                           'id', u.id,
                           'name', u.name,
                           'email', u.email
                       ))
                       FROM task_assignee_group_members gm
                       JOIN users u ON gm.user_id = u.id
                       WHERE gm.group_id = g.id),
                       '[]'::json
                   ) as members
            FROM task_assignee_groups g
            WHERE g.id = $1
        `;
        const res = await pool.query(query, [groupId]);
        return res.rows[0] || null;
    },

    async deleteAssigneeGroup(groupId) {
        const res = await pool.query(
            `DELETE FROM task_assignee_groups WHERE id = $1 RETURNING id`,
            [groupId]
        );
        return res.rowCount > 0;
    }
};

module.exports = taskModel;

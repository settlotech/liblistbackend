const { query } = require('../db');

/**
 * GET /api/tasks
 * Returns all compliance & operational workflow tasks.
 * Optional query: assigned_to, status
 */
async function getTasks(req, res, next) {
  try {
    const { assigned_to, status } = req.query;
    let sql = 'SELECT * FROM tasks WHERE 1=1';
    const params = [];

    if (assigned_to && assigned_to !== 'all') {
      params.push(assigned_to);
      sql += ` AND LOWER(assigned_to) LIKE LOWER('%' || $${params.length} || '%')`;
    }

    if (status && status !== 'all') {
      params.push(status);
      sql += ` AND status = $${params.length}`;
    }

    sql += ' ORDER BY id DESC;';

    const result = await query(sql, params);
    res.json(result.rows);
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/tasks
 * Create and assign a new task.
 */
async function createTask(req, res, next) {
  try {
    const {
      title,
      description = '',
      assigned_to = 'Sarah Jenkins',
      assigned_by = 'Marcus Vance (Bank Owner)',
      priority = 'medium',
      status = 'pending',
      due_date = 'In 7 Days',
      category = 'APRA CPS 234 Audit',
      linked_policy_id = null
    } = req.body;

    if (!title) {
      return res.status(400).json({ error: 'Task title is required' });
    }

    const result = await query(
      `INSERT INTO tasks (title, description, assigned_to, assigned_by, priority, status, due_date, category, linked_policy_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING *;`,
      [title, description, assigned_to, assigned_by, priority, status, due_date, category, linked_policy_id]
    );

    // Also log in change_logs for institutional compliance audit
    await query(
      `INSERT INTO change_logs (entity_type, entity_id, user_name, action, section_name, details)
       VALUES ('task', $1, $2, 'TASK_ASSIGNED', $3, $4);`,
      [
        String(result.rows[0].id),
        assigned_by,
        category,
        `Assigned task "${title}" to ${assigned_to}. Due: ${due_date}`
      ]
    );

    res.status(201).json(result.rows[0]);
  } catch (err) {
    next(err);
  }
}

/**
 * PATCH /api/tasks/:id
 * Update task status, assignee, or details.
 */
async function updateTask(req, res, next) {
  try {
    const { id } = req.params;
    const { status, title, description, priority, due_date, assigned_to } = req.body;

    const existingRes = await query('SELECT * FROM tasks WHERE id = $1', [id]);
    if (existingRes.rows.length === 0) {
      return res.status(404).json({ error: 'Task not found' });
    }
    const current = existingRes.rows[0];

    const updatedTitle = title !== undefined ? title : current.title;
    const updatedDesc = description !== undefined ? description : current.description;
    const updatedStatus = status !== undefined ? status : current.status;
    const updatedPriority = priority !== undefined ? priority : current.priority;
    const updatedDueDate = due_date !== undefined ? due_date : current.due_date;
    const updatedAssignee = assigned_to !== undefined ? assigned_to : current.assigned_to;

    const result = await query(
      `UPDATE tasks
       SET title = $1, description = $2, status = $3, priority = $4, due_date = $5, assigned_to = $6, updated_at = CURRENT_TIMESTAMP
       WHERE id = $7
       RETURNING *;`,
      [updatedTitle, updatedDesc, updatedStatus, updatedPriority, updatedDueDate, updatedAssignee, id]
    );

    res.json(result.rows[0]);
  } catch (err) {
    next(err);
  }
}

/**
 * DELETE /api/tasks/:id
 * Remove task.
 */
async function deleteTask(req, res, next) {
  try {
    const { id } = req.params;
    const result = await query('DELETE FROM tasks WHERE id = $1 RETURNING *;', [id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Task not found' });
    }
    res.json({ success: true, message: 'Task deleted successfully' });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  getTasks,
  createTask,
  updateTask,
  deleteTask
};


const { query } = require('../db');

/**
 * GET /api/users
 * Returns list of users, optionally filtered by bank_id or role_type.
 */
async function getUsers(req, res, next) {
  try {
    const { bank_id, role_type } = req.query;
    let conditions = [];
    let params = [];
    let idx = 1;

    if (bank_id && bank_id !== 'all') {
      conditions.push(`bank_id = $${idx++}`);
      params.push(bank_id);
    }
    if (role_type) {
      conditions.push(`role_type = $${idx++}`);
      params.push(role_type);
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const result = await query(
      `SELECT id, name, email, role, role_type, department, avatar, bank_id, is_active, created_by, created_at
       FROM users
       ${where}
       ORDER BY created_at ASC;`,
      params
    );
    res.json(result.rows);
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/users/:id
 * Returns single user by ID.
 */
async function getUserById(req, res, next) {
  try {
    const { id } = req.params;
    const result = await query('SELECT * FROM users WHERE id = $1', [id]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'User not found' });
    res.json(result.rows[0]);
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/users
 * Admin endpoint to create a new user and assign roles.
 */
async function createUser(req, res, next) {
  try {
    const {
      name,
      email,
      role = 'Bank Employee',
      role_type = 'employee',
      department = 'Retail Banking',
      bank_id = 'cba',
      created_by = 'Admin'
    } = req.body;

    if (!name || !email) {
      return res.status(400).json({ error: 'Name and email are required' });
    }

    // Generate unique ID & Avatar
    const id = `u_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
    const avatar = name
      .split(' ')
      .map(part => part[0])
      .join('')
      .substring(0, 2)
      .toUpperCase();

    const result = await query(
      `INSERT INTO users (id, name, email, role, role_type, department, avatar, bank_id, is_active, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, TRUE, $9)
       RETURNING *;`,
      [id, name.trim(), email.trim().toLowerCase(), role, role_type, department, avatar, bank_id, created_by]
    );

    // Record in change logs
    await query(
      `INSERT INTO change_logs (entity_type, entity_id, user_name, action, section_name, details)
       VALUES ('user', $1, $2, 'CREATED', $3, $4);`,
      [id, created_by, department, `New user ${name} (${role} - ${role_type}) provisioned for ${bank_id.toUpperCase()}`]
    );

    res.status(201).json(result.rows[0]);
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ error: 'A user with this email already exists' });
    }
    next(err);
  }
}

/**
 * PUT /api/users/:id
 * Updates an existing user's role, department, or active status.
 */
async function updateUser(req, res, next) {
  try {
    const { id } = req.params;
    const { name, email, role, role_type, department, bank_id, is_active, updated_by = 'Admin' } = req.body;

    const result = await query(
      `UPDATE users
       SET name = COALESCE($1, name),
           email = COALESCE($2, email),
           role = COALESCE($3, role),
           role_type = COALESCE($4, role_type),
           department = COALESCE($5, department),
           bank_id = COALESCE($6, bank_id),
           is_active = COALESCE($7, is_active)
       WHERE id = $8
       RETURNING *;`,
      [name, email, role, role_type, department, bank_id, is_active, id]
    );

    if (result.rows.length === 0) return res.status(404).json({ error: 'User not found' });

    await query(
      `INSERT INTO change_logs (entity_type, entity_id, user_name, action, section_name, details)
       VALUES ('user', $1, $2, 'CONFIGURED', $3, $4);`,
      [id, updated_by, result.rows[0].department, `User ${result.rows[0].name} updated: role=${result.rows[0].role}`]
    );

    res.json(result.rows[0]);
  } catch (err) {
    next(err);
  }
}

/**
 * DELETE /api/users/:id
 * Soft deletes or deactivates user.
 */
async function deleteUser(req, res, next) {
  try {
    const { id } = req.params;
    const { deleted_by = 'Admin' } = req.query;

    const result = await query(
      `UPDATE users SET is_active = FALSE WHERE id = $1 RETURNING *;`,
      [id]
    );

    if (result.rows.length === 0) return res.status(404).json({ error: 'User not found' });

    await query(
      `INSERT INTO change_logs (entity_type, entity_id, user_name, action, section_name, details)
       VALUES ('user', $1, $2, 'ARCHIVED', $3, $4);`,
      [id, deleted_by, result.rows[0].department, `User ${result.rows[0].name} deactivated`]
    );

    res.json({ success: true, message: `User ${result.rows[0].name} deactivated successfully`, user: result.rows[0] });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  getUsers,
  getUserById,
  createUser,
  updateUser,
  deleteUser
};


const pool = require('../config/db');
const rbacModel = require('./rbac.model');
const bcrypt = require('bcrypt');

const BCRYPT_ROUNDS = Number(process.env.BCRYPT_ROUNDS || 12);

const createUser = async ({ name, email, password }) => {
    const query = `
        INSERT INTO users (name, email, password)
        VALUES ($1, $2, $3)
        RETURNING id, name, email, is_active, created_at
    `;
    const result = await pool.query(query, [
        name,
        email,
        password
    ]);
    return result.rows[0];
};

const findByEmail = async (email) => {
    const query = `SELECT * FROM users WHERE LOWER(email) = LOWER($1)`;
    const result = await pool.query(query, [email]);
    return result.rows[0];
};

const findById = async (id) => {
    const query = `
        SELECT id, name, email, is_active, created_at, updated_at
        FROM users
        WHERE id = $1
    `;
    const result = await pool.query(query, [id]);
    return result.rows[0];
};

/**
 * Fetch a user with full dynamic RBAC profile: roles, permissions, and flags
 */
const findUserWithRolesAndPermissions = async (id) => {
    const user = await findById(id);
    if (!user) return null;
    const roles = await rbacModel.getUserRoles(id);
    const { permissions, permissionStrings } = await rbacModel.getUserPermissions(id);
    const isSuperAdmin = roles.some(r => r.role_name.toLowerCase() === 'super admin' || r.role_name.toLowerCase() === 'super_admin');

    return {
        ...user,
        roles,
        role: roles[0]?.role_name,
        permissions,
        permissionStrings,
        isSuperAdmin
    };
};

const updateProfile = async (id, name) => {
    const query = `
        UPDATE users
        SET name = $1,
            updated_at = NOW()
        WHERE id = $2
        RETURNING id, name, email, is_active, created_at, updated_at
    `;
    const result = await pool.query(query, [name, id]);
    return result.rows[0];
};

const updatePassword = async (id, password) => {
    const hashedPassword = await bcrypt.hash(password.trim(), BCRYPT_ROUNDS);
    const query = `
        UPDATE users
        SET password = $1,
            updated_at = NOW()
        WHERE id = $2
    `;
    await pool.query(query, [hashedPassword, id]);
};

// Fetch list of users with their assigned roles for admin user management
const fetchUsersWithRoles = async ({ limit = 50, offset = 0 } = {}) => {
    const query = `
        SELECT 
            u.id, 
            u.name, 
            u.email, 
            u.is_active, 
            u.created_at,
            u.updated_at,
            COALESCE(
                json_agg(
                    json_build_object(
                        'id', r.id, 
                        'role_name', r.role_name,
                        'description', r.description
                    )
                ) FILTER (WHERE r.id IS NOT NULL),
                '[]'
            ) AS roles
        FROM users u
        LEFT JOIN user_roles ur ON ur.user_id = u.id
        LEFT JOIN roles r ON r.id = ur.role_id AND r.is_active = TRUE
        GROUP BY u.id
        ORDER BY u.created_at DESC
        LIMIT $1 OFFSET $2;
    `;
    const result = await pool.query(query, [limit, offset]);
    return result.rows;
};

// Fetch a single user by ID with their assigned roles
const getUserWithRoles = async (id) => {
    const query = `
        SELECT 
            u.id, 
            u.name, 
            u.email, 
            u.is_active, 
            u.created_at,
            u.updated_at,
            COALESCE(
                json_agg(
                    json_build_object(
                        'id', r.id, 
                        'role_name', r.role_name,
                        'description', r.description
                    )
                ) FILTER (WHERE r.id IS NOT NULL),
                '[]'
            ) AS roles
        FROM users u
        LEFT JOIN user_roles ur ON ur.user_id = u.id
        LEFT JOIN roles r ON r.id = ur.role_id AND r.is_active = TRUE
        WHERE u.id = $1
        GROUP BY u.id
    `;
    const result = await pool.query(query, [id]);
    return result.rows[0] || null;
};

// Create user from admin panel with assigned roles
const createAdminUser = async ({ name, email, password, is_active = true, roleIds = [] }) => {
    const hashedPassword = await bcrypt.hash(password, BCRYPT_ROUNDS);

    const query = `
        INSERT INTO users (name, email, password, is_active)
        VALUES ($1, $2, $3, $4)
        RETURNING id, name, email, is_active, created_at, updated_at
    `;
    const result = await pool.query(query, [name, email, hashedPassword, is_active]);
    const user = result.rows[0];

    // Assign roles if provided
    if (Array.isArray(roleIds) && roleIds.length > 0) {
        await rbacModel.assignRolesToUser(user.id, roleIds);
    }

    // Default user settings
    await pool.query(
        `INSERT INTO user_settings (user_id, theme, button_color)
         VALUES ($1, 'system', '#075bb9')
         ON CONFLICT (user_id) DO NOTHING`,
        [user.id]
    );

    return await getUserWithRoles(user.id);
};

// Update user details and roles from admin panel
const updateAdminUser = async (id, { name, email, password, is_active, roleIds }) => {
    const updates = [];
    const values = [];
    let paramIndex = 1;

    if (name !== undefined) {
        updates.push(`name = $${paramIndex++}`);
        values.push(name);
    }
    if (email !== undefined) {
        updates.push(`email = $${paramIndex++}`);
        values.push(email);
    }
    if (is_active !== undefined) {
        updates.push(`is_active = $${paramIndex++}`);
        values.push(is_active);
    }
    if (password && password.trim()) {
        const hashedPassword = await bcrypt.hash(password.trim(), BCRYPT_ROUNDS);
        updates.push(`password = $${paramIndex++}`);
        values.push(hashedPassword);
    }

    updates.push(`updated_at = NOW()`);

    if (values.length > 0) {
        values.push(id);
        const query = `
            UPDATE users
            SET ${updates.join(', ')}
            WHERE id = $${paramIndex}
        `;
        await pool.query(query, values);
    }

    if (Array.isArray(roleIds)) {
        await rbacModel.assignRolesToUser(id, roleIds);
    }

    return await getUserWithRoles(id);
};

// Delete user
const deleteUser = async (id) => {
    const query = `DELETE FROM users WHERE id = $1 RETURNING id, name, email`;
    const result = await pool.query(query, [id]);
    return result.rows[0] || null;
};

const assignUserRoles = async (userId, roleIds) => {
    return await rbacModel.assignRolesToUser(userId, roleIds);
};


// For Forgot Password & OTP
const checkuserEmailavailable = async (emailId) => {
    return await findByEmail(emailId);
};

const savePasswordResetOtp = async (userId, otp) => {
    // Expire in 5 minutes
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000);
    // Invalidate existing unused tokens for this user
    await pool.query(
        `UPDATE password_reset_tokens SET used = TRUE WHERE user_id = $1 AND used = FALSE`,
        [userId]
    );
    const query = `
        INSERT INTO password_reset_tokens (user_id, otp, expires_at)
        VALUES ($1, $2, $3)
        RETURNING *
    `;
    const result = await pool.query(query, [userId, otp, expiresAt]);
    return result.rows[0];
};

const getLatestPasswordResetOtp = async (userId) => {
    const query = `SELECT * FROM password_reset_tokens WHERE user_id = $1 ORDER BY created_at DESC LIMIT 1`;
    const result = await pool.query(query, [userId]);
    return result.rows[0];
};

const verifyPasswordResetOtp = async (userId, otp) => {
    const query = `
        SELECT * FROM password_reset_tokens
        WHERE user_id = $1 AND otp = $2 AND used = FALSE AND expires_at > NOW()
        ORDER BY created_at DESC
        LIMIT 1
    `;
    const result = await pool.query(query, [userId, otp]);
    return result.rows[0];
};

const markOtpAsUsed = async (tokenId) => {
    const query = `UPDATE password_reset_tokens SET used = TRUE WHERE id = $1`;
    await pool.query(query, [tokenId]);
};

module.exports = {
    createUser,
    findByEmail,
    findById,
    findUserWithRolesAndPermissions,
    updateProfile,
    updatePassword,
    fetchUsersWithRoles,
    getUserWithRoles,
    createAdminUser,
    updateAdminUser,
    deleteUser,
    assignUserRoles,

    checkuserEmailavailable,
    savePasswordResetOtp,
    verifyPasswordResetOtp,
    markOtpAsUsed,
    getLatestPasswordResetOtp
};

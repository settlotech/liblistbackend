const pool = require('../config/db');
const crypto = require('crypto');

 
const findUserByEmail = async (email) => {
    const { rows } = await pool.query(
        `SELECT
            u.id,
            u.name,
            u.email,
            u.password,
            u.is_active,
            u.token_version,
            COALESCE(
                JSON_AGG(r.role_name) FILTER (WHERE r.role_name IS NOT NULL),
                '[]'
            ) AS roles
         FROM users u
         LEFT JOIN user_roles ur ON ur.user_id = u.id
         LEFT JOIN roles r       ON r.id = ur.role_id AND r.is_active = TRUE
         WHERE u.email = $1
         GROUP BY u.id`,
        [email.toLowerCase().trim()]
    );
    return rows[0] || null;
};

 
const findUserById = async (id) => {
    const { rows } = await pool.query(
        `SELECT
            u.id,
            u.name,
            u.email,
            u.is_active,
            u.token_version,
            u.created_at,
            u.updated_at,
            COALESCE(
                JSON_AGG(r.role_name) FILTER (WHERE r.role_name IS NOT NULL),
                '[]'
            ) AS roles,
            us.theme,
            us.button_color
         FROM users u
         LEFT JOIN user_roles ur      ON ur.user_id = u.id
         LEFT JOIN roles r            ON r.id = ur.role_id AND r.is_active = TRUE
         LEFT JOIN user_settings us   ON us.user_id = u.id
         WHERE u.id = $1
         GROUP BY u.id, us.theme, us.button_color`,
        [id]
    );
    return rows[0] || null;
};

 
const saveRefreshToken = async (userId, tokenHash, familyId, expiresAt) => {
    await pool.query(
        `INSERT INTO refresh_tokens (user_id, token_hash, family_id, expires_at)
         VALUES ($1, $2, $3, $4)`,
        [userId, tokenHash, familyId, expiresAt]
    );
};

 
const findRefreshToken = async (tokenHash) => {
    const { rows } = await pool.query(
        `SELECT * FROM refresh_tokens WHERE token_hash = $1`,
        [tokenHash]
    );
    return rows[0] || null;
};

/**
 * Revoke a single refresh token (by hash).
 */
const revokeRefreshToken = async (tokenHash, replacedByHash = null) => {
    await pool.query(
        `UPDATE refresh_tokens
         SET revoked_at = NOW(), replaced_by_hash = $2
         WHERE token_hash = $1`,
        [tokenHash, replacedByHash]
    );
};

 
const revokeTokenFamily = async (familyId) => {
    await pool.query(
        `UPDATE refresh_tokens
         SET revoked_at = NOW()
         WHERE family_id = $1 AND revoked_at IS NULL`,
        [familyId]
    );
};

 
const revokeAllUserTokens = async (userId) => {
    await pool.query(
        `UPDATE refresh_tokens
         SET revoked_at = NOW()
         WHERE user_id = $1 AND revoked_at IS NULL`,
        [userId]
    );
};

 
const bumpTokenVersion = async (userId) => {
    await pool.query(
        `UPDATE users SET token_version = token_version + 1, updated_at = NOW()
         WHERE id = $1`,
        [userId]
    );
};

// ─── OTP / PASSWORD RESET QUERIES ────────────────────────────────────────────

 
const saveOtp = async (userId, otp, expiresAt) => {
    // Invalidate previous OTPs for the same user first
    await pool.query(
        `UPDATE password_reset_tokens SET used = TRUE WHERE user_id = $1 AND used = FALSE`,
        [userId]
    );
    await pool.query(
        `INSERT INTO password_reset_tokens (user_id, otp, expires_at)
         VALUES ($1, $2, $3)`,
        [userId, otp, expiresAt]
    );
};

/**
 * Find a valid (unused, unexpired) OTP for a user.
 */
const findValidOtp = async (userId, otp) => {
    const { rows } = await pool.query(
        `SELECT * FROM password_reset_tokens
         WHERE user_id = $1
           AND otp = $2
           AND used = FALSE
           AND expires_at > NOW()
         ORDER BY created_at DESC
         LIMIT 1`,
        [userId, otp]
    );
    return rows[0] || null;
};

/**
 * Mark an OTP as used.
 */
const markOtpUsed = async (otpId) => {
    await pool.query(
        `UPDATE password_reset_tokens SET used = TRUE WHERE id = $1`,
        [otpId]
    );
};

/**
 * Update a user's password.
 */
const updateUserPassword = async (userId, hashedPassword) => {
    await pool.query(
        `UPDATE users
         SET password = $2, updated_at = NOW()
         WHERE id = $1`,
        [userId, hashedPassword]
    );
};

module.exports = {
    findUserByEmail,
    findUserById,
    saveRefreshToken,
    findRefreshToken,
    revokeRefreshToken,
    revokeTokenFamily,
    revokeAllUserTokens,
    bumpTokenVersion,
    saveOtp,
    findValidOtp,
    markOtpUsed,
    updateUserPassword,
};

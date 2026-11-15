const pool = require('../config/db');
const bcrypt = require('bcrypt');
const BCRYPT_ROUNDS = Number(process.env.BCRYPT_ROUNDS || 12);
const OTP_EXPIRY_MINUTES = 10;

 
const createOrReplaceRequest = async ({ user_email, user_name, otp }) => { 
    await pool.query(
        `UPDATE user_request
         SET is_used = TRUE, updated_at = NOW()
         WHERE LOWER(user_email) = LOWER($1)
           AND is_used = FALSE
           AND is_email_verified = FALSE`,
        [user_email]
    );

    const otp_hash = await bcrypt.hash(String(otp), BCRYPT_ROUNDS);
    const expires_at = new Date(Date.now() + OTP_EXPIRY_MINUTES * 60 * 1000);
    const result = await pool.query(
        `INSERT INTO user_request (user_email, user_name, otp_hash, expires_at)
         VALUES ($1, $2, $3, $4)
         RETURNING id, user_email, user_name, expires_at, created_at`,
        [user_email.toLowerCase().trim(), user_name || null, otp_hash, expires_at]
    );
    return result.rows[0];
};

 
const findActiveRequest = async (user_email) => {
    const result = await pool.query(
        `SELECT * FROM user_request
         WHERE LOWER(user_email) = LOWER($1)
           AND is_used = FALSE
           AND is_email_verified = FALSE
         ORDER BY created_at DESC
         LIMIT 1`,
        [user_email]
    );
    return result.rows[0] || null;
};
 
const verifyOtp = async (user_email, otp) => {
    const request = await findActiveRequest(user_email);
    if (!request) return null;

    // Check expiry
    if (new Date() > new Date(request.expires_at)) return null;

    // Compare hash
    const match = await bcrypt.compare(String(otp), request.otp_hash);
    if (!match) return null;

    return request;
};
 
const markEmailVerified = async (requestId) => {
    const result = await pool.query(
        `UPDATE user_request
         SET is_email_verified = TRUE,
             otp_hash = NULL,
             expires_at = NULL,
             updated_at = NOW()
         WHERE id = $1
         RETURNING id, user_email, user_name, status, created_at`,
        [requestId]
    );
    return result.rows[0];
};

 
const findVerifiedPendingRequest = async (user_email) => {
    const result = await pool.query(
        `SELECT id, user_email, user_name, status, created_at
         FROM user_request
         WHERE LOWER(user_email) = LOWER($1)
           AND is_email_verified = TRUE
           AND status = 'pending'
           AND is_used = FALSE
         ORDER BY created_at DESC
         LIMIT 1`,
        [user_email]
    );
    return result.rows[0] || null;
};

 
const getAllRequests = async ({ status } = {}) => {
    const params = [];
    let where = '';
    if (status) {
        params.push(status);
        where = `WHERE ur.status = $1`;
    }
    const result = await pool.query(
        `SELECT ur.*, u.name AS reviewed_by_name
         FROM user_request ur
         LEFT JOIN users u ON u.id = ur.reviewed_by
         ${where}
         ORDER BY ur.created_at DESC`,
        params
    );
    return result.rows;
};

 
const updateRequestStatus = async (requestId, { status, reviewed_by, rejection_reason }) => {
    const result = await pool.query(
        `UPDATE user_request
         SET status = $1,
             reviewed_by = $2,
             reviewed_at = NOW(),
             rejection_reason = $3,
             is_used = TRUE,
             updated_at = NOW()
         WHERE id = $4
         RETURNING *`,
        [status, reviewed_by, rejection_reason || null, requestId]
    );
    return result.rows[0];
};

 
const findById = async (id) => {
    const result = await pool.query(
        `SELECT * FROM user_request WHERE id = $1`,
        [id]
    );
    return result.rows[0] || null;
};

module.exports = {
    createOrReplaceRequest,
    findActiveRequest,
    verifyOtp,
    markEmailVerified,
    findVerifiedPendingRequest,
    getAllRequests,
    updateRequestStatus,
    findById,
};

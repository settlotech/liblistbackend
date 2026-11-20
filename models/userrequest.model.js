const pool = require('../config/db');
const bcrypt = require('bcryptjs');
const BCRYPT_ROUNDS = Number(process.env.BCRYPT_ROUNDS || 12);
const OTP_EXPIRY_MINUTES = 10;

 
const createOrReplaceRequest = async ({ user_email, user_name, otp }) => {
    const normalizedEmail = user_email.toLowerCase().trim();
    const otp_hash = await bcrypt.hash(String(otp), BCRYPT_ROUNDS);
    const expires_at = new Date(Date.now() + OTP_EXPIRY_MINUTES * 60 * 1000);
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        // Serialize OTP creation per normalized email to prevent parallel requests from inserting duplicates.
        await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [normalizedEmail]);
        const active = await client.query(
            `SELECT id, user_email, user_name, is_email_verified, status
             FROM user_request
             WHERE LOWER(BTRIM(user_email))=$1 AND is_used=FALSE
             ORDER BY created_at DESC LIMIT 1 FOR UPDATE`,
            [normalizedEmail]
        );

        if (active.rows[0]?.is_email_verified && active.rows[0]?.status === 'pending') {
            await client.query('COMMIT');
            return { ...active.rows[0], alreadyPending: true };
        }

        let result;
        if (active.rows[0]) {
            result = await client.query(
                `UPDATE user_request
                 SET user_email=$1, user_name=$2, otp_hash=$3, expires_at=$4,
                     is_email_verified=FALSE, status='pending', is_used=FALSE,
                     rejection_reason=NULL, updated_at=NOW()
                 WHERE id=$5
                 RETURNING id, user_email, user_name, expires_at, created_at`,
                [normalizedEmail, user_name || null, otp_hash, expires_at, active.rows[0].id]
            );
        } else {
            result = await client.query(
                `INSERT INTO user_request (user_email, user_name, otp_hash, expires_at)
                 VALUES ($1, $2, $3, $4)
                 RETURNING id, user_email, user_name, expires_at, created_at`,
                [normalizedEmail, user_name || null, otp_hash, expires_at]
            );
        }
        await client.query('COMMIT');
        return result.rows[0];
    } catch (error) {
        await client.query('ROLLBACK');
        throw error;
    } finally {
        client.release();
    }
};

 
const findActiveRequest = async (user_email) => {
    const result = await pool.query(
        `SELECT * FROM user_request
         WHERE LOWER(BTRIM(user_email)) = LOWER(BTRIM($1))
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
           AND is_email_verified=FALSE AND is_used=FALSE
         RETURNING id, user_email, user_name, status, created_at`,
        [requestId]
    );
    return result.rows[0];
};

 
const findVerifiedPendingRequest = async (user_email) => {
    const result = await pool.query(
        `SELECT id, user_email, user_name, status, created_at
         FROM user_request
         WHERE LOWER(BTRIM(user_email)) = LOWER(BTRIM($1))
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
    const conditions = [
        'ur.is_email_verified=TRUE',
        "(ur.status <> 'pending' OR ur.is_used=FALSE)",
    ];
    if (status) {
        params.push(status);
        conditions.push(`ur.status = $${params.length}`);
    }
    const result = await pool.query(
        `SELECT ur.*, u.name AS reviewed_by_name
         FROM user_request ur
         LEFT JOIN users u ON u.id = ur.reviewed_by
         WHERE ${conditions.join(' AND ')}
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
         WHERE id = $4 AND status='pending' AND is_email_verified=TRUE AND is_used=FALSE
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

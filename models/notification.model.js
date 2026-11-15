const pool = require('../config/db');

 
const saveFcmToken = async (userId, fcmToken, deviceInfo = '') => {
    const query = `
        INSERT INTO user_fcm_tokens (user_id, fcm_token, device_info, updated_at)
        VALUES ($1, $2, $3, NOW())
        ON CONFLICT (user_id, fcm_token)
        DO UPDATE SET device_info = EXCLUDED.device_info, updated_at = NOW()
        RETURNING id, user_id, fcm_token, device_info, created_at, updated_at;
    `;
    const result = await pool.query(query, [userId, fcmToken, deviceInfo]);
    return result.rows[0];
};

 
const removeFcmToken = async (userId, fcmToken) => {
    const query = `
        DELETE FROM user_fcm_tokens
        WHERE user_id = $1 AND fcm_token = $2
        RETURNING id;
    `;
    const result = await pool.query(query, [userId, fcmToken]);
    return result.rowCount > 0;
};

 
const removeInvalidTokens = async (tokens) => {
    if (!Array.isArray(tokens) || tokens.length === 0) return 0;
    const query = `
        DELETE FROM user_fcm_tokens
        WHERE fcm_token = ANY($1::text[])
        RETURNING id;
    `;
    const result = await pool.query(query, [tokens]);
    return result.rowCount;
};

 
const getUserFcmTokens = async (userId) => {
    const query = `
        SELECT fcm_token
        FROM user_fcm_tokens
        WHERE user_id = $1
        ORDER BY updated_at DESC;
    `;
    const result = await pool.query(query, [userId]);
    return result.rows.map((r) => r.fcm_token);
};

//* Fetch all active FCM tokens for multiple users
 
const getUsersFcmTokens = async (userIds) => {
    if (!Array.isArray(userIds) || userIds.length === 0) return [];
    const query = `
        SELECT user_id, fcm_token
        FROM user_fcm_tokens
        WHERE user_id = ANY($1::uuid[])
        ORDER BY updated_at DESC;
    `;
    const result = await pool.query(query, [userIds]);
    return result.rows;
};

/**
 * Create a new in-app notification record
 */
const createNotification = async ({ userId, title, body, data = {} }) => {
    const query = `
        INSERT INTO notifications (user_id, title, body, data)
        VALUES ($1, $2, $3, $4)
        RETURNING id, user_id, title, body, data, is_read, created_at;
    `;
    const result = await pool.query(query, [userId, title, body, JSON.stringify(data)]);
    return result.rows[0];
};

 
const getUserNotifications = async (userId, { limit = 30, offset = 0, unreadOnly = false } = {}) => {
    let whereClause = `WHERE user_id = $1`;
    const params = [userId, limit, offset];

    if (unreadOnly) {
        whereClause += ` AND is_read = FALSE`;
    }

    const query = `
        SELECT id, user_id, title, body, data, is_read, created_at
        FROM notifications
        ${whereClause}
        ORDER BY created_at DESC
        LIMIT $2 OFFSET $3;
    `;
    const result = await pool.query(query, params);
    return result.rows;
};

 
const getUnreadCount = async (userId) => {
    const query = `
        SELECT COUNT(*)::int AS count
        FROM notifications
        WHERE user_id = $1 AND is_read = FALSE;
    `;
    const result = await pool.query(query, [userId]);
    return result.rows[0]?.count || 0;
};

 
const markAsRead = async (notificationId, userId) => {
    const query = `
        UPDATE notifications
        SET is_read = TRUE
        WHERE id = $1 AND user_id = $2
        RETURNING id, is_read;
    `;
    const result = await pool.query(query, [notificationId, userId]);
    return result.rows[0] || null;
};

 
const markAllAsRead = async (userId) => {
    const query = `
        UPDATE notifications
        SET is_read = TRUE
        WHERE user_id = $1 AND is_read = FALSE
        RETURNING id;
    `;
    const result = await pool.query(query, [userId]);
    return result.rowCount;
};

 
const deleteNotification = async (notificationId, userId) => {
    const query = `
        DELETE FROM notifications
        WHERE id = $1 AND user_id = $2
        RETURNING id;
    `;
    const result = await pool.query(query, [notificationId, userId]);
    return result.rowCount > 0;
};

module.exports = {
    saveFcmToken,
    removeFcmToken,
    removeInvalidTokens,
    getUserFcmTokens,
    getUsersFcmTokens,
    createNotification,
    getUserNotifications,
    getUnreadCount,
    markAsRead,
    markAllAsRead,
    deleteNotification,
};

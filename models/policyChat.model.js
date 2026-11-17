const pool = require('../config/db');

const policyChatModel = {
    async taskBelongsToPolicy(documentId, taskId) {
        const result = await pool.query(
            'SELECT 1 FROM tasks WHERE id = $1 AND library_id = $2',
            [taskId, documentId]
        );
        return result.rowCount > 0;
    },

    async getMessages(documentId) {
        const result = await pool.query(
            `SELECT m.id, m.document_id, m.message_type, m.content, m.task_id,
                    m.created_at, m.sender_id, u.name AS sender_name,
                    t.task_seq, t.title AS task_title, t.assigned_to,
                    assignee.name AS assigned_name
             FROM policy_chat_messages m
             LEFT JOIN users u ON u.id = m.sender_id
             LEFT JOIN tasks t ON t.id = m.task_id
             LEFT JOIN users assignee ON assignee.id = t.assigned_to
             WHERE m.document_id = $1
             ORDER BY m.created_at ASC, m.id ASC`,
            [documentId]
        );
        return result.rows;
    },

    async getPolicyTasks(documentId) {
        const result = await pool.query(
            `SELECT t.id, t.task_seq, t.title, t.status, t.category, t.created_at,
                    t.assigned_to, u.name AS assigned_name
             FROM tasks t
             LEFT JOIN users u ON u.id = t.assigned_to
             WHERE t.library_id = $1
             ORDER BY t.created_at DESC, t.id DESC`,
            [documentId]
        );
        return result.rows;
    },

    async createMessage({ documentId, senderId, messageType, content, taskId = null }) {
        const result = await pool.query(
            `INSERT INTO policy_chat_messages (document_id, sender_id, message_type, content, task_id)
             VALUES ($1, $2, $3, $4, $5)
             RETURNING id, document_id, sender_id, message_type, content, task_id, created_at`,
            [documentId, senderId, messageType, content, taskId]
        );
        return result.rows[0];
    }
};

module.exports = policyChatModel;

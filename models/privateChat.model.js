const pool = require('../config/db');

const privateChatModel = {
    async isActiveUser(userId) {
        const result = await pool.query('SELECT 1 FROM users WHERE id = $1 AND is_active = TRUE', [userId]);
        return result.rowCount > 0;
    },

    async ensureAiChat(userId) {
        const result = await pool.query(
            `INSERT INTO private_chats (is_ai, owner_user_id)
             VALUES (TRUE, $1)
             ON CONFLICT (owner_user_id) WHERE is_ai = TRUE
             DO UPDATE SET owner_user_id = EXCLUDED.owner_user_id
             RETURNING id`,
            [userId]
        );
        return result.rows[0].id;
    },

    async getOrCreateDirectChat(userId, otherUserId) {
        const [lowId, highId] = [String(userId), String(otherUserId)].sort((a, b) => a.localeCompare(b));
        const result = await pool.query(
            `INSERT INTO private_chats (is_ai, user_low_id, user_high_id)
             VALUES (FALSE, $1, $2)
             ON CONFLICT (user_low_id, user_high_id) WHERE is_ai = FALSE
             DO UPDATE SET user_low_id = EXCLUDED.user_low_id
             RETURNING id`,
            [lowId, highId]
        );
        return result.rows[0].id;
    },

    async getChats(userId) {
        const aiChatId = await this.ensureAiChat(userId);
        const [aiResult, directResult] = await Promise.all([
            pool.query(
                `SELECT $1::bigint AS id, TRUE AS is_ai, NULL::uuid AS contact_id,
                        'Shidney'::text AS contact_name, latest.content AS last_message,
                        latest.created_at AS last_message_at
                 FROM (SELECT 1) seed
                 LEFT JOIN LATERAL (
                    SELECT content, created_at FROM private_chat_messages
                    WHERE chat_id = $1 ORDER BY created_at DESC, id DESC LIMIT 1
                 ) latest ON TRUE`,
                [aiChatId]
            ),
            pool.query(
                `SELECT c.id, FALSE AS is_ai,
                        CASE WHEN c.user_low_id = $1 THEN c.user_high_id ELSE c.user_low_id END AS contact_id,
                        u.name AS contact_name, latest.content AS last_message,
                        latest.created_at AS last_message_at
                 FROM private_chats c
                 JOIN users u ON u.id = CASE WHEN c.user_low_id = $1 THEN c.user_high_id ELSE c.user_low_id END
                 LEFT JOIN LATERAL (
                    SELECT content, created_at FROM private_chat_messages
                    WHERE chat_id = c.id ORDER BY created_at DESC, id DESC LIMIT 1
                 ) latest ON TRUE
                 WHERE c.is_ai = FALSE AND (c.user_low_id = $1 OR c.user_high_id = $1)
                 ORDER BY COALESCE(latest.created_at, c.updated_at) DESC`,
                [userId]
            )
        ]);
        return [...aiResult.rows, ...directResult.rows];
    },

    async getMessages(chatId) {
        const result = await pool.query(
            `SELECT m.id, m.chat_id, m.sender_id, m.message_type, m.content, m.created_at,
                    u.name AS sender_name
             FROM private_chat_messages m
             LEFT JOIN users u ON u.id = m.sender_id
             WHERE m.chat_id = $1
             ORDER BY m.created_at ASC, m.id ASC`,
            [chatId]
        );
        return result.rows;
    },

    async saveMessage({ chatId, senderId = null, messageType = 'user', content }, client = pool) {
        const result = await client.query(
            `INSERT INTO private_chat_messages (chat_id, sender_id, message_type, content)
             VALUES ($1, $2, $3, $4)
             RETURNING id, chat_id, sender_id, message_type, content, created_at`,
            [chatId, senderId, messageType, content]
        );
        await client.query('UPDATE private_chats SET updated_at = NOW() WHERE id = $1', [chatId]);
        return result.rows[0];
    }
};

module.exports = privateChatModel;

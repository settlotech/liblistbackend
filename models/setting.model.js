const pool = require('../config/db');

const DEFAULT_THEME = 'system';
const DEFAULT_BUTTON_COLOR = '#075bb9';

const getUserSettings = async (userId) => {
    const selectQuery = `
        SELECT theme, button_color, updated_at
        FROM user_settings
        WHERE user_id = $1;
    `;
    const result = await pool.query(selectQuery, [userId]);

    if (result.rows.length > 0) {
        return result.rows[0];
    }

    // Insert default settings row if none exists yet
    const insertQuery = `
        INSERT INTO user_settings (user_id, theme, button_color)
        VALUES ($1, $2, $3)
        ON CONFLICT (user_id) DO UPDATE 
        SET updated_at = NOW()
        RETURNING theme, button_color, updated_at;
    `;
    const insertResult = await pool.query(insertQuery, [userId, DEFAULT_THEME, DEFAULT_BUTTON_COLOR]);
    return insertResult.rows[0];
};

const updateUserSettings = async (userId, { theme, button_color }) => {
    // Upsert user settings
    const query = `
        INSERT INTO user_settings (user_id, theme, button_color, updated_at)
        VALUES ($1, COALESCE($2, 'system'), COALESCE($3, '#075bb9'), NOW())
        ON CONFLICT (user_id) DO UPDATE
        SET 
            theme = COALESCE($2, user_settings.theme),
            button_color = COALESCE($3, user_settings.button_color),
            updated_at = NOW()
        RETURNING theme, button_color, updated_at;
    `;
    const result = await pool.query(query, [userId, theme, button_color]);
    return result.rows[0];
};

module.exports = {
    getUserSettings,
    updateUserSettings,
    DEFAULT_THEME,
    DEFAULT_BUTTON_COLOR
};

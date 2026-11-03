const settingModel = require('../models/setting.model');

const VALID_THEMES = ['light', 'dark', 'system'];
const HEX_COLOR_REGEX = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

const getSettings = async (req, res, next) => {
    try {
        const userId = req.user.id;
        const settings = await settingModel.getUserSettings(userId);

        return res.status(200).json({
            success: true,
            data: settings
        });
    } catch (error) {
        next(error);
    }
};

const updateSettings = async (req, res, next) => {
    try {
        const userId = req.user.id;
        const { theme, button_color } = req.body;

        if (theme !== undefined && !VALID_THEMES.includes(theme.toLowerCase())) {
            return res.status(400).json({
                success: false,
                message: `Invalid theme. Must be one of: ${VALID_THEMES.join(', ')}`
            });
        }

        if (button_color !== undefined && !HEX_COLOR_REGEX.test(button_color)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid button color. Must be a valid hex color code (e.g. #075bb9 or #2563eb)'
            });
        }

        const updated = await settingModel.updateUserSettings(userId, {
            theme: theme ? theme.toLowerCase() : undefined,
            button_color
        });

        return res.status(200).json({
            success: true,
            message: 'Settings updated successfully',
            data: updated
        });
    } catch (error) {
        next(error);
    }
};

module.exports = {
    getSettings,
    updateSettings
};

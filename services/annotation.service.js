const AppError = require('../utils/appError');

/**
 * Validate and normalize annotation anchor data
 * @param {'TEXT' | 'IMAGE'} type
 * @param {object} anchorData
 * @returns {object} Normalized anchor data
 */
const validateAnchorData = (type, anchorData) => {
    if (!anchorData || typeof anchorData !== 'object') {
        throw new AppError('Anchor data must be a valid JSON object.', 400);
    }

    if (type === 'IMAGE') {
        const { x, y, width, height, shape } = anchorData;

        if (typeof x !== 'number' || typeof y !== 'number') {
            throw new AppError('Image annotation anchorData must contain numeric x and y coordinates.', 400);
        }

        if (x < 0 || x > 100 || y < 0 || y > 100) {
            throw new AppError('Image coordinates x and y must be normalized percentages between 0 and 100.', 400);
        }

        return {
            x: Number(x.toFixed(2)),
            y: Number(y.toFixed(2)),
            width: width !== undefined ? Number(Math.max(0, Math.min(100, width)).toFixed(2)) : undefined,
            height: height !== undefined ? Number(Math.max(0, Math.min(100, height)).toFixed(2)) : undefined,
            shape: shape || 'PIN',
        };
    }

    if (type === 'TEXT') {
        const { blockId, startOffset, endOffset, selectedText, contextPrefix, contextSuffix } = anchorData;

        return {
            blockId: blockId || null,
            startOffset: typeof startOffset === 'number' ? Math.max(0, startOffset) : 0,
            endOffset: typeof endOffset === 'number' ? Math.max(0, endOffset) : 0,
            selectedText: typeof selectedText === 'string' ? selectedText.slice(0, 1000) : '',
            contextPrefix: typeof contextPrefix === 'string' ? contextPrefix.slice(0, 100) : '',
            contextSuffix: typeof contextSuffix === 'string' ? contextSuffix.slice(0, 100) : '',
        };
    }

    return anchorData;
};

module.exports = {
    validateAnchorData,
};

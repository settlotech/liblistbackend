/**
 * Standardized API response helpers for LibList Document Management System
 */

const sendSuccess = (res, message, data = null, statusCode = 200, pagination = null) => {
    return res.status(statusCode).json({
        success: true,
        message,
        data,
        pagination,
    });
};

const sendError = (res, message, statusCode = 500, details = null) => {
    return res.status(statusCode).json({
        success: false,
        message,
        data: {
            details,
        },
    });
};

module.exports = {
    sendSuccess,
    sendError,
};

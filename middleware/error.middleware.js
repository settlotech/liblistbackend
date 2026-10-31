const AppError = require('../utils/appError');

const notFound = (req, res, next) => {
    next(new AppError('API endpoint not found', 404)); 
};

const errorHandler = (error, req, res, next) => { 
    let statusCode = error.statusCode || 500; 
    let message = error.message || 'Internal server error';
    if (error.code === '23505') {
        statusCode = 409;
        message = 'Resource already exists';
    }

    if (error.code === '23503') {
        statusCode = 400;
        message = 'Invalid related resource';
    }

    if (error.code === '23502') {
        statusCode = 400;
        message = 'Required database field is missing';
    }

    if (statusCode >= 500) {
        console.error(error);
        message = 'Internal server error';
    }

    res.status(statusCode).json({
        success: false,
        message,
        ...(process.env.NODE_ENV === 'development' &&
            statusCode >= 500
            ? { error: error.message }
            : {})
    });

};

module.exports = {
    notFound,
    errorHandler
};
const rateLimit = require('express-rate-limit');

const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 10,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    message: {
        success: false,
        message: 'Too many login attempts. Please try again later. after 15 minutes'
    }
});

const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, 
    limit: 30, 
    standardHeaders: 'draft-8',
    legacyHeaders: false, 
    message: {
        success: false,
        message: 'Too many requests. Please try again later.'
    }
});

module.exports = {
    loginLimiter,
    authLimiter
};
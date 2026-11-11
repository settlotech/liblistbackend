/**
 * Wraps async controller functions to pass unhandled rejections to next()
 * @param {Function} fn - Async express route handler
 * @returns {import('express').RequestHandler}
 */
const asyncHandler = (fn) => (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
};

module.exports = asyncHandler;

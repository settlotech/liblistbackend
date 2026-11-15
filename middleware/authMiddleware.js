const { verifyAccessToken } = require('../services/tokenService');

/**
 * Middleware: Authenticate access token from Authorization header.
 * Sets req.user = JWT payload on success.
 */
const authenticate = (req, res, next) => {
    const authHeader = req.headers['authorization'];

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({
            success: false,
            message: 'Access token is missing or malformed.',
        });
    }

    const token = authHeader.split(' ')[1];

    try {
        const decoded = verifyAccessToken(token);
        req.user = decoded;
        next();
    } catch (err) {
        const message =
            err.name === 'TokenExpiredError'
                ? 'Access token has expired.'
                : 'Access token is invalid.';

        return res.status(401).json({
            success: false,
            message,
        });
    }
};

/**
 * Middleware: Authorize by role(s).
 * Usage: authorize('Super Admin') or authorize(['Super Admin', 'Admin'])
 */
const authorize = (...allowedRoles) => {
    const roles = allowedRoles.flat();

    return (req, res, next) => {
        const userRoles = req.user?.roles || [];
        const hasRole   = roles.some((r) => userRoles.includes(r));

        if (!hasRole) {
            return res.status(403).json({
                success: false,
                message: 'You do not have permission to perform this action.',
            });
        }

        next();
    };
};

module.exports = { authenticate, authorize };

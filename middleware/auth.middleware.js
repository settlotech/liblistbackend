const User = require('../models/user.model'); 
const { verifyAccessToken } = require('../utils/jwt');
const AppError = require('../utils/appError');

const authenticate = async (req, res, next) => {
    try {
        const authHeader = req.headers.authorization; 
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            throw new AppError('Authentication required', 401);
        }

        const token = authHeader.split(' ')[1]; 
        const decoded = verifyAccessToken(token);

        // Fetch user with full dynamic roles and permissions
        const user = await User.findUserWithRolesAndPermissions(decoded.sub);
        if (!user || !user.is_active) {
            throw new AppError('User not authorized', 401);
        }

        req.user = user;
        next();
    } catch (error) {
        if (
            error.name === 'JsonWebTokenError' ||
            error.name === 'TokenExpiredError' ||
            error.name === 'NotBeforeError'
        ) {
            return next(new AppError('Invalid or expired access token', 401));
        }

        next(error);
    }
};

module.exports = authenticate;

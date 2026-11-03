const jwt = require('jsonwebtoken');
const crypto = require('crypto');

const generateAccessToken = (user) => {
    const roles = Array.isArray(user.roles)
        ? user.roles.map(r => (typeof r === 'string' ? r : r.role_name))
        : (user.role ? [user.role] : []);

    return jwt.sign(
        {
            role: roles[0] || user.role || 'User',
            roles
        },
        process.env.JWT_ACCESS_SECRET,
        {
            subject: user.id,
            expiresIn: process.env.JWT_ACCESS_EXPIRY || '15m',
            issuer: process.env.JWT_ISSUER,
            audience: process.env.JWT_AUDIENCE,
            algorithm: 'HS256'
        }
    );
};

// Generate cryptographically random refresh token
const generateRefreshToken = () => {
    return crypto.randomBytes(64).toString('hex');
};

// Store only SHA-256 hash in database
const hashRefreshToken = (token) => {
    return crypto.createHash('sha256').update(token).digest('hex');
};

const verifyAccessToken = (token) => {
    return jwt.verify(
        token,
        process.env.JWT_ACCESS_SECRET,
        {
            algorithms: ['HS256'],
            issuer: process.env.JWT_ISSUER,
            audience: process.env.JWT_AUDIENCE
        }
    );
};

module.exports = {
    generateAccessToken,
    generateRefreshToken,
    hashRefreshToken,
    verifyAccessToken
};

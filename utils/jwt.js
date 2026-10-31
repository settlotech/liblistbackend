const jwt = require('jsonwebtoken');
const crypto = require('crypto');

const JWT_SECRET = process.env.JWT_ACCESS_SECRET || process.env.JWT_SECRET || 'libtrak_jwt_super_secret_key_2026';
const JWT_ISSUER = process.env.JWT_ISSUER || 'libtrak-hub';
const JWT_AUDIENCE = process.env.JWT_AUDIENCE || 'libtrak-users';

const generateAccessToken = (user) => {
    return jwt.sign(
        { role: user.role, role_type: user.role_type || user.role, name: user.name, email: user.email },
        JWT_SECRET,
        {
            subject: String(user.id),
            expiresIn: process.env.JWT_ACCESS_EXPIRY || '1h',
            issuer: JWT_ISSUER,
            audience: JWT_AUDIENCE,
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
        JWT_SECRET,
        {
            algorithms: ['HS256'],
            issuer: JWT_ISSUER,
            audience: JWT_AUDIENCE
        }
    );
};

module.exports = {
    generateAccessToken,
    generateRefreshToken,
    hashRefreshToken,
    verifyAccessToken
};

const jwt = require('jsonwebtoken');
const crypto = require('crypto');

const generateAccessToken = (user) => {
    return jwt.sign(
        {role: user.role},
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
        token,process.env.JWT_ACCESS_SECRET,
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
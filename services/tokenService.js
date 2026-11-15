const jwt = require('jsonwebtoken');
const crypto = require('crypto');
require('dotenv').config();

const ACCESS_SECRET  = process.env.JWT_ACCESS_SECRET;
const ACCESS_EXPIRY  = process.env.JWT_ACCESS_EXPIRY  || '15m';
const ISSUER         = process.env.JWT_ISSUER         || 'api-server';
const AUDIENCE       = process.env.JWT_AUDIENCE       || 'api-users';

// ─── ACCESS TOKEN ────────────────────────────────────────────────────────────

/**
 * Generate a signed JWT access token.
 * @param {object} user  - { id, name, email, roles, token_version }
 * @returns {string}     - signed JWT
 */
const generateAccessToken = (user) => {
    return jwt.sign(
        {
            sub:           user.id,
            name:          user.name,
            email:         user.email,
            roles:         user.roles,
            tokenVersion:  user.token_version,
        },
        ACCESS_SECRET,
        {
            expiresIn: ACCESS_EXPIRY,
            issuer:    ISSUER,
            audience:  AUDIENCE,
        }
    );
};

/**
 * Verify and decode a JWT access token.
 * Throws if invalid / expired.
 */
const verifyAccessToken = (token) => {
    return jwt.verify(token, ACCESS_SECRET, {
        issuer:   ISSUER,
        audience: AUDIENCE,
    });
};

// ─── REFRESH TOKEN ────────────────────────────────────────────────────────────

/**
 * Generate a cryptographically-random opaque refresh token string.
 * @returns {string}  - hex string (64 chars → 32 bytes)
 */
const generateRefreshTokenString = () => {
    return crypto.randomBytes(40).toString('hex'); // 80 hex chars
};

/**
 * Hash a refresh-token string for safe DB storage (SHA-256).
 * @param {string} token
 * @returns {string}  - hex SHA-256 (64 chars)
 */
const hashToken = (token) => {
    return crypto.createHash('sha256').update(token).digest('hex');
};

/**
 * Compute the expiry Date for a refresh token.
 * @param {number} days
 * @returns {Date}
 */
const refreshTokenExpiry = (days) => {
    const d = new Date();
    d.setDate(d.getDate() + days);
    return d;
};

module.exports = {
    generateAccessToken,
    verifyAccessToken,
    generateRefreshTokenString,
    hashToken,
    refreshTokenExpiry,
};

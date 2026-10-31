const bcrypt = require('bcrypt');
const crypto = require('crypto');
const pool = require('../config/db');
const AppError = require('../utils/appError');
const {generateAccessToken,generateRefreshToken,hashRefreshToken} = require('../utils/jwt');

// Import Models
const User = require('../models/user.model');
const RefreshToken = require('../models/refreshToken.model');

const BCRYPT_ROUNDS = Number(process.env.BCRYPT_ROUNDS || 12); 
const REFRESH_DAYS = Number(process.env.REFRESH_TOKEN_DAYS || 7);

const publicUser = (user) => ({
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role
});

// REGISTER
const register = async ({ name, email, password }) => { 
    const existingUser = await User.findByEmail(email); 
    if (existingUser) {
        throw new AppError('Email already registered', 409);
    }
    const hashedPassword = await bcrypt.hash(password,BCRYPT_ROUNDS);

    try {
        return await User.createUser({
            name,
            email,
            password: hashedPassword
        });

    } catch (error) { 
        if (error.code === '23505') {
            throw new AppError('Email already registered', 409);
        }

        throw error;
    }
};

// CREATE SESSION
const createSession = async (user, familyId = crypto.randomUUID()) => { 
    const refreshToken = generateRefreshToken(); 
    const tokenHash = hashRefreshToken(refreshToken); 
    const expiresAt = new Date(Date.now() + REFRESH_DAYS * 24 * 60 * 60 * 1000);

    const client = await pool.connect(); 
    try {

        await client.query('BEGIN'); 
        await RefreshToken.createToken(client, {
            userId: user.id,
            tokenHash,
            familyId,
            expiresAt
        });

        await client.query('COMMIT'); 
    } catch (error) { 
        await client.query('ROLLBACK');
        throw error;

    } finally { 
        client.release(); 
    }

    return {
        user: publicUser(user),
        accessToken: generateAccessToken(user),
        refreshToken
    };
};

// LOGIN
const login = async ({ email, password }) => {
    const user = await User.findByEmail(email);
    if (!user || !user.is_active) {
        throw new AppError('Invalid email or password', 401);
    }

    const passwordMatch = await bcrypt.compare(password,user.password);

    if (!passwordMatch) {
        throw new AppError('Invalid email or password', 401);
    }

    return createSession(user);
};

// REFRESH TOKEN ROTATION
const refresh = async (refreshToken) => {
    const oldHash = hashRefreshToken(refreshToken);
    const client = await pool.connect();
    let transactionOpen = false;
    try {
        await client.query('BEGIN');
        transactionOpen = true;
        const token = await RefreshToken.findTokenForUpdate(
            client,
            oldHash
        );

        if (!token) {
            throw new AppError('Invalid refresh token', 401);
        }

        // Detect reuse of an already rotated token
        if (token.revoked_at) {

            await RefreshToken.revokeFamily(
                client,
                token.family_id
            );

            await client.query('COMMIT');
            transactionOpen = false;

            throw new AppError(
                'Refresh token reuse detected. Login again.',
                401
            );
        }

        if (new Date(token.expires_at) <= new Date()) {

            await RefreshToken.revokeToken(client, oldHash);

            await client.query('COMMIT');
            transactionOpen = false;

            throw new AppError('Refresh token expired', 401);
        }

        const user = await User.findById(token.user_id);

        if (!user || !user.is_active) {

            await RefreshToken.revokeFamily(
                client,
                token.family_id
            );

            await client.query('COMMIT');
            transactionOpen = false;

            throw new AppError('Account unavailable', 401);
        }

        const newRefreshToken = generateRefreshToken();
        const newHash = hashRefreshToken(newRefreshToken);

        const expiresAt = new Date(
            Date.now() + REFRESH_DAYS * 24 * 60 * 60 * 1000
        );

        await RefreshToken.rotateToken(
            client,
            oldHash,
            newHash
        );

        await RefreshToken.createToken(client, {
            userId: user.id,
            tokenHash: newHash,
            familyId: token.family_id,
            expiresAt
        });

        await client.query('COMMIT');
        transactionOpen = false;

        return {
            user: publicUser(user),
            accessToken: generateAccessToken(user),
            refreshToken: newRefreshToken
        };

    } catch (error) {

        if (transactionOpen) {
            await client.query('ROLLBACK');
        }

        throw error;

    } finally {

        client.release();

    }
};

// LOGOUT CURRENT SESSION
const logout = async (refreshToken) => {

    if (!refreshToken) return; 
    const client = await pool.connect(); 
    try { 
        await client.query('BEGIN'); 
        await RefreshToken.revokeToken(client,hashRefreshToken(refreshToken));
        await client.query('COMMIT'); 
    } catch (error) { 
        await client.query('ROLLBACK');
        throw error;

    } finally { 
        client.release(); 
    }
};

// LOGOUT ALL DEVICES
const logoutAll = async (userId) => {

    const client = await pool.connect();

    try {

        await client.query('BEGIN');

        await RefreshToken.revokeAllUserTokens(
            client,
            userId
        );

        await client.query('COMMIT');

    } catch (error) {

        await client.query('ROLLBACK');
        throw error;

    } finally {

        client.release();

    }
};

// CHANGE PASSWORD
const changePassword = async (userId,currentPassword,newPassword) => {

    const user = await User.findByEmail((await User.findById(userId)).email);

    const valid = await bcrypt.compare(currentPassword,user.password);

    if (!valid) {
        throw new AppError('Current password is incorrect', 400);
    }
    const hashedPassword = await bcrypt.hash(newPassword,BCRYPT_ROUNDS); 
    const client = await pool.connect(); 
    try {

        await client.query('BEGIN');
        await client.query(`
            UPDATE users
            SET password = $1, updated_at = NOW()
            WHERE id = $2
        `, [hashedPassword, userId]);

        await RefreshToken.revokeAllUserTokens(client, userId); 
        await client.query('COMMIT'); 
    } catch (error) {

        await client.query('ROLLBACK');
        throw error;

    } finally {

        client.release();

    }
};

module.exports = {
    register,
    login,
    refresh,
    logout,
    logoutAll,
    changePassword
};
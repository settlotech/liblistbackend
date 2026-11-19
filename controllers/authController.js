const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const pool = require('../config/db');
require('dotenv').config();

const {
    findUserByEmail,
    findUserById,
    saveRefreshToken,
    findRefreshToken,
    revokeRefreshToken,
    revokeTokenFamily,
    revokeAllUserTokens,
    bumpTokenVersion,
    saveOtp,
    findValidOtp,
    markOtpUsed,
    updateUserPassword,
} = require('../models/authModel');

const userModel = require('../models/user.model');

const {
    generateAccessToken,
    verifyAccessToken,
    generateRefreshToken,
    hashRefreshToken,
} = require('../utils/jwt');
const {
    generateRefreshTokenString,
    hashToken,
    refreshTokenExpiry,
} = require('../services/tokenService');

const { sendOtpEmail } = require('../services/emailService');

// ─── HELPERS ─────────────────────────────────────────────────────────────────

const REFRESH_DAYS       = Number(process.env.REFRESH_TOKEN_DAYS) || 7;
const SHORT_SESSION_DAYS = Number(process.env.SHORT_SESSION_DAYS) || 1;

const isCrossSiteProd = Boolean(process.env.VERCEL) || process.env.NODE_ENV === 'production';

/**
 * Set the refresh-token as an HttpOnly cookie.
 */
const setRefreshCookie = (res, token, days) => {
    res.cookie('refreshToken', token, {
        httpOnly: true,
        secure:   isCrossSiteProd,
        sameSite: isCrossSiteProd ? 'none' : 'lax',
        maxAge:   days * 24 * 60 * 60 * 1000,
        path:     '/',
    });
};

/**
 * Clear the refresh-token cookie.
 */
const clearRefreshCookie = (res) => {
    res.clearCookie('refreshToken', {
        httpOnly: true,
        secure:   isCrossSiteProd,
        sameSite: isCrossSiteProd ? 'none' : 'lax',
        path:     '/',
    });
};

// ─── POST /api/auth/register ─────────────────────────────────────────────────
const register = async (req, res, next) => {
    try {
        const { name, email, password } = req.body;

        if (!name || !email || !password) {
            return res.status(400).json({
                success: false,
                message: 'Name, email, and password are required.',
            });
        }

        const normalizedEmail = email.trim().toLowerCase();
        const existing = await userModel.findByEmail(normalizedEmail);
        if (existing) {
            return res.status(409).json({
                success: false,
                message: 'Email is already registered.',
            });
        }

        const rounds = Number(process.env.BCRYPT_ROUNDS) || 10;
        const hashedPassword = await bcrypt.hash(password, rounds);

        const newUser = await userModel.createUser({
            name: name.trim(),
            email: normalizedEmail,
            password: hashedPassword,
        });

        // Automatically assign standard role
        const roleRes = await pool.query(
            "SELECT id FROM roles WHERE LOWER(role_name) = 'user' LIMIT 1"
        );
        if (roleRes.rowCount > 0) {
            await pool.query(
                'INSERT INTO user_roles (user_id, role_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
                [newUser.id, roleRes.rows[0].id]
            );
        }

        const fullUser = await userModel.findUserWithRolesAndPermissions(newUser.id);

        return res.status(201).json({
            success: true,
            message: 'Registration successful.',
            data: { user: fullUser },
        });

    } catch (error) {
        next(error);
    }
};

// ─── POST /api/auth/login ─────────────────────────────────────────────────────
const login = async (req, res, next) => {
    try {
        const { email, password, rememberMe = false } = req.body;

        // 1. Validate input
        if (!email || !password) {
            return res.status(400).json({
                success: false,
                message: 'Email and password are required.',
            });
        }

        // 2. Find user
        const user = await findUserByEmail(email);
        if (!user) {
            return res.status(401).json({
                success: false,
                message: 'Invalid email or password.',
            });
        }

        // 3. Check account is active
        if (!user.is_active) {
            return res.status(403).json({
                success: false,
                message: 'Your account has been deactivated. Please contact support.',
            });
        }

        // 4. Verify password
        const passwordMatch = await bcrypt.compare(password, user.password);
        if (!passwordMatch) {
            return res.status(401).json({
                success: false,
                message: 'Invalid email or password.',
            });
        }

        // 5. Fetch full user with dynamic roles and permissions
        const fullUser = await userModel.findUserWithRolesAndPermissions(user.id);

        // 6. Generate tokens
        const accessToken        = generateAccessToken(user);
        const rawRefreshToken    = generateRefreshTokenString();
        const refreshHash        = hashToken(rawRefreshToken);
        const familyId           = crypto.randomUUID();
        const sessionDays        = rememberMe ? REFRESH_DAYS : SHORT_SESSION_DAYS;
        const expiresAt          = refreshTokenExpiry(sessionDays);

        // 7. Persist refresh token
        await saveRefreshToken(user.id, refreshHash, familyId, expiresAt);

        // 8. Set cookie
        setRefreshCookie(res, rawRefreshToken, sessionDays);

        // 9. Respond
        return res.status(200).json({
            success: true,
            message: 'Login successful.',
            data: {
                accessToken,
                user: {
                    id:           fullUser.id,
                    name:         fullUser.name,
                    email:        fullUser.email,
                    role:         fullUser.role || (fullUser.roles && fullUser.roles[0]?.role_name) || 'User',
                    roles:        fullUser.roles || [],
                    permissions:  fullUser.permissionStrings || [],
                    isSuperAdmin: Boolean(fullUser.isSuperAdmin),
                },
            },
        });

    } catch (error) {
        next(error);
    }
};

// ─── POST /api/auth/refresh ──────────────────────────────────────────────────
const refreshToken = async (req, res, next) => {
    try {
        const rawToken = req.cookies?.refreshToken;

        if (!rawToken) {
            return res.status(401).json({
                success: false,
                message: 'Refresh token missing.',
            });
        }

        const tokenHash = hashToken(rawToken);
        const stored    = await findRefreshToken(tokenHash);

        if (!stored) {
            clearRefreshCookie(res);
            return res.status(401).json({
                success: false,
                message: 'Invalid refresh token.',
            });
        }

        if (stored.revoked_at) {
            await revokeTokenFamily(stored.family_id);
            clearRefreshCookie(res);
            return res.status(401).json({
                success: false,
                message: 'Session revoked due to token reuse.',
            });
        }

        if (new Date() > new Date(stored.expires_at)) {
            await revokeRefreshToken(tokenHash);
            clearRefreshCookie(res);
            return res.status(401).json({
                success: false,
                message: 'Refresh token expired. Please log in again.',
            });
        }

        const user = await findUserById(stored.user_id);
        if (!user || !user.is_active) {
            await revokeTokenFamily(stored.family_id);
            clearRefreshCookie(res);
            return res.status(401).json({
                success: false,
                message: 'User account inactive or not found.',
            });
        }

        const fullUser = await userModel.findUserWithRolesAndPermissions(user.id);

        const newRawRefreshToken = generateRefreshTokenString();
        const newRefreshHash     = hashToken(newRawRefreshToken);
        const newExpiresAt       = refreshTokenExpiry(REFRESH_DAYS);

        await revokeRefreshToken(tokenHash, newRefreshHash);
        await saveRefreshToken(user.id, newRefreshHash, stored.family_id, newExpiresAt);

        setRefreshCookie(res, newRawRefreshToken, REFRESH_DAYS);

        const newAccessToken = generateAccessToken(user);

        return res.status(200).json({
            success: true,
            message: 'Token refreshed.',
            data: {
                accessToken: newAccessToken,
                user: {
                    id:           fullUser.id,
                    name:         fullUser.name,
                    email:        fullUser.email,
                    role:         fullUser.role || (fullUser.roles && fullUser.roles[0]?.role_name) || 'User',
                    roles:        fullUser.roles || [],
                    permissions:  fullUser.permissionStrings || [],
                    isSuperAdmin: Boolean(fullUser.isSuperAdmin),
                },
            },
        });

    } catch (error) {
        next(error);
    }
};

// ─── POST /api/auth/logout ────────────────────────────────────────────────────
const logout = async (req, res, next) => {
    try {
        const rawToken = req.cookies?.refreshToken;

        if (rawToken) {
            const tokenHash = hashToken(rawToken);
            await revokeRefreshToken(tokenHash);
        }

        clearRefreshCookie(res);

        return res.status(200).json({
            success: true,
            message: 'Logged out successfully.',
        });

    } catch (error) {
        next(error);
    }
};

// ─── POST /api/auth/logout-all ────────────────────────────────────────────────
const logoutAll = async (req, res, next) => {
    try {
        const userId = req.user.sub || req.user.id;

        await revokeAllUserTokens(userId);
        await bumpTokenVersion(userId);
        clearRefreshCookie(res);

        return res.status(200).json({
            success: true,
            message: 'All sessions terminated successfully.',
        });

    } catch (error) {
        next(error);
    }
};

// ─── GET /api/auth/me (or /api/auth/profile) ──────────────────────────────────
const getMe = async (req, res, next) => {
    try {
        const userId = req.user.sub || req.user.id;
        const fullUser = await userModel.findUserWithRolesAndPermissions(userId);

        if (!fullUser) {
            return res.status(404).json({
                success: false,
                message: 'User not found.',
            });
        }

        return res.status(200).json({
            success: true,
            data: {
                user: {
                    id:           fullUser.id,
                    name:         fullUser.name,
                    email:        fullUser.email,
                    role:         fullUser.role || (fullUser.roles && fullUser.roles[0]?.role_name) || 'User',
                    roles:        fullUser.roles || [],
                    permissions:  fullUser.permissionStrings || [],
                    isSuperAdmin: Boolean(fullUser.isSuperAdmin),
                },
            },
        });

    } catch (error) {
        next(error);
    }
};

// ─── PATCH /api/auth/profile ──────────────────────────────────────────────────
const updateProfile = async (req, res, next) => {
    try {
        const userId = req.user.sub || req.user.id;
        const { name } = req.body;

        if (!name || !name.trim()) {
            return res.status(400).json({
                success: false,
                message: 'Name is required.',
            });
        }

        await userModel.updateProfile(userId, name.trim());
        const fullUser = await userModel.findUserWithRolesAndPermissions(userId);

        return res.status(200).json({
            success: true,
            message: 'Profile updated successfully.',
            data: {
                user: {
                    id:           fullUser.id,
                    name:         fullUser.name,
                    email:        fullUser.email,
                    role:         fullUser.role || (fullUser.roles && fullUser.roles[0]?.role_name) || 'User',
                    roles:        fullUser.roles || [],
                    permissions:  fullUser.permissionStrings || [],
                    isSuperAdmin: Boolean(fullUser.isSuperAdmin),
                },
            },
        });

    } catch (error) {
        next(error);
    }
};

// ─── PATCH /api/auth/change-password ──────────────────────────────────────────
const changePassword = async (req, res, next) => {
    try {
        const userId = req.user.sub || req.user.id;
        const { currentPassword, newPassword } = req.body;

        if (!currentPassword || !newPassword) {
            return res.status(400).json({
                success: false,
                message: 'Current password and new password are required.',
            });
        }

        if (newPassword.length < 6) {
            return res.status(400).json({
                success: false,
                message: 'New password must be at least 6 characters.',
            });
        }

        const { rows } = await pool.query('SELECT password FROM users WHERE id = $1', [userId]);
        if (rows.length === 0) {
            return res.status(404).json({ success: false, message: 'User not found.' });
        }

        const match = await bcrypt.compare(currentPassword, rows[0].password);
        if (!match) {
            return res.status(400).json({
                success: false,
                message: 'Current password is incorrect.',
            });
        }

        await userModel.updatePassword(userId, newPassword);

        return res.status(200).json({
            success: true,
            message: 'Password changed successfully.',
        });

    } catch (error) {
        next(error);
    }
};

// ─── POST /api/auth/forgot-password ───────────────────────────────────────────
const forgotPassword = async (req, res, next) => {
    try {
        const { email } = req.body;

        if (!email) {
            return res.status(400).json({
                success: false,
                message: 'Email is required.',
            });
        }

        const user = await findUserByEmail(email);

        if (user && user.is_active) {
            const otp       = String(crypto.randomInt(100000, 999999));
            const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

            await saveOtp(user.id, otp, expiresAt);
            try {
                await sendOtpEmail(user.email, user.name, otp);
            } catch (mailErr) {
                console.error('[Mailer Warning]', mailErr.message);
            }
        }

        return res.status(200).json({
            success: true,
            message: 'If that email exists, password reset instructions have been dispatched.',
        });

    } catch (error) {
        next(error);
    }
};

// ─── POST /api/auth/verify-otp ────────────────────────────────────────────────
const verifyOtp = async (req, res, next) => {
    try {
        const { email, otp } = req.body;

        if (!email || !otp) {
            return res.status(400).json({
                success: false,
                message: 'Email and OTP are required.',
            });
        }

        const user = await findUserByEmail(email);
        if (!user) {
            return res.status(400).json({
                success: false,
                message: 'Invalid OTP or email.',
            });
        }

        const otpRecord = await findValidOtp(user.id, otp);
        if (!otpRecord) {
            return res.status(400).json({
                success: false,
                message: 'OTP is invalid or has expired.',
            });
        }

        const resetToken = require('jsonwebtoken').sign(
            { sub: user.id, purpose: 'password_reset', otpId: otpRecord.id },
            process.env.JWT_ACCESS_SECRET,
            { expiresIn: '15m', issuer: process.env.JWT_ISSUER }
        );

        return res.status(200).json({
            success: true,
            message: 'OTP verified successfully.',
            data: { resetToken, userId: user.id },
        });

    } catch (error) {
        next(error);
    }
};

// ─── POST /api/auth/reset-password ───────────────────────────────────────────
const resetPassword = async (req, res, next) => {
    try {
        const { resetToken, newPassword, confirmPassword } = req.body;

        if (!resetToken || !newPassword) {
            return res.status(400).json({
                success: false,
                message: 'resetToken and newPassword are required.',
            });
        }

        if (confirmPassword && newPassword !== confirmPassword) {
            return res.status(400).json({
                success: false,
                message: 'Passwords do not match.',
            });
        }

        if (newPassword.length < 6) {
            return res.status(400).json({
                success: false,
                message: 'Password must be at least 6 characters.',
            });
        }

        let payload;
        try {
            payload = require('jsonwebtoken').verify(
                resetToken,
                process.env.JWT_ACCESS_SECRET,
                { issuer: process.env.JWT_ISSUER }
            );
        } catch {
            return res.status(400).json({
                success: false,
                message: 'Reset token is invalid or has expired.',
            });
        }

        if (payload.purpose !== 'password_reset') {
            return res.status(400).json({
                success: false,
                message: 'Invalid token purpose.',
            });
        }

        if (payload.otpId) {
            await markOtpUsed(payload.otpId);
        }

        const rounds         = Number(process.env.BCRYPT_ROUNDS) || 10;
        const hashedPassword = await bcrypt.hash(newPassword, rounds);

        await updateUserPassword(payload.sub, hashedPassword);
        await revokeAllUserTokens(payload.sub);
        await bumpTokenVersion(payload.sub);

        clearRefreshCookie(res);

        return res.status(200).json({
            success: true,
            message: 'Password reset successfully. You can now log in with your new password.',
        });

    } catch (error) {
        next(error);
    }
};

module.exports = {
    register,
    login,
    refreshToken,
    logout,
    logoutAll,
    getMe,
    updateProfile,
    changePassword,
    forgotPassword,
    verifyOtp,
    resetPassword,
};

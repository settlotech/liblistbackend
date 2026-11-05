const AuthService = require('../services/auth.service');
const User = require('../models/user.model');
const AppError = require('../utils/appError');
const { setRefreshCookie, clearRefreshCookie } = require('../utils/cookies');

// REGISTER
const register = async (req, res, next) => {
    try {
        const user = await AuthService.register(req.body);
        res.status(201).json({
            success: true,
            message: 'Registration successful',
            data: { ...user }
        });
    } catch (error) {
        next(error);
    }
};

// LOGIN
const login = async (req, res, next) => {
    try {
        const { rememberMe } = req.body; 
        const result = await AuthService.login(req.body); 
        setRefreshCookie(res, result.refreshToken, rememberMe);
        res.status(200).json({
            success: true,
            message: 'Login successful',
            data: {
                user: result.user,
                accessToken: result.accessToken
            }
        });
    } catch (error) {
        next(error);
    }
};

// REFRESH
const refresh = async (req, res, next) => {
    try {
        const token = req.cookies.refreshToken;
        if (!token) {
            throw new AppError('Refresh token required', 401);
        }

        const result = await AuthService.refresh(token);
        setRefreshCookie(res, result.refreshToken);

        res.status(200).json({
            success: true,
            message: 'Token refreshed successfully',
            data: {
                user: result.user,
                accessToken: result.accessToken
            }
        });
    } catch (error) {
        next(error);
    }
};

// LOGOUT
const logout = async (req, res, next) => {
    try {
        await AuthService.logout(req.cookies.refreshToken);
        clearRefreshCookie(res);
        res.status(200).json({
            success: true,
            message: 'Logout successful'
        });
    } catch (error) {
        next(error);
    }
};

// LOGOUT ALL DEVICES
const logoutAll = async (req, res, next) => {
    try {
        await AuthService.logoutAll(req.user.id);
        clearRefreshCookie(res);
        res.status(200).json({
            success: true,
            message: 'Logged out from all devices'
        });
    } catch (error) {
        next(error);
    }
};

// PROFILE
const profile = async (req, res, next) => {
    try {
        res.status(200).json({
            success: true,
            data: {
                user: {
                    id: req.user.id,
                    name: req.user.name,
                    email: req.user.email,
                    role: req.user.role,
                    roles: req.user.roles || [],
                    permissions: req.user.permissionStrings || [],
                    isSuperAdmin: Boolean(req.user.isSuperAdmin)
                }
            }
        });
    } catch (error) {
        next(error);
    }
};

// UPDATE PROFILE
const updateProfile = async (req, res, next) => {
    try {
        const user = await User.updateProfile(
            req.user.id,
            req.body.name
        );

        res.status(200).json({
            success: true,
            message: 'Profile updated successfully',
            data: { user }
        });
    } catch (error) {
        next(error);
    }
};

// CHANGE PASSWORD
const changePassword = async (req, res, next) => {
    try {
        const { currentPassword, newPassword } = req.body;
        await AuthService.changePassword(
            req.user.id,
            currentPassword,
            newPassword
        );

        clearRefreshCookie(res);

        res.status(200).json({
            success: true,
            message: 'Password changed. Please login again.'
        });
    } catch (error) {
        next(error);
    }
};

module.exports = {
    register,
    login,
    refresh,
    logout,
    logoutAll,
    profile,
    updateProfile,
    changePassword
};

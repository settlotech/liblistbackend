const express = require('express');
const router  = express.Router();
const rateLimit = require('express-rate-limit');

const {
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
} = require('../controllers/authController');

const authenticate = require('../middleware/auth.middleware');

const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 15,
    standardHeaders: true,
    legacyHeaders: false,
    message: {
        success: false,
        message: 'Too many login attempts. Please try again after 15 minutes.',
    },
});

const otpLimiter = rateLimit({
    windowMs: 10 * 60 * 1000,
    max: 10,
    standardHeaders: true,
    legacyHeaders: false,
    message: {
        success: false,
        message: 'Too many OTP requests. Please try again after 10 minutes.',
    },
});

// ─── Public Routes ───────────────────────────────────────────────────────────
router.post('/register', register);
router.post('/login', loginLimiter, login);
router.post('/refresh', refreshToken);
router.post('/forgot-password', otpLimiter, forgotPassword);
router.post('/verify-otp', otpLimiter, verifyOtp);
router.post('/reset-password', resetPassword);

// ─── Protected Routes (require valid access token) ───────────────────────────
router.post('/logout', authenticate, logout);
router.post('/logout-all', authenticate, logoutAll);
router.get('/me', authenticate, getMe);
router.get('/profile', authenticate, getMe);
router.patch('/profile', authenticate, updateProfile);
router.patch('/change-password', authenticate, changePassword);

module.exports = router;

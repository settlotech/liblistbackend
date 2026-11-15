const userModel = require('../models/user.model');
const jwt = require('jsonwebtoken');
const rbacModel = require('../models/rbac.model');
const AppError = require('../utils/appError');
const emailService = require('../services/email.service');
const emailTemplates = require('../utils/emailtemplates');

// Fetch all users with their assigned roles
const getAllUsers = async (req, res, next) => {
    try {
        const limit = Math.min(Number(req.query.limit) || 100, 200);
        const page = Math.max(Number(req.query.page) || 1, 1);
        const offset = (page - 1) * limit;

        const users = await userModel.fetchUsersWithRoles({ limit, offset });

        return res.status(200).json({
            success: true,
            data: users,
            pagination: {
                page,
                limit
            }
        });
    } catch (error) {
        next(error);
    }
};

// Fetch single user by ID with roles
const getUserById = async (req, res, next) => {
    try {
        const { id } = req.params;
        const user = await userModel.getUserWithRoles(id);
        if (!user) {
            return next(new AppError('User not found', 404));
        }

        return res.status(200).json({
            success: true,
            data: user
        });
    } catch (error) {
        next(error);
    }
};

// Create a new user (with assigned roles)
const createUser = async (req, res, next) => {
    try {
        const { name, email, password, is_active = true, roleIds = [] } = req.body;

        if (!name || !name.trim()) {
            return next(new AppError('Name is required', 400));
        }
        if (!email || !email.trim()) {
            return next(new AppError('Email is required', 400));
        }
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
            return next(new AppError('Valid email is required', 400));
        }
        if (!password || password.length < 6) {
            return next(new AppError('Password must be at least 6 characters', 400));
        }

        const normalizedEmail = email.trim().toLowerCase();
        const existing = await userModel.findByEmail(normalizedEmail);
        if (existing) {
            return next(new AppError('User with this email already exists', 409));
        }

        const newUser = await userModel.createAdminUser({
            name: name.trim(),
            email: normalizedEmail,
            password,
            is_active: is_active !== false,
            roleIds: Array.isArray(roleIds) ? roleIds : []
        });

        return res.status(201).json({
            success: true,
            message: 'User created successfully',
            data: newUser
        });
    } catch (error) {
        next(error);
    }
};

// Update an existing user
const updateUser = async (req, res, next) => {
    try {
        const { id } = req.params;
        const { name, email, password, is_active, roleIds } = req.body;

        const user = await userModel.findById(id);
        if (!user) {
            return next(new AppError('User not found', 404));
        }

        let normalizedEmail = user.email;
        if (email && email.trim().toLowerCase() !== user.email.toLowerCase()) {
            normalizedEmail = email.trim().toLowerCase();
            if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
                return next(new AppError('Valid email is required', 400));
            }
            const existing = await userModel.findByEmail(normalizedEmail);
            if (existing && existing.id !== id) {
                return next(new AppError('Email is already in use by another user', 409));
            }
        }

        // Protect default superadmin account from being deactivated
        if (user.email.toLowerCase() === 'settlo@gmail.com' && is_active === false) {
            return next(new AppError('Default Super Admin account cannot be deactivated', 400));
        }

        if (password && password.trim().length > 0 && password.trim().length < 6) {
            return next(new AppError('New password must be at least 6 characters', 400));
        }

        const updated = await userModel.updateAdminUser(id, {
            name: name ? name.trim() : user.name,
            email: normalizedEmail,
            password: password && password.trim() ? password.trim() : undefined,
            is_active: typeof is_active === 'boolean' ? is_active : user.is_active,
            roleIds: Array.isArray(roleIds) ? roleIds : undefined
        });

        return res.status(200).json({
            success: true,
            message: 'User updated successfully',
            data: updated
        });
    } catch (error) {
        next(error);
    }
};

// Delete a user
const deleteUser = async (req, res, next) => {
    try {
        const { id } = req.params;

        const user = await userModel.findById(id);
        if (!user) {
            return next(new AppError('User not found', 404));
        }

        // Protect primary Super Admin
        if (user.email.toLowerCase() === 'settlo@gmail.com') {
            return next(new AppError('Default Super Admin account cannot be deleted', 403));
        }

        // Prevent self-deletion
        if (req.user && req.user.id === id) {
            return next(new AppError('You cannot delete your own logged-in account', 400));
        }

        await userModel.deleteUser(id);

        return res.status(200).json({
            success: true,
            message: `User ${user.name} (${user.email}) deleted successfully`,
            data: { id }
        });
    } catch (error) {
        next(error);
    }
};

// Fetch roles for a specific user
const getUserRoles = async (req, res, next) => {
    try {
        const { id } = req.params;
        const user = await userModel.findById(id);
        if (!user) {
            return next(new AppError('User not found', 404));
        }

        const roles = await rbacModel.getUserRoles(id);
        const { permissions, permissionStrings } = await rbacModel.getUserPermissions(id);

        return res.status(200).json({
            success: true,
            data: {
                user: {
                    id: user.id,
                    name: user.name,
                    email: user.email,
                    is_active: user.is_active
                },
                roles,
                permissions,
                permissionStrings
            }
        });
    } catch (error) {
        next(error);
    }
};

// Assign/update roles for a user
const assignUserRoles = async (req, res, next) => {
    try {
        const { id } = req.params;
        const { roleIds } = req.body;

        const user = await userModel.findById(id);
        if (!user) {
            return next(new AppError('User not found', 404));
        }

        if (!Array.isArray(roleIds)) {
            return res.status(400).json({
                success: false,
                message: 'roleIds must be an array of numeric role IDs'
            });
        }

        const updatedRoles = await userModel.assignUserRoles(id, roleIds);

        return res.status(200).json({
            success: true,
            message: 'User roles updated successfully',
            data: {
                userId: id,
                roles: updatedRoles
            }
        });
    } catch (error) {
        next(error);
    }
};
// Get user email for password reset verification screen
const getUserResetInfo = async (req, res, next) => {
    try {
        const { id } = req.params;
        const user = await userModel.findById(id);
        if (!user) {
            return res.status(404).json({ success: false, message: 'User not found' });
        }
        return res.status(200).json({
            success: true,
            email: user.email
        });
    } catch (err) {
        next(err);
    }
};

// Check User email availability and send OTP
const userEmailavailable = async (req, res, next) => {
    try {
        const { email } = req.body;
        if (!email || !email.trim()) {
            return res.status(400).json({ success: false, message: 'Email is required' });
        }
        const result = await userModel.checkuserEmailavailable(email.trim()); 
        if (!result) {
            return res.status(404).json({ success: false, message: `${email} Not yet registered` });
        }
        const randomPin = String(Math.floor(100000 + Math.random() * 900000)); 
        await userModel.savePasswordResetOtp(result.id, randomPin); 
        await emailService.sendEmail(result.email, 'Reset Your Password - LibList', emailTemplates.passwordResetTemplate(randomPin, `http://localhost:5173/reset/${result.id}`));
        return res.status(200).json({
            success: true,
            message: 'Email sent successfully',
            userId: result.id
        });
    } catch (err) {
        next(err);
    }
};

// Resend OTP
const resendOtp = async (req, res, next) => {
    try {
        const { id } = req.params;
        const user = await userModel.findById(id);
        if (!user) {
            return res.status(404).json({ success: false, message: 'User not found' });
        }
        const lastOtp = await userModel.getLatestPasswordResetOtp(user.id);
        if (lastOtp && lastOtp.created_at) {
            const secondsAgo = (Date.now() - new Date(lastOtp.created_at).getTime()) / 1000;
            if (secondsAgo < 25) {
                return res.status(429).json({
                    success: false,
                    message: 'Please wait ' + Math.ceil(25 - secondsAgo) + ' seconds before requesting another code.'
                });
            }
        }
        const randomPin = String(Math.floor(100000 + Math.random() * 900000));
        await userModel.savePasswordResetOtp(user.id, randomPin);

        await emailService.sendEmail(user.email, 'Your New Security Code – LibList', emailTemplates.passwordResetTemplate(randomPin, `http://localhost:5173/reset/${user.id}`));
        return res.status(200).json({
            success: true,
            message: 'Verification code resent successfully'
        });
    } catch (err) {
        next(err);
    }
};

 
//  Verify OTP and issue temporary reset authorization token
const verifyOtp = async (req, res, next) => {
    try {
        const { id } = req.params;
        const { otp } = req.body;
        if (!otp || String(otp).trim().length !== 6) {
            return res.status(400).json({ success: false, message: 'A valid 6-digit code is required' });
        }
        const validOtp = await userModel.verifyPasswordResetOtp(id, String(otp).trim());
        if (!validOtp) {
            return res.status(400).json({ success: false, message: 'Invalid or expired verification code' });
        }
        await userModel.markOtpAsUsed(validOtp.id);
        const resetToken = jwt.sign(
            { userId: id, purpose: 'password_reset' },
            process.env.JWT_ACCESS_SECRET,
            { expiresIn: '15m' }
        );
        return res.status(200).json({
            success: true,
            message: 'Email verified successfully!',
            resetToken
        });
    } catch (err) {
        next(err);
    }
};

//   Set new password using verified reset authorization token
const resetPasswordWithToken = async (req, res, next) => {
    try {
        const { id } = req.params;
        const { resetToken, newPassword } = req.body;
        if (!resetToken) {
            return res.status(401).json({ success: false, message: 'Reset token missing or expired. Please verify your OTP again.' });
        }
        if (!newPassword || newPassword.length < 6) {
            return res.status(400).json({ success: false, message: 'Password must be at least 6 characters long' });
        }
        let decoded;
        try {
            decoded = jwt.verify(resetToken, process.env.JWT_ACCESS_SECRET);
        } catch (jwtErr) {
            return res.status(401).json({ success: false, message: 'Invalid or expired reset token. Please verify OTP again.' });
        }
        if (decoded.userId !== id || decoded.purpose !== 'password_reset') {
            return res.status(403).json({ success: false, message: 'Unauthorized reset request' });
        }
        await userModel.updatePassword(id, newPassword);
        return res.status(200).json({
            success: true,
            message: 'Password reset successfully. You can now log in with your new password.'
        });
    } catch (err) {
        next(err);
    }
};

module.exports = {
    getAllUsers,
    getUserById,
    createUser,
    updateUser,
    deleteUser,
    getUserRoles,
    assignUserRoles,

    userEmailavailable,
    getUserResetInfo,
    resendOtp,
    verifyOtp,
    resetPasswordWithToken
};

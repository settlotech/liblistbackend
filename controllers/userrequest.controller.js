const crypto = require('crypto');
const userRequestModel = require('../models/userrequest.model');
const userModel = require('../models/user.model');
const emailService = require('../services/email.service');
const emailTemplates = require('../utils/emailtemplates');
const AppError = require('../utils/appError');
const notificationService = require('../services/notification.service');


const generateOtp = () => {
    return String(crypto.randomInt(100000, 999999));
};

// Step 1: Validate email → send OTP 
const requestOtp = async (req, res, next) => {
    try {
        const { user_email, user_name } = req.body;

        if (!user_email) {
            return next(new AppError('Email address is required.', 400));
        }

        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(user_email.trim())) {
            return next(new AppError('Please provide a valid email address.', 400));
        }

        const email = user_email.toLowerCase().trim();

        const existingUser = await userModel.findByEmail(email);
        if (existingUser) {
            return next(new AppError('This email is already registered. Please log in.', 409));
        }

        // Block if there is already an approved/pending-verified request
        const existingVerified = await userRequestModel.findVerifiedPendingRequest(email);
        if (existingVerified) {
            return next(new AppError(
                'A signup request with this email is already under admin review. Please wait for approval.',
                409
            ));
        }

        // Generate and store OTP
        const otp = generateOtp();
        const request = await userRequestModel.createOrReplaceRequest({
            user_email: email,
            user_name: user_name?.trim() || null,
            otp,
        });

        // Send OTP email
        const html = emailTemplates.signupOtpTemplate(otp, user_name?.trim() || email);
        await emailService.sendEmail(email, 'Verify Your Email – LibList Signup', html);

        return res.status(200).json({
            success: true,
            message: 'Verification code sent to your email address.',
            data: {
                request_id: request.id,
                expires_at: request.expires_at,
            },
        });

    } catch (err) {
        next(err);
    }
};


// Step 2: Verify OTP → mark email verified 
const verifyOtp = async (req, res, next) => {
    try {
        const { user_email, otp } = req.body;

        if (!user_email || !otp) {
            return next(new AppError('Email and verification code are required.', 400));
        }

        const email = user_email.toLowerCase().trim();

        const request = await userRequestModel.verifyOtp(email, String(otp).trim());

        if (!request) {
            return next(new AppError(
                'Invalid or expired verification code. Please request a new one.',
                400
            ));
        }

        // Mark email verified — request moves to pending admin approval
        const verified = await userRequestModel.markEmailVerified(request.id);
        //sent notification to Admin or super admin
        const result = await userModel.fetchSuperadmins();
        const superAdminIds = result.filter((val) => val.roles[0].role_name == 'Super Admin').map((supadmin) => supadmin.id);
        await notificationService.sendNotificationToMany({
            userIds: superAdminIds,
            title: 'New Request',
            body: 'A new user request has been submitted.'
        });


        return res.status(200).json({
            success: true,
            message: 'Email verified successfully. Your request is now pending admin approval.',
            data: {
                request_id: verified.id,
                user_email: verified.user_email,
                user_name: verified.user_name,
                status: verified.status,
                submitted_at: verified.created_at,
            },
        });

    } catch (err) {
        next(err);
    }
};

const resendOtp = async (req, res, next) => {
    try {
        const { user_email, user_name } = req.body;

        if (!user_email) {
            return next(new AppError('Email address is required.', 400));
        }

        const email = user_email.toLowerCase().trim();

        // Check no already-verified pending request
        const existingVerified = await userRequestModel.findVerifiedPendingRequest(email);
        if (existingVerified) {
            return next(new AppError(
                'Your email is already verified and under admin review.',
                409
            ));
        }

        const otp = generateOtp();
        const request = await userRequestModel.createOrReplaceRequest({
            user_email: email,
            user_name: user_name?.trim() || null,
            otp,
        });

        const html = emailTemplates.signupOtpTemplate(otp, user_name?.trim() || email);
        await emailService.sendEmail(email, 'New Verification Code – LibList Signup', html);

        return res.status(200).json({
            success: true,
            message: 'A new verification code has been sent to your email.',
            data: {
                request_id: request.id,
                expires_at: request.expires_at,
            },
        });

    } catch (err) {
        next(err);
    }
};


const getAllRequests = async (req, res, next) => {
    try {
        const { status } = req.query;
        const requests = await userRequestModel.getAllRequests({ status });
        return res.status(200).json({
            success: true,
            data: { requests },
        });
    } catch (err) {
        next(err);
    }
};


const reviewRequest = async (req, res, next) => {
    try {
        const { id } = req.params;
        const { status, rejection_reason, password } = req.body;
        const reviewed_by = req.user?.id;

        if (!['approved', 'rejected'].includes(status)) {
            return next(new AppError('Status must be "approved" or "rejected".', 400));
        }

        const request = await userRequestModel.findById(id);
        if (!request) {
            return next(new AppError('Signup request not found.', 404));
        }

        if (!request.is_email_verified) {
            return next(new AppError('Cannot review a request whose email has not been verified.', 400));
        }

        if (request.status !== 'pending') {
            return next(new AppError(`Request has already been ${request.status}.`, 409));
        }

        const updated = await userRequestModel.updateRequestStatus(id, {
            status,
            reviewed_by,
            rejection_reason: status === 'rejected' ? rejection_reason : null,
        });

        // If approved, notify the user with credentials and portal instructions
        if (status === 'approved') {
            const loginUrl = process.env.CLIENT_URL;
            const html = emailTemplates.signupApprovedTemplate({
                name: request.user_name || request.user_email,
                email: request.user_email,
                password: password || null,
                loginUrl
            });
            await emailService.sendEmail(
                request.user_email,
                'Your LibList Account Request Was Approved',
                html
            ).catch((err) => {
                console.error('Failed to send approval email:', err.message);
            });
        }

        return res.status(200).json({
            success: true,
            message: `Signup request ${status} successfully.`,
            data: { request: updated },
        });

    } catch (err) {
        next(err);
    }
};


const demo = async (req, res, next) => {
    try {
        const result = await userModel.fetchSuperadmins();
        const superAdminIds = result.filter((val) => val.roles[0].role_name == 'Super Admin').map((supadmin) => supadmin.id);
        console.log("superAdminIds ==> ", superAdminIds);
        const notificationRes = await notificationService.sendNotificationToMany({ userIds: superAdminIds, title: 'New Requist', body: 'New User Request' });


    } catch (err) {

    }
}
module.exports = {
    requestOtp,
    verifyOtp,
    resendOtp,
    getAllRequests,
    reviewRequest,

    demo
};

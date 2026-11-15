const nodemailer = require('nodemailer');
require('dotenv').config();

const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS,
    },
});

/**
 * Send a password-reset OTP email.
 * @param {string} toEmail
 * @param {string} userName
 * @param {string} otp
 */
const sendOtpEmail = async (toEmail, userName, otp) => {
    const mailOptions = {
        from: `"Support" <${process.env.EMAIL_USER}>`,
        to: toEmail,
        subject: 'Your Password Reset OTP',
        html: `
        <div style="font-family:Arial,sans-serif;max-width:480px;margin:auto;padding:32px;border:1px solid #e5e7eb;border-radius:8px;">
            <h2 style="color:#075bb9;margin-bottom:8px;">Password Reset</h2>
            <p>Hi <strong>${userName}</strong>,</p>
            <p>Use the OTP below to reset your password. It expires in <strong>10 minutes</strong>.</p>
            <div style="text-align:center;margin:28px 0;">
                <span style="display:inline-block;font-size:36px;letter-spacing:12px;font-weight:700;color:#1e293b;background:#f1f5f9;padding:16px 32px;border-radius:8px;">
                    ${otp}
                </span>
            </div>
            <p style="color:#64748b;font-size:13px;">If you did not request this, please ignore this email.</p>
        </div>`,
    };

    await transporter.sendMail(mailOptions);
};

module.exports = { sendOtpEmail };

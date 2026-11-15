const { transporter } = require('../config/email.js');

const sendEmail = async (to, subject, html) => {
    try {
        const info = await transporter.sendMail({
            from: `"LibList" <${process.env.EMAIL_USER}>`,
            to,
            subject,
            html
        });
        return {
            success: true,
            messageId: info.messageId
        };

    } catch (error) {
        console.error('Email Error:', error.message);
        throw new Error('Failed to send email');
    }
};

module.exports = {
    sendEmail
}
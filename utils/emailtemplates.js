const onboardEmailtemplate = `
                <h2>Welcome to LibList!</h2>
                <p>Your account has been successfully created.</p>
                <p>Thank you for joining us.</p>
            `

const passwordResetTemplate = (code, link) => {
    return `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta name="x-apple-disable-message-reformatting">

    <title>Reset Password | LibList</title>

    <style>
        body {
            margin: 0;
            padding: 0;
            background-color: #f1f5f9;
            font-family: Arial, Helvetica, sans-serif;
        }

        table {
            border-spacing: 0;
            border-collapse: collapse;
        }

        .email-container {
            width: 100%;
            max-width: 600px;
            margin: 0 auto;
            background: #ffffff;
            border-radius: 12px;
            overflow: hidden;
        }

        .email-content {
            padding: 40px;
        }

        .otp-code {
            font-size: 34px;
            letter-spacing: 12px;
            font-weight: 700;
            color: #1d4ed8;
            margin: 0;
        }

        .reset-button {
            display: inline-block;
            padding: 15px 38px;
            background: #1d4ed8;
            color: #ffffff !important;
            font-size: 15px;
            font-weight: 600;
            text-decoration: none;
            border-radius: 7px;
        }

        .footer {
            background: #f8fafc;
            padding: 25px 35px;
        }

        @media only screen and (max-width: 600px) {
            .email-wrapper {
                padding: 12px !important;
            }

            .email-container {
                width: 100% !important;
                border-radius: 8px !important;
            }

            .email-content {
                padding: 28px 20px !important;
            }

            .otp-code {
                font-size: 27px !important;
                letter-spacing: 8px !important;
            }

            .reset-button {
                display: block !important;
                text-align: center !important;
                padding: 15px 20px !important;
            }

            .footer {
                padding: 22px 15px !important;
            }
        }
    </style>
</head>

<body>

<table width="100%" role="presentation"
    style="background:#f1f5f9; width:100%;">

    <tr>
        <td align="center" class="email-wrapper"
            style="padding:40px 15px;">

            <table class="email-container" width="600"
                role="presentation">

                <!-- LOGO HEADER -->
                <tr>
                    <td align="center"
                        style="padding:30px 20px; background:#ffffff;">

                        <img
                            src="https://your-domain.com/assets/liblist-logo.png"
                            alt="LibList"
                            width="150"
                            style="display:block; width:150px; max-width:100%; height:auto;"
                        >

                    </td>
                </tr>

                <!-- BLUE TOP BORDER -->
                <tr>
                    <td style="height:4px; background:#2563eb;"></td>
                </tr>

                <!-- MAIN CONTENT -->
                <tr>
                    <td class="email-content">

                        <h1 style="
                            color:#172554;
                            font-size:25px;
                            line-height:34px;
                            text-align:center;
                            margin:0 0 15px;
                        ">
                            Reset Your Password
                        </h1>

                        <p style="
                            color:#64748b;
                            font-size:15px;
                            line-height:25px;
                            text-align:center;
                            margin:0 0 30px;
                        ">
                            Hello,
                            <br><br>
                            We received a request to reset your LibList
                            account password. Use the verification code
                            below to securely continue.
                        </p>

                        <!-- OTP CARD -->
                        <table width="100%" role="presentation"
                            style="
                                background:#f8fafc;
                                border:1px solid #e2e8f0;
                                border-radius:10px;
                            ">

                            <tr>
                                <td align="center" style="padding:25px 15px;">

                                    <p style="
                                        color:#64748b;
                                        font-size:12px;
                                        font-weight:bold;
                                        letter-spacing:2px;
                                        margin:0 0 15px;
                                    ">
                                        YOUR VERIFICATION CODE
                                    </p>

                                    <h2 class="otp-code">
                                        ${code}
                                    </h2>

                                    <p style="
                                        color:#94a3b8;
                                        font-size:12px;
                                        margin:15px 0 0;
                                    ">
                                        Enter this code to verify your identity
                                    </p>

                                </td>
                            </tr>
                        </table>

                        <!-- EXPIRY -->
                        <p style="
                            color:#64748b;
                            font-size:13px;
                            text-align:center;
                            margin:20px 0 25px;
                            line-height:22px;
                        ">
                            This verification code expires in
                            <strong style="color:#334155;">5 minutes.</strong>
                        </p>

                        <!-- DIVIDER -->
                        <table width="100%" role="presentation">
                            <tr>
                                <td style="
                                    border-top:1px solid #e2e8f0;
                                    height:1px;
                                "></td>
                            </tr>
                        </table>

                        <!-- RESET LINK -->
                        <p style="
                            color:#64748b;
                            font-size:14px;
                            text-align:center;
                            margin:25px 0 20px;
                        ">
                            Or reset your password directly:
                        </p>

                        <table width="100%" role="presentation">
                            <tr>
                                <td align="center">

                                    <a href="${link}"
                                        class="reset-button">
                                        Reset Password
                                    </a>

                                </td>
                            </tr>
                        </table>

                        <!-- SECURITY NOTICE -->
                        <table width="100%" role="presentation"
                            style="
                                margin-top:30px;
                                background:#eff6ff;
                                border-radius:8px;
                            ">

                            <tr>
                                <td style="padding:16px;">

                                    <p style="
                                        color:#1e40af;
                                        font-size:13px;
                                        font-weight:bold;
                                        margin:0 0 6px;
                                    ">
                                        Security Notice
                                    </p>

                                    <p style="
                                        color:#475569;
                                        font-size:12px;
                                        line-height:21px;
                                        margin:0;
                                    ">
                                        If you did not request a password
                                        reset, please ignore this email.
                                        Do not share your verification code
                                        with anyone.
                                    </p>

                                </td>
                            </tr>
                        </table>

                    </td>
                </tr>

                <!-- FOOTER -->
                <tr>
                    <td align="center" class="footer">

                        <p style="
                            color:#334155;
                            font-size:13px;
                            font-weight:bold;
                            margin:0 0 8px;
                        ">
                            LibList
                        </p>

                        <p style="
                            color:#94a3b8;
                            font-size:11px;
                            line-height:19px;
                            margin:0;
                        ">
                            Secure Banking Policy Management Platform
                            <br>
                            © ${new Date().getFullYear()} LibList.
                            All rights reserved.
                        </p>

                        <p style="
                            color:#94a3b8;
                            font-size:11px;
                            margin:12px 0 0;
                        ">
                            This is an automated email.
                            Please do not reply.
                        </p>

                    </td>
                </tr>

            </table>

        </td>
    </tr>

</table>

</body>
</html>
`;
};
module.exports = {
    onboardEmailtemplate,
    passwordResetTemplate
}
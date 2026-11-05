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
                                </th>
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
const signupOtpTemplate = (otp, nameOrEmail) => `
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Verify Your Email – LibList</title>
<style>
  body { margin:0; padding:0; background:#f1f5f9; font-family:Arial,Helvetica,sans-serif; }
  .footer { background:#f8fafc; padding:25px 35px; text-align:center; }
</style>
</head>
<body>
<table width="100%" style="background:#f1f5f9;padding:40px 15px;" role="presentation">
  <tr><td align="center">
    <table width="600" style="background:#ffffff;border-radius:12px;overflow:hidden;" role="presentation">
      <tr><td style="height:4px;background:#2563eb;"></td></tr>
      <tr><td style="padding:40px;">
        <h1 style="color:#172554;font-size:24px;text-align:center;margin:0 0 12px;">Verify Your Email Address</h1>
        <p style="color:#64748b;font-size:15px;text-align:center;line-height:24px;margin:0 0 28px;">
          Hi <strong style="color:#0f172a;">${nameOrEmail}</strong>,<br><br>
          Thank you for signing up for LibList. Enter the verification code below to confirm your email address.
        </p>
        <table width="100%" role="presentation" style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;">
          <tr><td align="center" style="padding:28px 15px;">
            <p style="color:#64748b;font-size:11px;font-weight:bold;letter-spacing:2px;margin:0 0 12px;">YOUR VERIFICATION CODE</p>
            <h2 style="font-size:36px;letter-spacing:14px;font-weight:700;color:#1d4ed8;margin:0;">${otp}</h2>
            <p style="color:#94a3b8;font-size:12px;margin:14px 0 0;">
              This code expires in <strong style="color:#334155;">10 minutes</strong>
            </p>
          </td></tr>
        </table>
        <table width="100%" role="presentation" style="margin-top:28px;background:#eff6ff;border-radius:8px;">
          <tr><td style="padding:16px;">
            <p style="color:#1e40af;font-size:13px;font-weight:bold;margin:0 0 5px;">Security Notice</p>
            <p style="color:#475569;font-size:12px;line-height:20px;margin:0;">
              If you did not request this code, please ignore this email. Do not share your verification code with anyone.
            </p>
          </td></tr>
        </table>
      </td></tr>
      <tr><td class="footer">
        <p style="color:#334155;font-size:13px;font-weight:bold;margin:0 0 6px;">LibList</p>
        <p style="color:#94a3b8;font-size:11px;line-height:18px;margin:0;">
          © ${new Date().getFullYear()} LibList. All rights reserved.
        </p>
      </td></tr>
    </table>
  </td></tr>
</table>
</body>
</html>
`;

const signupApprovedTemplate = (param, emailParam, passwordParam, loginUrlParam) => {
    let name = '';
    let email = '';
    let password = '';
    let loginUrl = process.env.CLIENT_URL || 'http://localhost:5173';

    if (typeof param === 'object' && param !== null) {
        name = param.name || param.user_name || param.email || 'User';
        email = param.email || param.user_email || '';
        password = param.password || '';
        loginUrl = param.loginUrl || loginUrl;
    } else {
        name = param || 'User';
        email = emailParam || '';
        password = passwordParam || '';
        loginUrl = loginUrlParam || loginUrl;
    }

    const credentialsSection = password ? `
        <table width="100%" role="presentation" style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;margin-bottom:24px;">
          <tr><td style="padding:22px 24px;">
            <p style="color:#475569;font-size:12px;font-weight:bold;letter-spacing:1px;text-transform:uppercase;margin:0 0 14px;">Your Login Credentials</p>
            <table width="100%" role="presentation" style="font-size:14px;color:#1e293b;">
              <tr>
                <td style="padding:6px 0;color:#64748b;width:120px;font-weight:600;">Email ID:</td>
                <td style="padding:6px 0;font-weight:700;color:#0f172a;word-break:break-all;">${email}</td>
              </tr>
              <tr>
                <td style="padding:6px 0;color:#64748b;width:120px;font-weight:600;">Password:</td>
                <td style="padding:6px 0;font-family:monospace;font-size:15px;font-weight:700;color:#1d4ed8;letter-spacing:1px;">${password}</td>
              </tr>
            </table>
          </td></tr>
        </table>
    ` : `
        <table width="100%" role="presentation" style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;margin-bottom:24px;">
          <tr><td style="padding:20px 24px;">
            <p style="color:#475569;font-size:12px;font-weight:bold;letter-spacing:1px;text-transform:uppercase;margin:0 0 10px;">Your Registered Email</p>
            <p style="color:#0f172a;font-size:15px;font-weight:700;margin:0;">${email}</p>
          </td></tr>
        </table>
    `;

    return `
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Account Approved – LibList</title>
<style>
  body { margin:0; padding:0; background:#f1f5f9; font-family:Arial,Helvetica,sans-serif; }
  .footer { background:#f8fafc; padding:25px 35px; text-align:center; }
  .btn-login { display:inline-block; padding:12px 32px; background:#2563eb; color:#ffffff !important; text-decoration:none; font-weight:600; font-size:14px; border-radius:6px; }
</style>
</head>
<body>
<table width="100%" style="background:#f1f5f9;padding:40px 15px;" role="presentation">
  <tr><td align="center">
    <table width="600" style="background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 4px 6px -1px rgba(0,0,0,0.05);" role="presentation">
      <tr><td style="height:4px;background:#2563eb;"></td></tr>
      <tr><td style="padding:40px;">
        <h1 style="color:#172554;font-size:24px;text-align:center;margin:0 0 12px;">Your Account Request Was Approved!</h1>
        <p style="color:#64748b;font-size:15px;text-align:center;line-height:24px;margin:0 0 28px;">
          Hi <strong style="color:#0f172a;">${name}</strong>,<br><br>
          Great news! An administrator has approved your LibList signup request. Your account is now active and ready for use.
        </p>

        ${credentialsSection}

        <table width="100%" role="presentation" style="background:#ecfdf5;border:1px solid #a7f3d0;border-radius:10px;margin-bottom:24px;">
          <tr><td style="padding:16px 20px;">
            <p style="color:#065f46;font-size:14px;font-weight:700;margin:0 0 6px;">
              Change Password in Portal
            </p>
            <p style="color:#047857;font-size:13px;line-height:20px;margin:0;">
              You can change your password anytime after logging into the portal by going to <strong>Settings &gt; Profile &amp; Security</strong>. For your account security, we recommend changing this temporary password upon your first sign-in.
            </p>
          </td></tr>
        </table>

        <table width="100%" role="presentation" style="text-align:center;">
          <tr><td>
            <a href="${loginUrl}" target="_blank" class="btn-login" style="display:inline-block;padding:12px 34px;background:#2563eb;color:#ffffff;text-decoration:none;font-weight:bold;font-size:14px;border-radius:6px;">
              Log In to LibList
            </a>
          </td></tr>
        </table>
      </td></tr>
      <tr><td class="footer">
        <p style="color:#334155;font-size:13px;font-weight:bold;margin:0 0 6px;">LibList</p>
        <p style="color:#94a3b8;font-size:11px;line-height:18px;margin:0;">
          © ${new Date().getFullYear()} LibList. All rights reserved.
        </p>
      </td></tr>
    </table>
  </td></tr>
</table>
</body>
</html>
`;
};

module.exports = {
    onboardEmailtemplate,
    passwordResetTemplate,
    signupOtpTemplate,
    signupApprovedTemplate
};

import nodemailer from 'nodemailer'
import { EMAIL_USER, EMAIL_PASS, CLIENT_URL, NODE_ENV } from '../config/env.js'

// ── Transporter ────────────────────────────────────────────────────────────────
// Uses Gmail App Password.  In test mode we swap to Ethereal (fake SMTP) so
// no real emails are sent and no credentials are required in CI.
const createTransporter = () => {
  if (NODE_ENV === 'test') {
    // Ethereal is auto-created per-run; messages are captured in memory only
    return nodemailer.createTransport({
      host: 'smtp.ethereal.email',
      port: 587,
      auth: { user: 'test@ethereal.email', pass: 'test' },
    })
  }

  return nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: EMAIL_USER,
      pass: EMAIL_PASS,   // Gmail App Password — NOT the account password
    },
  })
}

// ── Password-reset email ───────────────────────────────────────────────────────
// Sends a link that embeds a plain token (not hashed).
// The link is valid for 10 minutes; expiry is enforced server-side.
export const sendPasswordResetEmail = async (toEmail, resetToken) => {
  const resetUrl = `${CLIENT_URL}/reset-password?token=${resetToken}`

  const transporter = createTransporter()

  await transporter.sendMail({
    from:    `"SmartCart Support" <${EMAIL_USER}>`,
    to:      toEmail,
    subject: 'Reset your SmartCart password',
    html: `
      <div style="font-family:sans-serif;max-width:480px;margin:auto">
        <h2 style="color:#2563eb">Reset your password</h2>
        <p>We received a request to reset the password for your SmartCart account.</p>
        <p>Click the button below to choose a new password. This link expires in <strong>10 minutes</strong>.</p>
        <a href="${resetUrl}"
           style="display:inline-block;padding:12px 24px;background:#2563eb;color:#fff;
                  border-radius:6px;text-decoration:none;font-weight:bold;margin:16px 0">
          Reset Password
        </a>
        <p style="color:#6b7280;font-size:13px">
          If the button doesn't work, copy this link into your browser:<br>
          <a href="${resetUrl}" style="color:#2563eb">${resetUrl}</a>
        </p>
        <hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0">
        <p style="color:#9ca3af;font-size:12px">
          If you didn't request a password reset, you can safely ignore this email.
          Your password will not change.
        </p>
      </div>
    `,
    text: `Reset your SmartCart password\n\nVisit this link (expires in 10 min):\n${resetUrl}\n\nIf you didn't request this, ignore this email.`,
  })
}

// ── Password-changed security notification ────────────────────────────────────
// Sent to the account's stored email address after a successful password reset.
// This is a security alert — the user did not request this, so it warns them
// if someone else changed their password without their knowledge.
export const sendPasswordChangedEmail = async (toEmail) => {
  const transporter = createTransporter()

  await transporter.sendMail({
    from:    `"SmartCart Support" <${EMAIL_USER}>`,
    to:      toEmail,   // always the address on file — never the raw request input
    subject: 'Your SmartCart password was changed',
    html: `
      <div style="font-family:sans-serif;max-width:480px;margin:auto">
        <h2 style="color:#16a34a">Password changed successfully</h2>
        <p>The password for your SmartCart account was just changed.</p>
        <p>If <strong>you</strong> made this change, no action is needed.</p>
        <p style="color:#dc2626;font-weight:bold">
          If you did NOT change your password, your account may be compromised.
          Please <a href="${CLIENT_URL}/forgot-password" style="color:#dc2626">reset your password immediately</a>
          and contact our support team.
        </p>
        <hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0">
        <p style="color:#9ca3af;font-size:12px">
          This is an automated security notification from SmartCart.
        </p>
      </div>
    `,
    text: `Your SmartCart password was changed.\n\nIf you made this change, no action is needed.\n\nIf you did NOT change your password, reset it immediately at: ${CLIENT_URL}/forgot-password`,
  })
}

import crypto from 'crypto'
import User from '../models/User.js'
import { sendPasswordResetEmail, sendPasswordChangedEmail } from '../utils/emailService.js'
import { hash } from '../utils/hashPassword.js'
import { STATUS, ERRORS } from '../constants/httpConstants.js'
import { assertAccountActive } from './authService.js'

const err = (msg, code) => Object.assign(new Error(msg), { statusCode: code })

// Token expiry window — 10 minutes
const RESET_TOKEN_TTL_MS = 10 * 60 * 1000

// ── Step 1: Forgot password ────────────────────────────────────────────────────
// Generates a cryptographically random token, stores its SHA-256 hash on the user
// (never the raw token), then emails the raw token inside a link.
//
// Security notes:
//  • We always respond with 200 even when the email doesn't exist — prevents
//    user enumeration attacks.
//  • The raw token is ONLY in the email; the DB only stores the hash.
export const requestPasswordReset = async (email) => {
  const user = await User.findOne({ email: email.toLowerCase() })

  // Always succeed from the caller's perspective — prevents user enumeration
  if (!user) return

  // Generate a 32-byte (256-bit) random token
  const rawToken    = crypto.randomBytes(32).toString('hex')
  const hashedToken = crypto.createHash('sha256').update(rawToken).digest('hex')

  user.passwordResetToken   = hashedToken
  user.passwordResetExpires = new Date(Date.now() + RESET_TOKEN_TTL_MS)
  await user.save({ validateBeforeSave: false })

  try {
    await sendPasswordResetEmail(user.email, rawToken)
  } catch (emailErr) {
    // If email fails, clear the token so the user isn't stuck with an unusable token
    user.passwordResetToken   = null
    user.passwordResetExpires = null
    await user.save({ validateBeforeSave: false })
    throw err(ERRORS.EMAIL_SEND_FAILED, STATUS.INTERNAL_ERROR)
  }
}

// ── Step 2: Reset password ─────────────────────────────────────────────────────
// Client sends the raw token from the email link + the new password.
// We hash the raw token and do TWO separate lookups:
//   1. Find by hash only            → not found = tampered/wrong token (vague error)
//   2. Check expiry separately      → found but expired = clear "link expired" message
// This distinction is intentional: telling a user their token "expired" when
// the token hash doesn't exist at all would hint that valid tokens exist.
export const resetPassword = async (rawToken, newPassword) => {
  if (!rawToken) throw err(ERRORS.RESET_TOKEN_INVALID, STATUS.BAD_REQUEST)

  const hashedToken = crypto.createHash('sha256').update(rawToken).digest('hex')

  // Lookup 1: does this token hash exist at all?
  const user = await User.findOne({ passwordResetToken: hashedToken })
  if (!user) throw err(ERRORS.RESET_TOKEN_INVALID, STATUS.BAD_REQUEST)

  // Lookup 2: token exists but may be expired
  if (user.passwordResetExpires < Date.now()) {
    // Clear the stale token so DB stays clean; log internally
    user.passwordResetToken   = null
    user.passwordResetExpires = null
    await user.save({ validateBeforeSave: false })
    console.info(`[passwordReset] Expired token used for userId=${user._id}`)
    throw err(ERRORS.RESET_TOKEN_EXPIRED, STATUS.BAD_REQUEST)
  }

  assertAccountActive(user)

  // Token valid — update password on the account's stored email, not the request input
  const accountEmail = user.email   // always the address on file

  user.password             = await hash(newPassword)
  user.passwordChangedAt    = new Date()
  user.passwordResetToken   = null   // token consumed — single-use
  user.passwordResetExpires = null
  await user.save()

  // Send security notification to the account's registered email address
  // Non-fatal: password is already changed — don't fail the response if email errors
  sendPasswordChangedEmail(accountEmail).catch(e =>
    console.error(`[passwordReset] security email failed for userId=${user._id}:`, e.message)
  )

  return user
}

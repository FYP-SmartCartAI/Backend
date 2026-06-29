// ── oauthController.js ────────────────────────────────────────────────────────
// Handles OAuth redirect callbacks and session management.
// Passport strategies are configured in src/config/passport.js.
// The actual OAuth flow (redirect to provider, token exchange) is handled by
// Passport middleware — these controllers only deal with the post-auth step.

import generateToken from '../utils/generateToken.js'
import { CLIENT_URL } from '../config/env.js'
import { assertAccountActive } from '../services/authService.js'

// ── Google OAuth callback ─────────────────────────────────────────────────────
// Called after Passport's Google strategy has verified the user.
// req.user is populated by passport.authenticate('google', ...) middleware.
const redirectBlockedAccount = (res, user) => {
  const email = encodeURIComponent(user?.email || '')
  res.redirect(`${CLIENT_URL}/login?error=account_blocked&email=${email}`)
}

export const googleCallback = (req, res) => {
  try {
    assertAccountActive(req.user)
  } catch {
    return redirectBlockedAccount(res, req.user)
  }

  const token = generateToken(req.user._id)
  const user = {
    id: req.user._id,
    name: req.user.name,
    email: req.user.email,
    avatar: req.user.avatar,
    provider: req.user.provider,
    role: req.user.role,
  }
  const userEncoded = encodeURIComponent(JSON.stringify(user))
  res.redirect(`${CLIENT_URL}/oauth/callback?token=${token}&user=${userEncoded}`)
}

// ── Facebook OAuth callback ───────────────────────────────────────────────────
// Called after Passport's Facebook strategy has verified the user.
export const facebookCallback = (req, res) => {
  try {
    assertAccountActive(req.user)
  } catch {
    return redirectBlockedAccount(res, req.user)
  }

  const token = generateToken(req.user._id)
  const user = {
    id: req.user._id,
    name: req.user.name,
    email: req.user.email,
    avatar: req.user.avatar,
    provider: req.user.provider,
    role: req.user.role,
  }
  const userEncoded = encodeURIComponent(JSON.stringify(user))
  res.redirect(`${CLIENT_URL}/oauth/callback?token=${token}&user=${userEncoded}`)
}

// ── GET /api/oauth/me ─────────────────────────────────────────────────────────
// Returns the currently authenticated user (works for both JWT and OAuth tokens).
export const getMe = (req, res) => {
  const { _id, name, email, avatar, provider, role } = req.user
  res.json({
    success: true,
    data: { user: { id: _id, name, email, avatar, provider, role } },
  })
}

// ── POST /api/oauth/logout ────────────────────────────────────────────────────
// JWT is stateless — signals the client to discard its stored token.
// Also destroys the Passport session if one exists.
export const logout = (req, res) => {
  if (req.logout) req.logout(() => {})
  res.json({ success: true, message: 'Logged out — please delete your token on the client.' })
}

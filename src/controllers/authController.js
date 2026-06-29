import * as authService from '../services/authService.js'
import generateToken from '../utils/generateToken.js'
import { STATUS, ERRORS } from '../constants/httpConstants.js'
import User from '../models/User.js'
import * as passwordResetService from '../services/passwordResetService.js'

export const register = async (req, res, next) => {
  try {
    const user = await authService.registerUser(req.body)
    res.status(STATUS.CREATED).json({ token: generateToken(user._id), user: { id: user._id, name: user.name, email: user.email, role: user.role, city: user.city, avatar: user.avatar } })
  } catch (err) { next(err) }
}

export const login = async (req, res, next) => {
  try {
    const user = await authService.authenticate(req.body)
    res.json({ token: generateToken(user._id), user: { id: user._id, name: user.name, email: user.email, role: user.role, city: user.city, avatar: user.avatar } })
  } catch (err) { next(err) }
}

export const profile = async (req, res) => {
  const { _id, name, email, role, city, avatar, phone, address, provider } = req.user
  res.json({
    success: true,
    data: {
      user: { id: _id, name, email, role, city, avatar, phone, address, provider },
    },
  })
}

export const updateProfile = async (req, res, next) => {
  try {
    const user = await authService.updateProfile(req.user._id, req.body)
    const { _id, name, email, role, city, avatar, phone, address, provider } = user
    res.json({
      success: true,
      data: {
        user: { id: _id, name, email, role, city, avatar, phone, address, provider },
      },
    })
  } catch (err) { next(err) }
}

// ── POST /api/auth/avatar  (protect) ──────────────────────────────────────────
// avatarUpload.single('avatar') middleware runs before this handler.
// Cloudinary URL is already stored; just persist it on the user document.
export const uploadAvatar = async (req, res, next) => {
  try {
    if (!req.file) {
      return res.status(STATUS.BAD_REQUEST).json({ message: ERRORS.VALIDATION_FAILED })
    }

    const avatarUrl = req.file.path   // multer-storage-cloudinary sets file.path = secure_url

    const user = await User.findByIdAndUpdate(
      req.user._id,
      { avatar: avatarUrl },
      { returnDocument: 'after', runValidators: true },
    ).select('-password -passwordResetToken -passwordResetExpires')

    res.json({ success: true, data: { avatar: user.avatar } })
  } catch (err) {
    next(err)
  }
}

// ── POST /api/auth/forgot-password  (public) ──────────────────────────────────
// Body: { "email": "user@example.com" }
// Always returns 200 — prevents user enumeration.
export const forgotPassword = async (req, res, next) => {
  try {
    await passwordResetService.requestPasswordReset(req.body.email)
    // Respond the same way whether the email exists or not
    res.json({ success: true, message: 'If that email is registered, a reset link has been sent.' })
  } catch (err) {
    next(err)
  }
}

// ── POST /api/auth/reset-password  (public) ───────────────────────────────────
// Body: { "token": "<raw token from email>", "password": "<new password>" }
// Invalidates all existing JWTs for the user via passwordChangedAt.
export const resetPassword = async (req, res, next) => {
  try {
    const user = await passwordResetService.resetPassword(req.body.token, req.body.password)
    // Issue a fresh JWT so the user is immediately logged in after reset
    res.json({
      success: true,
      message: 'Password reset successful.',
      token:   generateToken(user._id),
    })
  } catch (err) {
    next(err)
  }
}

// ── POST /api/auth/change-password  (protect) ───────────────────────────────
export const changePassword = async (req, res, next) => {
  try {
    await authService.changePassword(req.user._id, req.body)
    res.json({ success: true, message: 'Password changed successfully' })
  } catch (err) {
    next(err)
  }
}

// ── POST /api/auth/fcm-token  (protect) ───────────────────────────────────────
// Body: { "fcmToken": "<device token>" }  — pass null or omit to clear the token.
// Called by the mobile/web client after login or when the device token refreshes.
// Stores the FCM registration token so push notifications can be sent to this device.
export const registerFcmToken = async (req, res, next) => {
  try {
    const { fcmToken } = req.body   // may be null/undefined to clear
    const user = await authService.registerFcmToken(req.user._id, fcmToken ?? null)
    res.json({ success: true, data: { fcmToken: user.fcmToken } })
  } catch (err) {
    next(err)
  }
}

// ── POST /api/auth/logout  (protect) ──────────────────────────────────────────
// Clears the FCM token so no push notifications are sent after logout.
// JWT is stateless — the client must delete the token from localStorage/cookies.
export const logout = async (req, res, next) => {
  try {
    // Clear FCM token — deregisters the device from Firebase push notifications
    await User.findByIdAndUpdate(req.user._id, { $set: { fcmToken: null } })
    console.info(`[auth] User ${req.user._id} logged out — FCM token cleared`)
    res.json({ success: true, data: null, message: 'Logged out successfully' })
  } catch (err) {
    next(err)
  }
}

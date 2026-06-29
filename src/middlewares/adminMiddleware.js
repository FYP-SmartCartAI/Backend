import { STATUS, ERRORS } from '../constants/httpConstants.js'

// ── adminOnly ─────────────────────────────────────────────────────────────────
// Allows ONLY role === 'admin'. Blocks subadmins and users.
// Use on: delete tickets, promote/demote subadmins, view all orders, etc.
export const adminOnly = (req, res, next) => {
  if (!req.user)                   return res.status(STATUS.UNAUTHORIZED).json({ success: false, message: ERRORS.NOT_AUTHORIZED })
  if (req.user.role !== 'admin')   return res.status(STATUS.FORBIDDEN).json({ success: false, message: ERRORS.ADMIN_ONLY })
  next()
}

// ── subAdmin ──────────────────────────────────────────────────────────────────
// Allows ONLY role === 'subadmin'. Blocks admins and users.
// Use on: routes exclusive to subadmins (e.g. close tickets in their city).
export const subAdmin = (req, res, next) => {
  if (!req.user)                      return res.status(STATUS.UNAUTHORIZED).json({ success: false, message: ERRORS.NOT_AUTHORIZED })
  if (req.user.role !== 'subadmin')   return res.status(STATUS.FORBIDDEN).json({ success: false, message: ERRORS.ADMIN_ONLY })
  next()
}

// ── admin (backwards-compatible) ──────────────────────────────────────────────
// Allows role === 'admin' OR role === 'subadmin'.
// Keeps all existing routes working without changes.
// Use on: routes both admin and subadmin can access.
export const admin = (req, res, next) => {
  if (!req.user)                                                   return res.status(STATUS.UNAUTHORIZED).json({ success: false, message: ERRORS.NOT_AUTHORIZED })
  if (req.user.role !== 'admin' && req.user.role !== 'subadmin')   return res.status(STATUS.FORBIDDEN).json({ success: false, message: ERRORS.ADMIN_ONLY })
  next()
}

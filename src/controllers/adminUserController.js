import * as adminUserService from '../services/adminUserService.js'

// ── GET /api/admin/users ───────────────────────────────────────────────────────
export const listUsers = async (req, res, next) => {
  try {
    const result = await adminUserService.listUsers(req.query)
    res.json({ success: true, data: result })
  } catch (err) { next(err) }
}

// ── GET /api/admin/users/:id ───────────────────────────────────────────────────
export const getUser = async (req, res, next) => {
  try {
    const user = await adminUserService.getUserById(req.params.id)
    res.json({ success: true, data: { user } })
  } catch (err) { next(err) }
}

// ── PATCH /api/admin/users/:id/block ──────────────────────────────────────────
export const blockUser = async (req, res, next) => {
  try {
    const user    = await adminUserService.toggleBlockUser(req.params.id)
    const message = user.isBlocked ? 'User blocked' : 'User unblocked'
    res.json({ success: true, data: { user }, message })
  } catch (err) { next(err) }
}

// ── DELETE /api/admin/users/:id ───────────────────────────────────────────────
export const deleteUser = async (req, res, next) => {
  try {
    await adminUserService.deleteUser(req.params.id)
    res.json({ success: true, data: null, message: 'User and all related data deleted' })
  } catch (err) { next(err) }
}

// ── POST /api/admin/users ──────────────────────────────────────────────────────
export const createUser = async (req, res, next) => {
  try {
    const user = await adminUserService.createUser(req.body)
    res.status(201).json({ success: true, data: { user } })
  } catch (err) { next(err) }
}

// ── PATCH /api/admin/users/:id/role ───────────────────────────────────────────
export const updateUserRole = async (req, res, next) => {
  try {
    const user = await adminUserService.updateUserRole(req.params.id, req.user._id, req.body)
    res.json({ success: true, data: { user }, message: `Role updated to ${user.role}` })
  } catch (err) { next(err) }
}

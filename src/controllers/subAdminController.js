import * as subAdminService from '../services/subAdminService.js'
import { STATUS } from '../constants/httpConstants.js'

// POST /api/admin/subadmins/:userId/promote
export const promote = async (req, res, next) => {
  try {
    const user = await subAdminService.promoteToSubAdmin(req.params.userId, req.body.city)
    res.status(STATUS.OK).json({ success: true, data: user })
  } catch (err) { next(err) }
}

// DELETE /api/admin/subadmins/:userId/demote
export const demote = async (req, res, next) => {
  try {
    const user = await subAdminService.demoteSubAdmin(req.params.userId)
    res.json({ success: true, data: user })
  } catch (err) { next(err) }
}

// GET /api/admin/subadmins
export const list = async (req, res, next) => {
  try {
    const subAdmins = await subAdminService.getSubAdmins()
    res.json({ success: true, data: subAdmins })
  } catch (err) { next(err) }
}

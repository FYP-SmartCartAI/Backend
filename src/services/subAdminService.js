import User from '../models/User.js'
import Ticket from '../models/Ticket.js'
import { STATUS, ERRORS } from '../constants/httpConstants.js'

const err = (msg, code) => Object.assign(new Error(msg), { statusCode: code })

// ── Promote a user to sub-admin ───────────────────────────────────────────────
// Only main admin can call this.
// Sets role = 'subadmin' and stores the city this sub-admin will manage.
export const promoteToSubAdmin = async (userId, city) => {
  if (!city?.trim()) throw err(ERRORS.SUBADMIN_CITY_REQUIRED, STATUS.BAD_REQUEST)

  const user = await User.findById(userId)
  if (!user) throw err(ERRORS.USER_NOT_FOUND, STATUS.NOT_FOUND)
  if (user.role === 'admin') throw err(ERRORS.CANNOT_DEMOTE_ADMIN, STATUS.CONFLICT)
  if (user.role === 'subadmin') throw err(ERRORS.ALREADY_SUBADMIN, STATUS.CONFLICT)

  user.role = 'subadmin'
  user.city = city.trim().toLowerCase()
  await user.save()
  return user
}

// ── Demote a sub-admin back to regular user ───────────────────────────────────
export const demoteSubAdmin = async (userId) => {
  const user = await User.findById(userId)
  if (!user) throw err(ERRORS.USER_NOT_FOUND, STATUS.NOT_FOUND)
  if (user.role === 'admin')    throw err(ERRORS.CANNOT_DEMOTE_ADMIN, STATUS.CONFLICT)
  if (user.role !== 'subadmin') throw err(ERRORS.USER_NOT_SUBADMIN, STATUS.CONFLICT)

  await Ticket.updateMany({ assignedTo: user._id }, { $set: { assignedTo: null } })

  user.role = 'user'
  user.city = null
  await user.save()
  return user
}

// ── List all sub-admins ───────────────────────────────────────────────────────
export const getSubAdmins = async () => {
  return User.find({ role: 'subadmin' }).select('_id name email avatar city isBlocked createdAt').sort({ city: 1 })
}

// ── Find sub-admin by city (used by ticket auto-routing) ──────────────────────
// Returns null if no sub-admin exists for that city — caller falls back to main admin.
export const getSubAdminByCity = async (city) => {
  if (!city) return null
  return User.findOne({ role: 'subadmin', city: city.trim().toLowerCase() }).select('_id name email city role')
}

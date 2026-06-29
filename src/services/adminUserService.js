import User from '../models/User.js'
import Order from '../models/Order.js'
import BehaviorLog from '../models/BehaviorLog.js'
import Cart from '../models/Cart.js'
import Wishlist from '../models/Wishlist.js'
import Review from '../models/Review.js'
import Notification from '../models/Notification.js'
import Ticket from '../models/Ticket.js'
import { STATUS, ERRORS } from '../constants/httpConstants.js'
import mongoose from 'mongoose'
import { hash } from '../utils/hashPassword.js'
import { validateEmailReputation } from '../utils/emailReputationService.js'

const err = (msg, code) => Object.assign(new Error(msg), { statusCode: code })

// Escape regex special characters to prevent ReDoS
const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

// ── GET /api/admin/users ───────────────────────────────────────────────────────
// Returns paginated regular users (role = 'user') with optional search.
export const listUsers = async (query) => {
  const { page = 1, limit = 20, search } = query || {}
  const safePage  = Math.max(1, parseInt(page) || 1)
  const safeLimit = Math.min(Math.max(1, parseInt(limit) || 20), 100)

  // Return regular users and sub-admins; main admins are never listed here
  const filter = { role: { $in: ['user', 'subadmin'] } }

  if (search && typeof search === 'string') {
    const escaped = escapeRegex(search)
    filter.$or = [
      { name:  { $regex: escaped, $options: 'i' } },
      { email: { $regex: escaped, $options: 'i' } },
    ]
  }

  const [users, total] = await Promise.all([
    User.find(filter)
      .select('_id name email avatar isBlocked createdAt provider role city')
      .sort({ createdAt: -1 })
      .skip((safePage - 1) * safeLimit)
      .limit(safeLimit),
    User.countDocuments(filter),
  ])

  return {
    users,
    pagination: {
      page:  safePage,
      limit: safeLimit,
      total,
      pages: Math.ceil(total / safeLimit),
    },
  }
}

// ── GET /api/admin/users/:id ───────────────────────────────────────────────────
// Returns a single user with computed activity stats.
export const getUserById = async (id) => {
  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw err(ERRORS.USER_NOT_FOUND, STATUS.NOT_FOUND)
  }

  const user = await User.findById(id).select('-password -passwordResetToken -passwordResetExpires')
  if (!user) throw err(ERRORS.USER_NOT_FOUND, STATUS.NOT_FOUND)

  // Compute stats in parallel
  const [orderCount, behaviorCount, revenueResult] = await Promise.all([
    Order.countDocuments({ user: id }),
    BehaviorLog.countDocuments({ userId: id }),
    Order.aggregate([
      { $match: { user: new mongoose.Types.ObjectId(id), paymentStatus: 'paid' } },
      { $group: { _id: null, total: { $sum: '$total' } } },
    ]),
  ])

  const totalSpent = revenueResult[0]?.total ?? 0

  return {
    ...user.toObject(),
    orderCount,
    behaviorCount,
    totalSpent,
  }
}

// ── PATCH /api/admin/users/:id/block ──────────────────────────────────────────
// Toggles the isBlocked flag on a user. Cannot block another admin.
export const toggleBlockUser = async (id) => {
  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw err(ERRORS.USER_NOT_FOUND, STATUS.NOT_FOUND)
  }

  const user = await User.findById(id).select('-password -passwordResetToken -passwordResetExpires')
  if (!user) throw err(ERRORS.USER_NOT_FOUND, STATUS.NOT_FOUND)

  // Cannot block an admin
  if (user.role === 'admin') {
    throw err('Cannot block an admin account', STATUS.FORBIDDEN)
  }

  user.isBlocked = !user.isBlocked
  await user.save()

  return user
}

// ── DELETE /api/admin/users/:id ───────────────────────────────────────────────
// Hard-deletes a user and ALL their related data atomically.
// Cannot delete an admin account.
export const deleteUser = async (id) => {
  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw err(ERRORS.USER_NOT_FOUND, STATUS.NOT_FOUND)
  }

  const user = await User.findById(id)
  if (!user) throw err(ERRORS.USER_NOT_FOUND, STATUS.NOT_FOUND)

  // Cannot delete an admin
  if (user.role === 'admin') {
    throw err('Cannot delete an admin account', STATUS.FORBIDDEN)
  }

  const objectId = new mongoose.Types.ObjectId(id)

  if (user.role === 'subadmin') {
    await Ticket.updateMany({ assignedTo: objectId }, { $set: { assignedTo: null } })
  }

  // Delete all related data in parallel, then delete the user
  await Promise.all([
    Order.deleteMany({ user: objectId }),
    BehaviorLog.deleteMany({ userId: objectId }),
    Cart.deleteOne({ user: objectId }),
    Wishlist.deleteOne({ userId: objectId }),
    Review.deleteMany({ user: objectId }),
    Notification.deleteMany({ recipientId: objectId }),
    Ticket.deleteMany({ userId: objectId }),
  ])

  await User.deleteOne({ _id: objectId })

  return true
}

// ── POST /api/admin/users ───────────────────────────────────────────────────────
// Direct creation of User, Subadmin, or Admin by an administrator.
export const createUser = async ({ name, email, password, role, city }) => {
  await validateEmailReputation(email)

  const existing = await User.findOne({ email })
  if (existing) throw err(ERRORS.EMAIL_TAKEN, STATUS.CONFLICT)

  const hashedPassword = await hash(password)
  const newUser = await User.create({
    name,
    email,
    password: hashedPassword,
    role,
    city: role === 'subadmin' ? city?.trim().toLowerCase() : null,
    isVerified: true,
  })

  const userObj = newUser.toObject()
  delete userObj.password
  return userObj
}

// ── PATCH /api/admin/users/:id/role ──────────────────────────────────────────
// Change a user's role. Admin-only. Cannot change own role.
export const updateUserRole = async (targetId, requestingAdminId, { role, city }) => {
  if (!mongoose.Types.ObjectId.isValid(targetId)) {
    throw err(ERRORS.USER_NOT_FOUND, STATUS.NOT_FOUND)
  }

  if (targetId === String(requestingAdminId)) {
    throw err('You cannot change your own role', STATUS.FORBIDDEN)
  }

  const validRoles = ['user', 'subadmin', 'admin']
  if (!validRoles.includes(role)) {
    throw err('Invalid role', STATUS.BAD_REQUEST)
  }

  if (role === 'subadmin' && !city?.trim()) {
    throw err(ERRORS.SUBADMIN_CITY_REQUIRED, STATUS.BAD_REQUEST)
  }

  const user = await User.findById(targetId)
  if (!user) throw err(ERRORS.USER_NOT_FOUND, STATUS.NOT_FOUND)

  const previousRole = user.role

  // If demoting from subadmin, clear their ticket assignments
  if (previousRole === 'subadmin' && role !== 'subadmin') {
    await Ticket.updateMany({ assignedTo: user._id }, { $set: { assignedTo: null } })
  }

  user.role = role
  user.city = role === 'subadmin' ? city.trim().toLowerCase() : null
  await user.save()

  return user
}

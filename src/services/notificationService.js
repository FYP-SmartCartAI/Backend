import Notification from '../models/Notification.js'
import User from '../models/User.js'
import { sendToUser } from '../utils/notificationService.js'
import { STATUS, ERRORS } from '../constants/httpConstants.js'

const err = (msg, code) => Object.assign(new Error(msg), { statusCode: code })

// Find all admins and notify them (fire-and-forget safe)
export const notifyAllAdmins = async (payload) => {
  try {
    const admins = await User.find({ role: 'admin' }).select('_id')
    await Promise.all(admins.map(a => createAndNotify({ ...payload, recipientId: a._id })))
  } catch (e) {
    console.error('[notificationService] notifyAllAdmins failed:', e.message)
  }
}

// Find subadmin(s) by city and notify (fire-and-forget safe)
export const notifySubadminsByCity = async (city, payload) => {
  if (!city) return
  try {
    const escaped = city.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const subadmins = await User.find({
      role: 'subadmin',
      city: new RegExp(`^${escaped}$`, 'i'),
    }).select('_id')
    await Promise.all(subadmins.map(s => createAndNotify({ ...payload, recipientId: s._id })))
  } catch (e) {
    console.error('[notificationService] notifySubadminsByCity failed:', e.message)
  }
}

// ── Shared helpers ────────────────────────────────────────────────────────────

export const formatOrderRef = (order) => {
  if (order?.orderNumber) return `#${order.orderNumber}`
  const id = order?._id?.toString() || ''
  return id ? `#${id.slice(-6).toUpperCase()}` : 'your order'
}

const formatStatusLabel = (status) => {
  const labels = {
    pending:       'placed',
    processing:    'processing',
    shipped:       'shipped',
    delivered:     'delivered',
    cancelled:     'cancelled',
    cod_collected: 'COD collected',
  }
  return labels[status] || status.replace(/_/g, ' ')
}

/**
 * Persist to inbox (triggers Socket.io via model hook) + optional FCM push.
 * Fire-and-forget safe — logs errors, never throws to callers.
 */
export const createAndNotify = async ({
  recipientId,
  type,
  title,
  body,
  refId     = null,
  refModel  = null,
  channel   = 'both',
  data      = {},
}) => {
  if (!recipientId) return null

  try {
    const notification = await Notification.create({
      recipientId,
      type,
      title,
      body,
      refId,
      refModel,
      channel,
    })

    if (channel === 'firebase' || channel === 'both') {
      sendToUser(recipientId, {
        title,
        body,
        data: {
          ...data,
          type,
          notificationId: notification._id.toString(),
          ...(refId && { refId: refId.toString() }),
        },
      }).catch(() => {})
    }

    return notification
  } catch (e) {
    console.error('[notificationService] createAndNotify failed:', e.message)
    return null
  }
}

export const notifyOrderStatusChange = (order, newStatus) =>
  createAndNotify({
    recipientId: order.userId,
    type:        'order_status',
    title:       '📦 Order Update',
    body:        `Your order ${formatOrderRef(order)} is now ${formatStatusLabel(newStatus)}.`,
    refId:       order._id,
    refModel:    'Order',
    data:        { orderId: order._id.toString(), status: newStatus, screen: 'orders' },
  })

// ── GET /api/notifications ────────────────────────────────────────────────────
export const getUserNotifications = async (userId, query) => {
  const { page = 1, limit = 20, isRead } = query || {}

  const safePage  = Math.max(1, parseInt(page) || 1)
  const safeLimit = Math.min(Math.max(1, parseInt(limit) || 20), 50)

  const filter = { recipientId: userId }

  // Optional isRead filter — accepts 'true' or 'false' as query string
  if (isRead === 'true')  filter.isRead = true
  if (isRead === 'false') filter.isRead = false

  const [notifications, total, unreadCount] = await Promise.all([
    Notification.find(filter)
      .sort({ createdAt: -1 })
      .skip((safePage - 1) * safeLimit)
      .limit(safeLimit),
    Notification.countDocuments(filter),
    Notification.countDocuments({ recipientId: userId, isRead: false }),
  ])

  return {
    notifications,
    pagination: {
      page:  safePage,
      limit: safeLimit,
      total,
      pages: Math.ceil(total / safeLimit),
    },
    unreadCount,
  }
}

// Helper to push updated unread counts to the user in real-time
const emitUnreadCount = async (userId) => {
  try {
    const { getIO } = await import('../config/socket.js')
    const io = getIO()
    const count = await Notification.countDocuments({ recipientId: userId, isRead: false })
    io.to(`user_${userId.toString()}`).emit('unread_count_update', { count })
  } catch (e) {
    console.error(`[notificationService] emitUnreadCount socket error:`, e.message)
  }
}

// ── PATCH /api/notifications/:id/read ─────────────────────────────────────────
export const markAsRead = async (notificationId, userId) => {
  const notification = await Notification.findOneAndUpdate(
    { _id: notificationId, recipientId: userId },
    { $set: { isRead: true, readAt: new Date() } },
    { returnDocument: 'after' }
  )

  if (!notification) {
    throw err('Notification not found', STATUS.NOT_FOUND)
  }

  // Update unread count over socket
  emitUnreadCount(userId).catch(() => {})

  return notification
}

// ── PATCH /api/notifications/read-all ─────────────────────────────────────────
export const markAllAsRead = async (userId) => {
  const result = await Notification.updateMany(
    { recipientId: userId, isRead: false },
    { $set: { isRead: true, readAt: new Date() } }
  )

  // Update unread count over socket
  emitUnreadCount(userId).catch(() => {})

  return { updated: result.modifiedCount }
}

// ── DELETE /api/notifications/:id ─────────────────────────────────────────────
export const deleteNotification = async (notificationId, userId) => {
  const notification = await Notification.findOneAndDelete({
    _id:         notificationId,
    recipientId: userId,
  })

  if (!notification) {
    throw err('Notification not found', STATUS.NOT_FOUND)
  }

  // Update unread count over socket
  emitUnreadCount(userId).catch(() => {})

  return notification
}

export const getUnreadCount = async (userId) => {
  const count = await Notification.countDocuments({ recipientId: userId, isRead: false })
  return { count }
}

import * as notificationSvc from '../services/notificationService.js'

// ── GET /api/notifications ────────────────────────────────────────────────────
// Query: page, limit, isRead
export const getNotifications = async (req, res, next) => {
  try {
    const result = await notificationSvc.getUserNotifications(req.user._id, req.query)
    res.json({
      success: true,
      data: {
        notifications: result.notifications,
        pagination:    result.pagination,
        unreadCount:   result.unreadCount,
      },
    })
  } catch (err) { next(err) }
}

// ── PATCH /api/notifications/:id/read ─────────────────────────────────────────
export const markAsRead = async (req, res, next) => {
  try {
    const notification = await notificationSvc.markAsRead(req.params.id, req.user._id)
    res.json({ success: true, data: { notification } })
  } catch (err) { next(err) }
}

// ── PATCH /api/notifications/read-all ─────────────────────────────────────────
export const markAllAsRead = async (req, res, next) => {
  try {
    const result = await notificationSvc.markAllAsRead(req.user._id)
    res.json({ success: true, data: { updated: result.updated } })
  } catch (err) { next(err) }
}

// ── DELETE /api/notifications/:id ─────────────────────────────────────────────
export const deleteNotification = async (req, res, next) => {
  try {
    await notificationSvc.deleteNotification(req.params.id, req.user._id)
    res.json({ success: true, data: null, message: 'Notification deleted' })
  } catch (err) { next(err) }
}

export const getUnreadCount = async (req, res, next) => {
  try {
    const result = await notificationSvc.getUnreadCount(req.user._id)
    res.json({ success: true, data: result })
  } catch (err) { next(err) }
}

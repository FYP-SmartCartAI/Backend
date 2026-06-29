import mongoose from 'mongoose'

// ── Notification model ────────────────────────────────────────────────────────
// Stores push notification records sent to users.
// Supports in-app notification inbox (GET /api/notifications).
//
// Sources:
//   • abandoned_cart  — cron job sends when cart is idle > 1 hour
//   • order_status    — order status changes (shipped, delivered, etc.)
//   • ticket_reply    — user receives reply on their ticket
//   • new_message     — new message in a ticket thread
//   • payment         — payment confirmed / failed
//   • ticket_assigned — subadmin receives a new ticket assignment
//   • general         — ad-hoc admin notifications

const notificationSchema = new mongoose.Schema({
  recipientId: {
    type:     mongoose.Schema.Types.ObjectId,
    ref:      'User',
    required: true,
    index:    true,
  },

  type: {
    type: String,
    enum: [
      'order_status',    // order shipped, delivered, cod_collected, etc.
      'abandoned_cart',  // cron job reminder for idle cart
      'ticket_reply',    // user receives a reply on their support ticket
      'new_message',     // new message in a ticket thread (for staff)
      'payment',         // payment success or failure notification
      'ticket_assigned', // subadmin receives a new ticket assignment
      'general',         // ad-hoc notifications from admin
      'new_order',       // admin/subadmin notification for new order placement
      'new_ticket',      // admin/subadmin notification for new ticket opened
      'low_stock',       // admin alert for low stock on products
      'out_of_stock',    // admin alert for out of stock products
      'cod_collected_admin', // admin alert when COD payment is collected
      'unresolved_ticket',   // admin alert when ticket remains open > 24h
    ],
    required: true,
  },

  title: { type: String, required: true },
  body:  { type: String, required: true },

  // ── Optional reference to the triggering resource ─────────────────────────
  refId:    { type: mongoose.Schema.Types.ObjectId, default: null },
  refModel: {
    type: String,
    enum: ['Order', 'Ticket', 'Cart', 'Payment', 'Product', null],
    default: null,
  },

  // ── Read state ─────────────────────────────────────────────────────────────
  isRead: { type: Boolean, default: false, index: true },
  readAt: { type: Date,    default: null },

  // ── Delivery channel ───────────────────────────────────────────────────────
  channel: {
    type: String,
    enum: ['firebase', 'socket', 'both'],
    default: 'firebase',
  },
}, {
  timestamps: true,
})

// ── Indexes ───────────────────────────────────────────────────────────────────
// Primary query: unread notifications for a user, newest first
notificationSchema.index({ recipientId: 1, createdAt: -1 })
notificationSchema.index({ recipientId: 1, isRead: 1 })

// ── Mongoose post-save hook for real-time Socket.io dispatch ───────────────────
notificationSchema.post('save', async function (doc) {
  try {
    const { getIO } = await import('../config/socket.js')
    const io = getIO()

    const notificationData = doc.toObject()

    // 1. Emit the new notification payload to the user's private socket room
    io.to(`user_${doc.recipientId.toString()}`).emit('new_notification', notificationData)

    // 2. Fetch the updated unread count and emit it
    const unreadCount = await doc.constructor.countDocuments({
      recipientId: doc.recipientId,
      isRead: false,
    })
    io.to(`user_${doc.recipientId.toString()}`).emit('unread_count_update', { count: unreadCount })

    console.info(`[Socket] Dispatched real-time notification to user_${doc.recipientId}: "${doc.title}"`)
  } catch (err) {
    // Avoid crashing if Socket.io is not initialized (e.g. during script runs)
    console.error('[Notification Schema post-save] Socket emission failed:', err.message)
  }
})

export default mongoose.model('Notification', notificationSchema)

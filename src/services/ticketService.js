import Ticket from '../models/Ticket.js'
import Order from '../models/Order.js'
import User from '../models/User.js'
import { getSubAdminByCity } from './subAdminService.js'
import { getIO } from '../config/socket.js'
import { STATUS, ERRORS } from '../constants/httpConstants.js'
import { createAndNotify, notifyAllAdmins, notifySubadminsByCity } from './notificationService.js'
import { sendToUser } from '../utils/notificationService.js'

const err = (msg, code) => Object.assign(new Error(msg), { statusCode: code })

// Maximum messages allowed per ticket (prevents 16 MB MongoDB document limit)
const MAX_MESSAGES_PER_TICKET = 500

// ── Helper: resolve city for a new ticket ─────────────────────────────────────
// Priority: orderId.shippingAddress.city > user.address.city
// A city is required — if neither exists the ticket cannot be routed.
const resolveCity = async (userId, orderId) => {
  if (orderId) {
    const order = await Order.findById(orderId).select('shippingAddress.city userId')
    if (!order) throw err(ERRORS.ORDER_NOT_FOUND, STATUS.NOT_FOUND)
    if (order.userId.toString() !== userId.toString())
      throw err(ERRORS.NOT_AUTHORIZED, STATUS.FORBIDDEN)
    const city = order.shippingAddress?.city?.trim().toLowerCase()
    if (city) return city
  }

  const user = await User.findById(userId).select('address')
  const city = user?.address?.city?.trim().toLowerCase()
  if (!city) throw err(ERRORS.TICKET_CITY_REQUIRED, STATUS.BAD_REQUEST)
  return city
}

// ── Create ticket ─────────────────────────────────────────────────────────────
// Auto-detects city, auto-assigns subadmin.
// Falls back to main admin assignment (assignedTo: null) if no subadmin for city.
export const createTicket = async (userId, { orderId, subject, message }) => {
  if (!message?.trim()) throw err(ERRORS.TICKET_MESSAGE_REQUIRED, STATUS.BAD_REQUEST)

  const city      = await resolveCity(userId, orderId)
  const subAdmin  = await getSubAdminByCity(city)   // null if none assigned
  const user      = await User.findById(userId).select('role')

  const ticket = await Ticket.create({
    userId,
    orderId:    orderId || null,
    subject:    subject?.trim() || '',
    city,
    assignedTo: subAdmin?._id || null,
    messages: [{
      sender:     userId,
      senderRole: user.role,
      text:       message.trim(),
    }],
  })

  // Trigger staff notifications for new ticket
  const ticketSubject = ticket.subject || 'Support Ticket'
  notifyAllAdmins({
    type: 'new_ticket',
    title: '🎫 New Support Ticket',
    body: `New ticket "${ticketSubject}" opened by customer in ${city}.`,
    refId: ticket._id,
    refModel: 'Ticket',
    data: { ticketId: ticket._id.toString(), screen: 'support' }
  }).catch(() => {})

  notifySubadminsByCity(city, {
    type: 'new_ticket',
    title: '🎫 New Ticket in Your City',
    body: `New support ticket "${ticketSubject}" opened in ${city}.`,
    refId: ticket._id,
    refModel: 'Ticket',
    data: { ticketId: ticket._id.toString(), screen: 'support' }
  }).catch(() => {})

  return ticket.populate([
    { path: 'userId',     select: 'name email' },
    { path: 'assignedTo', select: 'name email city' },
  ])
}

// ── Send a message ────────────────────────────────────────────────────────────
// Appends to messages array, sets status → in_progress if it was open,
// then emits the new message to all sockets in the ticket room.
export const sendMessage = async (ticketId, sender, text) => {
  if (!text?.trim()) throw err(ERRORS.TICKET_MESSAGE_REQUIRED, STATUS.BAD_REQUEST)

  const ticket = await Ticket.findById(ticketId)
  if (!ticket) throw err(ERRORS.TICKET_NOT_FOUND, STATUS.NOT_FOUND)
  if (ticket.status === 'closed') throw err(ERRORS.TICKET_CLOSED, STATUS.CONFLICT)

  // Guard against unbounded message arrays (MongoDB 16 MB document limit)
  if (ticket.messages.length >= MAX_MESSAGES_PER_TICKET)
    throw err(ERRORS.TICKET_TOO_MANY_MESSAGES, STATUS.CONFLICT)

  // Permission: user can only message their own ticket;
  //             subadmin can only message tickets in their city;
  //             admin can message any ticket.
  if (sender.role === 'user' && ticket.userId.toString() !== sender.id)
    throw err(ERRORS.NOT_AUTHORIZED, STATUS.FORBIDDEN)
  if (sender.role === 'subadmin') {
    if (ticket.city !== sender.city?.toLowerCase())
      throw err(ERRORS.ORDER_CITY_MISMATCH, STATUS.FORBIDDEN)
  }

  const newMessage = {
    sender:     sender.id,
    senderRole: sender.role,
    text:       text.trim(),
    createdAt:  new Date(),
  }

  // Transition open → in_progress on first staff reply
  const wasOpen = ticket.status === 'open'
  ticket.messages.push(newMessage)
  if (wasOpen && (sender.role === 'subadmin' || sender.role === 'admin')) {
    ticket.status = 'in_progress'
  }
  await ticket.save()

  const saved = ticket.messages[ticket.messages.length - 1]

  // Emit to all sockets in the ticket room — real-time delivery
  try {
    getIO().to(`ticket_${String(ticketId)}`).emit('new_message', {
      ticketId: String(ticketId),
      message: {
        _id:        saved._id,
        sender:     { _id: sender.id, name: sender.name, role: sender.role },
        senderRole: sender.role,
        text:       saved.text,
        createdAt:  saved.createdAt,
      },
    })
  } catch {
    // getIO() throws if socket.io not initialized (e.g. in tests) — non-fatal
  }

  // ── Push notifications ────────────────────────────────────────────────────
  // User sends a message → push to assigned subadmin (or admin fallback)
  // Staff replies → push to the ticket owner
  // All fire-and-forget — never let a missed push break the response
  const ticketRef = ticket.subject || `Ticket #${ticketId.toString().slice(-6).toUpperCase()}`

  if (sender.role === 'user') {
    if (ticket.assignedTo) {
      createAndNotify({
        recipientId: ticket.assignedTo,
        type:        'new_message',
        title:       '💬 New Support Message',
        body:        `Customer replied on ${ticketRef}`,
        refId:       ticket._id,
        refModel:    'Ticket',
        data:        { ticketId: String(ticketId), screen: 'support' },
      }).catch(() => {})
    }
  } else {
    createAndNotify({
      recipientId: ticket.userId,
      type:        'ticket_reply',
      title:       '✅ Support Reply',
      body:        `You have a new reply on ${ticketRef}`,
      refId:       ticket._id,
      refModel:    'Ticket',
      data:        { ticketId: String(ticketId), screen: 'support' },
    }).catch(() => {})
  }

  return newMessage
}

// ── Close ticket ──────────────────────────────────────────────────────────────
// Subadmin: can only close tickets in their city.
// Admin: can close any ticket.
// User: cannot close (they reopen by sending a message — handled separately).
export const closeTicket = async (ticketId, actor) => {
  const ticket = await Ticket.findById(ticketId)
  if (!ticket) throw err(ERRORS.TICKET_NOT_FOUND, STATUS.NOT_FOUND)
  if (ticket.status === 'closed') throw err(ERRORS.TICKET_ALREADY_CLOSED, STATUS.CONFLICT)

  if (actor.role === 'subadmin' && ticket.city !== actor.city?.toLowerCase())
    throw err(ERRORS.ORDER_CITY_MISMATCH, STATUS.FORBIDDEN)
  if (actor.role === 'user')
    throw err(ERRORS.ADMIN_ONLY, STATUS.FORBIDDEN)

  ticket.status = 'closed'
  await ticket.save()

  try {
    getIO().to(`ticket_${ticketId}`).emit('ticket_closed', { ticketId })
  } catch { /* non-fatal */ }

  return ticket
}

// ── Delete ticket ─────────────────────────────────────────────────────────────
// Admin only — hard delete.
export const deleteTicket = async (ticketId, actor) => {
  if (actor.role !== 'admin') throw err(ERRORS.ADMIN_ONLY, STATUS.FORBIDDEN)

  const ticket = await Ticket.findByIdAndDelete(ticketId)
  if (!ticket) throw err(ERRORS.TICKET_NOT_FOUND, STATUS.NOT_FOUND)
  return ticket
}

// ── Get tickets — role-scoped ─────────────────────────────────────────────────
export const getTickets = async (actor, { page = 1, limit = 20, status } = {}) => {
  // Sanitize pagination
  const safePage  = Math.max(1, parseInt(page)  || 1)
  const safeLimit = Math.min(Math.max(1, parseInt(limit) || 20), 100)

  // Whitelist status to prevent MongoDB operator injection
  const VALID_STATUS = ['open', 'in_progress', 'closed']
  const filter = {}

  if (actor.role === 'user')     filter.userId = actor.id
  if (actor.role === 'subadmin') filter.city   = actor.city?.toLowerCase()
  if (status && VALID_STATUS.includes(status)) filter.status = status

  const [tickets, total] = await Promise.all([
    Ticket.find(filter)
      .populate('userId',     'name email')
      .populate('assignedTo', 'name email')
      .sort({ updatedAt: -1 })
      .skip((safePage - 1) * safeLimit)
      .limit(safeLimit),
    Ticket.countDocuments(filter),
  ])

  return { tickets, total, page: safePage, pages: Math.ceil(total / safeLimit) }
}

// ── Get single ticket — role-scoped ───────────────────────────────────────────
export const getTicketById = async (ticketId, actor) => {
  const ticket = await Ticket.findById(ticketId)
    .populate('userId',          'name email')
    .populate('assignedTo',      'name email city')
    .populate('messages.sender', 'name role')

  if (!ticket) throw err(ERRORS.TICKET_NOT_FOUND, STATUS.NOT_FOUND)

  if (actor.role === 'user' && ticket.userId._id.toString() !== actor.id)
    throw err(ERRORS.NOT_AUTHORIZED, STATUS.FORBIDDEN)
  if (actor.role === 'subadmin' && ticket.city !== actor.city?.toLowerCase())
    throw err(ERRORS.ORDER_CITY_MISMATCH, STATUS.FORBIDDEN)

  return ticket
}

// ── Reassign ticket (admin only) ──────────────────────────────────────────────
// Reassigns an open/in_progress ticket to a different subadmin in the same city.
export const reassignTicket = async (ticketId, subadminId) => {
  const ticket = await Ticket.findById(ticketId)
  if (!ticket) throw err(ERRORS.TICKET_NOT_FOUND, STATUS.NOT_FOUND)

  // Cannot reassign a closed ticket
  if (ticket.status === 'closed') {
    throw err(ERRORS.TICKET_ALREADY_CLOSED, STATUS.BAD_REQUEST)
  }

  // Find and validate the target subadmin
  const newSubadmin = await User.findOne({ _id: subadminId, role: 'subadmin' })
    .select('_id name city fcmToken')
  if (!newSubadmin) {
    throw err('Subadmin not found or user is not a subadmin', STATUS.NOT_FOUND)
  }

  // City match — subadmin city must match ticket city
  if (newSubadmin.city?.toLowerCase() !== ticket.city?.toLowerCase()) {
    throw err('Subadmin city does not match ticket city', STATUS.BAD_REQUEST)
  }

  // Reassign
  ticket.assignedTo = newSubadmin._id
  await ticket.save()

  // Notify the new subadmin via Firebase — fire-and-forget
  if (newSubadmin.fcmToken) {
    sendToUser(newSubadmin._id, {
      title: 'New ticket assigned',
      body:  `A support ticket from ${ticket.city} has been assigned to you`,
      data:  { type: 'ticket_assigned', ticketId: ticket._id.toString(), screen: 'tickets' },
    }).catch(() => {})
  }

  return ticket
}

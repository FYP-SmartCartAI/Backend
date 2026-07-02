import { Server } from 'socket.io'
import jwt from 'jsonwebtoken'
import User from '../models/User.js'
import Ticket from '../models/Ticket.js'
import { JWT_SECRET, CLIENT_URL } from './env.js'

let io

// ── Initialize Socket.io ───────────────────────────────────────────────────────
// Called once from server.js with the raw HTTP server instance.
// Exported `io` is used by ticketService to emit events into ticket rooms.
export const initSocket = (httpServer) => {
  io = new Server(httpServer, {
    cors: {
      origin:      CLIENT_URL,
      methods:     ['GET', 'POST'],
      credentials: true,
    },
  })

  // ── JWT authentication middleware ─────────────────────────────────────────
  // Every socket connection must provide a valid JWT in handshake.auth.token.
  // Connection is rejected immediately if the token is missing or invalid.
  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth?.token
      if (!token) return next(new Error('Authentication required'))

      const decoded = jwt.verify(token, JWT_SECRET)
      const user    = await User.findById(decoded.id).select('_id name role city')
      if (!user) return next(new Error('User not found'))

      // Attach user info — available on all socket event handlers as socket.user
      socket.user = {
        id:   user._id.toString(),
        name: user.name,
        role: user.role,
        city: user.city,
      }
      socket.data.userId = socket.user.id
      next()
    } catch {
      next(new Error('Invalid or expired token'))
    }
  })

  // ── Connection handler ────────────────────────────────────────────────────
  io.on('connection', (socket) => {
    // Join a private room for this user to receive real-time notifications
    const userId = socket.user.id
    socket.join(`user_${userId}`)
    console.info(`[Socket] User ${socket.user.name} connected and joined room: user_${userId}`)

    // ── join-ticket-room ──────────────────────────────────────────────────
    // Client emits: { ticketId }
    // Authorization: user must own the ticket, subadmin must match city,
    // admin can join any ticket.
    socket.on('join_ticket', async ({ ticketId }) => {
      const tid = ticketId ? String(ticketId) : ''
      if (!tid) return
      try {
        const ticket = await Ticket.findById(tid).select('userId city assignedTo')
        if (!ticket) return

        const { id: uid, role, city } = socket.user
        const allowed =
          role === 'admin' ||
          (role === 'subadmin' && ticket.city === city?.toLowerCase()) ||
          (role === 'user'     && ticket.userId.toString() === uid)

        if (!allowed) return
        socket.join(`ticket_${tid}`)
      } catch {
        // DB error — ignore; don't crash the socket
      }
    })

    // ── leave-ticket-room ─────────────────────────────────────────────────
    socket.on('leave_ticket', ({ ticketId }) => {
      const tid = ticketId ? String(ticketId) : ''
      if (!tid) return
      socket.leave(`ticket_${tid}`)
    })

    // ── send-message ──────────────────────────────────────────────────────
    // Client emits: { ticketId, text }
    // Authorization: socket must already be in the ticket room (joined via join_ticket).
    // The message is saved to MongoDB via the ticketService (HTTP POST is the primary
    // path), but this handler allows real-time delivery from the client side.
    // On success, the message is broadcast to all clients in the ticket room
    // (including the sender) via the 'new_message' event.
    socket.on('send_message', async ({ ticketId, text }) => {
      if (!ticketId || !text?.trim()) return

      try {
        // Verify the socket is actually in this room (joined via join_ticket)
        if (!socket.rooms.has(`ticket_${ticketId}`)) return

        // Fetch ticket to verify it's not closed
        const ticket = await Ticket.findById(ticketId).select('status userId city assignedTo')
        if (!ticket || ticket.status === 'closed') return

        const { id: senderId, name: senderName, role: senderRole } = socket.user

        // Build and persist the message
        const message = {
          sender:     senderId,
          senderRole,
          text:       text.trim(),
          createdAt:  new Date(),
        }

        ticket.messages.push(message)

        // Transition open → in_progress on first staff reply
        if (ticket.status === 'open' && (senderRole === 'subadmin' || senderRole === 'admin')) {
          ticket.status = 'in_progress'
        }

        await ticket.save()

        // Get the saved message (with _id assigned by Mongoose)
        const saved = ticket.messages[ticket.messages.length - 1]

        // Broadcast to all clients in the ticket room
        io.to(`ticket_${ticketId}`).emit('new_message', {
          ticketId,
          message: {
            _id:        saved._id,
            sender:     { _id: senderId, name: senderName, role: senderRole },
            senderRole,
            text:       saved.text,
            createdAt:  saved.createdAt,
          },
        })
      } catch (e) {
        console.error(`[socket] send_message error for ticket ${ticketId}:`, e.message)
        socket.emit('error', { message: 'Failed to send message' })
      }
    })

    // ── disconnect ────────────────────────────────────────────────────────
    socket.on('disconnect', () => {
      // Socket.io automatically removes the socket from all rooms on disconnect
    })
  })

  console.info('[socket.io] Initialized ✅')
  return io
}

// ── Get the initialized io instance ───────────────────────────────────────────
export const getIO = () => {
  if (!io) throw new Error('Socket.io has not been initialized. Call initSocket(httpServer) first.')
  return io
}

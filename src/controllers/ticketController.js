import * as ticketService from '../services/ticketService.js'

// Build an actor object from req.user — used for all permission checks in the service layer
const actor = (req) => ({
  id:   req.user._id.toString(),
  name: req.user.name,
  role: req.user.role,
  city: req.user.city,
})

// ── POST /api/tickets ──────────────────────────────────────────────────────────
// Body: { orderId?, message }
// Creates ticket, auto-routes to subadmin by city.
export const createTicket = async (req, res, next) => {
  try {
    const ticket = await ticketService.createTicket(req.user._id, req.body)
    res.status(201).json({ success: true, data: ticket })
  } catch (err) { next(err) }
}

// ── GET /api/tickets ───────────────────────────────────────────────────────────
// user     → own tickets
// subadmin → tickets in their city
// admin    → all tickets
// Optional query: ?status=open|in_progress|closed  &page=  &limit=
export const getTickets = async (req, res, next) => {
  try {
    const result = await ticketService.getTickets(actor(req), req.query)
    res.json({ success: true, ...result })
  } catch (err) { next(err) }
}

// ── GET /api/tickets/:id ───────────────────────────────────────────────────────
export const getTicket = async (req, res, next) => {
  try {
    const ticket = await ticketService.getTicketById(req.params.id, actor(req))
    res.json({ success: true, data: ticket })
  } catch (err) { next(err) }
}

// ── POST /api/tickets/:id/messages ────────────────────────────────────────────
// Body: { message }
// Appends message, transitions status, emits socket event.
export const sendMessage = async (req, res, next) => {
  try {
    const message = await ticketService.sendMessage(req.params.id, actor(req), req.body.message)
    res.json({ success: true, data: message })
  } catch (err) { next(err) }
}

// ── PATCH /api/tickets/:id/close ──────────────────────────────────────────────
// subadmin (own city) or admin
export const closeTicket = async (req, res, next) => {
  try {
    const ticket = await ticketService.closeTicket(req.params.id, actor(req))
    res.json({ success: true, data: ticket })
  } catch (err) { next(err) }
}

// ── DELETE /api/tickets/:id ───────────────────────────────────────────────────
// admin only — hard delete
export const deleteTicket = async (req, res, next) => {
  try {
    await ticketService.deleteTicket(req.params.id, actor(req))
    res.json({ success: true })
  } catch (err) { next(err) }
}

// ── PATCH /api/tickets/:id/reassign ───────────────────────────────────────────
// Admin only — reassign ticket to a different subadmin.
// Body: { subadminId: string }
export const reassignTicket = async (req, res, next) => {
  try {
    const ticket = await ticketService.reassignTicket(req.params.id, req.body.subadminId)
    res.json({ success: true, data: ticket })
  } catch (err) { next(err) }
}

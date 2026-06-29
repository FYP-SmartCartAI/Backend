import mongoose from 'mongoose'

// ── Embedded message sub-schema ───────────────────────────────────────────────
// Each message is appended to the ticket's messages array.
// Socket.io delivers it in real-time; MongoDB stores it permanently.
const messageSchema = new mongoose.Schema({
  sender:     { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  senderRole: { type: String, enum: ['user', 'subadmin', 'admin'], required: true },
  text:       { type: String, required: true, trim: true },
  createdAt:  { type: Date, default: Date.now },
  readAt:     { type: Date, default: null },  // set when the recipient reads the message
}, { _id: true })

// ── Ticket schema ─────────────────────────────────────────────────────────────
const ticketSchema = new mongoose.Schema({
  // ── Who opened it ─────────────────────────────────────────────────────────
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },

  // ── Linked order (optional) ───────────────────────────────────────────────
  orderId: { type: mongoose.Schema.Types.ObjectId, ref: 'Order', default: null },

  // ── Subject line ─────────────────────────────────────────────────────────
  // Short title summarising the issue. Max 200 chars.
  subject: { type: String, default: '', trim: true, maxlength: 200 },

  // ── City — used to auto-assign the correct sub-admin ─────────────────────
  city: { type: String, required: true, lowercase: true, trim: true },

  // ── Status lifecycle ──────────────────────────────────────────────────────
  // open        → ticket just created, waiting for sub-admin
  // in_progress → sub-admin has replied at least once
  // closed      → sub-admin or admin marked it resolved
  status: {
    type: String,
    enum: ['open', 'in_progress', 'closed'],
    default: 'open',
  },

  // ── Assigned sub-admin ────────────────────────────────────────────────────
  assignedTo: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },

  // ── Full conversation history ─────────────────────────────────────────────
  messages: [messageSchema],

  // ── Closure timestamp ─────────────────────────────────────────────────────
  closedAt: { type: Date, default: null }, // set when status transitions to 'closed'

  // ── Notification state ────────────────────────────────────────────────────
  unresolvedNotified: { type: Boolean, default: false },
}, { timestamps: true })

// ── Indexes ───────────────────────────────────────────────────────────────────
ticketSchema.index({ userId: 1, status: 1 })       // user fetches their own tickets
ticketSchema.index({ city: 1, status: 1 })          // sub-admin fetches tickets by city
ticketSchema.index({ assignedTo: 1, status: 1 })    // sub-admin fetches their assigned tickets

export default mongoose.model('Ticket', ticketSchema)

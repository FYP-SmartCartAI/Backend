import mongoose from 'mongoose'

// ── Payment model ─────────────────────────────────────────────────────────────
// Records every payment event for an order.
// For Stripe: created when the webhook receives payment_intent.succeeded.
// For COD:    created when subadmin marks order as cod_collected.
//
// stripeEventId has a unique sparse index to guarantee idempotency —
// Stripe may deliver the same webhook event more than once.

const paymentSchema = new mongoose.Schema({
  // ── References ────────────────────────────────────────────────────────────
  orderId: { type: mongoose.Schema.Types.ObjectId, ref: 'Order', required: true },
  userId:  { type: mongoose.Schema.Types.ObjectId, ref: 'User',  required: true },

  // ── Payment method ────────────────────────────────────────────────────────
  method: {
    type: String,
    enum: ['stripe', 'cash_on_delivery'],
    required: true,
    default: 'stripe',
  },

  // ── Financials ────────────────────────────────────────────────────────────
  amount:   { type: Number, required: true },
  currency: { type: String, default: 'PKR' }, // ISO 4217 — PKR for Pakistani Rupee

  // ── Stripe-specific fields ────────────────────────────────────────────────
  // stripeEventId: idempotency key — each Stripe event is processed at most once
  stripeEventId:         { type: String, index: true, unique: true, sparse: true },
  stripePaymentIntentId: { type: String, index: true, default: null },
  stripeSessionId:       { type: String, default: null }, // Checkout Session ID
  stripeChargeId:        { type: String, default: null }, // Charge ID after capture

  // ── Status ────────────────────────────────────────────────────────────────
  status: {
    type: String,
    enum: ['pending', 'success', 'failed', 'refunded', 'cod_pending', 'cod_collected'],
    default: 'pending',
  },

  // ── Raw Stripe event payload (stored for debugging / audit trail) ─────────
  metadata: { type: Object, default: null },
  raw:      { type: Object, default: null },
}, { timestamps: true })

export default mongoose.model('Payment', paymentSchema)

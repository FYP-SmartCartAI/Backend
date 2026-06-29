import mongoose from 'mongoose'

// ── Embedded order item ───────────────────────────────────────────────────────
// Prices and product details are snapshotted at order time so the order history
// stays accurate even if the product is later edited or deleted.
const orderItemSchema = new mongoose.Schema({
  product:  { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
  name:     { type: String, required: true },   // snapshot of product.name
  qty:      { type: Number, required: true, min: 1 },
  price:    { type: Number, required: true },   // locked from DB at order time
  image:    { type: String, default: '' },       // snapshot of product.images[0]
}, { _id: false })

// ── Embedded shipping address ─────────────────────────────────────────────────
// Stored on order so history is accurate even if user updates their address later.
const shippingAddressSchema = new mongoose.Schema({
  street:     { type: String, default: '' },
  city:       { type: String, default: '' },   // ← sub-admin city matching
  state:      { type: String, default: '' },
  postalCode: { type: String, default: '' },
  country:    { type: String, default: '' },
}, { _id: false })

// ── Status history entry ──────────────────────────────────────────────────────
const statusHistorySchema = new mongoose.Schema({
  status:    { type: String, required: true },
  changedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  changedAt: { type: Date, default: Date.now },
}, { _id: false })

const orderSchema = new mongoose.Schema({
  // ── Core references ───────────────────────────────────────────────────────
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },

  // ── Order items ───────────────────────────────────────────────────────────
  items: [orderItemSchema],

  // ── Financials ────────────────────────────────────────────────────────────
  subtotal:    { type: Number, required: true },  // sum of item prices (before delivery)
  deliveryFee: { type: Number, default: 0 },      // shipping fee
  total:       { type: Number, required: true },  // subtotal + deliveryFee

  // ── Shipping ──────────────────────────────────────────────────────────────
  shippingAddress:  { type: shippingAddressSchema, default: () => ({}) },
  assignedSubadmin: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },

  // ── Fulfilment status ─────────────────────────────────────────────────────
  // Transitions are role-scoped:
  //   admin    → pending → processing → shipped
  //   subadmin → shipped → delivered  (city must match)
  //   user     → any    → cancelled   (before shipped only)
  //   cod      → delivered → cod_collected
  status: {
    type: String,
    enum: ['pending', 'confirmed', 'processing', 'shipped', 'delivered', 'cancelled', 'cod_collected'],
    default: 'pending',
  },

  // ── Full status transition audit trail ────────────────────────────────────
  statusHistory: { type: [statusHistorySchema], default: [] },

  // ── Payment ───────────────────────────────────────────────────────────────
  paymentMethod: {
    type: String,
    enum: ['stripe', 'cod'],
    default: 'stripe',
  },
  paymentStatus: {
    type: String,
    enum: ['pending', 'paid', 'failed', 'refunded', 'cod_pending', 'cod_collected'],
    default: 'pending',
  },
  stripePaymentId: { type: String, default: null }, // Stripe PaymentIntent ID

  // ── Idempotency ───────────────────────────────────────────────────────────
  // Prevents duplicate orders from network retries / double-clicks.
  // Also stored in the separate IdempotencyKey model for faster lookups.
  idempotencyKey: {
    type:   String,
    default: null,
    sparse: true,
    index:  true,
  },
}, { timestamps: true })

// ── Indexes ───────────────────────────────────────────────────────────────────
orderSchema.index({ userId: 1, createdAt: -1 })
orderSchema.index({ 'shippingAddress.city': 1, status: 1 })
orderSchema.index({ paymentMethod: 1, paymentStatus: 1, status: 1 })

export default mongoose.model('Order', orderSchema)

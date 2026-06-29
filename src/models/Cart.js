import mongoose from 'mongoose'

// ── Cart item sub-schema ──────────────────────────────────────────────────────
// Product details (name, image) are snapshotted at add-to-cart time.
// This allows the cart UI to render correctly even if the product is edited.
// The price stored here is for display only — DB price is used at checkout.
const cartItemSchema = new mongoose.Schema({
  product:  { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
  name:     { type: String, default: '' },   // snapshot of product.name at time of add
  image:    { type: String, default: '' },   // snapshot of product.images[0]
  quantity: { type: Number, default: 1, min: 1 },
  price:    { type: Number, required: true }, // display price snapshot — DB price used at checkout
}, { _id: false })

const cartSchema = new mongoose.Schema({
  // ── Owner ─────────────────────────────────────────────────────────────────
  user:   { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }, // mirror for service compat

  // ── Items ─────────────────────────────────────────────────────────────────
  items: [cartItemSchema],

  // ── Totals ────────────────────────────────────────────────────────────────
  subtotal: { type: Number, default: 0 }, // sum of item prices (display only)
  total:    { type: Number, default: 0 }, // same as subtotal for cart (alias kept for compat)

  // ── Abandoned cart detection ───────────────────────────────────────────────
  // The cron job runs every hour and checks:
  //   • isAbandoned = false
  //   • reminderSent = false
  //   • updatedAt < (now - ABANDONED_CART_IDLE_MINUTES, default 2 min)
  //   • items.length > 0
  isAbandoned:    { type: Boolean, default: false },
  abandonedAt:    { type: Date,    default: null },
  reminderSent:   { type: Boolean, default: false },
  reminderSentAt: { type: Date,    default: null },
  // updatedAt (from timestamps) is used as lastUpdated for abandonment detection
}, { timestamps: true })

export default mongoose.model('Cart', cartSchema)

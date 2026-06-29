import mongoose from 'mongoose'

// ── BehaviorLog schema (= Behavior.js in spec) ────────────────────────────────
// Records every meaningful user interaction for the AI recommendation engine.
// behaviorService.buildUserProfile() reads these logs, weights them, and builds
// a taste profile text that gets converted to a vector for Pinecone similarity search.
//
// Weight table:
//   purchase / 5-star review → 5   (strongest proof of interest)
//   add_to_cart              → 4   (strong interest)
//   wishlist / long view     → 3   (medium interest — long view = >= 10 s on page)
//   search                   → 2   (shows general interest)
//   quick view (< 10 s)      → 1   (weak signal)
//   remove_from_cart         → -1  (negative signal)
//   3-star review            → 2   (mild interest)
//   1–2 star review          → -2  (user disliked it)

const behaviorLogSchema = new mongoose.Schema({
  // ── Who did the action ────────────────────────────────────────────────────
  userId:    { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },

  // ── What product (optional — search action has no product) ────────────────
  productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', default: null },

  // ── What action was performed ─────────────────────────────────────────────
  action: {
    type: String,
    enum: [
      'view',             // user opened the product detail page
      'add_to_cart',      // user added to cart
      'remove_from_cart', // user removed from cart (negative signal)
      'purchase',         // user completed checkout (strongest signal)
      'wishlist',         // user saved to wishlist
      'review',           // user left a rating/review
      'search',           // user ran a search query
    ],
    required: true,
  },

  // ── Computed weight (stored for fast profile building) ────────────────────
  // Stored on write so buildUserProfile() can SUM weights without recalculating.
  // Positive = interest signal, negative = disinterest signal.
  weight: { type: Number, default: 1 },

  // ── Extra context fields (only used for specific actions) ─────────────────
  query:           { type: String, default: null }, // action: 'search'   — typed query
  rating:          { type: Number, default: null }, // action: 'review'   — star rating 1–5
  durationSeconds: { type: Number, default: null }, // action: 'view'     — time on page
  price:           { type: Number, default: null }, // action: 'purchase' — price paid

  // ── When it happened ──────────────────────────────────────────────────────
  // NOTE: no `index: true` here — the compound index { userId, timestamp: -1 }
  // and the TTL index below both cover timestamp; a standalone index is redundant.
  timestamp: { type: Date, default: Date.now },
}, {
  // Behavior logs are write-once — no updatedAt needed
  timestamps: false,
})

// ── Indexes ───────────────────────────────────────────────────────────────────
// buildUserProfile fetches the most recent N logs for a user sorted by time
behaviorLogSchema.index({ userId: 1, timestamp: -1 })

// For analytics: find all users who performed a specific action on a product
behaviorLogSchema.index({ productId: 1, action: 1 })

// ── TTL index — auto-delete behavior logs older than 90 days ─────────────────
// MongoDB TTL indexes run a background job every 60 seconds.
// Keeps the collection from growing unbounded over time.
behaviorLogSchema.index({ timestamp: 1 }, { expireAfterSeconds: 90 * 24 * 60 * 60 })

export default mongoose.model('BehaviorLog', behaviorLogSchema)

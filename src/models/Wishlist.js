import mongoose from 'mongoose'

// ── Wishlist model ─────────────────────────────────────────────────────────────
// One wishlist per user (enforced by unique index on userId).
// products is an array of Product ObjectIds.

const wishlistSchema = new mongoose.Schema({
  userId: {
    type:     mongoose.Schema.Types.ObjectId,
    ref:      'User',
    required: true,
    unique:   true,
    index:    true,
  },

  products: [{
    type: mongoose.Schema.Types.ObjectId,
    ref:  'Product',
  }],
}, { timestamps: true })

export default mongoose.model('Wishlist', wishlistSchema)

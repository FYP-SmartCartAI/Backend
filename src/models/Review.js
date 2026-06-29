import mongoose from 'mongoose'

const reviewSchema = new mongoose.Schema({
  // ── Core references ───────────────────────────────────────────────────────
  product: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
  user:    { type: mongoose.Schema.Types.ObjectId, ref: 'User',    required: true },

  // ── Optional order reference ──────────────────────────────────────────────
  // Links the review to the specific purchase that triggered it.
  // Useful for "verified purchase" badge and preventing review fraud.
  orderId: { type: mongoose.Schema.Types.ObjectId, ref: 'Order', default: null },

  // ── Review content ────────────────────────────────────────────────────────
  rating:  { type: Number, required: true, min: 1, max: 5 },
  comment: { type: String, default: '' },

  // ── Review images (Cloudinary URLs) ──────────────────────────────────────
  // Customers can attach up to 5 photos to their review.
  images: { type: [String], default: [] },
}, { timestamps: true })

// ── One review per user per product ───────────────────────────────────────────
reviewSchema.index({ user: 1, product: 1 }, { unique: true })

export default mongoose.model('Review', reviewSchema)

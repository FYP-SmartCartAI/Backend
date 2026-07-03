import mongoose from 'mongoose'

// ── FlashSale Model ────────────────────────────────────────────────────────────
// Stores a single timed flash sale event. Admin picks products (which must
// already have discountPrice set on the Product document), sets a duration
// (1–24 h, default 6 h), and launches. One active sale at a time is enforced
// at the service layer.

const FlashSaleSchema = new mongoose.Schema(
  {
    title: {
      type:     String,
      required: true,
      trim:     true,
    },

    // Product refs — the product's own discountPrice is used as the sale price.
    // No separate flash price stored here.
    products: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Product' }],

    // Duration in hours chosen by the admin (1–24, default 6)
    duration: {
      type:    Number,
      min:     1,
      max:     24,
      default: 6,
    },

    startTime: { type: Date, default: Date.now },

    // endTime = startTime + duration * 3600000 ms, computed in the service
    endTime: { type: Date, required: true },

    // Manual kill-switch: set to false by admin terminate OR by the cron job
    isActive: { type: Boolean, default: true },

    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
)

// Fast index for the public "getActive" query called by the hero every 60 s
FlashSaleSchema.index({ isActive: 1, endTime: 1 })

export default mongoose.model('FlashSale', FlashSaleSchema)

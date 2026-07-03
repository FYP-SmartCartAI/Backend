import mongoose from 'mongoose'

const productSchema = new mongoose.Schema({
  // ── Core fields ───────────────────────────────────────────────────────────
  name:        { type: String, required: true, trim: true },
  // NOTE: no `unique: true` inline here — the unique index is declared via
  // schema.index() below. Declaring it both ways produces a duplicate-index warning.
  slug:        { type: String, required: true, lowercase: true, trim: true },
  description: { type: String, default: '' },
  category:    { type: String, required: true, lowercase: true, trim: true },
  subcategory: { type: String, default: '',    lowercase: true, trim: true },
  brand:       { type: String, default: '',    trim: true },

  // ── Pricing ───────────────────────────────────────────────────────────────
  price:         { type: Number, required: true, min: 0 },
  discountPrice: { type: Number, default: null, min: 0 }, // null = no discount active

  // ── Inventory ────────────────────────────────────────────────────────────
  stock: { type: Number, default: 0, min: 0 },

  // ── Media ─────────────────────────────────────────────────────────────────
  images: { type: [String], default: [] }, // Cloudinary URLs

  // ── Tags — used in AI embedding text for richer semantic search ───────────
  tags: { type: [String], default: [] },

  // ── Reviews (denormalized for fast listing) ───────────────────────────────
  rating:      { type: Number, default: 0, min: 0, max: 5 },
  reviewCount: { type: Number, default: 0, min: 0 },

  // ── Visibility ────────────────────────────────────────────────────────────
  isActive: { type: Boolean, default: true }, // false = soft-deleted / hidden

  // ── Ownership ─────────────────────────────────────────────────────────────
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },

  // ── Vector sync status ────────────────────────────────────────────────────
  // true after product is embedded and upserted into Pinecone.
  vectorSynced: { type: Boolean, default: false },
  iconName:     { type: String, default: 'Package' },
}, { timestamps: true })

// ── Pre-Save Hook ─────────────────────────────────────────────────────────────
// Automatically resolve category ObjectId or name to slug before saving to DB
productSchema.pre('save', async function () {
  if (!this.isModified('category') || !this.category) return

  const Category = mongoose.model('Category')
  const categoryInput = this.category

  if (mongoose.Types.ObjectId.isValid(categoryInput)) {
    const cat = await Category.findById(categoryInput)
    if (cat) {
      this.category = cat.slug
      return
    }
  }

  const cat = await Category.findOne({
    $or: [
      { slug: categoryInput.toLowerCase() },
      { name: categoryInput },
    ],
  })
  if (cat) {
    this.category = cat.slug
  } else {
    this.category = categoryInput.toLowerCase().trim().replace(/\s+/g, '-').replace(/[^\w-]/g, '')
  }
})

// ── Indexes ───────────────────────────────────────────────────────────────────
productSchema.index({ category: 1, subcategory: 1 })
productSchema.index({ slug: 1 }, { unique: true })
productSchema.index({ isActive: 1, category: 1 })
productSchema.index({ vectorSynced: 1 }) // used by sync-all-vectors endpoint

export default mongoose.model('Product', productSchema)

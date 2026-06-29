import mongoose from 'mongoose'

const subcategorySchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  slug: { type: String, required: true, lowercase: true, trim: true },
}, { _id: true })

const categorySchema = new mongoose.Schema({
  name:          { type: String, required: true, trim: true, unique: true },
  slug:          { type: String, required: true, lowercase: true, trim: true, unique: true },
  description:   { type: String, default: '' },
  subcategories: [subcategorySchema],
  isActive:      { type: Boolean, default: true }, // soft-delete / hide from frontend
}, { timestamps: true })

export default mongoose.model('Category', categorySchema)

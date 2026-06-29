import Category from '../models/Category.js'
import Product from '../models/Product.js'
import { STATUS, ERRORS } from '../constants/httpConstants.js'
import mongoose from 'mongoose'

const err = (msg, code) => Object.assign(new Error(msg), { statusCode: code })

// ── helpers ──────────────────────────────────────────────────────────────────
const slugify = (str) => str.toLowerCase().trim().replace(/\s+/g, '-').replace(/[^\w-]/g, '')

const findCategory = async (slugOrId) => {
  if (mongoose.Types.ObjectId.isValid(slugOrId)) {
    const byId = await Category.findById(slugOrId)
    if (byId) return byId
  }
  return Category.findOne({ slug: slugOrId })
}

// ── Category CRUD ─────────────────────────────────────────────────────────────
export const getAll = async () => Category.find().sort({ name: 1 })

export const getBySlug = async (slugOrId) => {
  const cat = await findCategory(slugOrId)
  if (!cat) throw err(ERRORS.CATEGORY_NOT_FOUND, STATUS.NOT_FOUND)
  return cat
}

export const create = async ({ name, description = '', image = '', subcategories = [] }) => {
  const slug = slugify(name)
  const formattedSubs = subcategories.map(sub => {
    const subName = typeof sub === 'string' ? sub : sub.name
    return {
      name: subName,
      slug: slugify(subName)
    }
  })
  return Category.create({ name, slug, description, image, subcategories: formattedSubs })
}

export const update = async (slugOrId, data) => {
  const existing = await findCategory(slugOrId)
  if (!existing) throw err(ERRORS.CATEGORY_NOT_FOUND, STATUS.NOT_FOUND)
  if (data.name) data.slug = slugify(data.name)
  const cat = await Category.findByIdAndUpdate(existing._id, data, { returnDocument: 'after', runValidators: true })
  return cat
}

export const remove = async (slugOrId) => {
  const existing = await findCategory(slugOrId)
  if (!existing) throw err(ERRORS.CATEGORY_NOT_FOUND, STATUS.NOT_FOUND)
  const productCount = await Product.countDocuments({ category: existing.slug })
  if (productCount > 0)
    throw err(ERRORS.CATEGORY_HAS_PRODUCTS(productCount), STATUS.CONFLICT)
  await Category.findByIdAndDelete(existing._id)
  return existing
}

// ── Subcategory CRUD ───────────────────────────────────────────────────────────
export const getSubcategories = async (categorySlugOrId) => {
  const cat = await findCategory(categorySlugOrId)
  if (!cat) throw err(ERRORS.CATEGORY_NOT_FOUND, STATUS.NOT_FOUND)
  return cat.subcategories
}

export const addSubcategory = async (categorySlugOrId, { name }) => {
  const slug = slugify(name)
  const cat = await findCategory(categorySlugOrId)
  if (!cat) throw err(ERRORS.CATEGORY_NOT_FOUND, STATUS.NOT_FOUND)
  const exists = cat.subcategories.some(s => s.slug === slug)
  if (exists) throw err(ERRORS.SUBCATEGORY_EXISTS, STATUS.CONFLICT)
  cat.subcategories.push({ name, slug })
  await cat.save()
  return cat
}

export const updateSubcategory = async (categorySlugOrId, subSlug, { name }) => {
  const cat = await findCategory(categorySlugOrId)
  if (!cat) throw err(ERRORS.CATEGORY_NOT_FOUND, STATUS.NOT_FOUND)
  const subDoc = cat.subcategories.find(s => s.slug === subSlug)
  if (!subDoc) throw err(ERRORS.SUBCATEGORY_NOT_FOUND, STATUS.NOT_FOUND)
  subDoc.name = name
  subDoc.slug = slugify(name)
  await cat.save()
  return cat
}

export const removeSubcategory = async (categorySlugOrId, subSlug) => {
  const cat = await findCategory(categorySlugOrId)
  if (!cat) throw err(ERRORS.CATEGORY_NOT_FOUND, STATUS.NOT_FOUND)
  cat.subcategories = cat.subcategories.filter(s => s.slug !== subSlug)
  await cat.save()
  return cat
}

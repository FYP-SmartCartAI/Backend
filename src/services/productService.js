import Product from '../models/Product.js'
import Category from '../models/Category.js'
import mongoose from 'mongoose'
import { STATUS, ERRORS } from '../constants/httpConstants.js'
import { embedProduct, deleteProductVector } from './vectorService.js'
import { productMatchesIntent, getCategorySlug } from '../utils/parseAiSearchQuery.js'

const err = (msg, code) => Object.assign(new Error(msg), { statusCode: code })

// Escape regex special characters to prevent ReDoS from user-supplied filter strings
const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

const slugify = (str) => str.toLowerCase().trim().replace(/\s+/g, '-').replace(/[^\w-]/g, '')

const findProduct = async (idOrSlug) => {
  if (mongoose.Types.ObjectId.isValid(idOrSlug)) {
    const byId = await Product.findById(idOrSlug)
    if (byId) return byId
  }
  return Product.findOne({ slug: idOrSlug })
}

const normalizeProductFields = (data) => {
  if (data.brand !== undefined) {
    data.brand = typeof data.brand === 'string' ? data.brand.trim() : ''
  }
  if (Array.isArray(data.tags)) {
    const seen = new Set()
    data.tags = data.tags
      .map((t) => (typeof t === 'string' ? t.trim().toLowerCase() : ''))
      .filter((t) => {
        if (!t || seen.has(t)) return false
        seen.add(t)
        return true
      })
  }
  if (data.subcategory !== undefined && typeof data.subcategory === 'string') {
    data.subcategory = data.subcategory.trim().toLowerCase()
  }
  return data
}

const resolveCategorySlug = async (categoryInput) => {
  if (!categoryInput || typeof categoryInput !== 'string') return categoryInput
  if (mongoose.Types.ObjectId.isValid(categoryInput)) {
    const cat = await Category.findById(categoryInput)
    if (cat) return cat.slug
  }
  const cat = await Category.findOne({
    $or: [
      { slug: categoryInput.toLowerCase() },
      { name: categoryInput }
    ]
  })
  if (cat) return cat.slug
  return categoryInput.toLowerCase().trim().replace(/\s+/g, '-').replace(/[^\w-]/g, '')
}

export const populateProductCategory = (product, categoryMap) => {
  if (!product) return null
  const p = product.toObject ? product.toObject() : product
  const catVal = p.category
  
  if (catVal && typeof catVal === 'object') {
    p.category = {
      _id: catVal._id || undefined,
      name: typeof catVal.name === 'string' ? catVal.name : (catVal.name?.name || ''),
      slug: catVal.slug || '',
    }
  } else if (catVal && categoryMap[catVal]) {
    p.category = {
      _id: categoryMap[catVal]._id,
      name: categoryMap[catVal].name,
      slug: categoryMap[catVal].slug,
    }
  } else {
    p.category = {
      _id: mongoose.Types.ObjectId.isValid(catVal) ? catVal : undefined,
      name: catVal || '',
      slug: catVal || '',
    }
  }
  return p
}

export const getCategoryMap = async () => {
  const categories = await Category.find()
  const categoryMap = {}
  for (const c of categories) {
    categoryMap[c.slug] = c
    categoryMap[c._id.toString()] = c
  }
  return categoryMap
}

const parseSearchTerms = (q) => {
  const raw = q.trim().split(/\s+/).filter(Boolean)
  const terms = raw.filter((t) => t.length >= 2)
  return terms.length ? terms : raw
}

const buildTermSearchClause = (term, categoryMap) => {
  const escaped = escapeRegex(term)
  const categorySlugs = Object.values(categoryMap)
    .filter((c) => c?.name && new RegExp(escaped, 'i').test(c.name))
    .map((c) => c.slug)

  const or = [
    { name:        { $regex: escaped, $options: 'i' } },
    { brand:       { $regex: escaped, $options: 'i' } },
    { description: { $regex: escaped, $options: 'i' } },
    { tags:        { $regex: escaped, $options: 'i' } },
    { subcategory: { $regex: escaped, $options: 'i' } },
    { category:    { $regex: escaped, $options: 'i' } },
  ]
  if (categorySlugs.length) {
    or.push({ category: { $in: categorySlugs } })
  }
  return { $or: or }
}

/** Multi-field text search — used by AI search fallback and product listing */
export const searchByText = async (q, { limit = 10, inStockOnly = true, minPrice, maxPrice } = {}) => {
  if (!q?.trim()) return []

  const categoryMap = await getCategoryMap()
  const terms = parseSearchTerms(q)
  const filter = {
    isActive: { $ne: false },
    $and: terms.map((term) => buildTermSearchClause(term, categoryMap)),
  }
  if (inStockOnly) filter.stock = { $gt: 0 }
  if (minPrice != null && minPrice !== '') filter.price = { ...filter.price, $gte: Number(minPrice) }
  if (maxPrice != null && maxPrice !== '') filter.price = { ...filter.price, $lte: Number(maxPrice) }

  const products = await Product.find(filter)
    .sort({ rating: -1, createdAt: -1 })
    .limit(Number(limit))

  return products.map((p) => populateProductCategory(p, categoryMap))
}

/** Category-aware search when the query implies a product type (phone, laptop, etc.) */
export const searchByIntent = async (intent, { limit = 10, minPrice, maxPrice, q = '' } = {}) => {
  if (!intent) return []

  const filter = {
    isActive: { $ne: false },
    stock: { $gt: 0 },
    category: { $in: intent.categories },
  }
  if (minPrice != null && minPrice !== '') filter.price = { ...filter.price, $gte: Number(minPrice) }
  if (maxPrice != null && maxPrice !== '') filter.price = { ...filter.price, $lte: Number(maxPrice) }

  const sort = /\b(budget|cheap|affordable|inexpensive|low\s+cost|economical)\b/i.test(q)
    ? { price: 1, rating: -1 }
    : { rating: -1, createdAt: -1 }

  const categoryMap = await getCategoryMap()
  const products = await Product.find(filter).sort(sort).limit(Number(limit) * 4)

  const applyFilter = (intentFilter) => products
    .filter((p) => productMatchesIntent(populateProductCategory(p, categoryMap), intentFilter))
    .slice(0, Number(limit))
    .map((p) => populateProductCategory(p, categoryMap))

  const strict = applyFilter(intent)
  if (strict.length || !intent.keywords?.length) return strict

  // No keyword hits in category — return best-rated items in the right category anyway
  return applyFilter({ ...intent, keywords: undefined })
}

/**
 * When the query looks like a product/brand name (not "phone", "laptop", etc.),
 * derive category intent from catalog matches so we don't return random categories.
 */
export const resolveIntentFromCatalogMatch = async (q) => {
  if (!q?.trim()) return { intent: null, directMatches: [] }

  const normalized = q.trim().toLowerCase()
  const terms = normalized.split(/\s+/).filter((t) => t.length >= 2)
  if (!terms.length) return { intent: null, directMatches: [] }

  const namePattern = terms.map((t) => escapeRegex(t)).join('.*')
  const candidates = await Product.find({
    isActive: { $ne: false },
    stock: { $gt: 0 },
    $or: [
      { name: { $regex: namePattern, $options: 'i' } },
      { brand: { $regex: `^${escapeRegex(normalized)}$`, $options: 'i' } },
      { brand: { $regex: escapeRegex(terms[0]), $options: 'i' } },
    ],
  }).limit(25)

  if (!candidates.length) return { intent: null, directMatches: [] }

  const scored = candidates
    .map((product) => {
      const name = (product.name || '').toLowerCase()
      const brand = (product.brand || '').toLowerCase()
      let score = 0

      if (name === normalized) score = 100
      else if (name.includes(normalized)) score = 95
      else if (terms.every((t) => name.includes(t))) score = 85
      else if (brand === normalized || terms.every((t) => brand.includes(t))) score = 75
      else if (terms.some((t) => name.includes(t) || brand.includes(t))) score = 50

      return { product, score }
    })
    .filter((s) => s.score >= 75)
    .sort((a, b) => b.score - a.score)

  if (!scored.length) return { intent: null, directMatches: [] }

  const categorySlug = getCategorySlug(scored[0].product)
  const categoryMap = await getCategoryMap()
  const directMatches = scored.map((s) => populateProductCategory(s.product, categoryMap))

  return {
    intent: {
      type: 'catalog_match',
      categories: [categorySlug],
      sourceProduct: scored[0].product.name,
    },
    directMatches,
  }
}

export const getAll = async (query) => {
  const { page=1, limit=10, category, subcategory, q, minPrice, maxPrice, sortBy, brand, inStock } = query || {}
  const filter = {}
  if (category) {
    const cat = await Category.findOne({
      $or: [
        { slug: category.toLowerCase() },
        { name: category },
        ...(mongoose.Types.ObjectId.isValid(category) ? [{ _id: category }] : [])
      ]
    })
    if (cat) {
      filter.$or = [
        { category: cat.slug },
        { category: cat._id.toString() }
      ]
    } else {
      filter.category = { $regex: `^${escapeRegex(category)}$`, $options: 'i' }
    }
  }
  if (subcategory) filter.subcategory = { $regex: `^${escapeRegex(subcategory)}$`, $options: 'i' }

  if (q?.trim()) {
    const categoryMap = await getCategoryMap()
    const terms = parseSearchTerms(q)
    const searchClauses = terms.map((term) => buildTermSearchClause(term, categoryMap))
    filter.$and = [...(filter.$and || []), ...searchClauses]
  }

  // ── New price / brand / stock filters ─────────────────────────────────────
  if (minPrice) filter.price = { ...filter.price, $gte: Number(minPrice) }
  if (maxPrice) filter.price = { ...filter.price, $lte: Number(maxPrice) }
  if (brand)    filter.brand = { $regex: escapeRegex(brand), $options: 'i' }
  if (inStock === 'true') filter.stock = { $gt: 0 }

  // ── Sort options ───────────────────────────────────────────────────────────
  const sortOptions = {
    price_asc:  { price: 1 },
    price_desc: { price: -1 },
    rating:     { rating: -1 },
    newest:     { createdAt: -1 },
  }
  const sort = sortOptions[sortBy] || { createdAt: -1 }

  const [products, total] = await Promise.all([
    Product.find(filter).sort(sort).limit(Number(limit)).skip((Number(page)-1)*Number(limit)),
    Product.countDocuments(filter),
  ])

  const categoryMap = await getCategoryMap()
  const populatedProducts = products.map(p => populateProductCategory(p, categoryMap))

  return {
    products: populatedProducts,
    total,
    page: Number(page),
    pages: Math.ceil(total / Number(limit))
  }
}

export const search = async (q, { page=1, limit=10 } = {}) => {
  const escaped = q ? escapeRegex(q) : null
  const filter = escaped ? { $or: [
    { name:        { $regex: escaped, $options: 'i' } },
    { description: { $regex: escaped, $options: 'i' } },
  ]} : {}

  const [products, total] = await Promise.all([
    Product.find(filter).limit(Number(limit)).skip((Number(page)-1)*Number(limit)),
    Product.countDocuments(filter),
  ])

  const categoryMap = await getCategoryMap()
  const populatedProducts = products.map(p => populateProductCategory(p, categoryMap))

  return {
    products: populatedProducts,
    total,
    page: Number(page),
    pages: Math.ceil(total / Number(limit))
  }
}

export const getByCategory = async (category, { page=1, limit=10, subcategory } = {}) => {
  const cat = await Category.findOne({
    $or: [
      { slug: category.toLowerCase() },
      { name: category },
      ...(mongoose.Types.ObjectId.isValid(category) ? [{ _id: category }] : [])
    ]
  })
  const filter = {}
  if (cat) {
    filter.$or = [
      { category: cat.slug },
      { category: cat._id.toString() }
    ]
  } else {
    filter.category = { $regex: `^${escapeRegex(category)}$`, $options: 'i' }
  }
  if (subcategory) filter.subcategory = { $regex: `^${escapeRegex(subcategory)}$`, $options: 'i' }

  const [products, total] = await Promise.all([
    Product.find(filter).limit(Number(limit)).skip((Number(page)-1)*Number(limit)),
    Product.countDocuments(filter),
  ])

  const categoryMap = await getCategoryMap()
  const populatedProducts = products.map(p => populateProductCategory(p, categoryMap))

  return {
    products: populatedProducts,
    total,
    page: Number(page),
    pages: Math.ceil(total / Number(limit))
  }
}

export const getById = async (idOrSlug) => {
  const p = await findProduct(idOrSlug)
  if (!p) throw err(ERRORS.PRODUCT_NOT_FOUND, STATUS.NOT_FOUND)

  const categoryMap = await getCategoryMap()
  return populateProductCategory(p, categoryMap)
}

/** Raw Mongo document lookup — accepts product slug or MongoDB _id */
export const findProductByIdOrSlug = findProduct

export const create = async (data) => {
  // Validate: discountPrice must be less than price
  if (data.discountPrice != null && data.discountPrice >= data.price) {
    throw err('Discount price must be less than the actual price', STATUS.BAD_REQUEST)
  }
  normalizeProductFields(data)
  if (data.category) {
    data.category = await resolveCategorySlug(data.category)
  }
  if (data.name && !data.slug) {
    data.slug = slugify(data.name)
  }
  const product = await Product.create(data)
  // Fire-and-forget — never let a vector failure block product creation
  embedProduct(product).catch(() => {})

  const categoryMap = await getCategoryMap()
  return populateProductCategory(product, categoryMap)
}

export const update = async (idOrSlug, data) => {
  const existing = await findProduct(idOrSlug)
  if (!existing) throw err(ERRORS.PRODUCT_NOT_FOUND, STATUS.NOT_FOUND)

  // Validate: discountPrice must be less than the effective price (updated or existing)
  const effectivePrice = data.price ?? existing.price
  if (data.discountPrice != null && data.discountPrice >= effectivePrice) {
    throw err('Discount price must be less than the actual price', STATUS.BAD_REQUEST)
  }

  normalizeProductFields(data)
  if (data.category) {
    data.category = await resolveCategorySlug(data.category)
  }
  if (data.name && !data.slug) {
    data.slug = slugify(data.name)
  }
  const p = await Product.findByIdAndUpdate(existing._id, data, { returnDocument: 'after' })
  // Re-embed so the vector stays in sync with the latest product data
  embedProduct(p).catch(() => {})

  const categoryMap = await getCategoryMap()
  return populateProductCategory(p, categoryMap)
}

export const remove = async (idOrSlug) => {
  const existing = await findProduct(idOrSlug)
  if (!existing) throw err(ERRORS.PRODUCT_NOT_FOUND, STATUS.NOT_FOUND)
  await Product.findByIdAndDelete(existing._id)
  // Remove the vector from Pinecone — fire-and-forget
  deleteProductVector(existing._id).catch(() => {})
  return existing
}

export const getFacets = async () => {
  const brands = await Product.distinct('brand', {
    isActive: { $ne: false },
    brand: { $exists: true, $nin: ['', null] },
  })
  return {
    brands: brands.filter(Boolean).sort((a, b) => a.localeCompare(b)),
  }
}

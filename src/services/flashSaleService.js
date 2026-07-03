import FlashSale from '../models/FlashSale.js'
import Product   from '../models/Product.js'
import { STATUS, ERRORS } from '../constants/httpConstants.js'

// Shared error factory — same pattern used across all services
const err = (msg, code) => Object.assign(new Error(msg), { statusCode: code })

// ── createFlashSale ────────────────────────────────────────────────────────────
// Enforces one-active-at-a-time, validates products exist, computes endTime.
export const createFlashSale = async ({ title, productIds, duration = 6, userId }) => {
  // One active sale at a time
  const existing = await FlashSale.findOne({ isActive: true, endTime: { $gt: new Date() } })
  if (existing) throw err(ERRORS.FLASH_SALE_ALREADY_ACTIVE, STATUS.CONFLICT)

  // Validate all supplied product IDs actually exist
  const products = await Product.find({ _id: { $in: productIds } }).select('_id')
  if (products.length !== productIds.length)
    throw err(ERRORS.PRODUCT_NOT_FOUND, STATUS.NOT_FOUND)

  const startTime = new Date()
  const endTime   = new Date(startTime.getTime() + duration * 60 * 60 * 1000)

  const sale = await FlashSale.create({
    title,
    products: productIds,
    duration,
    startTime,
    endTime,
    isActive:  true,
    createdBy: userId,
  })

  return sale
}

// ── getActiveFlashSale ─────────────────────────────────────────────────────────
// Public endpoint — called by the hero section every 60 s via polling.
// Populates product fields needed to render the deal cards.
export const getActiveFlashSale = async () => {
  const sale = await FlashSale
    .findOne({ isActive: true, endTime: { $gt: new Date() } })
    .populate('products', 'name slug images price discountPrice rating numReviews iconName')

  if (!sale) return { active: false }

  return {
    active: true,
    sale: {
      _id:       sale._id,
      title:     sale.title,
      startTime: sale.startTime,
      endTime:   sale.endTime,
      duration:  sale.duration,
      products:  sale.products,
    },
  }
}

// ── terminateFlashSale ─────────────────────────────────────────────────────────
// Admin can kill a sale early at any time.
export const terminateFlashSale = async (saleId) => {
  const sale = await FlashSale.findById(saleId)
  if (!sale)        throw err(ERRORS.FLASH_SALE_NOT_FOUND,  STATUS.NOT_FOUND)
  if (!sale.isActive) throw err(ERRORS.FLASH_SALE_NOT_ACTIVE, STATUS.CONFLICT)

  sale.isActive = false
  await sale.save()
  return sale
}

// ── getAllFlashSales ────────────────────────────────────────────────────────────
// Admin history view — newest first.
export const getAllFlashSales = async () => {
  return FlashSale
    .find()
    .sort({ createdAt: -1 })
    .populate('products', 'name price discountPrice images')
    .populate('createdBy', 'name email')
}

// ── deleteFlashSale ────────────────────────────────────────────────────────────
// Only allows deletion of non-active (expired or terminated) sales.
export const deleteFlashSale = async (saleId) => {
  const sale = await FlashSale.findById(saleId)
  if (!sale)         throw err(ERRORS.FLASH_SALE_NOT_FOUND,  STATUS.NOT_FOUND)
  if (sale.isActive) throw err(ERRORS.FLASH_SALE_STILL_ACTIVE, STATUS.CONFLICT)

  await sale.deleteOne()
}

// ── expireOverdueSales ─────────────────────────────────────────────────────────
// Called by flashSaleJob every minute. Bulk-sets isActive: false on any sale
// whose endTime has passed. Returns the number of records updated.
export const expireOverdueSales = async () => {
  const result = await FlashSale.updateMany(
    { isActive: true, endTime: { $lte: new Date() } },
    { $set: { isActive: false } }
  )
  return result.modifiedCount
}

import mongoose from 'mongoose'
import Wishlist from '../models/Wishlist.js'
import Product from '../models/Product.js'
import { STATUS, ERRORS } from '../constants/httpConstants.js'

const err = (msg, code) => Object.assign(new Error(msg), { statusCode: code })

// ── GET /api/wishlist ──────────────────────────────────────────────────────────
// Returns the user's wishlist with products populated.
// If no wishlist exists yet, returns an empty wishlist shape.
export const getWishlist = async (userId) => {
  let wishlist = await Wishlist.findOne({ userId }).populate('products')
  if (!wishlist) {
    // Return a virtual empty wishlist — do not persist until something is added
    return { userId, products: [] }
  }
  return wishlist
}

// ── POST /api/wishlist/:productId ─────────────────────────────────────────────
// Adds a product to the wishlist.
// Creates the wishlist document on first add (upsert).
export const addToWishlist = async (userId, productId) => {
  // Validate ObjectId format
  if (!mongoose.Types.ObjectId.isValid(productId)) {
    throw err(ERRORS.PRODUCT_NOT_FOUND, STATUS.NOT_FOUND)
  }

  // Check product exists
  const product = await Product.findById(productId)
  if (!product) throw err(ERRORS.PRODUCT_NOT_FOUND, STATUS.NOT_FOUND)

  // Find or create wishlist
  let wishlist = await Wishlist.findOne({ userId })

  if (!wishlist) {
    wishlist = await Wishlist.create({ userId, products: [productId] })
    return wishlist.populate('products')
  }

  // Check for duplicate
  const alreadyAdded = wishlist.products.some(id => id.toString() === productId.toString())
  if (alreadyAdded) {
    throw err('Product already in wishlist', STATUS.CONFLICT)
  }

  wishlist.products.push(productId)
  await wishlist.save()

  return wishlist.populate('products')
}

// ── DELETE /api/wishlist/:productId ───────────────────────────────────────────
// Removes a product from the wishlist.
// Silently succeeds even if the product wasn't in the list.
export const removeFromWishlist = async (userId, productId) => {
  const wishlist = await Wishlist.findOneAndUpdate(
    { userId },
    { $pull: { products: productId } },
    { returnDocument: 'after' }
  ).populate('products')

  // If no wishlist exists, return empty wishlist shape
  if (!wishlist) return { userId, products: [] }

  return wishlist
}

// ── DELETE /api/wishlist ──────────────────────────────────────────────────────
// Clears all products from the user's wishlist.
export const clearWishlist = async (userId) => {
  const wishlist = await Wishlist.findOneAndUpdate(
    { userId },
    { $set: { products: [] } },
    { returnDocument: 'after' },
  ).populate('products')

  if (!wishlist) return { userId, products: [] }

  return wishlist
}

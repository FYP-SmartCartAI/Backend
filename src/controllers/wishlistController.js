import * as wishlistService from '../services/wishlistService.js'

// ── GET /api/wishlist ──────────────────────────────────────────────────────────
export const getWishlist = async (req, res, next) => {
  try {
    const wishlist = await wishlistService.getWishlist(req.user._id)
    res.json({ success: true, data: { wishlist } })
  } catch (err) { next(err) }
}

// ── POST /api/wishlist/:productId ─────────────────────────────────────────────
export const addToWishlist = async (req, res, next) => {
  try {
    const wishlist = await wishlistService.addToWishlist(req.user._id, req.params.productId)
    res.json({ success: true, data: { wishlist } })
  } catch (err) { next(err) }
}

// ── DELETE /api/wishlist/:productId ───────────────────────────────────────────
export const removeFromWishlist = async (req, res, next) => {
  try {
    const wishlist = await wishlistService.removeFromWishlist(req.user._id, req.params.productId)
    res.json({ success: true, data: { wishlist } })
  } catch (err) { next(err) }
}

// ── DELETE /api/wishlist ──────────────────────────────────────────────────────
export const clearWishlist = async (req, res, next) => {
  try {
    const wishlist = await wishlistService.clearWishlist(req.user._id)
    res.json({ success: true, data: { wishlist } })
  } catch (err) { next(err) }
}

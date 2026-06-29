import Review from '../models/Review.js'
import Product from '../models/Product.js'
import { STATUS, ERRORS } from '../constants/httpConstants.js'

const err = (msg, code) => Object.assign(new Error(msg), { statusCode: code })

async function recalcRating(productId) {
  const reviews = await Review.find({ product: productId })
  const avg = reviews.length
    ? reviews.reduce((s, r) => s + r.rating, 0) / reviews.length
    : 0
  await Product.findByIdAndUpdate(productId, { rating: Number(avg.toFixed(2)) })
}

export const addReview = async (userId, productId, { rating, comment }) => {
  const p = await Product.findById(productId)
  if (!p) throw err(ERRORS.PRODUCT_NOT_FOUND, STATUS.NOT_FOUND)

  const existing = await Review.findOne({ user: userId, product: productId })
  if (existing) throw err(ERRORS.REVIEW_DUPLICATE, STATUS.CONFLICT)

  const review = await Review.create({ user: userId, product: productId, rating, comment })
  await recalcRating(productId)
  return review
}

export const getReviewsForProduct = async (productId) => {
  return Review.find({ product: productId }).populate('user', 'name')
}

export const updateReview = async (userId, reviewId, { rating, comment }) => {
  const rev = await Review.findById(reviewId)
  if (!rev) throw err(ERRORS.REVIEW_NOT_FOUND, STATUS.NOT_FOUND)
  if (rev.user.toString() !== userId.toString())
    throw err(ERRORS.REVIEW_UNAUTHORIZED, STATUS.FORBIDDEN)

  if (rating  !== undefined) rev.rating  = rating
  if (comment !== undefined) rev.comment = comment
  await rev.save()
  await recalcRating(rev.product)
  return rev
}

export const deleteReview = async (userId, reviewId, isAdmin = false) => {
  const rev = await Review.findById(reviewId)
  if (!rev) throw err(ERRORS.REVIEW_NOT_FOUND, STATUS.NOT_FOUND)
  if (!isAdmin && rev.user.toString() !== userId.toString())
    throw err(ERRORS.REVIEW_UNAUTHORIZED, STATUS.FORBIDDEN)

  const productId = rev.product
  await Review.findByIdAndDelete(reviewId)
  await recalcRating(productId)
  return true
}

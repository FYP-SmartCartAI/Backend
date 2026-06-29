import * as reviewService from '../services/reviewService.js'
import { STATUS } from '../constants/httpConstants.js'

export const add = async (req, res, next) => {
  try {
    const review = await reviewService.addReview(req.user._id, req.params.productId, req.body)
    res.status(STATUS.CREATED).json({ success: true, data: review })
  } catch (err) { next(err) }
}

export const getForProduct = async (req, res, next) => {
  try {
    const items = await reviewService.getReviewsForProduct(req.params.productId)
    res.json({ success: true, data: items })
  } catch (err) { next(err) }
}

export const updateReview = async (req, res, next) => {
  try {
    const review = await reviewService.updateReview(req.user._id, req.params.id, req.body)
    res.json({ success: true, data: review })
  } catch (err) { next(err) }
}

export const deleteReview = async (req, res, next) => {
  try {
    await reviewService.deleteReview(req.user._id, req.params.id, req.user.role === 'admin')
    res.json({ success: true })
  } catch (err) { next(err) }
}

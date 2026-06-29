import * as cartService from '../services/cartService.js'

export const getCart = async (req, res, next) => {
  try {
    const cart = await cartService.getCartForUser(req.user._id)
    res.json({ success: true, data: cart })
  } catch (err) { next(err) }
}

export const add = async (req, res, next) => {
  try {
    const cart = await cartService.addItem(req.user._id, req.body)
    res.json({ success: true, data: cart })
  } catch (err) { next(err) }
}

export const update = async (req, res, next) => {
  try {
    const cart = await cartService.updateItem(req.user._id, req.body)
    res.json({ success: true, data: cart })
  } catch (err) { next(err) }
}

export const remove = async (req, res, next) => {
  try {
    const cart = await cartService.removeItem(req.user._id, req.params.productId)
    res.json({ success: true, data: cart })
  } catch (err) { next(err) }
}

export const clear = async (req, res, next) => {
  try {
    const cart = await cartService.clearCart(req.user._id)
    res.json({ success: true, data: cart })
  } catch (err) { next(err) }
}

export const verifyStock = async (req, res, next) => {
  try {
    const result = await cartService.verifyCartStock(req.user._id)
    res.json({ success: true, data: result })
  } catch (err) { next(err) }
}

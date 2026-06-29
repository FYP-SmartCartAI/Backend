import Cart from '../models/Cart.js'
import Product from '../models/Product.js'
import { STATUS, ERRORS } from '../constants/httpConstants.js'
import { logAction } from './behaviorService.js'

const err = (msg, code) => Object.assign(new Error(msg), { statusCode: code })

/** Cart with no items is not actively abandoned — reset flags for accurate admin stats */
const syncAbandonmentWhenEmpty = (cart) => {
  if (!cart.items?.length) {
    cart.isAbandoned = false
    cart.abandonedAt = null
    cart.total = 0
  }
}

export const getCartForUser = async (userId) => {
  let cart = await Cart.findOne({ user: userId }).populate('items.product')
  if (!cart) cart = await Cart.create({ user: userId, items: [] })
  return cart
}

export const addItem = async (userId, { productId, quantity = 1 }) => {
  if (quantity < 1) throw err(ERRORS.INVALID_QUANTITY, STATUS.BAD_REQUEST)
  const p = await Product.findById(productId)
  if (!p) throw err(ERRORS.PRODUCT_NOT_FOUND, STATUS.NOT_FOUND)
  if (p.stock !== undefined && p.stock < quantity)
    throw err(ERRORS.OUT_OF_STOCK(p.name, p.stock), STATUS.CONFLICT)

  let cart = await Cart.findOne({ user: userId })
  if (!cart) cart = await Cart.create({ user: userId, items: [] })
  const idx = cart.items.findIndex(it => it.product.toString() === productId.toString())
  if (idx >= 0) {
    const newQty = cart.items[idx].quantity + quantity
    if (p.stock !== undefined && p.stock < newQty)
      throw err(ERRORS.OUT_OF_STOCK(p.name, p.stock), STATUS.CONFLICT)
    cart.items[idx].quantity = newQty
    cart.items[idx].price    = p.price
  } else {
    cart.items.push({ product: p._id, quantity, price: p.price })
  }
  cart.total = cart.items.reduce((s, it) => s + it.price * it.quantity, 0)
  await cart.save()

  // Log behavior — fire-and-forget, never blocks the cart response
  logAction(userId, { productId, action: 'add_to_cart' }).catch(() => {})

  return cart
}

export const updateItem = async (userId, { productId, quantity }) => {
  const cart = await Cart.findOne({ user: userId })
  if (!cart) throw err(ERRORS.CART_NOT_FOUND, STATUS.NOT_FOUND)
  const idx = cart.items.findIndex(it => it.product.toString() === productId.toString())
  if (idx < 0) throw err(ERRORS.ITEM_NOT_IN_CART, STATUS.NOT_FOUND)
  if (quantity <= 0) {
    cart.items.splice(idx, 1)
    cart.total = cart.items.reduce((s, it) => s + it.price * it.quantity, 0)
    syncAbandonmentWhenEmpty(cart)
    await cart.save()
    logAction(userId, { productId, action: 'remove_from_cart' }).catch(() => {})
    return cart
  }
  const p = await Product.findById(productId)
  if (!p) throw err(ERRORS.PRODUCT_NOT_FOUND, STATUS.NOT_FOUND)
  if (p.stock !== undefined && p.stock < quantity) {
    throw err(ERRORS.OUT_OF_STOCK(p.name, p.stock), STATUS.CONFLICT)
  }
  cart.items[idx].quantity = quantity
  cart.total = cart.items.reduce((s, it) => s + it.price * it.quantity, 0)
  await cart.save()
  return cart
}

export const removeItem = async (userId, productId) => {
  const cart = await Cart.findOne({ user: userId })
  if (!cart) throw err(ERRORS.CART_NOT_FOUND, STATUS.NOT_FOUND)
  cart.items = cart.items.filter(it => it.product.toString() !== productId.toString())
  cart.total = cart.items.reduce((s, it) => s + it.price * it.quantity, 0)
  syncAbandonmentWhenEmpty(cart)
  await cart.save()
  logAction(userId, { productId, action: 'remove_from_cart' }).catch(() => {})
  return cart
}

export const clearCart = async (userId) => {
  const cart = await Cart.findOne({ user: userId })
  if (!cart) return Cart.create({ user: userId, items: [] })
  cart.items = []
  cart.total = 0
  syncAbandonmentWhenEmpty(cart)
  await cart.save()
  return cart
}

export const verifyCartStock = async (userId) => {
  const cart = await Cart.findOne({ user: userId }).populate('items.product')
  if (!cart || cart.items.length === 0) {
    return { success: true, errors: [] }
  }

  const errors = []
  for (const item of cart.items) {
    const p = item.product
    if (!p) {
      errors.push('One of the products in your cart is no longer available.')
      continue
    }
    if (p.stock !== undefined && p.stock < item.quantity) {
      errors.push(ERRORS.OUT_OF_STOCK(p.name, p.stock))
    }
  }

  return {
    success: errors.length === 0,
    errors,
  }
}

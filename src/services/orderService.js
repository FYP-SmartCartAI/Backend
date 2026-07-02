import mongoose from 'mongoose'
import Order from '../models/Order.js'
import Product from '../models/Product.js'
import Cart from '../models/Cart.js'
import { STATUS, ERRORS } from '../constants/httpConstants.js'
import { sendToTopic } from '../utils/notificationService.js'
import { notifyOrderStatusChange, notifyAllAdmins, notifySubadminsByCity } from './notificationService.js'
import { logAction } from './behaviorService.js'

const err = (msg, code) => Object.assign(new Error(msg), { statusCode: code })

/** Returns the active selling price — discountPrice takes priority over price */
const effectivePrice = (product) =>
  (product.discountPrice != null && product.discountPrice < product.price)
    ? product.discountPrice
    : product.price

// ── Role-scoped status transition rules ───────────────────────────────────────
// admin & subadmin can transition to any forward status, but never backwards
const ADMIN_TRANSITIONS = {
  pending:       ['confirmed', 'processing', 'shipped', 'delivered', 'cancelled'],
  confirmed:     ['processing', 'shipped', 'delivered', 'cancelled'],
  processing:    ['shipped',    'delivered', 'cancelled'],
  shipped:       ['delivered',  'cancelled'],
  delivered:     ['cod_collected'],   // admin fallback — only valid for COD orders (enforced below)
  cancelled:     [],
  cod_collected: [],
}
const SUBADMIN_TRANSITIONS = {
  // Subadmin only acts AFTER admin ships the order.
  // pending / confirmed / processing / cancelling are admin-only.
  pending:       [],   // locked — admin must confirm & ship first
  confirmed:     [],   // locked — admin must process & ship first
  processing:    [],   // locked — admin must ship first
  shipped:       ['delivered'],           // subadmin confirms delivery in their city
  delivered:     ['cod_collected'],       // subadmin marks COD cash received
  cancelled:     [],
  cod_collected: [],
}

export const placeOrder = async (userId, items, shippingAddress, paymentMethod = 'stripe') => {
  if (!items || !Array.isArray(items) || items.length === 0)
    throw err(ERRORS.NO_ITEMS, STATUS.BAD_REQUEST)
  if (!shippingAddress?.city)
    throw err(ERRORS.SHIPPING_ADDRESS_REQUIRED, STATUS.BAD_REQUEST)

  // Service-layer guard — defends against direct calls bypassing route validation
  for (const item of items) {
    if (!Number.isInteger(item.quantity) || item.quantity < 1)
      throw err(ERRORS.INVALID_QUANTITY, STATUS.BAD_REQUEST)
  }

  const session = await mongoose.startSession()
  session.startTransaction()

  try {
    // ── Step 1: Fetch real prices from DB ────────────────────────────────────
    const productIds = items.map(it => it.product)
    const dbProducts = await Product.find({ _id: { $in: productIds } }).session(session)
    const productMap = Object.fromEntries(dbProducts.map(p => [p._id.toString(), p]))

    for (const item of items) {
      if (!productMap[item.product?.toString()])
        throw err(ERRORS.PRODUCT_NOT_FOUND, STATUS.NOT_FOUND)
    }

    const sanitizedItems = items.map(item => {
      const p     = productMap[item.product.toString()]
      const price = effectivePrice(p)
      return {
        product:       item.product,
        name:          p.name,
        qty:           item.quantity,
        price,                            // the price actually charged
        originalPrice: p.price,           // kept for receipt / history
        image:         p.images?.[0] || '',
      }
    })

    // ── Step 2: Atomic stock check + decrement ───────────────────────────────
    for (const item of sanitizedItems) {
      const updated = await Product.findOneAndUpdate(
        { _id: item.product, stock: { $gte: item.qty } },
        { $inc: { stock: -item.qty } },
        { returnDocument: 'after', session }
      )
      if (!updated) {
        const product = productMap[item.product.toString()]
        throw err(ERRORS.OUT_OF_STOCK(product.name, product.stock), STATUS.CONFLICT)
      }
    }

    // ── Step 3: Create order ─────────────────────────────────────────────────
    const subtotal = sanitizedItems.reduce((s, it) => s + (it.price * it.qty), 0)
    const [order] = await Order.create([{
      userId,
      items: sanitizedItems,
      subtotal,
      total: subtotal,
      shippingAddress,
      paymentMethod,
      paymentStatus: paymentMethod === 'cod' ? 'cod_pending' : 'pending',
    }], { session })

    await session.commitTransaction()
    session.endSession()

    // ── Clear the user's cart after successful order ──────────────────────────
    // Fire-and-forget — a cart clear failure must never roll back a committed order
    Cart.findOneAndUpdate(
      { user: userId },
      { $set: { items: [], total: 0, subtotal: 0 } }
    ).catch(() => {})

    // ── Staff notifications: new order placement ─────────────────────────────
    const orderRef = order.orderNumber || order._id.toString().slice(-6).toUpperCase()
    notifyAllAdmins({
      type: 'new_order',
      title: '📦 New Order Placed',
      body: `Order #${orderRef} has been placed by a customer.`,
      refId: order._id,
      refModel: 'Order',
      data: { orderId: order._id.toString(), screen: 'orders' }
    }).catch(() => {})

    if (shippingAddress?.city) {
      notifySubadminsByCity(shippingAddress.city, {
        type: 'new_order',
        title: '📦 New Order in Your City',
        body: `Order #${orderRef} has been placed in ${shippingAddress.city}.`,
        refId: order._id,
        refModel: 'Order',
        data: { orderId: order._id.toString(), screen: 'orders' }
      }).catch(() => {})
    }

    // Check stock alerts (low stock / out of stock)
    (async () => {
      try {
        const productIds = sanitizedItems.map(it => it.product)
        const updatedProducts = await Product.find({ _id: { $in: productIds } }).select('name stock')
        for (const p of updatedProducts) {
          if (p.stock === 0) {
            await notifyAllAdmins({
              type: 'out_of_stock',
              title: '🚨 Out of Stock Alert',
              body: `${p.name} is now out of stock!`,
              refId: p._id,
              refModel: 'Product',
            })
          } else if (p.stock <= 5) {
            await notifyAllAdmins({
              type: 'low_stock',
              title: '⚠️ Low Stock Alert',
              body: `${p.name} has only ${p.stock} units left!`,
              refId: p._id,
              refModel: 'Product',
            })
          }
        }
      } catch (err) {
        console.error('[orderService] stock notification check failed:', err.message)
      }
    })().catch(() => {})

    // ── Push notification: new COD order → notify admin topic ────────────────
    // Fire-and-forget — never let a notification failure roll back the order
    if (paymentMethod === 'cod') {
      sendToTopic('admins', {
        title: '💵 New COD Order',
        body:  `Order #${order._id} placed via Cash on Delivery`,
        data:  { orderId: order._id.toString(), type: 'cod_order_placed' },
      }).catch(() => {})
    }

    // ── Behavior log: purchase signal for each item ───────────────────────────
    // Strongest recommendation signal — fire-and-forget per item
    for (const item of sanitizedItems) {
      logAction(userId, {
        productId: item.product,
        action:    'purchase',
        price:     item.price,
      }).catch(() => {})
    }

    return order

  } catch (e) {
    await session.abortTransaction()
    session.endSession()
    throw e
  }
}

export const getUserOrders = async (userId, { page = 1, limit = 10, status } = {}) => {
  const safePage  = Math.max(1, parseInt(page)  || 1)
  const safeLimit = Math.min(Math.max(1, parseInt(limit) || 10), 100)

  const filter = { userId }
  const VALID_STATUS = ['pending', 'processing', 'shipped', 'delivered', 'cancelled', 'cod_collected']
  
  if (status && VALID_STATUS.includes(status)) {
    filter.status = status
  }

  const [orders, total] = await Promise.all([
    Order.find(filter)
      .sort({ createdAt: -1 })
      .skip((safePage - 1) * safeLimit)
      .limit(safeLimit),
    Order.countDocuments(filter),
  ])

  return {
    orders,
    total,
    page: safePage,
    pages: Math.ceil(total / safeLimit),
  }
}

export const getOrderById = async (id, userId, actor = { role: 'user', city: null }) => {
  const order = await Order.findById(id).populate('items.product')
  if (!order) throw err(ERRORS.ORDER_NOT_FOUND, STATUS.NOT_FOUND)

  if (actor.role === 'admin') return order  // full access

  if (actor.role === 'subadmin') {
    // Subadmin can only view orders in their assigned city
    const orderCity = order.shippingAddress?.city?.toLowerCase()
    if (!orderCity || orderCity !== actor.city?.toLowerCase())
      throw err(ERRORS.ORDER_CITY_MISMATCH, STATUS.FORBIDDEN)
    return order
  }

  // Regular user: can only view their own orders
  if (order.userId.toString() !== userId.toString())
    throw err(ERRORS.NOT_AUTHORIZED, STATUS.FORBIDDEN)
  return order
}

export const cancelOrder = async (userId, orderId) => {
  const session = await mongoose.startSession()
  session.startTransaction()

  try {
    const order = await Order.findById(orderId).populate('items.product').session(session)
    if (!order) throw err(ERRORS.ORDER_NOT_FOUND, STATUS.NOT_FOUND)
    if (order.userId.toString() !== userId.toString())
      throw err(ERRORS.NOT_AUTHORIZED, STATUS.FORBIDDEN)
    if (order.status === 'cancelled')
      throw err(ERRORS.ORDER_ALREADY_CANCELLED, STATUS.CONFLICT)
    if (order.status === 'shipped' || order.status === 'delivered')
      throw err(ERRORS.ORDER_CANCEL_DENIED, STATUS.CONFLICT)
    // Block cancellation of paid Stripe orders — a refund must be issued first
    if (order.paymentStatus === 'paid')
      throw err(ERRORS.ORDER_CANCEL_PAID, STATUS.CONFLICT)

    order.status = 'cancelled'
    // For COD orders that haven't been collected yet, reset paymentStatus to 'pending'
    // so reporting is clean and no phantom cod_pending entries exist
    if (order.paymentMethod === 'cod' && order.paymentStatus === 'cod_pending') {
      order.paymentStatus = 'pending'
    }
    await order.save({ session })

    await Promise.all(
      order.items.map(item =>
        Product.findByIdAndUpdate(item.product, { $inc: { stock: item.qty } }, { session })
      )
    )

    await session.commitTransaction()
    session.endSession()

    notifyOrderStatusChange(order, 'cancelled').catch(() => {})

    return order

  } catch (e) {
    await session.abortTransaction()
    session.endSession()
    throw e
  }
}

export const adminListOrders = async ({ page = 1, limit = 20, status, paymentMethod, paymentStatus, cityFilter } = {}) => {
  // Sanitize pagination — non-numeric values become NaN which breaks .skip()
  const safePage  = Math.max(1, parseInt(page)  || 1)
  const safeLimit = Math.min(Math.max(1, parseInt(limit) || 20), 100)

  // Whitelist enum values to prevent MongoDB operator injection via qs-parsed objects
  const VALID_STATUS         = ['pending','confirmed','processing','shipped','delivered','cancelled','cod_collected']
  const VALID_PAYMENT_METHOD = ['stripe','cod']
  const VALID_PAYMENT_STATUS = ['unpaid','paid','cod_pending','cod_collected']

  const filter = {}
  if (status        && VALID_STATUS.includes(status))                filter.status        = status
  if (paymentMethod && VALID_PAYMENT_METHOD.includes(paymentMethod)) filter.paymentMethod = paymentMethod
  if (paymentStatus && VALID_PAYMENT_STATUS.includes(paymentStatus)) filter.paymentStatus = paymentStatus
  if (cityFilter && typeof cityFilter === 'string') {
    // Escape regex special characters to prevent ReDoS
    const escaped = cityFilter.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    filter['shippingAddress.city'] = new RegExp(`^${escaped}$`, 'i')
  }

  const [orders, total] = await Promise.all([
    Order.find(filter)
      .populate('userId', 'name email')
      .sort({ createdAt: -1 })
      .skip((safePage - 1) * safeLimit)
      .limit(safeLimit),
    Order.countDocuments(filter),
  ])
  return { orders, total, page: safePage, pages: Math.ceil(total / safeLimit) }
}

export const updateOrderStatus = async (orderId, newStatus, actor = { role: 'admin', city: null }) => {
  const order = await Order.findById(orderId)
  if (!order) throw err(ERRORS.ORDER_NOT_FOUND, STATUS.NOT_FOUND)

  const currentStatus = order.status

  // ── Guard: prevent double-collecting a COD order ──────────────────────────
  if (newStatus === 'cod_collected' && order.paymentStatus === 'cod_collected')
    throw err(ERRORS.COD_ALREADY_COLLECTED, STATUS.CONFLICT)

  // ── Role-scoped transition guard ──────────────────────────────────────────
  let allowed = []
  if (actor.role === 'admin') {
    allowed = ADMIN_TRANSITIONS[currentStatus] || []
    if (!allowed.includes(newStatus))
      throw err(ERRORS.STATUS_TRANSITION_DENIED(currentStatus, newStatus), STATUS.CONFLICT)

    // Admin can only mark cod_collected on COD orders — not on Stripe-paid orders
    if (newStatus === 'cod_collected' && order.paymentMethod !== 'cod')
      throw err(ERRORS.COD_ONLY_TRANSITION, STATUS.CONFLICT)

  } else if (actor.role === 'subadmin') {
    // City check — subadmin can only update orders from their city
    const orderCity = order.shippingAddress?.city?.toLowerCase()
    const adminCity = actor.city?.toLowerCase()
    if (!orderCity || !adminCity || orderCity !== adminCity)
      throw err(ERRORS.ORDER_CITY_MISMATCH, STATUS.FORBIDDEN)

    allowed = SUBADMIN_TRANSITIONS[currentStatus] || []
    if (!allowed.includes(newStatus))
      throw err(ERRORS.STATUS_TRANSITION_DENIED(currentStatus, newStatus), STATUS.CONFLICT)

    // Subadmin can only mark cod_collected on COD orders
    if (newStatus === 'cod_collected' && order.paymentMethod !== 'cod')
      throw err(ERRORS.COD_ONLY_TRANSITION, STATUS.CONFLICT)

  } else {
    throw err(ERRORS.ADMIN_ONLY, STATUS.FORBIDDEN)
  }

  // ── Build the update payload ───────────────────────────────────────────────
  // When marking cod_collected: sync paymentStatus atomically in the same write
  const updatePayload = { status: newStatus }
  if (newStatus === 'cod_collected') {
    updatePayload.paymentStatus = 'cod_collected'
  }

  // ── Atomic update — only succeeds if status hasn't changed since the guard ran ──
  const updated = await Order.findOneAndUpdate(
    { _id: orderId, status: currentStatus },   // TOCTOU guard
    updatePayload,
    { returnDocument: 'after', runValidators: true }
  )

  if (!updated) throw err(ERRORS.STATUS_TRANSITION_DENIED(currentStatus, newStatus), STATUS.CONFLICT)

  notifyOrderStatusChange(updated, newStatus).catch(() => {})

  if (newStatus === 'cod_collected') {
    const orderRef = updated.orderNumber || updated._id.toString().slice(-6).toUpperCase()
    notifyAllAdmins({
      type: 'cod_collected_admin',
      title: '💵 COD Cash Collected',
      body: `COD payment has been collected for order #${orderRef} in ${updated.shippingAddress?.city || 'city'}.`,
      refId: updated._id,
      refModel: 'Order',
      data: { orderId: updated._id.toString(), screen: 'orders' }
    }).catch(() => {})
  }

  return updated
}

// ── collectCod (dedicated endpoint logic) ────────────────────────────────────
// Marks an order as cod_collected with full validation.
// Used by PATCH /api/orders/:id/cod-collect (admin + subadmin city-scoped).
export const collectCod = async (orderId, actor) => {
  const order = await Order.findById(orderId)
  if (!order) throw err(ERRORS.ORDER_NOT_FOUND, STATUS.NOT_FOUND)

  // Validate: must be COD order
  if (order.paymentMethod !== 'cod')
    throw err("This order is not a Cash on Delivery order", STATUS.BAD_REQUEST)

  // Validate: must be delivered before collecting
  if (order.status !== 'delivered')
    throw err("Order must be in 'delivered' status before collecting payment", STATUS.BAD_REQUEST)

  // Validate: not already collected
  if (order.paymentStatus === 'cod_collected')
    throw err(ERRORS.COD_ALREADY_COLLECTED, STATUS.CONFLICT)

  // Subadmin city check
  if (actor.role === 'subadmin') {
    const orderCity = order.shippingAddress?.city?.toLowerCase()
    const adminCity = actor.city?.toLowerCase()
    if (!orderCity || !adminCity || orderCity !== adminCity)
      throw err(ERRORS.ORDER_CITY_MISMATCH, STATUS.FORBIDDEN)
  }

  // Atomic update
  const updated = await Order.findOneAndUpdate(
    { _id: orderId, status: 'delivered', paymentStatus: { $ne: 'cod_collected' } },
    {
      $set: {
        status:        'cod_collected',
        paymentStatus: 'cod_collected',
      },
    },
    { returnDocument: 'after', runValidators: true }
  )

  if (!updated) throw err(ERRORS.COD_ALREADY_COLLECTED, STATUS.CONFLICT)

  notifyOrderStatusChange(updated, 'cod_collected').catch(() => {})

  const orderRef = updated.orderNumber || updated._id.toString().slice(-6).toUpperCase()
  notifyAllAdmins({
    type: 'cod_collected_admin',
    title: '💵 COD Cash Collected',
    body: `COD payment has been collected for order #${orderRef} in ${updated.shippingAddress?.city || 'city'}.`,
    refId: updated._id,
    refModel: 'Order',
    data: { orderId: updated._id.toString(), screen: 'orders' }
  }).catch(() => {})

  return updated
}

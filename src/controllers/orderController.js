import paymentService from '../services/paymentService.js'
import * as orderService from '../services/orderService.js'

export const checkout = async (req, res, next) => {
  try {
    const { items, shippingAddress, paymentMethod } = req.body
    const order = await orderService.placeOrder(req.user._id, items, shippingAddress, paymentMethod)
    // COD orders: no PaymentIntent needed — return order directly
    if (paymentMethod === 'cod') {
      return res.json({ success: true, data: { orderId: order._id, paymentMethod: 'cod' } })
    }
    const { clientSecret, paymentIntentId, amount } = await paymentService.createPaymentIntent({ orderId: order._id, userId: req.user._id })
    res.json({ success: true, data: { orderId: order._id, clientSecret, paymentIntentId, amount } })
  } catch (err) { next(err) }
}

export const getOrder = async (req, res, next) => {
  try {
    const actor = { role: req.user.role, city: req.user.city }
    const order = await orderService.getOrderById(req.params.id, req.user._id, actor)
    res.json({ success: true, data: order })
  } catch (err) { next(err) }
}

export const getUserOrders = async (req, res, next) => {
  try {
    const { status, page, limit } = req.query
    const result = await orderService.getUserOrders(req.user._id, { status, page, limit })
    res.json({ success: true, data: result })
  } catch (err) { next(err) }
}

export const cancelOrder = async (req, res, next) => {
  try {
    const order = await orderService.cancelOrder(req.user._id, req.params.id)
    res.json({ success: true, data: order })
  } catch (err) { next(err) }
}

export const adminList = async (req, res, next) => {
  try {
    // Subadmins only see orders for their city
    const cityFilter = req.user.role === 'subadmin' ? req.user.city : req.query.city || null
    const result = await orderService.adminListOrders({
      page:          req.query.page,
      limit:         req.query.limit,
      status:        req.query.status,
      paymentMethod: req.query.paymentMethod,
      paymentStatus: req.query.paymentStatus,
      cityFilter,
    })
    res.json({ success: true, ...result })
  } catch (err) { next(err) }
}

// ── GET /api/orders/cod-pending  (admin + subadmin) ───────────────────────────
// Shortcut for the ops dashboard: all delivered COD orders awaiting cash collection.
// Subadmins are automatically scoped to their city.
export const codPending = async (req, res, next) => {
  try {
    const cityFilter = req.user.role === 'subadmin' ? req.user.city : req.query.city || null
    const result = await orderService.adminListOrders({
      page:          req.query.page,
      limit:         req.query.limit,
      status:        'delivered',
      paymentMethod: 'cod',
      paymentStatus: 'cod_pending',
      cityFilter,
    })
    res.json({ success: true, ...result })
  } catch (err) { next(err) }
}

export const updateStatus = async (req, res, next) => {
  try {
    const actor = { role: req.user.role, city: req.user.city }
    const order = await orderService.updateOrderStatus(req.params.id, req.body.status, actor)
    res.json({ success: true, data: order })
  } catch (err) { next(err) }
}

// ── PATCH /api/orders/:id/cod-collect  (admin + subadmin) ─────────────────────
// Marks an order as cod_collected after the delivery driver collects cash.
// Subadmin: city-scoped — can only collect for orders in their assigned city.
export const collectCod = async (req, res, next) => {
  try {
    const actor = { role: req.user.role, city: req.user.city }
    const order = await orderService.collectCod(req.params.id, actor)
    res.json({ success: true, data: order })
  } catch (err) { next(err) }
}


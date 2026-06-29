import express from 'express'
const router = express.Router()
import { protect } from '../middlewares/authMiddleware.js'
import { admin } from '../middlewares/adminMiddleware.js'
import * as orderController from '../controllers/orderController.js'
import { body } from 'express-validator'
import { runValidation, validate } from '../middlewares/validateMiddleware.js'
import { idempotent } from '../middlewares/idempotencyMiddleware.js'
import { checkoutSchema } from '../utils/validators.js'

/**
 * @swagger
 * tags:
 *   name: Orders
 *   description: Place, view, cancel and manage orders
 */

// ─────────────────────────────────────────────────────────────────────────────
// ROUTE REGISTRATION ORDER — CRITICAL
// Static named routes (/all, /cod-pending, /checkout) MUST come before /:id.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * @swagger
 * /api/orders/all:
 *   get:
 *     tags: [Orders]
 *     summary: List all orders (Admin + Subadmin)
 *     description: >
 *       Admin sees all orders. Subadmin sees only orders in their assigned city.
 *       Supports filtering by status, paymentMethod, paymentStatus, and city.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema: { type: integer, default: 1 }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 20 }
 *       - in: query
 *         name: status
 *         schema: { type: string, enum: [pending,processing,shipped,delivered,cancelled,cod_collected] }
 *       - in: query
 *         name: paymentMethod
 *         schema: { type: string, enum: [stripe,cod] }
 *       - in: query
 *         name: city
 *         schema: { type: string }
 *         description: Admin only — filter by city (subadmins are auto-scoped)
 *     responses:
 *       200:
 *         description: Paginated orders
 *       401:
 *         description: Not authorized
 *       403:
 *         description: Admin or subadmin only
 */
// 1. Static — before /:id
router.get('/all', protect, admin, orderController.adminList)

/**
 * @swagger
 * /api/orders/cod-pending:
 *   get:
 *     tags: [Orders]
 *     summary: List delivered COD orders awaiting cash collection (Admin + Subadmin)
 *     description: >
 *       Shortcut for the ops dashboard. Returns all delivered COD orders with
 *       paymentStatus=cod_pending. Subadmins are auto-scoped to their city.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema: { type: integer, default: 1 }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 20 }
 *     responses:
 *       200:
 *         description: Paginated COD pending orders
 *       401:
 *         description: Not authorized
 *       403:
 *         description: Admin or subadmin only
 */
// 2. Static — before /:id
router.get('/cod-pending', protect, admin, orderController.codPending)

/**
 * @swagger
 * /api/orders/checkout:
 *   post:
 *     tags: [Orders]
 *     summary: Place a new order and create Stripe PaymentIntent
 *     description: >
 *       Idempotent — send an `Idempotency-Key` header (UUID) to prevent duplicate
 *       orders on network retries or double-clicks. Same key returns the cached response.
 *       For COD orders: returns orderId only (no Stripe intent created).
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: header
 *         name: Idempotency-Key
 *         schema: { type: string, format: uuid }
 *         description: Optional — prevents duplicate orders on retry
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/Checkout'
 *     responses:
 *       200:
 *         description: orderId + clientSecret (Stripe) or orderId only (COD)
 *       400:
 *         description: Validation error — missing items or shippingAddress.city
 *       401:
 *         description: Not authorized
 *       409:
 *         description: Duplicate Idempotency-Key — cached response returned
 *       422:
 *         description: Validation failed
 */
// 3. Static POST
router.post(
  '/checkout',
  protect,
  idempotent,
  validate(checkoutSchema),
  orderController.checkout,
)

/**
 * @swagger
 * /api/orders:
 *   get:
 *     tags: [Orders]
 *     summary: Get current user's own orders
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Array of orders
 *       401:
 *         description: Not authorized
 */
// 4. GET / (user's own orders)
router.get('/', protect, orderController.getUserOrders)

/**
 * @swagger
 * /api/orders/{id}:
 *   get:
 *     tags: [Orders]
 *     summary: Get single order by ID
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Order object
 *       401:
 *         description: Not authorized
 *       404:
 *         description: Order not found
 */
// 5. Dynamic /:id — AFTER all static routes
router.get('/:id', protect, orderController.getOrder)

/**
 * @swagger
 * /api/orders/{id}/cancel:
 *   put:
 *     tags: [Orders]
 *     summary: Cancel an order (user — before shipped; admin — any stage)
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Cancelled order
 *       400:
 *         description: Cannot cancel at this stage
 *       401:
 *         description: Not authorized
 *       404:
 *         description: Order not found
 */
// 6.
router.put('/:id/cancel', protect, orderController.cancelOrder)

/**
 * @swagger
 * /api/orders/{id}/status:
 *   put:
 *     tags: [Orders]
 *     summary: Update order status (Admin + Subadmin)
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [status]
 *             properties:
 *               status:
 *                 type: string
 *                 enum: [pending, processing, shipped, delivered, cancelled, cod_collected]
 *     responses:
 *       200:
 *         description: Updated order
 *       401:
 *         description: Not authorized
 *       404:
 *         description: Order not found
 */
// 7.
router.put(
  '/:id/status',
  protect, admin,
  body('status').notEmpty(),
  runValidation,
  orderController.updateStatus,
)

/**
 * @swagger
 * /api/orders/{id}/cod-collect:
 *   patch:
 *     tags: [Orders]
 *     summary: Mark COD order cash as collected (Admin + Subadmin city-scoped)
 *     description: >
 *       Only valid when order.paymentMethod=cod AND order.status=delivered.
 *       Subadmins can only collect for orders in their assigned city.
 *       Atomically sets status and paymentStatus to cod_collected.
 *       Sends Firebase push notification to the customer.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Order marked as cod_collected
 *       400:
 *         description: Not a COD order or not yet delivered
 *       401:
 *         description: Not authorized
 *       403:
 *         description: City mismatch (subadmin)
 *       404:
 *         description: Order not found
 *       409:
 *         description: Cash already collected for this order
 */
// 8.
router.patch('/:id/cod-collect', protect, admin, orderController.collectCod)

export default router

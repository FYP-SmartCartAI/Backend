import express from 'express'
const router = express.Router()
import * as paymentController from '../controllers/paymentController.js'
import { protect } from '../middlewares/authMiddleware.js'
import { verifyStripeSignature } from '../middlewares/stripeWebhookMiddleware.js'
import { body } from 'express-validator'
import { runValidation } from '../middlewares/validateMiddleware.js'
import { idempotent } from '../middlewares/idempotencyMiddleware.js'

/**
 * @swagger
 * tags:
 *   name: Payments
 *   description: Stripe PaymentIntent creation, webhook and payment status
 */

/**
 * @swagger
 * /api/payments/create-intent:
 *   post:
 *     tags: [Payments]
 *     summary: Create a Stripe PaymentIntent for an existing order
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               orderId:
 *                 type: string
 *             required: [orderId]
 *     responses:
 *       200:
 *         description: clientSecret and paymentIntentId returned
 *       400:
 *         description: Validation error or order not found
 */

/**
 * @swagger
 * /api/payments/webhook:
 *   post:
 *     tags: [Payments]
 *     summary: Stripe webhook — receives raw body, verifies signature
 *     description: Do NOT send JSON — Stripe posts raw bytes. Signature verified via STRIPE_WEBHOOK_SECRET.
 *     responses:
 *       200:
 *         description: "{ received: true }"
 *       400:
 *         description: Signature verification failed
 */

/**
 * @swagger
 * /api/payments/{orderId}:
 *   get:
 *     tags: [Payments]
 *     summary: Get payment record for an order
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: orderId
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Payment record object
 */

// Create PaymentIntent — idempotent: same orderId reuses existing intent, never double-charges
router.post('/create-intent',
  protect,
  idempotent,
  body('orderId').notEmpty(),
  runValidation,
  paymentController.createIntent
)

// DEV-ONLY: confirm a PaymentIntent with pm_card_visa so the webhook fires automatically.
// Returns 404 in production — invisible to real users.
router.post('/dev-confirm/:intentId', protect, paymentController.devConfirm)

// Webhook endpoint: server.js already applies express.raw() globally for this path,
// so we only need signature verification here — no second rawBodyMiddleware needed
router.post('/webhook', verifyStripeSignature, paymentController.webhook)

// Get payment info for an order
router.get('/:orderId', protect, paymentController.getPaymentStatus)

export default router

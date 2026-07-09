import paymentService from '../services/paymentService.js'
import { STATUS, ERRORS } from '../constants/httpConstants.js'
import { NODE_ENV, STRIPE_SECRET_KEY } from '../config/env.js'
import stripe from '../config/stripe.js'

export const createIntent = async (req, res, next) => {
  try {
    const { orderId } = req.body
    const result = await paymentService.createPaymentIntent({ orderId, userId: req.user._id })
    res.json({ success: true, data: result })
  } catch (err) { next(err) }
}

// Webhook handler — req.stripeEvent already verified by verifyStripeSignature middleware
export const webhook = async (req, res, next) => {
  try {
    const event = req.stripeEvent
    await paymentService.handleWebhookEvent(event)
    res.json({ received: true })
  } catch (err) { next(err) }
}

// DEV-ONLY: auto-confirm a PaymentIntent with a test card so the webhook fires
// without needing to run `stripe payment_intents confirm` in the CLI.
// Allowed in production ONLY if using a Stripe test mode key (sk_test_...) for staging.
export const devConfirm = async (req, res, next) => {
  const isTestKey = STRIPE_SECRET_KEY && STRIPE_SECRET_KEY.startsWith('sk_test_')
  if (NODE_ENV === 'production' && !isTestKey) {
    return res.status(STATUS.NOT_FOUND).end()
  }
  try {
    const { intentId } = req.params
    const pi = await stripe.paymentIntents.confirm(intentId, {
      payment_method: 'pm_card_visa',
      return_url:     'http://localhost:5173',
    })
    // Sync order immediately so the frontend does not rely solely on webhook timing
    if (pi.status === 'succeeded' && pi.metadata?.orderId) {
      await paymentService.syncPaymentFromStripe(pi.metadata.orderId, pi.metadata.userId)
    }
    res.json({ success: true, status: pi.status })
  } catch (err) { next(err) }
}

export const getPaymentStatus = async (req, res, next) => {
  try {
    const info = await paymentService.getPaymentForOrder(req.params.orderId, req.user._id)
    res.set('Cache-Control', 'no-store')
    res.json({ success: true, data: info })
  } catch (err) { next(err) }
}

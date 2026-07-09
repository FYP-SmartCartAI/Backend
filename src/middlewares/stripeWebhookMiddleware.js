import express from 'express'
import { STRIPE_WEBHOOK_SECRET } from '../config/env.js'
import stripe from '../config/stripe.js'
import { STATUS, ERRORS } from '../constants/httpConstants.js'

// Middleware to parse raw body for webhook route and attach stripe and rawBody
export const rawBodyMiddleware = express.raw({ type: 'application/json' })

export const verifyStripeSignature = (req, res, next) => {
  const sig = req.headers['stripe-signature']
  if (!sig) return res.status(STATUS.BAD_REQUEST).send(ERRORS.STRIPE_MISSING_SIGNATURE)
  try {
    const event = stripe.webhooks.constructEvent(req.body, sig, STRIPE_WEBHOOK_SECRET)
    req.stripeEvent = event
    next()
  } catch (err) {
    console.error('Webhook signature verification failed:', err.message, {
      bodyType: typeof req.body,
      isBuffer: Buffer.isBuffer(req.body),
      secretPrefix: STRIPE_WEBHOOK_SECRET ? STRIPE_WEBHOOK_SECRET.substring(0, 10) : 'undefined',
      secretSuffix: STRIPE_WEBHOOK_SECRET ? STRIPE_WEBHOOK_SECRET.slice(-5) : 'undefined',
      secretLength: STRIPE_WEBHOOK_SECRET ? STRIPE_WEBHOOK_SECRET.length : 0,
      bodyLength: req.body ? req.body.length : 0
    })
    return res.status(STATUS.BAD_REQUEST).send(ERRORS.STRIPE_WEBHOOK_ERROR(err.message))
  }
}

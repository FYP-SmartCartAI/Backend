import mongoose from 'mongoose'
import stripe from '../config/stripe.js'
import Order from '../models/Order.js'
import Payment from '../models/Payment.js'
import { STATUS, ERRORS } from '../constants/httpConstants.js'
import { createAndNotify, formatOrderRef } from './notificationService.js'

const err = (msg, code) => Object.assign(new Error(msg), { statusCode: code })

// Throttle Stripe API lookups — avoid hitting Stripe on every poll tick
const SYNC_COOLDOWN_MS = 10_000
const syncCache = new Map() // orderId → { checkedAt, order }

// ── Shared: mark order paid + write Payment audit row ─────────────────────────
const markOrderPaid = async ({
  orderId,
  userId,
  paymentIntentId,
  amount,
  currency,
  stripeEventId = null,
  metadata = null,
  session = null,
}) => {
  const opts = session ? { session } : {}

  await Order.findByIdAndUpdate(
    orderId,
    { paymentStatus: 'paid', status: 'processing', stripePaymentId: paymentIntentId },
    opts,
  )
  syncCache.delete(String(orderId))

  const existing = await Payment.findOne({ orderId, stripePaymentIntentId: paymentIntentId })
  if (!existing) {
    const doc = {
      orderId,
      userId,
      method: 'stripe',
      amount: amount / 100,
      currency: (currency || 'usd').toUpperCase(),
      stripePaymentIntentId: paymentIntentId,
      status: 'success',
      metadata,
    }
    if (stripeEventId) doc.stripeEventId = stripeEventId

    if (session) {
      await Payment.create([doc], { session })
    } else {
      await Payment.create(doc)
    }
  }

  if (!session && !existing) {
    const order = await Order.findById(orderId).select('orderNumber userId')
    if (order) {
      createAndNotify({
        recipientId: userId,
        type:        'payment',
        title:       '✅ Payment Successful',
        body:        `Payment confirmed for order ${formatOrderRef(order)}. Your order is now processing.`,
        refId:       orderId,
        refModel:    'Order',
        data:        { orderId: orderId.toString(), type: 'payment_success', screen: 'orders' },
      }).catch(() => {})
    }
  }
}

const createPaymentIntent = async ({ orderId, userId }) => {
  if (!orderId) throw err(ERRORS.ORDER_ID_REQUIRED, STATUS.BAD_REQUEST)
  const order = await Order.findById(orderId)
  if (!order)  throw err(ERRORS.ORDER_NOT_FOUND, STATUS.NOT_FOUND)
  if (order.userId.toString() !== userId.toString()) throw err(ERRORS.NOT_ORDER_OWNER, STATUS.FORBIDDEN)
  if (order.paymentStatus === 'paid') throw err(ERRORS.ORDER_ALREADY_PAID, STATUS.CONFLICT)

  // Reuse existing PaymentIntent if one was already created for this order
  if (order.stripePaymentId) {
    const existing = await stripe.paymentIntents.retrieve(order.stripePaymentId)
    if (existing && !['canceled', 'succeeded'].includes(existing.status)) {
      return {
        clientSecret:    existing.client_secret,
        paymentIntentId: existing.id,
        amount:          existing.amount,
      }
    }
    if (existing?.status === 'succeeded') {
      await syncPaymentFromStripe(orderId, userId)
      throw err(ERRORS.ORDER_ALREADY_PAID, STATUS.CONFLICT)
    }
  }

  const amount = Math.round(order.total * 100)

  const paymentIntent = await stripe.paymentIntents.create({
    amount,
    currency: 'usd',
    metadata: { orderId: order._id.toString(), userId: userId.toString() },
    payment_method_types: ['card'],
  })

  order.stripePaymentId = paymentIntent.id
  await order.save()

  return { clientSecret: paymentIntent.client_secret, paymentIntentId: paymentIntent.id, amount }
}

// Poll Stripe when webhook is delayed/missed (e.g. local dev) and mark order paid
const syncPaymentFromStripe = async (orderId, userId = null) => {
  const order = await Order.findById(orderId)
  if (!order) throw err(ERRORS.ORDER_NOT_FOUND, STATUS.NOT_FOUND)
  if (order.paymentStatus === 'paid') return order

  const cached = syncCache.get(String(orderId))
  if (cached && Date.now() - cached.checkedAt < SYNC_COOLDOWN_MS) {
    return cached.order
  }

  let intentId = order.stripePaymentId

  // Recover intent ID for older orders where it was saved under the wrong field
  if (!intentId) {
    const found = await stripe.paymentIntents.search({
      query: `metadata['orderId']:'${orderId}'`,
      limit: 1,
    })
    const match = found.data.find((pi) => pi.status === 'succeeded')
    if (match) {
      intentId = match.id
      order.stripePaymentId = intentId
      await order.save()
    }
  }

  if (!intentId) return order

  const pi = await stripe.paymentIntents.retrieve(intentId)
  if (pi.status !== 'succeeded') {
    syncCache.set(String(orderId), { checkedAt: Date.now(), order })
    return order
  }

  const ownerId = userId || order.userId
  await markOrderPaid({
    orderId:           order._id,
    userId:            ownerId,
    paymentIntentId:   pi.id,
    amount:            pi.amount_received,
    currency:          pi.currency,
    metadata:          { ...pi.metadata, syncedAt: new Date().toISOString() },
  })

  const updated = await Order.findById(orderId)
  syncCache.set(String(orderId), { checkedAt: Date.now(), order: updated })
  return updated
}

const handleWebhookEvent = async (event) => {
  const existing = await Payment.findOne({ stripeEventId: event.id })
  if (existing) return { skipped: true }

  switch (event.type) {
    case 'payment_intent.succeeded': {
      const pi      = event.data.object
      const orderId = pi.metadata?.orderId
      const userId  = pi.metadata?.userId

      const session = await mongoose.startSession()
      session.startTransaction()
      try {
        let payment
        let isNewPayment = false
        if (orderId) {
          const prior = await Payment.findOne({ orderId, stripePaymentIntentId: pi.id }).session(session)
          isNewPayment = !prior

          await markOrderPaid({
            orderId,
            userId,
            paymentIntentId: pi.id,
            amount:          pi.amount_received,
            currency:        pi.currency,
            stripeEventId:   event.id,
            metadata:        pi.metadata,
            session,
          })
          payment = await Payment.findOne({ orderId, stripePaymentIntentId: pi.id }).session(session)
        }
        await session.commitTransaction()
        session.endSession()

        if (orderId && userId && isNewPayment) {
          const order = await Order.findById(orderId).select('orderNumber')
          createAndNotify({
            recipientId: userId,
            type:        'payment',
            title:       '✅ Payment Successful',
            body:        `Payment confirmed for order ${formatOrderRef(order || { _id: orderId })}. Your order is now processing.`,
            refId:       orderId,
            refModel:    'Order',
            data:        { orderId: orderId.toString(), type: 'payment_success', screen: 'orders' },
          }).catch(() => {})
        }

        return payment
      } catch (e) {
        await session.abortTransaction()
        session.endSession()
        throw e
      }
    }
    case 'payment_intent.payment_failed': {
      const pi      = event.data.object
      const orderId = pi.metadata?.orderId
      const userId  = pi.metadata?.userId
      if (!orderId || !userId) return null

      const payment = await Payment.create({
        stripeEventId:         event.id,
        stripePaymentIntentId: pi.id,
        orderId,
        userId,
        method:   'stripe',
        amount:   pi.amount / 100,
        currency: (pi.currency || 'usd').toUpperCase(),
        status:   'failed',
        metadata: pi.last_payment_error,
      })

      const order = await Order.findById(orderId).select('orderNumber')
      createAndNotify({
        recipientId: userId,
        type:        'payment',
        title:       '❌ Payment Failed',
        body:        `Payment could not be completed for order ${formatOrderRef(order || { _id: orderId })}. Please try again.`,
        refId:       orderId,
        refModel:    'Order',
        data:        { orderId: orderId.toString(), type: 'payment_failed', screen: 'payment' },
      }).catch(() => {})

      return payment
    }
    default:
      return { skipped: true, type: event.type }
  }
}

const getPaymentForOrder = async (orderId, userId = null) => {
  await syncPaymentFromStripe(orderId, userId)
  const [payment, order] = await Promise.all([
    Payment.findOne({ orderId }),
    Order.findById(orderId).select('paymentStatus status paymentMethod'),
  ])
  return { payment, order }
}

export default { createPaymentIntent, handleWebhookEvent, getPaymentForOrder, syncPaymentFromStripe }

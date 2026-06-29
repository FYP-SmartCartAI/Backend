import Cart from '../models/Cart.js'
import Order from '../models/Order.js'
import User from '../models/User.js'
import Product from '../models/Product.js'
import Notification from '../models/Notification.js'
import { messaging } from '../config/firebase.js'
import { groqChatCompletion, isGroqConfigured } from '../config/groq.js'
import { ABANDONED_CART_IDLE_MINUTES } from '../config/env.js'

export const getAbandonedCartIdleMs = () => ABANDONED_CART_IDLE_MINUTES * 60 * 1000

export let lastRunTime = null

// ── Stock level categorisation ────────────────────────────────────────────────
const getStockLevel = (stock) => {
  if (stock >= 1  && stock <= 3)  return 'CRITICAL'
  if (stock >= 4  && stock <= 10) return 'LOW'
  if (stock >= 11 && stock <= 49) return 'MEDIUM'
  return 'HIGH'
}

// ── Fallback messages (used when Groq API fails or is not configured) ─────────
export const getFallbackMessage = (stockLevel, userName, productName, stockCount) => {
  const firstName = userName?.split(' ')[0] || userName
  switch (stockLevel) {
    case 'CRITICAL':
      return `${firstName}, only ${stockCount} left of ${productName}! Order now before it sells out 🔥`
    case 'LOW':
      return `${firstName}, your ${productName} is selling fast! Grab it before it's gone ⚡`
    case 'MEDIUM':
      return `${firstName}, your cart is waiting! Complete your order today 🛍️`
    case 'HIGH':
    default:
      return `${firstName}, great picks are saved in your cart! Order now 🎉`
  }
}

// ── Groq LLM call to generate personalised push notification text ─────────────
// Returns { body, source: 'groq' | 'fallback' }
export const generateAbandonedCartMessage = async (userName, products) => {
  const firstName = userName?.split(' ')[0] || userName

  // Build the product lines for the prompt
  const productLines = products.map(p => {
    const level      = getStockLevel(p.stock)
    const showCount  = (level === 'CRITICAL' || level === 'LOW')
    return [
      `- Product: ${p.name}`,
      `  Price: Rs ${p.price}`,
      `  Stock level: ${level}`,
      showCount ? `  Actual stock count: ${p.stock}` : '',
    ].filter(Boolean).join('\n')
  }).join('\n')

  const prompt = [
    'You are a friendly e-commerce assistant for SmartCart AI.',
    'Write a SHORT (max 2 sentences), personalized push notification to bring back an abandoned cart.',
    `User name: ${firstName}`,
    'Abandoned products:',
    productLines,
    '',
    'Rules:',
    '- CRITICAL (1-3 stock): mention exact count, create urgency, fear of missing out',
    '- LOW (4-10 stock): say selling fast, do not mention exact number',
    '- MEDIUM (11-49): mention value, limited time feel, no stock number',
    '- HIGH (50+): use excitement, deal, happiness, dopamine trigger — NO stock mention',
    '- Always address user by first name',
    '- Make it feel human, warm, and urgent — not robotic',
    '- Max 2 sentences, no emojis in first sentence',
    '- End with one relevant emoji only',
    '',
    'Output ONLY the notification text. No explanation. No quotes.',
  ].join('\n')

  const fallbackFor = () => {
    const worstProduct = products.reduce((prev, curr) => (curr.stock < prev.stock ? curr : prev), products[0])
    const level        = getStockLevel(worstProduct.stock)
    return getFallbackMessage(level, firstName, worstProduct.name, worstProduct.stock)
  }

  if (!isGroqConfigured()) {
    const body = fallbackFor()
    console.info(`[abandonedCartService] AI reminder (fallback — Groq not configured) for "${firstName}":\n  "${body}"`)
    return { body, source: 'fallback' }
  }

  try {
    const body = await groqChatCompletion(prompt)
    if (!body) throw new Error('Empty Groq response')
    console.info(`[abandonedCartService] AI reminder (groq) for "${firstName}":\n  "${body}"`)
    return { body, source: 'groq' }
  } catch (e) {
    console.error('[abandonedCartService] Groq generation failed:', e.message)
    const body = fallbackFor()
    console.info(`[abandonedCartService] AI reminder (fallback — Groq error) for "${firstName}":\n  "${body}"`)
    return { body, source: 'fallback' }
  }
}

// ── Firebase push notification sender ────────────────────────────────────────
export const sendAbandonedCartNotification = async (fcmToken, title, body, cartId) => {
  if (!messaging) return null

  const message = {
    token: fcmToken,
    notification: { title, body },
    data: {
      type:   'abandoned_cart',
      cartId: cartId.toString(),
      screen: 'cart',
    },
    android: {
      priority: 'high',
      notification: { sound: 'default', clickAction: 'FLUTTER_NOTIFICATION_CLICK' },
    },
    apns: {
      payload: { aps: { sound: 'default', badge: 1 } },
    },
  }

  return await messaging.send(message)
}

// ── Main job function ─────────────────────────────────────────────────────────
// force=true (admin manual trigger): any non-empty cart, no idle wait, can re-send
export const runAbandonedCartJob = async ({ force = false } = {}) => {
  const startTime = Date.now()
  let cartsFound       = 0
  let notificationsSent = 0
  let skippedNoToken   = 0
  let failed           = 0
  const sentMessages   = []

  const recordMessage = (user, cart, products, title, { body, source }, channel) => {
    sentMessages.push({
      userId:    user._id.toString(),
      userName:  user.name,
      cartId:    cart._id.toString(),
      title,
      body,
      source,
      channel,
      products:  products.map((p) => p.name),
    })
  }

  // ── Step 1 — Detect abandoned carts ───────────────────────────────────────
  let abandonedCarts

  if (force) {
    console.info('[abandonedCartService] FORCE mode — all non-empty carts (no idle wait)')
    abandonedCarts = await Cart.find({
      'items.0': { $exists: true },
      total:     { $gt: 0 },
    })
  } else {
    const idleCutoff = new Date(Date.now() - getAbandonedCartIdleMs())
    console.info(
      `[abandonedCartService] Checking carts idle since ${idleCutoff.toISOString()} ` +
      `(${ABANDONED_CART_IDLE_MINUTES} minute window)`,
    )
    abandonedCarts = await Cart.find({
      isAbandoned:  false,
      reminderSent: false,
      'items.0':    { $exists: true },
      updatedAt:    { $lt: idleCutoff },
    })
  }

  cartsFound = abandonedCarts.length

  if (!cartsFound) {
    lastRunTime = new Date()
    return { cartsFound: 0, notificationsSent: 0, skippedNoToken: 0, failed: 0, executionTimeMs: Date.now() - startTime, force, messages: [] }
  }

  console.info(`[abandonedCartService] Found ${cartsFound} cart(s) to process${force ? ' (force)' : ''}`)

  // ── Step 2 — Process each abandoned cart ──────────────────────────────────
  for (const cart of abandonedCarts) {
    try {
      // Step 2a — Mark cart as abandoned immediately
      await Cart.updateOne(
        { _id: cart._id },
        { $set: { isAbandoned: true, abandonedAt: new Date() } }
      )

      // Step 2b — Fetch full user details
      // cart.user is the userId (model field is `user`, aliased to userId in the spec)
      const user = await User.findById(cart.user).select('name fcmToken')
      if (!user) {
        console.warn(`[abandonedCartService] User not found for cart ${cart._id} — skipping`)
        await Cart.updateOne({ _id: cart._id }, { $set: { reminderSent: true, reminderSentAt: new Date() } })
        continue
      }

      // Step 2c — Fetch full product details for each cart item
      const products = []
      for (const item of cart.items) {
        try {
          const product = await Product.findById(item.product).select('name stock price images')
          if (product) {
            products.push({
              name:  product.name,
              stock: product.stock,
              price: product.price,
              image: product.images?.[0] || null,
            })
          }
        } catch (productErr) {
          console.warn(`[abandonedCartService] Failed to fetch product ${item.product}:`, productErr.message)
        }
      }

      if (!products.length) {
        console.warn(`[abandonedCartService] No valid products found for cart ${cart._id} — skipping`)
        await Cart.updateOne({ _id: cart._id }, { $set: { reminderSent: true, reminderSentAt: new Date() } })
        continue
      }

      // If no FCM token: push skipped — in force mode still save in-app notification
      if (!user.fcmToken) {
        console.warn(`[abandonedCartService] No FCM token for user ${user._id} (cart ${cart._id})`)
        skippedNoToken++

        if (force) {
          const notificationTitle = 'Your cart misses you! 🛒'
          const generated = await generateAbandonedCartMessage(user.name, products)
          try {
            await Notification.create({
              recipientId: user._id,
              type:        'abandoned_cart',
              title:       notificationTitle,
              body:        generated.body,
              refId:       cart._id,
              refModel:    'Cart',
              isRead:      false,
              channel:     'socket',
            })
            notificationsSent++
            recordMessage(user, cart, products, notificationTitle, generated, 'socket')
            console.info(`[abandonedCartService] In-app reminder saved for user ${user._id} (no FCM token)`)
          } catch (notifErr) {
            console.error(`[abandonedCartService] Failed to save in-app notification:`, notifErr.message)
            failed++
            continue
          }
        }

        await Cart.updateOne({ _id: cart._id }, { $set: { reminderSent: true, reminderSentAt: new Date() } })
        continue
      }

      // Step 2e-f — Generate personalised message via Groq
      const notificationTitle = 'Your cart misses you! 🛒'
      const generated = await generateAbandonedCartMessage(user.name, products)
      const notificationBody = generated.body

      // Step 2g — Send Firebase Cloud Messaging notification
      let firebaseSuccess = false
      try {
        await sendAbandonedCartNotification(user.fcmToken, notificationTitle, notificationBody, cart._id)
        firebaseSuccess = true
      } catch (firebaseErr) {
        // Step 3 error handling: if Firebase fails, log error, do NOT mark reminderSent=true
        console.error(`[abandonedCartService] Firebase send failed for cart ${cart._id}:`, firebaseErr.message)
        failed++
        // Do NOT update reminderSent — let cron retry next hour
        continue
      }

      if (firebaseSuccess) {
        // Step 2h — Save notification record to MongoDB
        try {
          await Notification.create({
            recipientId: user._id,
            type:        'abandoned_cart',
            title:       notificationTitle,
            body:        notificationBody,
            refId:       cart._id,
            refModel:    'Cart',
            isRead:      false,
            channel:     'firebase',
            createdAt:   new Date(),
          })
        } catch (notifErr) {
          // Non-fatal — notification was already sent via Firebase
          console.error(`[abandonedCartService] Failed to save notification record for cart ${cart._id}:`, notifErr.message)
        }

        // Step 2i — Update cart
        await Cart.updateOne(
          { _id: cart._id },
          { $set: { reminderSent: true, reminderSentAt: new Date() } }
        )

        notificationsSent++
        recordMessage(user, cart, products, notificationTitle, generated, 'firebase')
        console.info(`[abandonedCartService] Reminder sent to user ${user._id} for cart ${cart._id}`)
      }

    } catch (cartErr) {
      // Step 3 error handling: never crash the cron job — wrap everything in try/catch
      failed++
      console.error(`[abandonedCartService] Failed processing cart ${cart._id}:`, cartErr.message)
    }
  }

  const executionTimeMs = Date.now() - startTime
  console.info(`[abandonedCartService] Job complete — carts: ${cartsFound}, sent: ${notificationsSent}, skipped: ${skippedNoToken}, failed: ${failed}, time: ${executionTimeMs}ms`)

  if (sentMessages.length) {
    console.info(`[abandonedCartService] ── AI messages sent (${sentMessages.length}) ──`)
    sentMessages.forEach((m, i) => {
      console.info(
        `[abandonedCartService]   #${i + 1} ${m.userName} | ${m.source} | ${m.channel}\n` +
        `[abandonedCartService]      "${m.body}"`,
      )
    })
  }

  lastRunTime = new Date()
  return { cartsFound, notificationsSent, skippedNoToken, failed, executionTimeMs, force, messages: sentMessages }
}

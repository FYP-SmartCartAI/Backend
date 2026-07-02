// ── firebaseService.js ────────────────────────────────────────────────────────
// Thin wrapper around Firebase Admin SDK messaging.
// All FCM send calls in the app should go through here.
//
// Gracefully no-ops when Firebase is not configured (FIREBASE_SERVICE_ACCOUNT_B64
// not set), so the app works in dev/test without Firebase credentials.
//
// This file is the canonical firebaseService.js required by the spec.
// The existing utils/notificationService.js provides the higher-level
// sendToUser/sendToMany helpers that use this service internally.

import { messaging } from '../config/firebase.js'

// ── sendPush ───────────────────────────────────────────────────────────────────
/**
 * Send a single FCM push notification to a device token.
 * @param {string} token        - FCM device registration token
 * @param {string} title        - Notification title
 * @param {string} body         - Notification body text
 * @param {Object} [data={}]    - Custom key-value data payload (all values must be strings)
 * @returns {Promise<string|null>} FCM message ID, or null if Firebase not configured
 */
export const sendPush = async (token, title, body, data = {}) => {
  if (!messaging || !token) return null

  try {
    const message = {
      token,
      notification: { title, body },
      data: Object.fromEntries(
        Object.entries({ ...data, title, body }).map(([k, v]) => [k, String(v)])
      ),
      webpush: {
        headers: { Urgency: 'high' },
        notification: { title, body },
        fcmOptions: {
          link: process.env.CLIENT_URL || 'http://localhost:5173',
        },
      },
      android: {
        priority: 'high',
        notification: { sound: 'default', clickAction: 'FLUTTER_NOTIFICATION_CLICK' },
      },
      apns: {
        payload: { aps: { sound: 'default', badge: 1 } },
      },
    }

    const response = await messaging.send(message)
    return response
  } catch (e) {
    console.error('[firebaseService] sendPush failed:', e.message)
    return null
  }
}

// ── sendMulticast ─────────────────────────────────────────────────────────────
/**
 * Send the same notification to multiple device tokens in one batch call.
 * Firebase allows max 500 tokens per sendEachForMulticast call.
 * @param {string[]} tokens  - Array of FCM device registration tokens
 * @param {string}   title   - Notification title
 * @param {string}   body    - Notification body text
 * @param {Object}   [data={}]
 * @returns {Promise<Object[]|null>} Array of batch responses, or null if not configured
 */
export const sendMulticast = async (tokens, title, body, data = {}) => {
  if (!messaging || !tokens?.length) return null

  try {
    const chunks = []
    for (let i = 0; i < tokens.length; i += 500) {
      chunks.push(tokens.slice(i, i + 500))
    }

    const results = []
    for (const chunk of chunks) {
      const response = await messaging.sendEachForMulticast({
        tokens: chunk,
        notification: { title, body },
        data: Object.fromEntries(Object.entries(data).map(([k, v]) => [k, String(v)])),
        android: { priority: 'high' },
      })
      results.push(response)
    }

    return results
  } catch (e) {
    console.error('[firebaseService] sendMulticast failed:', e.message)
    return null
  }
}

// ── sendToTopic ────────────────────────────────────────────────────────────────
/**
 * Send a notification to a Firebase topic (e.g. 'admins', 'city_karachi').
 * @param {string} topic
 * @param {string} title
 * @param {string} body
 * @param {Object} [data={}]
 * @returns {Promise<string|null>}
 */
export const sendToTopic = async (topic, title, body, data = {}) => {
  if (!messaging) return null

  try {
    const response = await messaging.send({
      topic,
      notification: { title, body },
      data: Object.fromEntries(Object.entries(data).map(([k, v]) => [k, String(v)])),
      android: { priority: 'high' },
    })
    return response
  } catch (e) {
    console.error(`[firebaseService] sendToTopic(${topic}) failed:`, e.message)
    return null
  }
}

export default { sendPush, sendMulticast, sendToTopic }

import { messaging } from '../config/firebase.js'
import User from '../models/User.js'

// ── Notification payload builder ───────────────────────────────────────────────
// Firebase requires `notification` (visible banner) and optional `data`
// (custom key-value strings for in-app handling).
// All data values MUST be strings — FCM rejects non-string data values.
const buildMessage = ({ token, title, body, data = {} }) => ({
  token,
  notification: { title, body },
  data: Object.fromEntries(
    Object.entries(data).map(([k, v]) => [k, String(v)])
  ),
  android: {
    priority: 'high',
    notification: { sound: 'default', clickAction: 'FLUTTER_NOTIFICATION_CLICK' },
  },
  apns: {
    payload: { aps: { sound: 'default', badge: 1 } },
  },
})

// ── sendToUser ─────────────────────────────────────────────────────────────────
// Looks up the FCM device token from the DB and sends a notification.
// Silently returns null if:
//   • Firebase is not configured (messaging === null)
//   • User has no FCM token registered
//   • The token is invalid / unregistered — stale token is cleared from DB
//
// ⚠️  Always call fire-and-forget (.catch()) — never await in request handlers.
export const sendToUser = async (userId, { title, body, data = {} }) => {
  if (!messaging) return null

  try {
    const user = await User.findById(userId).select('fcmToken')
    if (!user?.fcmToken) return null

    const message = buildMessage({ token: user.fcmToken, title, body, data })
    const response = await messaging.send(message)
    return response
  } catch (e) {
    // messaging/registration-token-not-registered or messaging/invalid-argument
    // means the token is stale — clean it up so we don't keep trying
    if (
      e.code === 'messaging/registration-token-not-registered' ||
      e.code === 'messaging/invalid-argument'
    ) {
      await User.findByIdAndUpdate(userId, { fcmToken: null }).catch(() => {})
    }
    console.error(`[notification] sendToUser(${userId}) failed:`, e.message)
    return null
  }
}

// ── sendToMany ─────────────────────────────────────────────────────────────────
// Sends the same notification to multiple users.
// Uses sendEachForMulticast for batched delivery (max 500 tokens per call).
// Stale tokens for failed sends are cleared from DB.
export const sendToMany = async (userIds, { title, body, data = {} }) => {
  if (!messaging || !userIds?.length) return null

  try {
    // Fetch all tokens in a single DB query
    const users = await User.find(
      { _id: { $in: userIds }, fcmToken: { $ne: null } },
      { _id: 1, fcmToken: 1 }
    )
    if (!users.length) return null

    // Firebase allows max 500 tokens per sendEachForMulticast call
    const chunks = []
    for (let i = 0; i < users.length; i += 500) chunks.push(users.slice(i, i + 500))

    const results = []
    for (const chunk of chunks) {
      const tokens = chunk.map(u => u.fcmToken)
      const multicastMessage = {
        tokens,
        notification: { title, body },
        data: Object.fromEntries(Object.entries(data).map(([k, v]) => [String(k), String(v)])),
        android: { priority: 'high' },
      }
      const batchResponse = await messaging.sendEachForMulticast(multicastMessage)
      results.push(batchResponse)

      // Clear stale tokens that failed with registration-token-not-registered
      const staleIds = chunk
        .filter((_, idx) => {
          const r = batchResponse.responses[idx]
          return !r.success && (
            r.error?.code === 'messaging/registration-token-not-registered' ||
            r.error?.code === 'messaging/invalid-argument'
          )
        })
        .map(u => u._id)

      if (staleIds.length) {
        await User.updateMany({ _id: { $in: staleIds } }, { fcmToken: null }).catch(() => {})
      }
    }

    return results
  } catch (e) {
    console.error('[notification] sendToMany failed:', e.message)
    return null
  }
}

// ── sendToTopic ────────────────────────────────────────────────────────────────
// Send to a Firebase topic (e.g. 'admins', 'city_karachi').
// Clients must subscribe to the topic via the FCM SDK.
// Silently no-ops if Firebase is not configured.
export const sendToTopic = async (topic, { title, body, data = {} }) => {
  if (!messaging) return null

  try {
    const message = {
      topic,
      notification: { title, body },
      data: Object.fromEntries(Object.entries(data).map(([k, v]) => [String(k), String(v)])),
      android: { priority: 'high' },
    }
    return await messaging.send(message)
  } catch (e) {
    console.error(`[notification] sendToTopic(${topic}) failed:`, e.message)
    return null
  }
}

import admin from 'firebase-admin'
import { FIREBASE_SERVICE_ACCOUNT_B64 } from './env.js'

// ── Firebase Admin SDK initialization ─────────────────────────────────────────
//
// How to set up:
//   1. Firebase Console → Project Settings → Service Accounts → Generate new private key
//   2. Base64-encode the downloaded JSON:
//        macOS/Linux:  base64 -i serviceAccountKey.json | tr -d '\n'
//        Windows:      [Convert]::ToBase64String([IO.File]::ReadAllBytes('serviceAccountKey.json'))
//   3. Paste the result as FIREBASE_SERVICE_ACCOUNT_B64 in your .env
//
// At runtime we decode the string back to a JSON object and pass it to
// admin.credential.cert() — the private key never touches the filesystem.
//
// If the env var is absent (e.g. local dev without Firebase), we skip
// initialization and all notification calls will be graceful no-ops.

let messaging = null

if (FIREBASE_SERVICE_ACCOUNT_B64) {
  try {
    // Decode base64 → JSON → service account object
    const serviceAccountJson = Buffer.from(FIREBASE_SERVICE_ACCOUNT_B64, 'base64').toString('utf8')
    const serviceAccount     = JSON.parse(serviceAccountJson)

    // Only initialize once — guard against hot-reload calling this file multiple times
    if (!admin.apps.length) {
      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
      })
    }

    messaging = admin.messaging()
    console.info('[Firebase] Admin SDK initialized ✅')
  } catch (e) {
    // Bad JSON / corrupt base64 — log but don't crash the server
    console.error('[Firebase] Failed to initialize Admin SDK:', e.message)
  }
} else {
  console.warn('[Firebase] FIREBASE_SERVICE_ACCOUNT_B64 not set — push notifications disabled.')
}

// ── Exports ───────────────────────────────────────────────────────────────────
// `messaging` is null when Firebase is not configured.
// All consumers must check for null before calling — notificationService handles this.
export { messaging }
export default admin

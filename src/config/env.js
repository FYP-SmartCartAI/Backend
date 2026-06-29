import 'dotenv/config'

export const PORT                 = process.env.PORT || 5000
export const MONGO_URI            = process.env.MONGO_URI
export const JWT_SECRET           = process.env.JWT_SECRET
export const JWT_EXPIRE           = process.env.JWT_EXPIRE || '30d'
export const NODE_ENV             = process.env.NODE_ENV || 'development'
export const STRIPE_SECRET_KEY    = process.env.STRIPE_SECRET_KEY
export const STRIPE_PUBLISHABLE_KEY = process.env.STRIPE_PUBLISHABLE_KEY
export const STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET
export const GOOGLE_CLIENT_ID     = process.env.GOOGLE_CLIENT_ID
export const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET
export const FACEBOOK_APP_ID      = process.env.FACEBOOK_APP_ID
export const FACEBOOK_APP_SECRET  = process.env.FACEBOOK_APP_SECRET
export const SESSION_SECRET       = process.env.SESSION_SECRET || 'smartcart_session_secret'
export const CLIENT_URL           = process.env.CLIENT_URL || 'http://localhost:3000'

// ── Cloudinary ────────────────────────────────────────────────────────────────
export const CLOUDINARY_CLOUD_NAME  = process.env.CLOUDINARY_CLOUD_NAME
export const CLOUDINARY_API_KEY     = process.env.CLOUDINARY_API_KEY
export const CLOUDINARY_API_SECRET  = process.env.CLOUDINARY_API_SECRET

// ── Email (Nodemailer) ────────────────────────────────────────────────────────
export const EMAIL_USER = process.env.EMAIL_USER
export const EMAIL_PASS = process.env.EMAIL_PASS

// ── Abstract API — email reputation (registration validation) ───────────────
export const ABSTRACT_EMAIL_API_KEY = process.env.ABSTRACT_EMAIL_API_KEY || null

// ── Firebase Admin SDK ────────────────────────────────────────────────────────
// Base64-encoded service account JSON downloaded from Firebase Console.
// If absent, push notifications are silently disabled (graceful no-op).
export const FIREBASE_SERVICE_ACCOUNT_B64 = process.env.FIREBASE_SERVICE_ACCOUNT_B64 || null

// ── Pinecone (vector DB for AI search + recommendations) ─────────────────────
export const PINECONE_API_KEY    = process.env.PINECONE_API_KEY    || null
export const PINECONE_INDEX_NAME = process.env.PINECONE_INDEX_NAME || null

// Abandoned cart: minutes of cart inactivity before flagged (default 2 for local testing)
export const ABANDONED_CART_IDLE_MINUTES = Math.max(
  1,
  Number(process.env.ABANDONED_CART_IDLE_MINUTES) || 200,
)

// How often the abandoned-cart job polls the database (dev default: 2 min, prod: 60 min)
export const ABANDONED_CART_POLL_INTERVAL_MINUTES = Math.max(
  1,
  Number(process.env.ABANDONED_CART_POLL_INTERVAL_MINUTES)
    || (NODE_ENV === 'production' ? 60 : 120),
)

const buildAbandonedCartCronFromInterval = (minutes) => {
  if (minutes < 60) return `*/${minutes} * * * *`
  if (minutes === 60) return '0 * * * *'
  if (minutes % 60 === 0) return `0 */${minutes / 60} * * *`
  console.warn(
    `[env] ABANDONED_CART_POLL_INTERVAL_MINUTES=${minutes} is not cron-friendly; ` +
    'set ABANDONED_CART_CRON for custom schedules. Falling back to hourly.',
  )
  return '0 * * * *'
}

// Cron schedule for abandoned-cart job (ABANDONED_CART_CRON overrides poll interval)
export const ABANDONED_CART_CRON = process.env.ABANDONED_CART_CRON
  ?? buildAbandonedCartCronFromInterval(ABANDONED_CART_POLL_INTERVAL_MINUTES)

// Groq — abandoned cart reminder message generation only (semantic search uses Gemini)
export const GROQ_API_KEY = process.env.GROQ_API_KEY || null
export const GROQ_MODEL   = process.env.GROQ_MODEL || 'llama-3.3-70b-versatile'

// ── Google Gemini — multi-key rotation ───────────────────────────────────────
// Collect all GEMINI_API_KEY_1 … GEMINI_API_KEY_N that are present in .env.
// gemini.js picks keys round-robin and auto-rotates on 429 / quota errors.
export const GEMINI_API_KEYS = (() => {
  const keys = []
  let i = 1
  while (process.env[`GEMINI_API_KEY_${i}`]) {
    keys.push(process.env[`GEMINI_API_KEY_${i}`])
    i++
  }
  return keys
})()

// Keep the single-key export for any legacy callers (points to the first key)
export const GEMINI_API_KEY = GEMINI_API_KEYS[0] ?? null

// ── Startup environment validation (Phase 9) ──────────────────────────────────
// Crash early with a clear message rather than a cryptic runtime error later.
// Only the two vars that are truly required in every environment are checked here;
// optional integrations (Stripe, Cloudinary, Firebase, Pinecone, Gemini) are
// allowed to be absent and each config module handles the graceful no-op.
if (process.env.NODE_ENV !== 'test') {
  const REQUIRED = ['MONGO_URI', 'JWT_SECRET']
  const missing  = REQUIRED.filter((k) => !process.env[k])
  if (missing.length) {
    console.error(`[env] ❌ Missing required environment variable(s): ${missing.join(', ')}`)
    console.error('[env]    Check your .env file or deployment secrets and restart.')
    process.exit(1)
  }
}

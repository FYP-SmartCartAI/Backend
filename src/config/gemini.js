import { GoogleGenerativeAI } from '@google/generative-ai'
import { GEMINI_API_KEYS } from './env.js'

// ── Google Gemini — automatic API-key rotation ────────────────────────────────
//
// Why rotation?
//   The free Gemini tier has per-key RPM / RPD quotas. When key N hits its
//   limit the API returns HTTP 429 (ResourceExhausted). Instead of failing,
//   we immediately retry the same call with the next key in the pool.
//
// How it works:
//   • GEMINI_API_KEYS is an array built from GEMINI_API_KEY_1 … GEMINI_API_KEY_N
//     (however many are present in .env — just keep adding more keys).
//   • `currentIndex` tracks which key is active.
//   • `callWithRotation(fn)` wraps every SDK call:
//       - on 429 / quota error  → rotate to next key, rebuild models, retry
//       - after a full loop with no success → throw so the caller can fall back
//   • `embeddingModel` and `chatModel` are always the models of the *current* key.
//
// All callers (vectorService, abandonedCartJob) are unchanged — they call
// embeddingModel / chatModel directly; rotation is transparent.

// ── Is this error a quota/rate-limit that warrants rotating? ──────────────────
const isQuotaError = (e) =>
  e?.status === 429 ||
  /quota|rate.?limit|resource.?exhausted/i.test(e?.message || '')

// ── Key pool ──────────────────────────────────────────────────────────────────
let currentIndex  = 0
let genAI         = null
let embeddingModel = null
let chatModel     = null

const buildClients = (apiKey) => {
  genAI          = new GoogleGenerativeAI(apiKey)
  embeddingModel = genAI.getGenerativeModel({ model: 'gemini-embedding-001' })
  chatModel      = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' })
}

if (GEMINI_API_KEYS.length) {
  try {
    buildClients(GEMINI_API_KEYS[0])
    console.info(`[Gemini] client initialized ✅  (${GEMINI_API_KEYS.length} key(s) in rotation pool)`)
  } catch (e) {
    console.error('[Gemini] failed to initialize:', e.message)
  }
} else {
  console.warn('[Gemini] No GEMINI_API_KEY_* found — AI embeddings and generation disabled.')
}

// ── Rotation wrapper ──────────────────────────────────────────────────────────
// Usage:  const result = await callWithRotation(() => embeddingModel.embedContent(text))
//
// `fn` must be a *factory* (arrow function) that uses the module-level
// `embeddingModel` / `chatModel` — so each retry picks up the new models
// after a key rotation.
export const callWithRotation = async (fn) => {
  if (!GEMINI_API_KEYS.length) return null

  const total = GEMINI_API_KEYS.length

  for (let attempt = 0; attempt < total; attempt++) {
    try {
      return await fn()
    } catch (e) {
      if (!isQuotaError(e)) throw e  // non-quota error — don't rotate, just re-throw

      const exhausted = GEMINI_API_KEYS[currentIndex]?.slice(-6) ?? '??'
      currentIndex    = (currentIndex + 1) % total
      buildClients(GEMINI_API_KEYS[currentIndex])
      console.warn(
        `[Gemini] Key …${exhausted} hit quota — rotated to key ${currentIndex + 1}/${total}`
      )
    }
  }

  // Every key in the pool is exhausted
  throw Object.assign(new Error('[Gemini] All API keys exhausted — quota exceeded on all keys.'), {
    statusCode: 429,
  })
}

export { genAI, embeddingModel, chatModel }


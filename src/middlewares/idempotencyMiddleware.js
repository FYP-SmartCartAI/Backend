import IdempotencyKey from '../models/IdempotencyKey.js'
import { STATUS, ERRORS } from '../constants/httpConstants.js'

/**
 * Idempotency middleware — wraps a route so it only executes ONCE per key.
 *
 * Client must send:  Idempotency-Key: <uuid>
 *
 * How the race condition is closed
 * ─────────────────────────────────
 * OLD approach (vulnerable):
 *   findOne → (gap) → next() → res.json caches result
 *   Two concurrent requests both pass findOne before either saves → both execute.
 *
 * NEW approach (atomic):
 *   findOneAndUpdate + upsert inserts { status:'pending' } atomically.
 *   The compound unique index (key + userId) means only ONE request wins the upsert.
 *   The loser gets a 11000 duplicate-key error → 409 "request in progress".
 *   The winner runs the route, then updates the sentinel to { status:'done', response }.
 *   Future retries find status:'done' and return the cached response immediately.
 */
export const idempotent = async (req, res, next) => {
  const key = req.headers['idempotency-key']

  // Key is optional — skip idempotency logic if not provided
  if (!key) return next()

  if (key.length > 128) {
    return res.status(STATUS.BAD_REQUEST).json({
      success: false,
      message: ERRORS.IDEMPOTENCY_KEY_TOO_LONG,
    })
  }

  const userId = req.user._id
  const route  = `${req.method} ${req.path}`

  let sentinel
  try {
    // ── Atomic upsert of a 'pending' sentinel ─────────────────────────────
    // setOnInsert only runs when the document is CREATED (not when it already exists).
    // The compound unique index ensures only one concurrent request can insert.
    sentinel = await IdempotencyKey.findOneAndUpdate(
      { key, userId },
      { $setOnInsert: { key, userId, route, status: 'pending', response: null, createdAt: new Date() } },
      { upsert: true, returnDocument: 'before' }   // returns the OLD doc (null if inserted fresh)
    )
  } catch (e) {
    if (e.code === 11000) {
      // A concurrent request for the same key is currently in flight
      return res.status(STATUS.CONFLICT).json({
        success: false,
        message: 'A request with this Idempotency-Key is already in progress. Please retry in a moment.',
      })
    }
    return next(e)
  }

  // sentinel is non-null → document already existed before this request
  if (sentinel) {
    if (sentinel.status === 'done') {
      // Replay: return the exact cached response
      return res.status(sentinel.status_code ?? STATUS.OK).json(sentinel.response)
    }
    // status === 'pending' → previous request started but never finished (crashed mid-flight)
    // Treat as a conflict — safer than re-running and risking double-charge
    return res.status(STATUS.CONFLICT).json({
      success: false,
      message: 'A previous request with this key did not complete. Use a new Idempotency-Key to retry.',
    })
  }

  // ── Fresh request — intercept res.json to persist the final response ──────
  const originalJson = res.json.bind(res)

  res.json = async (body) => {
    if (res.statusCode >= 200 && res.statusCode < 300) {
      try {
        await IdempotencyKey.findOneAndUpdate(
          { key, userId },
          { $set: { status: 'done', status_code: res.statusCode, response: body } }
        )
      } catch (e) {
        // Non-fatal — response still goes back to client correctly
        console.error('[idempotency] failed to mark sentinel done:', e.message)
      }
    } else {
      // Request failed — remove sentinel so client can retry with same key
      try {
        await IdempotencyKey.deleteOne({ key, userId })
      } catch (_) { /* non-fatal */ }
    }
    return originalJson(body)
  }

  next()
}

/**
 * mongoSanitizeMiddleware.js
 *
 * Drop-in replacement for express-mongo-sanitize that works with Express 5.
 * Express 5 makes req.query a read-only getter, so any middleware that tries
 * to overwrite it directly (like express-mongo-sanitize v2) throws:
 *   "Cannot set property query of #<IncomingMessage> which has only a getter"
 *
 * This middleware recursively strips keys that start with '$' or contain '.'
 * from req.body, req.params, and req.query — preventing MongoDB operator injection.
 */

/**
 * Recursively remove keys starting with '$' or containing '.' from an object.
 * Returns a new sanitized object (does not mutate the original).
 *
 * @param {unknown} value
 * @returns {unknown}
 */
function sanitize(value) {
  if (Array.isArray(value)) {
    return value.map(sanitize)
  }

  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([key]) => !key.startsWith('$') && !key.includes('.'))
        .map(([key, val]) => [key, sanitize(val)]),
    )
  }

  return value
}

/**
 * Express middleware — sanitizes req.body, req.params, and req.query.
 * Compatible with Express 4 and Express 5 (does not overwrite req.query).
 */
const mongoSanitizeMiddleware = (req, _res, next) => {
  if (req.body)   req.body   = sanitize(req.body)
  if (req.params) req.params = sanitize(req.params)

  // Express 5: req.query is a read-only getter — we cannot reassign it.
  // Instead, delete each offending key in-place from the parsed query object.
  if (req.query) {
    const sanitized = sanitize(req.query)
    // Remove keys that were stripped by sanitize
    for (const key of Object.keys(req.query)) {
      if (!(key in sanitized)) {
        delete req.query[key]
      }
    }
    // Update values that were recursively sanitized
    for (const [key, val] of Object.entries(sanitized)) {
      req.query[key] = val
    }
  }

  next()
}

export default mongoSanitizeMiddleware

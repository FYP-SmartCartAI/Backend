import mongoose from 'mongoose'

// Stores idempotency keys and their cached responses.
// TTL index: MongoDB auto-deletes documents after 24 hours.
//
// Life-cycle of a sentinel document:
//   1. Inserted with status:'pending'  — request is in-flight
//   2. Updated to   status:'done'      — request completed successfully; response is cached
//   3. Deleted                         — request failed; client may retry with same key
const idempotencyKeySchema = new mongoose.Schema({
  key:         { type: String, required: true },               // client-supplied key (NOT unique alone)
  userId:      { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  route:       { type: String, required: true },               // e.g. POST /api/orders/checkout
  status:      { type: String, enum: ['pending', 'done'], default: 'pending' },
  status_code: { type: Number, default: null },                // HTTP status of cached response
  response:    { type: mongoose.Schema.Types.Mixed, default: null }, // cached response body
  createdAt:   { type: Date, default: Date.now, expires: '24h' },    // auto-delete after 24 h
})

// Compound unique index: only one entry per (key, userId) pair.
// Different users may reuse the same key string independently.
idempotencyKeySchema.index({ key: 1, userId: 1 }, { unique: true })

export default mongoose.model('IdempotencyKey', idempotencyKeySchema)

// ── behaviorController.js ─────────────────────────────────────────────────────
// Handles the POST /api/behaviors endpoint.
// Clients use this to log actions that cannot be inferred server-side:
//   view, wishlist, search, review, remove_from_cart
//
// purchase and add_to_cart are auto-logged by orderService and cartService
// respectively — clients must NOT duplicate those here.

import * as behaviorService from '../services/behaviorService.js'

// ── POST /api/behaviors (protect) ─────────────────────────────────────────────
export const logBehavior = async (req, res, next) => {
  try {
    await behaviorService.logAction(req.user._id, req.body)
    res.json({ success: true, data: null })
  } catch (err) { next(err) }
}

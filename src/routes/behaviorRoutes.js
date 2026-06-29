import express from 'express'
const router = express.Router()
import { protect } from '../middlewares/authMiddleware.js'
import { validate } from '../middlewares/validateMiddleware.js'
import { behaviorSchema } from '../utils/validators.js'
import { logBehavior } from '../controllers/behaviorController.js'

/**
 * @swagger
 * tags:
 *   name: Behaviors
 *   description: User behavior logging for the AI recommendation engine
 */

/**
 * @swagger
 * /api/behaviors:
 *   post:
 *     tags: [Behaviors]
 *     summary: Log a user action (view, wishlist, search, review)
 *     description: >
 *       Call from the frontend when the user performs an action that cannot be
 *       inferred server-side (e.g. viewing a product page, adding to wishlist,
 *       submitting a search query).
 *
 *       `purchase` and `add_to_cart` are auto-logged server-side — do NOT
 *       duplicate them here.
 *
 *       Extra context fields:
 *       - `durationSeconds` — how long the product page was open (action: view)
 *       - `query` — the search string (action: search)
 *       - `rating` — star rating 1–5 (action: review)
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [action]
 *             properties:
 *               productId:       { type: string, description: 'MongoDB ObjectId — omit for search logs' }
 *               action:          { type: string, enum: [view, wishlist, review, search, remove_from_cart] }
 *               query:           { type: string, description: 'search action only' }
 *               rating:          { type: integer, minimum: 1, maximum: 5 }
 *               durationSeconds: { type: integer, minimum: 0 }
 *     responses:
 *       200:
 *         description: Logged successfully
 *       400:
 *         description: Validation error
 */
router.post('/', protect, validate(behaviorSchema), logBehavior)

export default router

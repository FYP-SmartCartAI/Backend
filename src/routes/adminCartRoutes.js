import express from 'express'
const router = express.Router()
import { protect } from '../middlewares/authMiddleware.js'
import { adminOnly } from '../middlewares/adminMiddleware.js'
import * as adminCartController from '../controllers/adminCartController.js'

/**
 * @swagger
 * tags:
 *   name: Admin - Cart
 *   description: Admin controls for abandoned cart management
 */

/**
 * @swagger
 * /api/admin/cart/trigger-abandoned-check:
 *   post:
 *     tags: [Admin - Cart]
 *     summary: Manually trigger the abandoned cart job (Admin only)
 *     description: >
 *       Runs the exact same logic as the hourly cron job immediately.
 *       Useful for testing and for force-sending reminders outside the schedule.
 *       Detects carts idle > 1 hour, generates personalised Gemini messages,
 *       sends Firebase push notifications, and saves notification records.
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Job ran successfully — returns counts
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   type: object
 *                   properties:
 *                     cartsFound:
 *                       type: integer
 *                       example: 4
 *                     notificationsSent:
 *                       type: integer
 *                       example: 3
 *                     skippedNoToken:
 *                       type: integer
 *                       example: 1
 *                     failed:
 *                       type: integer
 *                       example: 0
 *                     executionTimeMs:
 *                       type: integer
 *                       example: 1240
 *       401:
 *         description: Not authorized
 *       403:
 *         description: Admin only
 *       500:
 *         description: Job threw an uncaught error
 */
router.post('/trigger-abandoned-check', protect, adminOnly, adminCartController.triggerAbandonedCheck)
router.get('/stats', protect, adminOnly, adminCartController.getAbandonedCartStats)

export default router

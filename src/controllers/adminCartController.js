import { runAbandonedCartJob, lastRunTime } from '../services/abandonedCartService.js'
import { STATUS } from '../constants/httpConstants.js'
import Cart from '../models/Cart.js'
import Notification from '../models/Notification.js'
import Order from '../models/Order.js'
import { ABANDONED_CART_IDLE_MINUTES } from '../config/env.js'

// ── POST /api/admin/cart/trigger-abandoned-check ───────────────────────────────
// Manually triggers the abandoned cart cron job for testing / admin force-send.
// Returns job result stats.
export const triggerAbandonedCheck = async (req, res, next) => {
  try {
    const result = await runAbandonedCartJob({ force: true })
    res.json({
      success: true,
      data: {
        cartsFound:        result.cartsFound,
        notificationsSent: result.notificationsSent,
        skippedNoToken:    result.skippedNoToken,
        failed:            result.failed,
        executionTimeMs:   result.executionTimeMs,
        force:             true,
        messages:          result.messages ?? [],
      },
    })
  } catch (err) {
    res.status(STATUS.INTERNAL_ERROR).json({
      success: false,
      message: 'Abandoned cart job threw an uncaught error',
      error:   err.message,
    })
  }
}

// ── GET /api/admin/cart/stats ──────────────────────────────────────────────────
// Calculates and returns key statistics for abandoned cart recovery campaigns.
export const getAbandonedCartStats = async (req, res, next) => {
  try {
    const totalAbandoned = await Cart.countDocuments({ isAbandoned: true, total: { $gt: 0 } })

    const revenueResult = await Cart.aggregate([
      { $match: { isAbandoned: true, total: { $gt: 0 } } },
      { $group: { _id: null, total: { $sum: '$total' } } },
    ])
    const potentialRevenue = revenueResult[0]?.total ?? 0

    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
    const remindersSent = await Notification.countDocuments({
      type: 'abandoned_cart',
      createdAt: { $gte: thirtyDaysAgo },
    })

    // Recovery = user placed an order after their cart was flagged abandoned
    const flaggedCarts = await Cart.find({ abandonedAt: { $ne: null } }).select('user abandonedAt')
    let recoveredCount = 0
    for (const cart of flaggedCarts) {
      const orderAfter = await Order.exists({
        userId: cart.user,
        createdAt: { $gt: cart.abandonedAt },
      })
      if (orderAfter) recoveredCount++
    }
    const totalFlagged = flaggedCarts.length
    const recoveryRate = totalFlagged > 0 ? Math.round((recoveredCount / totalFlagged) * 100) : 0

    res.json({
      success: true,
      data: {
        totalAbandoned,
        potentialRevenue,
        recoveryRate,
        emailsSent: remindersSent,
        lastRun: lastRunTime,
        idleMinutes: ABANDONED_CART_IDLE_MINUTES,
      },
    })
  } catch (err) {
    next(err)
  }
}

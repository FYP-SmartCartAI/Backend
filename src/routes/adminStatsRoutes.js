import express from 'express'
const router = express.Router()
import { protect } from '../middlewares/authMiddleware.js'
import { adminOnly, admin } from '../middlewares/adminMiddleware.js'
import * as adminStatsController from '../controllers/adminStatsController.js'

/**
 * @swagger
 * tags:
 *   name: Admin - Stats
 *   description: Admin dashboard analytics and statistics
 */

/**
 * @swagger
 * /api/admin/stats:
 *   get:
 *     tags: [Admin - Stats]
 *     summary: High-level platform dashboard stats (Admin only)
 *     description: >
 *       Returns totalUsers, totalProducts, totalOrders, totalRevenue,
 *       pendingOrders, and activeTickets in a single request.
 *       All queries run in parallel via Promise.all.
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Dashboard stats
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean }
 *                 data:
 *                   type: object
 *                   properties:
 *                     totalUsers:    { type: integer, example: 1200 }
 *                     totalProducts: { type: integer, example: 340 }
 *                     totalOrders:   { type: integer, example: 4500 }
 *                     totalRevenue:  { type: number,  example: 1250000 }
 *                     pendingOrders: { type: integer, example: 87 }
 *                     activeTickets: { type: integer, example: 12 }
 *       401:
 *         description: Not authorized
 *       403:
 *         description: Admin only
 */
// IMPORTANT: register '/' BEFORE '/:sub' routes so Express doesn't shadow them
router.get('/', protect, admin, adminStatsController.getDashboardStats)

/**
 * @swagger
 * /api/admin/stats/orders:
 *   get:
 *     tags: [Admin - Stats]
 *     summary: Order stats by status and by day (Admin + Subadmin)
 *     description: >
 *       Subadmins see only orders in their assigned city.
 *       Admins see all orders.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: period
 *         schema:
 *           type: string
 *           enum: ["7d", "30d", "90d"]
 *           default: "30d"
 *         description: Time window for the stats
 *     responses:
 *       200:
 *         description: Order stats
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean }
 *                 data:
 *                   type: object
 *                   properties:
 *                     byStatus:
 *                       type: object
 *                       example: { pending: 10, shipped: 5, delivered: 30 }
 *                     byDay:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           date:  { type: string, example: "2026-05-01" }
 *                           count: { type: integer }
 *                     period: { type: string, example: "30d" }
 */
router.get('/orders', protect, admin, adminStatsController.getOrderStats)

/**
 * @swagger
 * /api/admin/stats/revenue:
 *   get:
 *     tags: [Admin - Stats]
 *     summary: Revenue stats total, by day, and by product category (Admin only)
 *     description: >
 *       Only counts orders where paymentStatus is 'paid' or 'cod_collected'.
 *       byCategory uses a $lookup aggregation to join with the products collection.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: period
 *         schema:
 *           type: string
 *           enum: ["7d", "30d", "90d"]
 *           default: "30d"
 *         description: Time window for the stats
 *     responses:
 *       200:
 *         description: Revenue stats
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean }
 *                 data:
 *                   type: object
 *                   properties:
 *                     total:
 *                       type: number
 *                       example: 1250000
 *                     byDay:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           date:    { type: string, example: "2026-05-01" }
 *                           revenue: { type: number }
 *                     byCategory:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           category: { type: string, example: "electronics" }
 *                           revenue:  { type: number }
 *                     period: { type: string, example: "30d" }
 *       403:
 *         description: Admin only
 */
router.get('/revenue', protect, adminOnly, adminStatsController.getRevenueStats)

export default router

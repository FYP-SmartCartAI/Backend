import express from 'express'
const router = express.Router()
import { protect } from '../middlewares/authMiddleware.js'
import * as notificationController from '../controllers/notificationController.js'

/**
 * @swagger
 * tags:
 *   name: Notifications
 *   description: In-app notification inbox for users
 */

/**
 * @swagger
 * /api/notifications:
 *   get:
 *     tags: [Notifications]
 *     summary: Get paginated notifications for the logged-in user
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema: { type: integer, default: 1 }
 *         description: Page number
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 20, maximum: 50 }
 *         description: Items per page (max 50)
 *       - in: query
 *         name: isRead
 *         schema: { type: string, enum: ["true", "false"] }
 *         description: Filter by read state — omit to return all
 *     responses:
 *       200:
 *         description: Paginated notifications + unread count
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: object
 *                   properties:
 *                     notifications:
 *                       type: array
 *                       items:
 *                         type: object
 *                     pagination:
 *                       type: object
 *                       properties:
 *                         page:  { type: integer }
 *                         limit: { type: integer }
 *                         total: { type: integer }
 *                         pages: { type: integer }
 *                     unreadCount:
 *                       type: integer
 *       401:
 *         description: Not authorized
 */
router.get('/', protect, notificationController.getNotifications)

// IMPORTANT: register /unread-count BEFORE /:id to prevent Express matching "unread-count" as an id
router.get('/unread-count', protect, notificationController.getUnreadCount)

/**
 * @swagger
 * /api/notifications/read-all:
 *   patch:
 *     tags: [Notifications]
 *     summary: Mark all notifications as read
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Number of notifications updated
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean }
 *                 data:
 *                   type: object
 *                   properties:
 *                     updated: { type: integer, example: 5 }
 *       401:
 *         description: Not authorized
 */
// IMPORTANT: register /read-all BEFORE /:id to prevent Express matching "read-all" as an id
router.patch('/read-all', protect, notificationController.markAllAsRead)

/**
 * @swagger
 * /api/notifications/{id}/read:
 *   patch:
 *     tags: [Notifications]
 *     summary: Mark a single notification as read
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *         description: Notification MongoDB ObjectId
 *     responses:
 *       200:
 *         description: Updated notification
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean }
 *                 data:
 *                   type: object
 *                   properties:
 *                     notification: { type: object }
 *       401:
 *         description: Not authorized
 *       404:
 *         description: Notification not found or does not belong to user
 */
router.patch('/:id/read', protect, notificationController.markAsRead)

/**
 * @swagger
 * /api/notifications/{id}:
 *   delete:
 *     tags: [Notifications]
 *     summary: Delete a notification
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *         description: Notification MongoDB ObjectId
 *     responses:
 *       200:
 *         description: Notification deleted
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean }
 *                 data:   { type: "null", nullable: true }
 *                 message: { type: string, example: "Notification deleted" }
 *       401:
 *         description: Not authorized
 *       404:
 *         description: Notification not found or does not belong to user
 */
router.delete('/:id', protect, notificationController.deleteNotification)

export default router

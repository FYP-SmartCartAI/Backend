import express from 'express'
const router = express.Router()
import { protect } from '../middlewares/authMiddleware.js'
import { adminOnly } from '../middlewares/adminMiddleware.js'
import * as subAdminController from '../controllers/subAdminController.js'

/**
 * @swagger
 * tags:
 *   name: SubAdmins
 *   description: Manage sub-admins — promote, demote, list (Main Admin only)
 */

/**
 * @swagger
 * /api/admin/subadmins:
 *   get:
 *     tags: [SubAdmins]
 *     summary: List all sub-admins (Admin only)
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Array of sub-admin users with their assigned cities
 */
router.get('/', protect, adminOnly, subAdminController.list)

/**
 * @swagger
 * /api/admin/subadmins/{userId}/promote:
 *   post:
 *     tags: [SubAdmins]
 *     summary: Promote a user to sub-admin (Admin only)
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: userId
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [city]
 *             properties:
 *               city:
 *                 type: string
 *                 example: lahore
 *     responses:
 *       200:
 *         description: User promoted to sub-admin
 *       404:
 *         description: User not found
 *       409:
 *         description: Already a sub-admin or is a main admin
 */
router.post('/:userId/promote', protect, adminOnly, subAdminController.promote)

/**
 * @swagger
 * /api/admin/subadmins/{userId}/demote:
 *   delete:
 *     tags: [SubAdmins]
 *     summary: Demote a sub-admin back to user (Admin only)
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: userId
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Sub-admin demoted to user
 *       409:
 *         description: Not a sub-admin or is a main admin
 */
router.delete('/:userId/demote', protect, adminOnly, subAdminController.demote)

export default router

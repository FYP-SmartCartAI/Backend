import express from 'express'
const router = express.Router()
import { protect } from '../middlewares/authMiddleware.js'
import { adminOnly } from '../middlewares/adminMiddleware.js'
import * as adminUserController from '../controllers/adminUserController.js'
import { validate } from '../middlewares/validateMiddleware.js'
import { createUserSchema } from '../utils/validators.js'

/**
 * @swagger
 * tags:
 *   name: Admin - Users
 *   description: Admin user management — view, block, delete regular users
 */

/**
 * @swagger
 * /api/admin/users:
 *   get:
 *     tags: [Admin - Users]
 *     summary: List all regular users (Admin only)
 *     description: Returns paginated regular users (role = user). Subadmins and admins are excluded.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema: { type: integer, default: 1 }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 20 }
 *       - in: query
 *         name: search
 *         schema: { type: string }
 *         description: Match by name or email (case-insensitive)
 *     responses:
 *       200:
 *         description: Paginated list of users
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean }
 *                 data:
 *                   type: object
 *                   properties:
 *                     users:
 *                       type: array
 *                       items: { type: object }
 *                     pagination:
 *                       type: object
 *                       properties:
 *                         page:  { type: integer }
 *                         limit: { type: integer }
 *                         total: { type: integer }
 *                         pages: { type: integer }
 *       401:
 *         description: Not authorized
 *       403:
 *         description: Admin only
 */
router.get('/', protect, adminOnly, adminUserController.listUsers)

/**
 * @swagger
 * /api/admin/users:
 *   post:
 *     tags: [Admin - Users]
 *     summary: Create a new user, sub-admin, or admin account (Admin only)
 *     description: Directly creates a new user account with specified details and role. Subadmins require a city parameter. Created users are marked isVerified=true by default.
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name, email, password, role]
 *             properties:
 *               name:
 *                 type: string
 *                 example: Jane Doe
 *               email:
 *                 type: string
 *                 format: email
 *                 example: jane@example.com
 *               password:
 *                 type: string
 *                 minLength: 8
 *                 example: SecurePass123!
 *               role:
 *                 type: string
 *                 enum: [user, subadmin, admin]
 *                 example: subadmin
 *               city:
 *                 type: string
 *                 description: Required only if role is subadmin
 *                 example: lahore
 *     responses:
 *       201:
 *         description: User created successfully
 *       400:
 *         description: Validation failed or missing fields
 *       401:
 *         description: Not authorized
 *       403:
 *         description: Admin only
 *       409:
 *         description: Email already registered
 */
router.post('/', protect, adminOnly, validate(createUserSchema), adminUserController.createUser)

/**
 * @swagger
 * /api/admin/users/{id}:
 *   get:
 *     tags: [Admin - Users]
 *     summary: Get a single user with activity stats (Admin only)
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: User object with orderCount, behaviorCount, totalSpent
 *       404:
 *         description: User not found
 */
router.get('/:id', protect, adminOnly, adminUserController.getUser)

/**
 * @swagger
 * /api/admin/users/{id}/block:
 *   patch:
 *     tags: [Admin - Users]
 *     summary: Toggle block/unblock a user (Admin only)
 *     description: >
 *       Toggles the isBlocked flag. If currently blocked, unblocks; if unblocked, blocks.
 *       Cannot block another admin.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: User blocked or unblocked
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean }
 *                 data:
 *                   type: object
 *                   properties:
 *                     user: { type: object }
 *                 message:
 *                   type: string
 *                   enum: ["User blocked", "User unblocked"]
 *       403:
 *         description: Cannot block an admin account
 *       404:
 *         description: User not found
 */
router.patch('/:id/block', protect, adminOnly, adminUserController.blockUser)
router.patch('/:id/role',  protect, adminOnly, adminUserController.updateUserRole)

/**
 * @swagger
 * /api/admin/users/{id}:
 *   delete:
 *     tags: [Admin - Users]
 *     summary: Delete a user and all their data (Admin only)
 *     description: >
 *       Hard-deletes the user document plus: orders, behaviors, cart, wishlist,
 *       reviews, notifications, and tickets. Cannot delete an admin account.
 *       This action is irreversible.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: User and all related data deleted
 *       403:
 *         description: Cannot delete an admin account
 *       404:
 *         description: User not found
 */
router.delete('/:id', protect, adminOnly, adminUserController.deleteUser)

export default router

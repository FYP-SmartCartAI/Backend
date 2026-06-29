import express from 'express'
const router = express.Router()
import { protect } from '../middlewares/authMiddleware.js'
import { admin, adminOnly } from '../middlewares/adminMiddleware.js'
import { validate } from '../middlewares/validateMiddleware.js'
import { createTicketSchema, sendMessageSchema } from '../utils/validators.js'
import * as ticketController from '../controllers/ticketController.js'

/**
 * @swagger
 * tags:
 *   name: Tickets
 *   description: Support ticket system with real-time Socket.io chat
 */

/**
 * @swagger
 * /api/tickets:
 *   post:
 *     tags: [Tickets]
 *     summary: Create a support ticket
 *     description: >
 *       City is auto-detected from the linked order's shippingAddress.city,
 *       or from the user's profile address. A subadmin for that city is
 *       auto-assigned. If none exists, assignedTo is null (main admin handles it).
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [message]
 *             properties:
 *               orderId: { type: string, description: 'Optional — links ticket to an order' }
 *               message: { type: string, minLength: 1 }
 *     responses:
 *       201:
 *         description: Ticket created
 *       400:
 *         description: No city found / missing message
 *   get:
 *     tags: [Tickets]
 *     summary: List tickets (role-scoped)
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: status
 *         schema: { type: string, enum: [open, in_progress, closed] }
 *       - in: query
 *         name: page
 *         schema: { type: integer, default: 1 }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 20 }
 *     responses:
 *       200:
 *         description: Paginated ticket list
 */
router.post('/', protect, validate(createTicketSchema), ticketController.createTicket)
router.get('/',  protect, ticketController.getTickets)

/**
 * @swagger
 * /api/tickets/{id}:
 *   get:
 *     tags: [Tickets]
 *     summary: Get a single ticket with full message history
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Ticket object
 *       403:
 *         description: Not authorized (wrong user / city mismatch)
 *       404:
 *         description: Ticket not found
 *   delete:
 *     tags: [Tickets]
 *     summary: Delete a ticket (admin only)
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Deleted
 */
router.get('/:id',    protect, ticketController.getTicket)
router.delete('/:id', protect, adminOnly, ticketController.deleteTicket)

/**
 * @swagger
 * /api/tickets/{id}/messages:
 *   post:
 *     tags: [Tickets]
 *     summary: Send a message in a ticket
 *     description: >
 *       Message is persisted in MongoDB AND emitted via Socket.io to all
 *       clients in room `ticket_{id}`. Transitions ticket from open → in_progress
 *       on first staff reply.
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [message]
 *             properties:
 *               message: { type: string }
 *     responses:
 *       200:
 *         description: Message sent
 *       409:
 *         description: Ticket is closed
 */
router.post('/:id/messages', protect, validate(sendMessageSchema), ticketController.sendMessage)

/**
 * @swagger
 * /api/tickets/{id}/close:
 *   patch:
 *     tags: [Tickets]
 *     summary: Close a ticket (subadmin for their city, or admin)
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Ticket closed
 *       403:
 *         description: Not authorized
 */
router.patch('/:id/close', protect, admin, ticketController.closeTicket)

/**
 * @swagger
 * /api/tickets/{id}/reassign:
 *   patch:
 *     tags: [Tickets]
 *     summary: Reassign a ticket to a different subadmin (Admin only)
 *     description: >
 *       The target subadmin must have the same city as the ticket.
 *       Cannot reassign a closed ticket.
 *       Sends a Firebase push notification to the new subadmin if they have an FCM token.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *         description: Ticket MongoDB ObjectId
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [subadminId]
 *             properties:
 *               subadminId:
 *                 type: string
 *                 description: MongoDB ObjectId of the target subadmin
 *                 example: "664abc123def456789012345"
 *     responses:
 *       200:
 *         description: Ticket reassigned
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean }
 *                 data:    { type: object }
 *       400:
 *         description: Ticket is closed, or subadmin city does not match ticket city
 *       403:
 *         description: Admin only
 *       404:
 *         description: Ticket not found, or subadmin not found
 */
router.patch('/:id/reassign', protect, adminOnly, ticketController.reassignTicket)

export default router

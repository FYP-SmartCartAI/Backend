import express from 'express'
const router = express.Router()
import { body, param } from 'express-validator'
import { protect }       from '../middlewares/authMiddleware.js'
import { adminOnly }     from '../middlewares/adminMiddleware.js'
import { runValidation } from '../middlewares/validateMiddleware.js'
import * as flashSaleController from '../controllers/flashSaleController.js'

/**
 * @swagger
 * tags:
 *   name: FlashSale
 *   description: Flash sale management
 */

/**
 * @swagger
 * /api/flash-sale/active:
 *   get:
 *     tags: [FlashSale]
 *     summary: Get the current active flash sale (public)
 *     responses:
 *       200:
 *         description: "Active flash sale with populated products, or { active: false }"
 */
router.get('/active', flashSaleController.getActiveFlashSale)

/**
 * @swagger
 * /api/flash-sale:
 *   get:
 *     tags: [FlashSale]
 *     summary: List all flash sales — admin history (admin only)
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Array of flash sale records
 */
router.get(
  '/',
  protect, adminOnly,
  flashSaleController.getAllFlashSales
)

/**
 * @swagger
 * /api/flash-sale:
 *   post:
 *     tags: [FlashSale]
 *     summary: Create and launch a new flash sale (admin only)
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [title, productIds]
 *             properties:
 *               title:      { type: string }
 *               productIds: { type: array, items: { type: string } }
 *               duration:   { type: integer, minimum: 1, maximum: 24, default: 6 }
 *     responses:
 *       201:
 *         description: Flash sale created
 *       409:
 *         description: Another flash sale is already active
 */
router.post(
  '/',
  protect, adminOnly,
  body('title').notEmpty().withMessage('Title is required'),
  body('productIds')
    .isArray({ min: 1 })
    .withMessage('At least one product is required'),
  body('productIds.*')
    .isMongoId()
    .withMessage('Each productId must be a valid Mongo ID'),
  body('duration')
    .optional()
    .isInt({ min: 1, max: 24 })
    .withMessage('Duration must be between 1 and 24 hours'),
  runValidation,
  flashSaleController.createFlashSale
)

/**
 * @swagger
 * /api/flash-sale/{id}/terminate:
 *   patch:
 *     tags: [FlashSale]
 *     summary: Terminate a flash sale early (admin only)
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Flash sale terminated
 *       404:
 *         description: Flash sale not found
 *       409:
 *         description: Flash sale is already inactive
 */
router.patch(
  '/:id/terminate',
  protect, adminOnly,
  param('id').isMongoId().withMessage('Invalid flash sale ID'),
  runValidation,
  flashSaleController.terminateFlashSale
)

/**
 * @swagger
 * /api/flash-sale/{id}:
 *   delete:
 *     tags: [FlashSale]
 *     summary: Delete a flash sale record (admin only — only for inactive sales)
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Flash sale deleted
 *       409:
 *         description: Cannot delete an active flash sale
 */
router.delete(
  '/:id',
  protect, adminOnly,
  param('id').isMongoId().withMessage('Invalid flash sale ID'),
  runValidation,
  flashSaleController.deleteFlashSale
)

export default router

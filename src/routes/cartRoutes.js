import express from 'express'
const router = express.Router()
import { protect } from '../middlewares/authMiddleware.js'
import * as cartController from '../controllers/cartController.js'
import { body } from 'express-validator'
import { runValidation } from '../middlewares/validateMiddleware.js'

/**
 * @swagger
 * tags:
 *   name: Cart
 *   description: Shopping cart management
 */

/**
 * @swagger
 * /api/cart:
 *   get:
 *     tags: [Cart]
 *     summary: Get current user's cart
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Cart object with items and total
 */

/**
 * @swagger
 * /api/cart/add:
 *   post:
 *     tags: [Cart]
 *     summary: Add item to cart
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/CartAdd'
 *     responses:
 *       200:
 *         description: Updated cart
 *       400:
 *         description: Product not found or validation error
 */

/**
 * @swagger
 * /api/cart/update:
 *   put:
 *     tags: [Cart]
 *     summary: Update item quantity (set to 0 to remove)
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/CartUpdate'
 *     responses:
 *       200:
 *         description: Updated cart
 */

/**
 * @swagger
 * /api/cart/remove/{productId}:
 *   delete:
 *     tags: [Cart]
 *     summary: Remove a specific item from cart
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: productId
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Updated cart
 */

/**
 * @swagger
 * /api/cart/clear:
 *   delete:
 *     tags: [Cart]
 *     summary: Clear entire cart
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Cart cleared
 */

router.get('/', protect, cartController.getCart)
router.post('/verify-stock', protect, cartController.verifyStock)
router.post('/add', protect, body('productId').notEmpty(), body('quantity').optional().isInt({ min: 1 }), runValidation, cartController.add)
router.put('/update', protect, body('productId').notEmpty(), body('quantity').isInt({ min: 0 }), runValidation, cartController.update)
router.delete('/remove/:productId', protect, cartController.remove)
router.delete('/clear', protect, cartController.clear)

export default router

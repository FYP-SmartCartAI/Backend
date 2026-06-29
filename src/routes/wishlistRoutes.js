import express from 'express'
const router = express.Router()
import { protect } from '../middlewares/authMiddleware.js'
import * as wishlistController from '../controllers/wishlistController.js'

/**
 * @swagger
 * tags:
 *   name: Wishlist
 *   description: Save products to a personal wishlist
 */

/**
 * @swagger
 * /api/wishlist:
 *   get:
 *     tags: [Wishlist]
 *     summary: Get the current user's wishlist with full product details
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Wishlist with populated products
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean }
 *                 data:
 *                   type: object
 *                   properties:
 *                     wishlist:
 *                       type: object
 *                       properties:
 *                         userId: { type: string }
 *                         products:
 *                           type: array
 *                           items: { type: object }
 *       401:
 *         description: Not authorized
 */
router.get('/', protect, wishlistController.getWishlist)

/**
 * @swagger
 * /api/wishlist:
 *   delete:
 *     tags: [Wishlist]
 *     summary: Clear the entire wishlist
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Empty wishlist
 *       401:
 *         description: Not authorized
 */
router.delete('/', protect, wishlistController.clearWishlist)

/**
 * @swagger
 * /api/wishlist/{productId}:
 *   post:
 *     tags: [Wishlist]
 *     summary: Add a product to wishlist
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: productId
 *         required: true
 *         schema: { type: string }
 *         description: MongoDB ObjectId of the product
 *     responses:
 *       200:
 *         description: Updated wishlist with populated products
 *       404:
 *         description: Product not found
 *       409:
 *         description: Product already in wishlist
 *       401:
 *         description: Not authorized
 *   delete:
 *     tags: [Wishlist]
 *     summary: Remove a product from wishlist
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: productId
 *         required: true
 *         schema: { type: string }
 *         description: MongoDB ObjectId of the product
 *     responses:
 *       200:
 *         description: Updated wishlist with populated products
 *       401:
 *         description: Not authorized
 */
router.post('/:productId',   protect, wishlistController.addToWishlist)
router.delete('/:productId', protect, wishlistController.removeFromWishlist)

export default router

import express from 'express'
const router = express.Router()
import { protect } from '../middlewares/authMiddleware.js'
import * as reviewController from '../controllers/reviewController.js'
import { body } from 'express-validator'
import { runValidation } from '../middlewares/validateMiddleware.js'

/**
 * @swagger
 * tags:
 *   name: Reviews
 *   description: Product reviews and ratings
 */

/**
 * @swagger
 * /api/reviews/{productId}:
 *   post:
 *     tags: [Reviews]
 *     summary: Add a review for a product
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: productId
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/ReviewCreate'
 *     responses:
 *       201:
 *         description: Review created + product rating updated
 *       400:
 *         description: Validation error
 *   get:
 *     tags: [Reviews]
 *     summary: Get all reviews for a product
 *     parameters:
 *       - in: path
 *         name: productId
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Array of reviews
 */

/**
 * @swagger
 * /api/reviews/{id}:
 *   delete:
 *     tags: [Reviews]
 *     summary: Delete your own review
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Deleted
 *       400:
 *         description: Not authorized or not found
 */

router.post('/:productId', protect, body('rating').isInt({ min: 1, max: 5 }), runValidation, reviewController.add)
router.get('/:productId', reviewController.getForProduct)
router.put('/:id', protect, body('rating').optional().isInt({ min: 1, max: 5 }), runValidation, reviewController.updateReview)
router.delete('/:id', protect, reviewController.deleteReview)

export default router

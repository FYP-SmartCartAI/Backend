import express from 'express'
const router = express.Router()
import { protect } from '../middlewares/authMiddleware.js'
import { validate } from '../middlewares/validateMiddleware.js'
import { behaviorSchema } from '../utils/validators.js'
import { getRecommendations, getSimilarProducts } from '../controllers/recommendationController.js'

/**
 * @swagger
 * tags:
 *   name: Recommendations
 *   description: AI-powered personalized product recommendations
 */

/**
 * @swagger
 * /api/recommendations:
 *   get:
 *     tags: [Recommendations]
 *     summary: Get personalized product recommendations
 *     description: >
 *       Uses the authenticated user's behavior history (views, purchases, cart actions)
 *       to build a taste profile, embed it via Gemini, and find the most semantically
 *       similar products in Pinecone. Cold start (< 5 actions): returns top-rated products.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 10, maximum: 50 }
 *     responses:
 *       200:
 *         description: Array of recommended products (personalized or top-rated)
 *       401:
 *         description: Not authorized
 */
router.get('/', protect, getRecommendations)

/**
 * @swagger
 * /api/recommendations/similar/{productId}:
 *   get:
 *     tags: [Recommendations]
 *     summary: Get products similar to a specific product
 *     parameters:
 *       - in: path
 *         name: productId
 *         required: true
 *         schema: { type: string }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 4 }
 *     responses:
 *       200:
 *         description: Array of similar products
 */
router.get('/similar/:productId', getSimilarProducts)

export default router

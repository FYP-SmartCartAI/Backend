import express from 'express'
const router = express.Router()
import * as productController from '../controllers/productController.js'
import { protect } from '../middlewares/authMiddleware.js'
import { admin } from '../middlewares/adminMiddleware.js'
import { productUpload, multerErrorHandler } from '../middlewares/uploadMiddleware.js'
import { aiSearch } from '../controllers/recommendationController.js'

/**
 * @swagger
 * tags:
 *   name: Products
 *   description: Product catalogue — CRUD, search, AI search, vector sync
 */

// ─────────────────────────────────────────────────────────────────────────────
// ROUTE REGISTRATION ORDER — CRITICAL
// All static named routes MUST be registered before any /:id wildcard.
// Express matches routes in the order they are registered. If /:id came first,
// "ai-search", "search", "sync-all-vectors" would all be treated as product IDs.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * @swagger
 * /api/products/ai-search:
 *   get:
 *     tags: [Products]
 *     summary: AI semantic search (Gemini + Pinecone)
 *     description: >
 *       Embeds the natural-language query via Gemini (gemini-embedding-001),
 *       finds the most semantically similar products in Pinecone, then fetches
 *       full product documents from MongoDB.
 *       Falls back to MongoDB regex search if Pinecone is not configured.
 *     parameters:
 *       - in: query
 *         name: q
 *         required: true
 *         schema: { type: string }
 *         description: Natural language query (e.g. "waterproof running shoes for summer")
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 10, maximum: 50 }
 *     responses:
 *       200:
 *         description: Array of matching products ranked by semantic relevance
 */
// 1. Static — must be first to avoid /:id capture
router.get('/ai-search', aiSearch)

/**
 * @swagger
 * /api/products/search:
 *   get:
 *     tags: [Products]
 *     summary: Search products by name or description (regex)
 *     parameters:
 *       - in: query
 *         name: q
 *         required: true
 *         schema: { type: string }
 *       - in: query
 *         name: page
 *         schema: { type: integer, default: 1 }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 10 }
 *     responses:
 *       200:
 *         description: Matching products
 */
// 2. Static
router.get('/search', productController.searchProducts)

/**
 * @swagger
 * /api/products/category/{name}:
 *   get:
 *     tags: [Products]
 *     summary: Filter products by category (optionally also subcategory)
 *     parameters:
 *       - in: path
 *         name: name
 *         required: true
 *         schema: { type: string }
 *         description: Category slug (case-insensitive)
 *       - in: query
 *         name: subcategory
 *         schema: { type: string }
 *       - in: query
 *         name: page
 *         schema: { type: integer, default: 1 }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 10 }
 *     responses:
 *       200:
 *         description: Products in category
 */
// 3. Static (has its own param :name, not ambiguous with /:id)
router.get('/category/:name', productController.getByCategory)

/**
 * @swagger
 * /api/products/sync-all-vectors:
 *   post:
 *     tags: [Vector Sync]
 *     summary: Sync all unsynced products to Pinecone in background (Admin)
 *     description: >
 *       Finds all products where vectorSynced=false and starts a non-blocking
 *       background job. Returns immediately with a jobId and total queued count.
 *       Processing uses 200ms delay between embeddings to avoid Gemini rate limits.
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Background sync started
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean }
 *                 data:
 *                   type: object
 *                   properties:
 *                     jobId:       { type: string, format: uuid }
 *                     totalQueued: { type: integer }
 *                     message:     { type: string }
 *       401:
 *         description: Not authorized
 *       403:
 *         description: Admin only
 */
// 4. Static POST — must be before POST /:id/images and POST /:id/sync-vector
router.post('/sync-all-vectors', protect, admin, productController.syncAllVectors)
router.post('/vector-sync', protect, admin, productController.syncAllVectors)

/**
 * @swagger
 * /api/products:
 *   get:
 *     tags: [Products]
 *     summary: List products (paginated, filterable, sortable)
 *     parameters:
 *       - in: query
 *         name: q
 *         schema: { type: string }
 *         description: Search by product name
 *       - in: query
 *         name: category
 *         schema: { type: string }
 *       - in: query
 *         name: subcategory
 *         schema: { type: string }
 *       - in: query
 *         name: page
 *         schema: { type: integer, default: 1 }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 10 }
 *       - in: query
 *         name: minPrice
 *         schema: { type: number, minimum: 0 }
 *       - in: query
 *         name: maxPrice
 *         schema: { type: number, minimum: 0 }
 *       - in: query
 *         name: sortBy
 *         schema: { type: string, enum: [price_asc, price_desc, rating, newest], default: newest }
 *       - in: query
 *         name: brand
 *         schema: { type: string }
 *       - in: query
 *         name: inStock
 *         schema: { type: boolean }
 *     responses:
 *       200:
 *         description: Array of products
 *   post:
 *     tags: [Products]
 *     summary: Create product (Admin)
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/Product'
 *     responses:
 *       201:
 *         description: Product created
 *       401:
 *         description: Not authorized
 *       403:
 *         description: Admin only
 */
// 5. List all (GET /) — after all static named routes
router.get('/facets', productController.getProductFacets)
router.get('/', productController.getAllProducts)

// 6. Create (POST /) — admin only
router.post('/', protect, admin, productController.createProduct)

/**
 * @swagger
 * /api/products/{id}:
 *   get:
 *     tags: [Products]
 *     summary: Get product by ID
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Product object
 *       404:
 *         description: Not found
 *   put:
 *     tags: [Products]
 *     summary: Update product (Admin)
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/Product'
 *     responses:
 *       200:
 *         description: Updated product
 *       401:
 *         description: Not authorized
 *       404:
 *         description: Product not found
 *   delete:
 *     tags: [Products]
 *     summary: Delete product (Admin)
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
 *       401:
 *         description: Not authorized
 *       404:
 *         description: Product not found
 */
// 7. Dynamic /:id — AFTER all static routes
router.get('/:id',    productController.getProduct)
router.put('/:id',    protect, admin, productController.updateProduct)
router.delete('/:id', protect, admin, productController.deleteProduct)

// 8. Image upload / delete
router.post(
  '/:id/images',
  protect, admin,
  productUpload.array('images', 6),
  multerErrorHandler,
  productController.uploadProductImages,
)
router.delete(
  '/:id/images',
  protect, admin,
  productController.deleteProductImage,
)

/**
 * @swagger
 * /api/products/{id}/sync-vector:
 *   post:
 *     tags: [Vector Sync]
 *     summary: Sync a single product's vector to Pinecone (Admin)
 *     description: >
 *       Embeds the product via Gemini (gemini-embedding-001), upserts the vector
 *       into Pinecone, and sets vectorSynced=true in MongoDB.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Vector synced
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean }
 *                 data:
 *                   type: object
 *                   properties:
 *                     vectorId: { type: string }
 *                     synced:   { type: boolean }
 *       401:
 *         description: Not authorized
 *       403:
 *         description: Admin only
 *       404:
 *         description: Product not found
 *       503:
 *         description: Pinecone or Gemini not configured
 */
// 9. Sub-path of /:id — comes after the /:id routes
router.post('/:id/sync-vector', protect, admin, productController.syncVector)

export default router

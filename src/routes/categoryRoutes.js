import express from 'express'
const router = express.Router()
import * as categoryController from '../controllers/categoryController.js'
import { protect } from '../middlewares/authMiddleware.js'
import { admin } from '../middlewares/adminMiddleware.js'

/**
 * @swagger
 * tags:
 *   name: Categories
 *   description: Category and subcategory management
 */

/**
 * @swagger
 * components:
 *   schemas:
 *     Subcategory:
 *       type: object
 *       properties:
 *         _id:  { type: string }
 *         name: { type: string, example: "Smartphones" }
 *         slug: { type: string, example: "smartphones" }
 *     Category:
 *       type: object
 *       required: [name]
 *       properties:
 *         _id:           { type: string }
 *         name:          { type: string, example: "Electronics" }
 *         slug:          { type: string, example: "electronics" }
 *         description:   { type: string, example: "All electronic items" }
 *         image:         { type: string, example: "https://cdn.example.com/electronics.jpg" }
 *         subcategories:
 *           type: array
 *           items:
 *             $ref: '#/components/schemas/Subcategory'
 */

// ──────────────────────────────────────────────────────────────────────────────
// CATEGORIES
// ──────────────────────────────────────────────────────────────────────────────

/**
 * @swagger
 * /api/categories:
 *   get:
 *     tags: [Categories]
 *     summary: List all categories (with their subcategories)
 *     responses:
 *       200:
 *         description: Array of categories
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean }
 *                 data:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/Category'
 *   post:
 *     tags: [Categories]
 *     summary: Create a category (Admin)
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name]
 *             properties:
 *               name:        { type: string, example: "Electronics" }
 *               description: { type: string }
 *               image:       { type: string }
 *     responses:
 *       201:
 *         description: Category created
 *       401:
 *         description: Not authorised
 *       403:
 *         description: Admin only
 */
router.get('/',  categoryController.getAllCategories)
router.post('/', protect, admin, categoryController.createCategory)

/**
 * @swagger
 * /api/categories/{slug}:
 *   get:
 *     tags: [Categories]
 *     summary: Get a single category by slug
 *     parameters:
 *       - in: path
 *         name: slug
 *         required: true
 *         schema: { type: string }
 *         example: electronics
 *     responses:
 *       200:
 *         description: Category object
 *       404:
 *         description: Not found
 *   put:
 *     tags: [Categories]
 *     summary: Update a category (Admin)
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: slug
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name:        { type: string }
 *               description: { type: string }
 *               image:       { type: string }
 *     responses:
 *       200:
 *         description: Updated category
 *       404:
 *         description: Not found
 *   delete:
 *     tags: [Categories]
 *     summary: Delete a category (Admin)
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: slug
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Deleted
 *       404:
 *         description: Not found
 */
router.get('/:slug',    categoryController.getCategory)
router.put('/:slug',    protect, admin, categoryController.updateCategory)
router.delete('/:slug', protect, admin, categoryController.deleteCategory)

// ──────────────────────────────────────────────────────────────────────────────
// SUBCATEGORIES  /api/categories/:slug/subcategories
// ──────────────────────────────────────────────────────────────────────────────

/**
 * @swagger
 * /api/categories/{slug}/subcategories:
 *   get:
 *     tags: [Categories]
 *     summary: Get all subcategories of a category
 *     parameters:
 *       - in: path
 *         name: slug
 *         required: true
 *         schema: { type: string }
 *         example: electronics
 *     responses:
 *       200:
 *         description: Array of subcategories
 *       404:
 *         description: Category not found
 *   post:
 *     tags: [Categories]
 *     summary: Add a subcategory to a category (Admin)
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: slug
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name]
 *             properties:
 *               name: { type: string, example: "Smartphones" }
 *     responses:
 *       201:
 *         description: Subcategory added
 *       404:
 *         description: Category not found
 *       409:
 *         description: Subcategory already exists
 */
router.get('/:slug/subcategories',  categoryController.getSubcategories)
router.post('/:slug/subcategories', protect, admin, categoryController.addSubcategory)

/**
 * @swagger
 * /api/categories/{slug}/subcategories/{subSlug}:
 *   put:
 *     tags: [Categories]
 *     summary: Rename a subcategory (Admin)
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: slug
 *         required: true
 *         schema: { type: string }
 *       - in: path
 *         name: subSlug
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name]
 *             properties:
 *               name: { type: string, example: "Feature Phones" }
 *     responses:
 *       200:
 *         description: Updated category
 *       404:
 *         description: Category or subcategory not found
 *   delete:
 *     tags: [Categories]
 *     summary: Remove a subcategory (Admin)
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: slug
 *         required: true
 *         schema: { type: string }
 *       - in: path
 *         name: subSlug
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Subcategory removed
 *       404:
 *         description: Category not found
 */
router.put('/:slug/subcategories/:subSlug',    protect, admin, categoryController.updateSubcategory)
router.delete('/:slug/subcategories/:subSlug', protect, admin, categoryController.deleteSubcategory)

export default router

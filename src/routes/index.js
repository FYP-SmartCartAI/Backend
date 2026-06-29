import express from 'express'
const router = express.Router()

import authRoutes           from './authRoutes.js'
import oauthRoutes          from './oauthRoutes.js'
import productRoutes        from './productRoutes.js'
import categoryRoutes       from './categoryRoutes.js'
import orderRoutes          from './orderRoutes.js'
import paymentRoutes        from './paymentRoutes.js'
import cartRoutes           from './cartRoutes.js'
import reviewRoutes         from './reviewRoutes.js'
import recommendationRoutes from './recommendationRoutes.js'
import behaviorRoutes       from './behaviorRoutes.js'
import notificationRoutes   from './notificationRoutes.js'
import wishlistRoutes       from './wishlistRoutes.js'
import ticketRoutes         from './ticketRoutes.js'
import adminRoutes          from './adminRoutes.js'  // ← consolidated admin router

router.use('/auth',            authRoutes)
router.use('/oauth',           oauthRoutes)
router.use('/auth/oauth',      oauthRoutes)
router.use('/products',        productRoutes)
router.use('/categories',      categoryRoutes)
router.use('/orders',          orderRoutes)
router.use('/payments',        paymentRoutes)
router.use('/cart',            cartRoutes)
router.use('/reviews',         reviewRoutes)
router.use('/recommendations', recommendationRoutes)
router.use('/behaviors',       behaviorRoutes)
router.use('/notifications',   notificationRoutes)
router.use('/wishlist',        wishlistRoutes)
router.use('/tickets',         ticketRoutes)
router.use('/admin',           adminRoutes)          // ← single mount for all /api/admin/* routes

export default router

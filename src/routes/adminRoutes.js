// ── adminRoutes.js ────────────────────────────────────────────────────────────
// Single consolidated admin router that mounts all admin sub-routers.
// This satisfies the spec requirement for a single adminRoutes.js file while
// preserving the clean separation of subAdminRoutes, adminUserRoutes,
// adminStatsRoutes, and adminCartRoutes.
//
// Route order (all static paths before dynamic /:id):
//   1. GET    /subadmins
//   2. POST   /subadmins/:userId/promote
//   3. DELETE /subadmins/:userId/demote
//   4. GET    /users             ← static before /users/:id
//   5. GET    /users/:id
//   6. PATCH  /users/:id/block
//   7. DELETE /users/:id
//   8. GET    /stats             ← static before /stats/orders
//   9. GET    /stats/orders
//  10. GET    /stats/revenue
//  11. POST   /cart/trigger-abandoned-check

import express from 'express'
const router = express.Router()

import subAdminRoutes  from './subAdminRoutes.js'
import adminUserRoutes from './adminUserRoutes.js'
import adminStatsRoutes from './adminStatsRoutes.js'
import adminCartRoutes from './adminCartRoutes.js'
import { protect } from '../middlewares/authMiddleware.js'
import { admin } from '../middlewares/adminMiddleware.js'
import { getVectorSyncStatus } from '../controllers/productController.js'

router.use('/subadmins', subAdminRoutes)
router.use('/users',     adminUserRoutes)
router.use('/stats',     adminStatsRoutes)
router.use('/cart',      adminCartRoutes)

router.get('/vector-sync/status', protect, admin, getVectorSyncStatus)

export default router

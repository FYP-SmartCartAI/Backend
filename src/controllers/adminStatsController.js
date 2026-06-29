import * as adminStatsService from '../services/adminStatsService.js'

// ── GET /api/admin/stats ───────────────────────────────────────────────────────
export const getDashboardStats = async (req, res, next) => {
  try {
    const cityFilter = req.user.role === 'subadmin' ? req.user.city : null
    const stats = await adminStatsService.getDashboardStats(cityFilter)
    res.json({ success: true, data: stats })
  } catch (err) { next(err) }
}

// ── GET /api/admin/stats/orders ────────────────────────────────────────────────
// Query: period — '7d' | '30d' | '90d'
// Subadmin: scoped to their city automatically
export const getOrderStats = async (req, res, next) => {
  try {
    const period     = req.query.period || '30d'
    const cityFilter = req.user.role === 'subadmin' ? req.user.city : null
    const stats      = await adminStatsService.getOrderStats(period, cityFilter)
    res.json({ success: true, data: stats })
  } catch (err) { next(err) }
}

// ── GET /api/admin/stats/revenue ───────────────────────────────────────────────
// Query: period — '7d' | '30d' | '90d'
export const getRevenueStats = async (req, res, next) => {
  try {
    const period = req.query.period || '30d'
    const stats  = await adminStatsService.getRevenueStats(period)
    res.json({ success: true, data: stats })
  } catch (err) { next(err) }
}

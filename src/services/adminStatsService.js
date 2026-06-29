import mongoose from 'mongoose'
import User from '../models/User.js'
import Product from '../models/Product.js'
import Order from '../models/Order.js'
import Ticket from '../models/Ticket.js'

// ── Period helper ─────────────────────────────────────────────────────────────
const getPeriodStart = (period) => {
  const days = period === '7d' ? 7 : period === '90d' ? 90 : 30
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000)
}

// ── GET /api/admin/stats ───────────────────────────────────────────────────────
// Returns high-level platform counts for the admin and sub-admin dashboard.
export const getDashboardStats = async (cityFilter = null) => {
  const filter = {}
  const ticketFilter = {}
  const userFilter = { role: 'user' }
  const productFilter = { isActive: { $ne: false } }

  if (cityFilter) {
    const escaped = cityFilter.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const cityRegExp = new RegExp(`^${escaped}$`, 'i')
    filter['shippingAddress.city'] = cityRegExp
    ticketFilter.city = cityFilter.toLowerCase()
    userFilter['address.city'] = cityRegExp
  }

  const todayStart = new Date()
  todayStart.setHours(0, 0, 0, 0)

  const matchBaseRevenue = { paymentStatus: { $in: ['paid', 'cod_collected'] } }
  const matchBaseRevenueToday = { createdAt: { $gte: todayStart }, paymentStatus: { $in: ['paid', 'cod_collected'] } }
  const matchBaseCodCollected = { paymentMethod: 'cod', paymentStatus: 'cod_collected' }

  if (cityFilter) {
    const escaped = cityFilter.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const cityRegExp = new RegExp(`^${escaped}$`, 'i')
    matchBaseRevenue['shippingAddress.city'] = cityRegExp
    matchBaseRevenueToday['shippingAddress.city'] = cityRegExp
    matchBaseCodCollected['shippingAddress.city'] = cityRegExp
  }

  const [
    totalUsers,
    totalProducts,
    totalOrders,
    revenueResult,
    pendingOrders,
    activeTickets,
    ordersToday,
    revenueTodayResult,
    lowStock,
    codPending,
    codCollectedResult,
  ] = await Promise.all([
    User.countDocuments(userFilter),
    Product.countDocuments(productFilter),
    Order.countDocuments(filter),
    Order.aggregate([
      { $match: matchBaseRevenue },
      { $group: { _id: null, total: { $sum: '$total' } } },
    ]),
    Order.countDocuments({ ...filter, status: 'pending' }),
    Ticket.countDocuments({ ...ticketFilter, status: { $in: ['open', 'in_progress'] } }),
    Order.countDocuments({ ...filter, createdAt: { $gte: todayStart } }),
    Order.aggregate([
      { $match: matchBaseRevenueToday },
      { $group: { _id: null, total: { $sum: '$total' } } },
    ]),
    Product.countDocuments({ ...productFilter, stock: { $lte: 5 } }),
    Order.countDocuments({ ...filter, paymentMethod: 'cod', status: 'delivered', paymentStatus: 'cod_pending' }),
    Order.aggregate([
      { $match: matchBaseCodCollected },
      { $group: { _id: null, total: { $sum: '$total' } } },
    ]),
  ])

  const totalRevenue = revenueResult[0]?.total ?? 0
  const revenueToday = revenueTodayResult[0]?.total ?? 0
  const codCollectedTotal = codCollectedResult[0]?.total ?? 0

  return {
    totalUsers,
    totalProducts,
    totalOrders,
    totalRevenue,
    pendingOrders,
    activeTickets,
    ordersToday,
    revenueToday,
    lowStock,
    codPending,
    codCollectedTotal,
  }
}

// ── GET /api/admin/stats/orders ────────────────────────────────────────────────
// Returns order counts grouped by status and by day for the given period.
// Subadmin is city-scoped.
export const getOrderStats = async (period = '30d', cityFilter = null) => {
  const startDate = getPeriodStart(period)
  const matchBase = { createdAt: { $gte: startDate } }

  if (cityFilter) {
    const escaped = cityFilter.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    matchBase['shippingAddress.city'] = new RegExp(`^${escaped}$`, 'i')
  }

  const [byStatusResult, byDayResult] = await Promise.all([
    // Count orders grouped by status
    Order.aggregate([
      { $match: matchBase },
      { $group: { _id: '$status', count: { $sum: 1 } } },
    ]),
    // Count orders grouped by calendar day
    Order.aggregate([
      { $match: matchBase },
      {
        $group: {
          _id:   { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
          count: { $sum: 1 },
        },
      },
      { $sort: { _id: 1 } },
    ]),
  ])

  // Convert byStatus array → plain object { pending: 3, shipped: 7, … }
  const byStatus = {}
  for (const item of byStatusResult) {
    byStatus[item._id] = item.count
  }

  // Convert byDay array → [{ date, count }]
  const byDay = byDayResult.map(d => ({ date: d._id, count: d.count }))

  return { byStatus, byDay, period }
}

// ── GET /api/admin/stats/revenue ───────────────────────────────────────────────
// Returns total revenue, revenue by day, and revenue by product category.
export const getRevenueStats = async (period = '30d') => {
  const startDate = getPeriodStart(period)
  const matchBase = {
    createdAt:     { $gte: startDate },
    paymentStatus: { $in: ['paid', 'cod_collected'] },
  }

  const [totalResult, byDayResult, byCategoryResult] = await Promise.all([
    // Total revenue in period
    Order.aggregate([
      { $match: matchBase },
      { $group: { _id: null, total: { $sum: '$total' } } },
    ]),

    // Revenue grouped by day
    Order.aggregate([
      { $match: matchBase },
      {
        $group: {
          _id:     { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
          revenue: { $sum: '$total' },
        },
      },
      { $sort: { _id: 1 } },
    ]),

    // Revenue by product category — unwind items, lookup product, group by category
    Order.aggregate([
      { $match: matchBase },
      { $unwind: '$items' },
      {
        $lookup: {
          from:         'products',
          localField:   'items.product',
          foreignField: '_id',
          as:           'productDoc',
        },
      },
      { $unwind: { path: '$productDoc', preserveNullAndEmptyArrays: false } },
      {
        $group: {
          _id:     '$productDoc.category',
          revenue: { $sum: { $multiply: ['$items.price', '$items.quantity'] } },
        },
      },
      { $sort: { revenue: -1 } },
    ]),
  ])

  const total      = totalResult[0]?.total ?? 0
  const byDay      = byDayResult.map(d => ({ date: d._id, revenue: d.revenue }))
  const byCategory = byCategoryResult.map(c => ({ category: c._id, revenue: c.revenue }))

  return { total, byDay, byCategory, period }
}

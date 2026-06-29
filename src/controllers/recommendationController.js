import * as behaviorService from '../services/behaviorService.js'

// ── GET /api/products/ai-search?q=...  (public) ────────────────────────────────
// Embeds the query → Pinecone top-K → MongoDB fetch.
// Falls back to plain MongoDB text search if Pinecone not configured.
export const aiSearch = async (req, res, next) => {
  try {
    const { q = '', limit = 10, maxPrice, minPrice } = req.query
    if (!q.trim()) return res.json({ success: true, data: [] })

    const safeLimit = Math.min(Math.max(1, parseInt(limit) || 10), 50)
    console.log(`[AI Search] API GET /api/products/ai-search?q="${q.trim()}" limit=${safeLimit}`)
    const products  = await behaviorService.aiSearch(q.trim(), safeLimit, { maxPrice, minPrice })
    console.log(`[AI Search] API response → ${products.length} product(s) sent to client`)
    res.json({ success: true, data: products })
  } catch (err) { next(err) }
}

// ── GET /api/recommendations  (protect) ────────────────────────────────────────
// Returns personalized product recommendations for the logged-in user.
// Cold-start: < 5 behavior logs → top-rated products.
export const getRecommendations = async (req, res, next) => {
  try {
    const { limit = 10 } = req.query
    const safeLimit = Math.min(Math.max(1, parseInt(limit) || 10), 50)
    const products  = await behaviorService.getRecommendations(req.user._id, safeLimit)
    res.json({ success: true, data: products })
  } catch (err) { next(err) }
}

// ── GET /api/recommendations/similar/:productId  (public) ─────────────────────────
export const getSimilarProducts = async (req, res, next) => {
  try {
    const limit = req.query.limit || 4
    const products = await behaviorService.getSimilarProducts(req.params.productId, Number(limit))
    res.json({ success: true, data: products })
  } catch (err) { next(err) }
}

// ── POST /api/behaviors  (protect) ─────────────────────────────────────────────
// Client explicitly logs user actions that can't be inferred server-side:
//   view, wishlist, search, review — purchase & add_to_cart are auto-logged.
export const logBehavior = async (req, res, next) => {
  try {
    await behaviorService.logAction(req.user._id, req.body)
    res.json({ success: true })
  } catch (err) { next(err) }
}

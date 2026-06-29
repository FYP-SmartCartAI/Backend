import BehaviorLog from '../models/BehaviorLog.js'
import Product from '../models/Product.js'
import User from '../models/User.js'
import { searchSimilar, searchSimilarDetailed, embedStorageText, upsertUserProfileVector } from './vectorService.js'
import { getCategoryMap, populateProductCategory, searchByText, resolveIntentFromCatalogMatch } from './productService.js'
import { parseAiSearchQuery, buildPriceFilter, parseProductIntent, productMatchesIntent, productInCategories } from '../utils/parseAiSearchQuery.js'
import {
  buildGroqEmbeddingText,
  filterByPineconeRelevance,
  filterStrictCatalog,
  PINECONE_MIN_SCORE,
} from '../utils/searchRelevance.js'
import { resolveGroqSearchIntent } from './groqSearchIntent.js'
import { isGroqConfigured } from '../config/groq.js'
import {
  logSearchStart,
  logQueryParse,
  logPath,
  logGeminiEmbed,
  logPineconeQuery,
  logPineconeMatches,
  logMongoFetch,
  logFilterPass,
  logFinalResults,
} from '../utils/aiSearchLogger.js'

// ── Action weight table ────────────────────────────────────────────────────────
// Higher weight = stronger signal of interest.
// Negative weights penalize disliked products.
const ACTION_WEIGHTS = {
  purchase:         5,
  review:           5,   // weighted further by rating below
  add_to_cart:      4,
  wishlist:         3,
  view:             1,   // long views (>= 10 s) upgraded to 3 in computeActionWeight
  search:           2,
  remove_from_cart: -1,
}

// Cold-start threshold — below this many logs we fall back to top-rated products
export const COLD_START_THRESHOLD = 5

// Views at or above this duration are treated as "long view" (weight 3)
const LONG_VIEW_THRESHOLD_SECONDS = 10

// ── Compute the interest weight for a single action ───────────────────────────
export const computeActionWeight = (action, { rating = null, durationSeconds = null } = {}) => {
  let w = ACTION_WEIGHTS[action] ?? 1
  if (action === 'view' && durationSeconds != null && durationSeconds >= LONG_VIEW_THRESHOLD_SECONDS) w = 3
  if (action === 'review' && rating != null) {
    w = rating >= 4 ? 5 : rating >= 3 ? 2 : -2
  }
  return w
}

// ── Log a user action ─────────────────────────────────────────────────────────
// Called fire-and-forget from cartService, orderService, or the behavior REST API.
// Never throws — a failed log must never break the parent operation.
export const logAction = async (userId, { productId = null, action, query = null, rating = null, durationSeconds = null, price = null }) => {
  try {
    const weight = computeActionWeight(action, { rating, durationSeconds })
    await BehaviorLog.create({ userId, productId, action, query, rating, durationSeconds, price, weight })
    User.findByIdAndUpdate(userId, { $set: { profileSynced: false } }).catch(() => {})
  } catch (e) {
    console.error(`[behaviorService] logAction failed for user ${userId}:`, e.message)
  }
}

// ── Build a taste-profile text from recent behavior logs ──────────────────────
// Fetches the most recent 100 logs, weights each product interaction, and
// produces a human-readable text that can be embedded into a vector.
// This text intentionally reads like a sentence Gemini can understand.
export const buildUserProfile = async (userId) => {
  const logs = await BehaviorLog.find({ userId })
    .sort({ timestamp: -1 })
    .limit(100)
    .populate('productId', 'name category subcategory description price')

  if (logs.length < COLD_START_THRESHOLD) return null  // trigger cold-start path

  // Accumulate weighted product tokens
  const weightMap = {}   // productId → accumulated weight

  for (const log of logs) {
    if (!log.productId) continue  // search-only logs have no product

    const id = log.productId._id.toString()
    const w = computeActionWeight(log.action, {
      rating: log.rating,
      durationSeconds: log.durationSeconds,
    })

    weightMap[id] = (weightMap[id] ?? 0) + w
  }

  // Sort by weight descending, keep top 15 products
  const topProducts = Object.entries(weightMap)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 15)
    .map(([id]) => logs.find(l => l.productId?._id.toString() === id)?.productId)
    .filter(Boolean)

  if (!topProducts.length) return null

  // Also include search queries as context
  const queries = logs
    .filter(l => l.action === 'search' && l.query)
    .slice(0, 5)
    .map(l => l.query)

  const productDescriptions = topProducts
    .map(p => `${p.name} (${p.category}${p.subcategory ? '/' + p.subcategory : ''})`)
    .join(', ')

  const queryContext = queries.length ? `. Previously searched for: ${queries.join(', ')}` : ''

  return `User is interested in: ${productDescriptions}${queryContext}`
}

// ── User IDs with enough behavior logs to build a taste profile ───────────────
const getEligibleProfileUserIds = async () => {
  const rows = await BehaviorLog.aggregate([
    { $group: { _id: '$userId', count: { $sum: 1 } } },
    { $match: { count: { $gte: COLD_START_THRESHOLD } } },
  ])
  return rows.map((r) => r._id)
}

// ── Stats for admin vector-sync status panel ──────────────────────────────────
export const getUserProfileSyncStats = async () => {
  const eligibleIds = await getEligibleProfileUserIds()
  if (!eligibleIds.length) {
    return { totalEligible: 0, syncedProfiles: 0, pendingProfiles: 0 }
  }

  const filter = { _id: { $in: eligibleIds }, role: 'user' }
  const totalEligible   = await User.countDocuments(filter)
  const syncedProfiles  = await User.countDocuments({ ...filter, profileSynced: true })
  const pendingProfiles = await User.countDocuments({ ...filter, profileSynced: { $ne: true } })

  return { totalEligible, syncedProfiles, pendingProfiles }
}

// ── Embed one user's taste profile → Pinecone user-profiles namespace ─────────
export const syncUserProfile = async (userId) => {
  const profileText = await buildUserProfile(userId)
  if (!profileText) {
    return { userId: userId.toString(), synced: false, reason: 'cold_start' }
  }

  const user = await User.findById(userId).select('name email')
  if (!user) {
    return { userId: userId.toString(), synced: false, reason: 'user_not_found' }
  }

  const vector = await embedStorageText(profileText)
  if (!vector) throw Object.assign(new Error('User profile embedding failed'), { statusCode: 500 })

  const logCount = await BehaviorLog.countDocuments({ userId })
  await upsertUserProfileVector(userId, vector, {
    name:          user.name,
    email:         user.email,
    log_count:     logCount,
    profile_text:  profileText.slice(0, 200),
  })

  await User.findByIdAndUpdate(userId, { $set: { profileSynced: true } })
  return { userId: userId.toString(), synced: true }
}

// ── Sync all users whose profiles are out of date (profileSynced = false) ─────
export const syncAllUserProfiles = async () => {
  const eligibleIds = await getEligibleProfileUserIds()
  const users = await User.find({
    _id: { $in: eligibleIds },
    role: 'user',
    profileSynced: { $ne: true },
  }).select('_id')

  let processed = 0
  let errors    = 0
  let coldStart = 0

  for (const user of users) {
    try {
      const result = await syncUserProfile(user._id)
      if (result.reason === 'cold_start') coldStart++
      else if (result.synced) processed++

      await new Promise((r) => setTimeout(r, 350))
    } catch (e) {
      errors++
      console.error(`[syncAllUserProfiles] failed for user ${user._id}:`, e.message)
    }
  }

  return { totalQueued: users.length, processed, errors, coldStart }
}

// ── Get personalized recommendations ─────────────────────────────────────────
// 1. Build a user profile text from recent behavior logs
// 2. Embed it → search Pinecone → fetch matched products from MongoDB
// 3. Cold start: if < 5 logs, return top-rated products from MongoDB instead
export const getRecommendations = async (userId, topK = 10) => {
  const profileText = await buildUserProfile(userId)

  // ── Cold start path ───────────────────────────────────────────────────────
  if (!profileText) {
    const products = await Product.find({ stock: { $gt: 0 } })
      .sort({ rating: -1 })
      .limit(topK)
    const categoryMap = await getCategoryMap()
    return products.map(p => populateProductCategory(p, categoryMap))
  }

  // ── Personalized path — vector search ─────────────────────────────────────
  const matches = await searchSimilar(profileText, topK + 5)   // fetch a few extra for filtering

  if (!matches.length) {
    // Pinecone returned nothing (not configured or index empty) → fallback
    const products = await Product.find({ stock: { $gt: 0 } }).sort({ rating: -1 }).limit(topK)
    const categoryMap = await getCategoryMap()
    return products.map(p => populateProductCategory(p, categoryMap))
  }

  // Fetch the already-purchased product IDs for this user to exclude them
  const purchaseLogs = await BehaviorLog.find({ userId, action: 'purchase' }).select('productId')
  const purchasedIds = new Set(purchaseLogs.map(l => l.productId?.toString()).filter(Boolean))

  const filteredIds = matches
    .map(m => m.id)
    .filter(id => !purchasedIds.has(id))
    .slice(0, topK)

  if (!filteredIds.length) {
    const products = await Product.find({ stock: { $gt: 0 } }).sort({ rating: -1 }).limit(topK)
    const categoryMap = await getCategoryMap()
    return products.map(p => populateProductCategory(p, categoryMap))
  }

  // Preserve Pinecone ranking order in the MongoDB result
  const products = await Product.find({ _id: { $in: filteredIds }, stock: { $gt: 0 } })
  const productMap = Object.fromEntries(products.map(p => [p._id.toString(), p]))
  const sortedProducts = filteredIds.map(id => productMap[id]).filter(Boolean)

  const categoryMap = await getCategoryMap()
  return sortedProducts.map(p => populateProductCategory(p, categoryMap))
}

// ── AI Semantic Search ────────────────────────────────────────────────────────
// Groq query understanding → Pinecone first → strict relevance → MongoDB fallback only if empty.
export const aiSearch = async (queryText, topK = 10, { maxPrice: paramMax, minPrice: paramMin } = {}) => {
  logSearchStart({ rawQuery: queryText, topK })

  const { semanticQuery, maxPrice, minPrice } = parseAiSearchQuery(queryText, {
    maxPrice: paramMax,
    minPrice: paramMin,
  })
  const priceFilter = buildPriceFilter(maxPrice, minPrice)
  const fetchK = priceFilter ? Math.min(topK * 4, 50) : Math.min(topK * 3, 30)

  let groqMeta = null
  let intent = parseProductIntent(semanticQuery)

  if (isGroqConfigured()) {
    groqMeta = await resolveGroqSearchIntent(semanticQuery)
    if (groqMeta?.intent) {
      intent = { ...intent, ...groqMeta.intent }
    }
  }

  const catalog = await resolveIntentFromCatalogMatch(semanticQuery)
  const embeddingQuery = groqMeta?.searchText
    || buildGroqEmbeddingText(groqMeta, semanticQuery)
    || semanticQuery

  logQueryParse({ semanticQuery, embeddingQuery, maxPrice, minPrice, priceFilter, intent, groqMeta })

  const categoryMap = await getCategoryMap()
  const populate = (list) => list.map((p) => populateProductCategory(p, categoryMap))

  // ── Path A: Pinecone vector search (always first) ─────────────────────────
  logPath('PINECONE', `Groq-enriched embedding (topK=${fetchK}, minScore=${PINECONE_MIN_SCORE})`)

  const { matches, vectorLength, vectorPreview } = await searchSimilarDetailed(embeddingQuery, fetchK)

  logGeminiEmbed({
    inputText: embeddingQuery,
    taskType: 'RETRIEVAL_QUERY',
    vectorLength,
    vectorPreview,
  })

  logPineconeQuery({ topK: fetchK, filter: {}, matchCount: matches.length })
  logPineconeMatches(matches)

  const stockFilter = { stock: { $gt: 0 }, isActive: { $ne: false } }
  if (priceFilter) stockFilter.price = priceFilter

  let sortedProducts = []

  if (matches.length) {
    const ids = matches.map((m) => m.id)
    const priceFiltered = await Product.find({ _id: { $in: ids }, ...stockFilter })
    const priceMap = Object.fromEntries(priceFiltered.map((p) => [p._id.toString(), p]))

    const beforeStrict = ids.map((id) => priceMap[id]).filter(Boolean)

    logMongoFetch({
      idsRequested: ids,
      mongoFilter: stockFilter,
      productsFound: beforeStrict.length,
    })

    const afterCategory = intent?.categories?.length
      ? beforeStrict.filter((p) => productInCategories(p, intent.categories))
      : beforeStrict

    if (intent?.categories?.length && beforeStrict.length !== afterCategory.length) {
      logFilterPass('Category filter', {
        before: beforeStrict.length,
        after: afterCategory.length,
        dropped: beforeStrict
          .filter((p) => !afterCategory.includes(p))
          .map((p) => ({ name: p.name, reason: `outside ${intent.categories.join(', ')}` })),
      })
    }

    let afterIntent = afterCategory.filter((p) => productMatchesIntent(p, intent))

    if (afterCategory.length !== afterIntent.length) {
      logFilterPass('Intent rules (subcategory / keywords / exclusions)', {
        before: afterCategory.length,
        after: afterIntent.length,
        dropped: afterCategory
          .filter((p) => !afterIntent.includes(p))
          .map((p) => ({ name: p.name, reason: 'subcategory, keyword, or name exclusion' })),
      })
    }

    sortedProducts = filterByPineconeRelevance(afterIntent, matches, groqMeta, intent)

    if (afterIntent.length !== sortedProducts.length) {
      logFilterPass('Strict relevance (core product type + min score)', {
        before: afterIntent.length,
        after: sortedProducts.length,
        dropped: afterIntent
          .filter((p) => !sortedProducts.some((s) => s._id.toString() === p._id.toString()))
          .map((p) => ({ name: p.name, reason: 'no core product-type match or score below threshold' })),
      })
    }

    sortedProducts = ids
      .map((id) => sortedProducts.find((p) => p._id.toString() === id))
      .filter(Boolean)
      .slice(0, topK)
  }

  // Merge exact catalog name matches (e.g. "Clearview Mechanical")
  if (catalog.directMatches?.length) {
    const seen = new Set(sortedProducts.map((p) => p._id.toString()))
    for (const p of catalog.directMatches) {
      const id = p._id?.toString()
      if (id && !seen.has(id)) {
        sortedProducts.unshift(p)
        seen.add(id)
      }
    }
    sortedProducts = sortedProducts.slice(0, topK)
  }

  if (sortedProducts.length) {
    const results = populate(sortedProducts)
    logFinalResults(results, 'PINECONE (strict relevance)')
    return results
  }

  // ── Path B: MongoDB text fallback (only when Pinecone yields nothing relevant) ─
  logPath('FALLBACK', 'Pinecone returned 0 relevant matches — MongoDB text search')

  const fallbackProducts = await searchByText(
    groqMeta?.intent?.productName || semanticQuery,
    { limit: fetchK, inStockOnly: true, minPrice, maxPrice },
  )

  let strictFallback = filterStrictCatalog(fallbackProducts, groqMeta, intent)
  if (intent?.categories?.length) {
    strictFallback = strictFallback.filter((p) => productMatchesIntent(p, intent))
  }

  const results = populate(strictFallback.slice(0, topK))
  logFinalResults(results, strictFallback.length ? 'FALLBACK (MongoDB strict)' : 'NO MATCHES (product not in catalog)')
  return results
}

// ── Similar Products Recommendation ───────────────────────────────────────────
export const getSimilarProducts = async (productId, limit = 4) => {
  const product = await Product.findById(productId)
  if (!product) return []

  const queryText = `${product.name} | ${product.category} | ${product.description || ''}`
  const matches = await searchSimilar(queryText, limit + 1)

  if (!matches.length) {
    const fallbackProducts = await Product.find({
      category: product.category,
      _id: { $ne: product._id },
      stock: { $gt: 0 }
    }).limit(limit)
    const categoryMap = await getCategoryMap()
    return fallbackProducts.map(p => populateProductCategory(p, categoryMap))
  }

  const ids = matches.map(m => m.id).filter(id => id !== productId).slice(0, limit)
  const products = await Product.find({ _id: { $in: ids }, stock: { $gt: 0 } })
  const pMap = Object.fromEntries(products.map(p => [p._id.toString(), p]))
  const sortedProducts = ids.map(id => pMap[id]).filter(Boolean)

  const categoryMap = await getCategoryMap()
  return sortedProducts.map(p => populateProductCategory(p, categoryMap))
}

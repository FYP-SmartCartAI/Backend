/**
 * Extract price constraints from natural-language AI search queries.
 * e.g. "mobile phone below 150000" → { semanticQuery: "mobile phone", maxPrice: 150000 }
 */

const parseAmount = (raw, unit) => {
  const n = Number(String(raw).replace(/,/g, ''))
  if (!Number.isFinite(n) || n <= 0) return null
  const u = (unit || '').toLowerCase()
  if (u === 'k') return Math.round(n * 1_000)
  if (u === 'lakh' || u === 'lac') return Math.round(n * 100_000)
  return Math.round(n)
}

const MAX_PATTERNS = [
  /\b(?:below|under|less\s+than|cheaper\s+than|max|upto|up\s+to|<)\s*(?:rs\.?|pkr\.?)?\s*([\d,]+(?:\.\d+)?)\s*(k|lakh|lac)?\b/gi,
  /\b(?:rs\.?|pkr\.?)\s*([\d,]+(?:\.\d+)?)\s*(k|lakh|lac)?\s*(?:or\s+less|and\s+below|max)\b/gi,
]

const MIN_PATTERNS = [
  /\b(?:above|over|more\s+than|at\s+least|min|from|>)\s*(?:rs\.?|pkr\.?)?\s*([\d,]+(?:\.\d+)?)\s*(k|lakh|lac)?\b/gi,
  /\b(?:rs\.?|pkr\.?)\s*([\d,]+(?:\.\d+)?)\s*(k|lakh|lac)?\s*(?:or\s+more|and\s+above|min)\b/gi,
]

const stripMatch = (text, regex) => {
  let maxPrice = null
  let minPrice = null
  let cleaned = text

  for (const re of MAX_PATTERNS) {
    re.lastIndex = 0
    cleaned = cleaned.replace(re, (match, amount, unit) => {
      maxPrice = parseAmount(amount, unit)
      return ' '
    })
  }

  for (const re of MIN_PATTERNS) {
    re.lastIndex = 0
    cleaned = cleaned.replace(re, (match, amount, unit) => {
      minPrice = parseAmount(amount, unit)
      return ' '
    })
  }

  return { cleaned, maxPrice, minPrice }
}

export const parseAiSearchQuery = (queryText, { maxPrice: paramMax, minPrice: paramMin } = {}) => {
  const parsed = stripMatch(String(queryText || '').trim(), null)

  let maxPrice = paramMax != null && paramMax !== '' ? Number(paramMax) : parsed.maxPrice
  let minPrice = paramMin != null && paramMin !== '' ? Number(paramMin) : parsed.minPrice

  if (maxPrice != null && !Number.isFinite(maxPrice)) maxPrice = null
  if (minPrice != null && !Number.isFinite(minPrice)) minPrice = null

  const semanticQuery = parsed.cleaned.replace(/\s+/g, ' ').trim()

  return {
    semanticQuery: semanticQuery || String(queryText || '').trim(),
    maxPrice,
    minPrice,
  }
}

export const buildPriceFilter = (maxPrice, minPrice) => {
  const price = {}
  if (maxPrice != null) price.$lte = maxPrice
  if (minPrice != null) price.$gte = minPrice
  return Object.keys(price).length ? price : null
}

// ── Product-type intent (phone vs tablet vs headphones, etc.) ─────────────────
export const getCategorySlug = (product) => {
  const cat = product?.category
  if (!cat) return ''
  if (typeof cat === 'object') return cat.slug || cat.name || ''
  return String(cat)
}

/** True when every meaningful query term appears in the product name. */
export const queryMatchesProductName = (query, productName) => {
  const name = String(productName || '').toLowerCase()
  const terms = String(query || '').toLowerCase().split(/\s+/).filter((t) => t.length >= 2)
  if (!terms.length) return false
  return terms.every((t) => name.includes(t))
}

/**
 * When the top hit is a strong name match, keep only products in that category
 * so Pinecone noise (e.g. smart home for a watch query) is dropped.
 */
export const narrowResultsToAnchorCategory = (products, query, { topK = 10 } = {}) => {
  if (!products?.length) return products

  const anchor = products[0]
  if (!queryMatchesProductName(query, anchor.name)) return products

  const anchorSlug = getCategorySlug(anchor).toLowerCase().replace(/\s+/g, '-')
  if (!anchorSlug) return products

  const filtered = products.filter((p) => {
    const slug = getCategorySlug(p).toLowerCase().replace(/\s+/g, '-')
    return slug === anchorSlug || slug.includes(anchorSlug.replace(/--/g, '-'))
  })

  return filtered.length ? filtered.slice(0, topK) : products.slice(0, topK)
}

export const parseProductIntent = (semanticQuery) => {
  const q = String(semanticQuery || '').toLowerCase()

  if (/\b(headphones?|earbuds?|earphones?|headset|airpods|earbud)\b/i.test(q)) {
    return { type: 'audio', categories: ['audio--headphones'] }
  }
  if (/\b(speakers?|soundbar|subwoofer)\b/i.test(q) && !/\bmobile\b/i.test(q)) {
    return {
      type: 'speaker',
      categories: ['audio--headphones'],
      nameInclude: /\b(speaker|soundbar|bass|subwoofer)\b/i,
    }
  }
  if (/\b(tablet|ipad)\b/i.test(q) || /\btab\b/i.test(q)) {
    return {
      type: 'tablet',
      categories: ['smartphones--tablets'],
      nameInclude: /\b(tab|pad|tablet|slate)\b/i,
    }
  }
  if (/\b(laptop|notebook|macbook|chromebook|ultrabook|desktop|computer|pc)\b/i.test(q)) {
    return {
      type: 'laptop',
      categories: ['laptops--computers'],
      excludeName: /\b(stand|case|bag|sleeve|mouse pad|keyboard|cable)\b/i,
    }
  }
  if (/\b(watch|smartwatch|timepiece|chronograph)\b/i.test(q)) {
    return { type: 'watch', categories: ['designer-watches'] }
  }
  if (/\b(sneaker|shoes?|footwear|boots?|loafer|sandal)\b/i.test(q)) {
    return { type: 'footwear', categories: ['premium-footwear'] }
  }
  if (/\b(perfume|cologne|fragrance|scent)\b/i.test(q)) {
    return { type: 'fragrance', categories: ['luxury-fragrances'] }
  }
  if (/\b(camera|drone|lens|photography|mirrorless)\b/i.test(q)) {
    return { type: 'camera', categories: ['cameras--photography'] }
  }
  if (/\b(dumbbell|fitness|gym|yoga|workout|hiking|camping)\b/i.test(q)) {
    return { type: 'fitness', categories: ['fitness--outdoors'] }
  }
  const applianceMatch = q.match(
    /\b(kettle|toaster|blender|coffee\s+maker|microwave|air\s+fryer|vacuum|thermostat|purifier|humidifier|doorbell|smart\s+plug|smoke\s+detector)\b/i,
  )
  if (applianceMatch) {
    const subcategory = applianceMatch[1].replace(/\s+/g, ' ').trim()
    return {
      type: 'smart_home',
      categories: ['smart-home-devices'],
      subcategory,
      keywords: subcategory.split(/\s+/),
      strictKeywords: true,
    }
  }
  if (/\b(home\s+appliance|kitchen\s+appliance)\b/i.test(q)) {
    return { type: 'smart_home', categories: ['smart-home-devices'] }
  }
  if (/\b(smart\s+home|iot|home\s+automation)\b/i.test(q)) {
    return { type: 'smart_home', categories: ['smart-home-devices'] }
  }
  if (/\b(chair|chairs|stool|seating)\b/i.test(q)) {
    return { type: 'chair', categories: ['office--stationery'], keywords: ['chair', 'seating', 'stool'], subcategory: 'chair', strictKeywords: true }
  }
  if (/\b(pen|pencil|journal|planner|notebook|stationery|desk\s+organizer)\b/i.test(q) && !/\bchair\b/i.test(q)) {
    return { type: 'office', categories: ['office--stationery'], strictKeywords: true }
  }

  // Mobile phone — must come after headphone / phone-stand exclusions
  if (/\b(smartphones?|mobiles?|cellphones?|android\s+phones?|iphones?|mobile\s+phone|cell\s+phone)\b/i.test(q)) {
    return {
      type: 'phone',
      categories: ['smartphones--tablets'],
      excludeName: /\b(tab|pad|tablet|slate|stand|holder|mount|case|cover)\b/i,
    }
  }
  if (/\bphone\b/i.test(q) && !/\b(headphone|earphone|microphone|phone\s+stand|phone\s+holder|phone\s+mount)\b/i.test(q)) {
    return {
      type: 'phone',
      categories: ['smartphones--tablets'],
      excludeName: /\b(tab|pad|tablet|slate|stand|holder|mount|case|cover)\b/i,
    }
  }

  return null
}

export const productInCategories = (product, categories) => {
  if (!categories?.length || !product) return true
  const slug = getCategorySlug(product).toLowerCase().replace(/\s+/g, '-')
  const normalized = categories.map((c) => c.toLowerCase())
  return normalized.some((c) => slug === c || slug.includes(c.replace(/--/g, '-')))
}

export const productMatchesIntent = (product, intent) => {
  if (!intent || !product) return true

  if (!productInCategories(product, intent.categories)) return false

  const name = product.name || ''
  const desc = product.description || ''
  const tags = Array.isArray(product.tags) ? product.tags.join(' ') : ''

  if (intent.excludeName && intent.excludeName.test(name)) return false
  if (intent.nameInclude && !intent.nameInclude.test(name) && !intent.nameInclude.test(desc)) {
    return false
  }

  return true
}

export const isBudgetQuery = (q) => /\b(budget|cheap|affordable|inexpensive|low\s+cost|economical)\b/i.test(q || '')

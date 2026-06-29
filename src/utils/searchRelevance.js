/** Minimum Pinecone cosine score to consider a vector match relevant. */
export const PINECONE_MIN_SCORE = Number(process.env.PINECONE_MIN_SCORE) || 0.85

/**
 * Specific product types — result must mention the type in name/description/tags.
 * Prevents category dumps (e.g. all smart-home items for "coffee maker").
 */
const NICHE_SUBCATEGORY_LIST = [
  // Office & stationery
  'chair', 'chairs', 'stool', 'stools', 'seating', 'bench', 'ottoman', 'recliner',
  'desk', 'table', 'pen', 'pencil', 'pencils', 'marker', 'markers', 'highlighter',
  'eraser', 'ruler', 'journal', 'diary', 'planner', 'notebook', 'notepad', 'binder',
  'stapler', 'scissors', 'tape', 'glue', 'folder', 'envelope', 'label', 'sharpener',
  'compass', 'protractor', 'clipboard', 'calendar', 'organizer', 'organiser', 'tray',
  'mousepad', 'mouse pad', 'calculator', 'bookmark', 'correction', 'stationery',
  'whiteboard', 'blackboard', 'chalk', 'ink', 'refill', 'cartridge', 'toner',
  'paper', 'notecard', 'postit', 'sticky', 'holder', 'stand', 'lamp', 'lampdesk',

  // Kitchen & home appliances
  'kettle', 'toaster', 'blender', 'coffeemaker', 'microwave',
  'oven', 'airfryer', 'fryer', 'vacuum', 'cooker', 'ricecooker', 'mixer', 'juicer',
  'processor', 'foodprocessor', 'dishwasher', 'fridge', 'refrigerator', 'freezer',
  'grill', 'brewer', 'espresso', 'waffle', 'griddle', 'skillet', 'pan', 'pot',
  'steamer', 'dehydrator', 'slicer', 'peeler', 'opener', 'scale',

  // Smart home (specific devices)
  'purifier', 'humidifier', 'dehumidifier', 'doorbell', 'thermostat', 'doorlock',
  'smartlock', 'plug', 'socket', 'outlet', 'detector', 'smoke', 'carbon', 'hub',
  'bridge', 'gateway', 'bulb', 'light', 'shade', 'blinds', 'curtain', 'lock',
  'sensor', 'sprinkler', 'controller', 'display', 'switch', 'dimmer', 'router',
  'extender', 'repeater', 'door', 'window', 'garage', 'keypad', 'intercom',

  // Audio (specific gear — not generic "headphones" browse)
  'microphone', 'mic', 'soundbar', 'subwoofer', 'amplifier', 'receiver',
  'turntable', 'dac', 'preamp', 'mixer', 'interface',

  // Fitness & outdoors (equipment)
  'dumbbell', 'kettlebell', 'barbell', 'treadmill', 'elliptical', 'weights',
  'weight', 'mat', 'yoga', 'resistance', 'band', 'pullup', 'rowing', 'bicycle',
  'helmet', 'tent', 'sleepingbag', 'backpack', 'flask', 'bottle', 'hydration',
  'rope', 'jump', 'skipping', 'gloves', 'wraps', 'rack', 'benchpress',

  // Cameras & photography (specific gear)
  'drone', 'lens', 'tripod', 'gimbal', 'flash', 'mirrorless', 'dslr', 'actioncam',
  'monopod', 'filter', 'camcorder', 'binoculars', 'telescope',

  // Footwear (specific styles)
  'heel', 'heels', 'pump', 'oxford', 'moccasin', 'clog', 'slipper', 'flipflop',
  'loafer', 'sneaker', 'boot', 'sandal', 'trainer', 'cleat', 'mule',

  // Watches (specific styles)
  'chronograph', 'diver', 'dresswatch', 'pocketwatch',

  // Fragrance (formats / types)
  'deodorant', 'bodymist', 'aftershave', 'attar', 'oud',

  // Laptops & computers (accessories — not the device itself)
  'keyboard', 'mouse', 'trackpad', 'webcam', 'dock', 'docking', 'charger',
  'adapter', 'cable', 'hub', 'monitor', 'stand', 'sleeve', 'bag', 'case',
  'cooling', 'fan', 'ssd', 'ram', 'gpu', 'motherboard',

  // Phones & tablets (accessories)
  'case', 'cover', 'screen', 'protector', 'tempered', 'mount', 'grip', 'ring',
]

/**
 * Broad product browses — category + vector similarity is enough;
 * product names often omit the type (e.g. "iPhone 17 Pro" has no "phone").
 */
const BROAD_SUBCATEGORY_LIST = [
  // Phones & tablets
  'phone', 'phones', 'mobile', 'mobiles', 'smartphone', 'smartphones', 'cell',
  'cellphone', 'cellphones', 'handset', 'iphone', 'iphones', 'android',
  'tablet', 'tablets', 'ipad', 'ipads', 'slate', 'slates', 'pad', 'tab', 'tabs',
  'phablet', 'foldable', 'flip',

  // Laptops & computers
  'laptop', 'laptops', 'notebook', 'notebooks', 'macbook', 'macbooks',
  'chromebook', 'chromebooks', 'ultrabook', 'ultrabooks', 'desktop', 'desktops',
  'computer', 'computers', 'pc', 'pcs', 'workstation', 'workstations',
  'gaming', 'aio', 'allinone', 'all-in-one', 'minipc', 'nuc', 'tower',

  // Audio (general browse)
  'headphones', 'headphone', 'earphones', 'earphone', 'earbuds', 'earbud',
  'headset', 'headsets', 'airpods', 'iem', 'inear', 'inearbuds', 'audio',
  'speaker', 'speakers', 'sound', 'hifi', 'stereo', 'wireless', 'bluetooth',
  'noise', 'canceling', 'cancelling', 'anc',

  // Watches
  'watch', 'watches', 'smartwatch', 'smartwatches', 'timepiece', 'timepieces',
  'wristwatch', 'wristwatches', 'wearable', 'wearables',

  // Footwear (general browse)
  'footwear', 'shoe', 'shoes', 'sneakers', 'sneaker', 'boots', 'boot',
  'sandals', 'sandal', 'trainers', 'trainer', 'loafers', 'loafer', 'slippers',
  'slipper', 'heels', 'running', 'walking', 'hiking',

  // Fragrance (general browse)
  'perfume', 'perfumes', 'cologne', 'colognes', 'fragrance', 'fragrances',
  'scent', 'scents', 'parfum', 'eau', 'toilette', 'edp', 'edt',

  // Cameras (general browse)
  'camera', 'cameras', 'photography', 'photo', 'photos', 'imaging', 'video',

  // Fitness & outdoors (general browse)
  'fitness', 'gym', 'workout', 'exercise', 'sport', 'sports', 'outdoor',
  'outdoors', 'hiking', 'camping', 'training', 'athletic', 'athletics',
  'wellness', 'health', 'activewear',

  // Smart home (category browse)
  'smarthome', 'smart-home', 'smart home', 'iot', 'automation', 'connected',
  'home', 'devices', 'gadgets', 'appliance', 'appliances',

  // Office (category browse)
  'office', 'stationery', 'desk', 'workspace', 'work', 'supplies',

  // Generic e-commerce browses
  'electronics', 'gadget', 'gadgets', 'tech', 'device', 'devices', 'accessory',
  'accessories', 'premium', 'luxury', 'gift', 'gifts',
]

const normalizeSubcategoryKey = (value) =>
  String(value || '').toLowerCase().trim().replace(/[\s_-]+/g, '')

const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/** Whole-word match so "pen" does not match "pencil". */
const blobHasTerm = (blob, term) => {
  const t = String(term || '').toLowerCase().trim()
  if (t.length < 3) return false
  return new RegExp(`\\b${escapeRegex(t)}`, 'i').test(blob)
}

const NICHE_SUBCATEGORIES = new Set(
  NICHE_SUBCATEGORY_LIST.flatMap((term) => [term, normalizeSubcategoryKey(term)]),
)

const BROAD_SUBCATEGORIES = new Set(
  BROAD_SUBCATEGORY_LIST.flatMap((term) => [term, normalizeSubcategoryKey(term)]),
)

const isBroadSubcategory = (sub) =>
  BROAD_SUBCATEGORIES.has(sub) || BROAD_SUBCATEGORIES.has(normalizeSubcategoryKey(sub))

const isNicheSubcategory = (sub) =>
  NICHE_SUBCATEGORIES.has(sub) || NICHE_SUBCATEGORIES.has(normalizeSubcategoryKey(sub))

const getSubcategory = (groqMeta, intent) =>
  (intent?.subcategory || groqMeta?.intent?.subcategory || groqMeta?.subcategory || '')
    .toLowerCase()
    .trim()

/** Specific product query (chair, coffee maker) vs broad browse (phone, laptop). */
export const shouldEnforceCoreProductMatch = (groqMeta, intent) => {
  const sub = getSubcategory(groqMeta, intent)
  if (!sub) return false
  if (isBroadSubcategory(sub)) return false
  if (isNicheSubcategory(sub)) return true

  // Multi-word types: "coffee maker", "air fryer", "gaming laptop" (laptop is broad alone)
  if (/[\s_-]/.test(sub)) {
    const parts = sub.replace(/_/g, ' ').split(/\s+/).filter(Boolean)
    if (parts.some((part) => isBroadSubcategory(part))) return false
    return true
  }

  return Boolean(intent?.strictKeywords && intent?.type?.startsWith('smart_home'))
}

const STOP_WORDS = new Set([
  'comfortable', 'ergonomic', 'minimalist', 'premium', 'best', 'good', 'nice',
  'affordable', 'cheap', 'quality', 'durable', 'modern', 'stylish', 'portable',
  'wireless', 'smart', 'professional', 'daily', 'perfect', 'ideal', 'great',
  'for', 'the', 'and', 'with', 'that', 'this', 'under', 'below',
])

/** Terms that must appear for niche product types (chair, kettle, …). */
export const getNicheCoreTerms = (groqMeta, intent) => {
  const terms = new Set()
  const src = {
    productName: intent?.productName || groqMeta?.intent?.productName || groqMeta?.productName,
    subcategory: intent?.subcategory || groqMeta?.intent?.subcategory || groqMeta?.subcategory,
  }

  const add = (raw) => {
    String(raw || '')
      .toLowerCase()
      .split(/[\s,/|+-]+/)
      .map((t) => t.trim())
      .filter((t) => t.length >= 3 && !STOP_WORDS.has(t))
      .forEach((t) => terms.add(t))
  }

  add(src.productName)
  add(src.subcategory)
  return [...terms]
}

/** Core product-type terms — includes tags/keywords for broader matching helpers. */
export const getCoreProductTerms = (groqMeta, intent) => {
  const terms = new Set(getNicheCoreTerms(groqMeta, intent))
  const src = {
    tags: intent?.tags || groqMeta?.intent?.tags || groqMeta?.tags,
    keywords: intent?.keywords || groqMeta?.intent?.keywords || groqMeta?.keywords,
  }

  const add = (raw) => {
    String(raw || '')
      .toLowerCase()
      .split(/[\s,/|+-]+/)
      .map((t) => t.trim())
      .filter((t) => t.length >= 3 && !STOP_WORDS.has(t))
      .forEach((t) => terms.add(t))
  }

  if (src.tags?.length) src.tags.forEach((t) => add(t))
  if (src.keywords?.length) src.keywords.forEach((t) => add(t))

  return [...terms]
}

export const buildGroqEmbeddingText = (groqMeta, fallbackQuery) => {
  if (!groqMeta) return fallbackQuery

  const parts = [
    groqMeta.productName,
    groqMeta.categories?.[0]?.replace(/--/g, ' '),
    groqMeta.subcategory,
    groqMeta.tags?.join(' '),
    groqMeta.searchDescription,
  ].filter(Boolean)

  return parts.join(' | ') || groqMeta.refinedQuery || fallbackQuery
}

export const productBlob = (product) => {
  const cat = typeof product.category === 'object'
    ? `${product.category?.name || ''} ${product.category?.slug || ''}`
    : String(product.category || '')
  const tags = Array.isArray(product.tags) ? product.tags.join(' ') : ''
  return `${product.name || ''} ${product.description || ''} ${product.subcategory || ''} ${tags} ${cat}`.toLowerCase()
}

/**
 * Strict relevance: product must mention the core product type (e.g. "chair")
 * and meet minimum vector score. Prevents "office stationery" dump when chair is missing.
 */
export const productMeetsCoreType = (product, groqMeta, intent) => {
  if (!shouldEnforceCoreProductMatch(groqMeta, intent)) return true

  const subcategory = getSubcategory(groqMeta, intent)
  const terms = getNicheCoreTerms(groqMeta, intent)
  const blob = productBlob(product)

  const productName = intent?.productName || groqMeta?.intent?.productName || groqMeta?.productName
  const nameParts = String(productName || '')
    .toLowerCase()
    .replace(/_/g, ' ')
    .split(/\s+/)
    .filter((t) => t.length >= 3 && !STOP_WORDS.has(t))

  if (nameParts.length > 1) {
    return nameParts.every((t) => blobHasTerm(blob, t))
  }

  const subParts = subcategory
    .replace(/_/g, ' ')
    .split(/\s+/)
    .filter((t) => t.length >= 3 && !STOP_WORDS.has(t))

  if (subParts.length > 1) {
    return subParts.every((t) => blobHasTerm(blob, t))
  }

  const subPhrase = subcategory.replace(/_/g, ' ')
  if (subPhrase.length >= 3 && blobHasTerm(blob, subPhrase)) return true

  if (!terms.length) return false

  return terms.some((t) => blobHasTerm(blob, t))
}

export const filterByPineconeRelevance = (products, matches, groqMeta, intent, { minScore = PINECONE_MIN_SCORE } = {}) => {
  const scoreMap = Object.fromEntries(matches.map((m) => [m.id, m.score ?? 0]))

  return products.filter((p) => {
    const id = p._id?.toString()
    const score = scoreMap[id] ?? 0
    if (score < minScore) return false
    return productMeetsCoreType(p, groqMeta, intent)
  })
}

export const filterStrictCatalog = (products, groqMeta, intent) =>
  products.filter((p) => productMeetsCoreType(p, groqMeta, intent))

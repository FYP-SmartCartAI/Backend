import { groqJsonCompletion, isGroqConfigured } from '../config/groq.js'
import { CATALOG_CATEGORY_SLUGS, CATALOG_CATEGORY_GUIDE } from '../config/catalogCategories.js'
import { buildGroqEmbeddingText } from '../utils/searchRelevance.js'

const VALID_SLUGS = new Set(CATALOG_CATEGORY_SLUGS)

/**
 * Groq understands the user's search: product name, category, subcategory, tags,
 * and a short description used to build the Gemini embedding query.
 */
export const resolveGroqSearchIntent = async (queryText) => {
  if (!isGroqConfigured() || !queryText?.trim()) return null

  const prompt = [
    'You parse e-commerce product search queries for SmartCart AI.',
    `User query: "${queryText.trim()}"`,
    '',
    'Available category slugs (pick exactly 1 best match):',
    CATALOG_CATEGORY_GUIDE,
    '',
    'Extract:',
    '- productName: core product only, drop adjectives (e.g. "Comfortable ergonomic chair for office" → "ergonomic chair")',
    '- subcategory: specific product type slug-style (e.g. chair, kettle, phone, pen, headphones)',
    '- tags: 3–6 lowercase tags for search',
    '- searchDescription: one sentence describing what the user wants to buy (for semantic embedding)',
    '- keywords: 2–5 lowercase words that MUST appear in a matching product name/description',
    '- categories: one slug from the list above',
    '- confidence: 0.0–1.0',
    '',
    'Examples:',
    '- "Minimalist matte-black electric kettle" → productName "electric kettle", subcategory "kettle", categories ["smart-home-devices"]',
    '- "Comfortable ergonomic chair for office" → productName "ergonomic chair", subcategory "chair", categories ["office--stationery"]',
  '- "mobile phone below 150000" → productName "mobile phone", subcategory "phone", categories ["smartphones--tablets"]',
    '',
    'Respond ONLY with JSON:',
    '{"productName":"...","categories":["slug"],"subcategory":"...","tags":["..."],"searchDescription":"...","keywords":["..."],"confidence":0.9}',
  ].join('\n')

  try {
    const parsed = await groqJsonCompletion(prompt, { temperature: 0.1, max_tokens: 280 })
    if (!parsed) return null

    const categories = (parsed.categories || [])
      .map((c) => String(c).toLowerCase().trim())
      .filter((c) => VALID_SLUGS.has(c))

    if (!categories.length || Number(parsed.confidence) < 0.4) {
      console.info('[groqSearchIntent] Low confidence or invalid category — skipped')
      return null
    }

    const productName = String(parsed.productName || '').trim()
    const subcategory = String(parsed.subcategory || '').trim().toLowerCase()
    const tags = (parsed.tags || []).map((t) => String(t).toLowerCase().trim()).filter((t) => t.length >= 2).slice(0, 8)
    const keywords = (parsed.keywords || []).map((k) => String(k).toLowerCase().trim()).filter((k) => k.length >= 2).slice(0, 6)
    const searchDescription = String(parsed.searchDescription || '').trim()

    const intent = {
      type:        `groq_${subcategory || categories[0].replace(/--/g, '_')}`,
      categories,
      subcategory: subcategory || undefined,
      keywords:    keywords.length ? keywords : undefined,
      tags,
      productName: productName || null,
      searchDescription: searchDescription || null,
      source:      'groq',
      confidence:  Number(parsed.confidence) || 0.5,
      strictKeywords: true,
    }

    const searchText = buildGroqEmbeddingText(
      { productName, categories, subcategory, tags, searchDescription },
      queryText,
    )

    console.info(
      `[groqSearchIntent] product="${productName}" sub="${subcategory}" cat=[${categories.join(', ')}] ` +
      `confidence=${intent.confidence}`,
    )
    console.info(`[groqSearchIntent] embed text: "${searchText}"`)

    return {
      intent,
      searchText,
      refinedQuery: productName || searchText,
      raw: parsed,
    }
  } catch (e) {
    console.warn('[groqSearchIntent] Failed:', e.message)
    return null
  }
}

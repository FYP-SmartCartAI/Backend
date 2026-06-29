// ── buildEmbeddingText.js ──────────────────────────────────────────────────────
// Builds the text sent to Gemini for embedding → stored as the Pinecone vector.
//
// Fields used for semantic search (per product):
//   name, brand, category, subcategories, tags, description (category + product)

/**
 * Combine category-level and product-level descriptions (same as products-combined.json).
 */
export const buildCombinedDescription = (categoryDescription = '', productDescription = '') => {
  return [categoryDescription, productDescription]
    .map((s) => (typeof s === 'string' ? s.trim() : ''))
    .filter(Boolean)
    .join(' ')
}

/**
 * Build embedding text from a prepared context object.
 * @param {Object} ctx
 * @param {string} ctx.name
 * @param {string} ctx.brand
 * @param {string} ctx.category          - display name, e.g. "Laptops & Computers"
 * @param {string[]} [ctx.subcategories] - names from Category.subcategories
 * @param {string[]} [ctx.tags]
 * @param {string} ctx.description       - combined category + product description
 */
export const buildEmbeddingText = (ctx) => {
  const parts = [
    ctx.name        || '',
    ctx.brand       || '',
    ctx.category    || '',
  ]

  if (Array.isArray(ctx.subcategories) && ctx.subcategories.length) {
    parts.push(ctx.subcategories.join(' '))
  }

  if (ctx.description) {
    parts.push(ctx.description)
  }

  if (Array.isArray(ctx.tags) && ctx.tags.length) {
    parts.push(ctx.tags.join(' '))
  }

  return parts.filter(Boolean).join(' | ')
}

export default buildEmbeddingText

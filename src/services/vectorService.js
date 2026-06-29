import { pineconeIndex } from '../config/pinecone.js'
import { embeddingModel, callWithRotation } from '../config/gemini.js'
import Category from '../models/Category.js'
import { buildEmbeddingText, buildCombinedDescription } from '../utils/buildEmbeddingText.js'

// ── Text → vector ─────────────────────────────────────────────────────────────
const embedText = async (text, taskType = 'RETRIEVAL_DOCUMENT') => {
  if (!embeddingModel) return null

  console.log(`[Gemini API] Request: Generating embedding vector for text: "${text.substring(0, 100)}${text.length > 100 ? '...' : ''}" (TaskType: ${taskType})`)

  try {
    const result = await callWithRotation(() => embeddingModel.embedContent({
      content: { parts: [{ text }], role: 'user' },
      taskType,
      outputDimensionality: 1536,
    }))

    const values = result?.embedding?.values
    if (!values?.length) {
      console.warn('[Gemini API] Response: Failed. Received empty vector output.')
      return null
    }

    console.log(`[Gemini API] Response: Success. Generated embedding vector of length ${values.length}.`)
    return values
  } catch (err) {
    console.error('[Gemini API] Error during embedding generation:', err.message)
    return null
  }
}

const resolveCategoryDoc = async (categoryInput) => {
  if (!categoryInput) return null
  return Category.findOne({
    $or: [
      { slug: String(categoryInput).toLowerCase() },
      { name: categoryInput },
    ],
  })
}

/** Load category subcategories + merge descriptions for embedding */
export const buildEmbeddingContext = async (product) => {
  const cat = await resolveCategoryDoc(product.category)

  const subcategories = (cat?.subcategories || []).map((s) => s.name)
  const description   = buildCombinedDescription(cat?.description, product.description)

  return {
    name:          product.name        || '',
    brand:         product.brand       || '',
    category:      cat?.name           || product.category || '',
    subcategories,
    tags:          Array.isArray(product.tags) ? product.tags : [],
    description,
  }
}

/** Pinecone metadata — mirrors key fields (description truncated for size limits) */
const buildPineconeMetadata = (product, ctx) => ({
  productId:     product._id.toString(),
  name:          ctx.name,
  category:      ctx.category,
  subcategories: ctx.subcategories.join(', '),
  brand:         ctx.brand,
  tags:          ctx.tags,
  description:   ctx.description.slice(0, 500),
  isActive:      product.isActive ?? true,
})

const upsertProductVector = async (product, ctx, vector) => {
  await pineconeIndex.upsert({
    records: [{
      id:       product._id.toString(),
      values:   vector,
      metadata: buildPineconeMetadata(product, ctx),
    }],
  })
}

// ── Embed a product and upsert it into Pinecone ───────────────────────────────
export const embedProduct = async (product) => {
  if (!pineconeIndex || !embeddingModel) return null

  try {
    const ctx    = await buildEmbeddingContext(product)
    const text   = buildEmbeddingText(ctx)
    const vector = await embedText(text)
    if (!vector) return null

    await upsertProductVector(product, ctx, vector)
    return true
  } catch (e) {
    console.error(`[vectorService] embedProduct(${product._id}) failed:`, e.message)
    return null
  }
}

export const deleteProductVector = async (productId) => {
  if (!pineconeIndex) return null

  try {
    await pineconeIndex.deleteOne(productId.toString())
    return true
  } catch (e) {
    console.error(`[vectorService] deleteProductVector(${productId}) failed:`, e.message)
    return null
  }
}

export const searchSimilar = async (queryText, topK = 10, filter = {}) => {
  const { matches } = await searchSimilarDetailed(queryText, topK, filter)
  return matches
}

export const searchSimilarDetailed = async (queryText, topK = 10, filter = {}) => {
  if (!pineconeIndex || !embeddingModel) {
    console.warn('[vectorService] searchSimilar aborted: Pinecone or Gemini not configured.')
    return { matches: [], vector: null, vectorLength: 0, vectorPreview: [] }
  }

  try {
    const vector = await embedText(queryText, 'RETRIEVAL_QUERY')
    if (!vector) return { matches: [], vector: null, vectorLength: 0, vectorPreview: [] }

    const results = await pineconeIndex.query({
      vector,
      topK,
      includeMetadata: true,
      filter: Object.keys(filter).length ? filter : undefined,
    })

    const matches = results.matches ?? []
    return {
      matches,
      vector,
      vectorLength: vector.length,
      vectorPreview: vector.slice(0, 3).map((v) => v.toFixed(6)),
    }
  } catch (e) {
    console.error('[vectorService] searchSimilar failed:', e.message)
    return { matches: [], vector: null, vectorLength: 0, vectorPreview: [] }
  }
}

const USER_PROFILES_NAMESPACE = 'user-profiles'

const getUserProfilesIndex = () => {
  if (!pineconeIndex) return null
  return pineconeIndex.namespace(USER_PROFILES_NAMESPACE)
}

export const embedStorageText = async (text) => embedText(text, 'RETRIEVAL_DOCUMENT')

export const upsertUserProfileVector = async (userId, vector, metadata) => {
  const ns = getUserProfilesIndex()
  if (!ns) throw Object.assign(new Error('Pinecone is not configured'), { statusCode: 503 })

  await ns.upsert({
    records: [{
      id:       userId.toString(),
      values:   vector,
      metadata,
    }],
  })
}

export const syncProductVector = async (product) => {
  if (!pineconeIndex) throw Object.assign(new Error('Pinecone is not configured'), { statusCode: 503 })
  if (!embeddingModel) throw Object.assign(new Error('Gemini is not configured'), { statusCode: 503 })

  const ctx    = await buildEmbeddingContext(product)
  const text   = buildEmbeddingText(ctx)
  const vector = await embedText(text)
  if (!vector) throw Object.assign(new Error('Embedding generation failed'), { statusCode: 500 })

  await upsertProductVector(product, ctx, vector)
  return { vectorId: product._id.toString(), synced: true }
}

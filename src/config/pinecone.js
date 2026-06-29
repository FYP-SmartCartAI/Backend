import { Pinecone } from '@pinecone-database/pinecone'
import { PINECONE_API_KEY, PINECONE_INDEX_NAME } from './env.js'

// ── Pinecone client initialization ────────────────────────────────────────────
//
// Pinecone is used as the vector database for:
//   1. AI Smart Search  — products are embedded once on create/update; at
//      search time the query is embedded and the top-K nearest products returned.
//   2. Recommendations  — user behaviour is summarised into a "taste profile"
//      text, embedded, and queried against product vectors.
//
// If PINECONE_API_KEY or PINECONE_INDEX_NAME are absent (e.g. local dev without
// Pinecone), the client is null.  All vectorService calls check for null and
// degrade gracefully — the app continues to work with plain MongoDB search.

let pineconeIndex = null

if (PINECONE_API_KEY && PINECONE_INDEX_NAME) {
  try {
    const pinecone  = new Pinecone({ apiKey: PINECONE_API_KEY })
    pineconeIndex   = pinecone.index(PINECONE_INDEX_NAME)
    console.info('[Pinecone] client initialized ✅')
  } catch (e) {
    console.error('[Pinecone] failed to initialize:', e.message)
  }
} else {
  console.warn('[Pinecone] PINECONE_API_KEY or PINECONE_INDEX_NAME not set — vector search disabled.')
}

// Export the index directly — consumers call pineconeIndex.upsert() etc.
// null when not configured.
export { pineconeIndex }

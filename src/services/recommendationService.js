// ── recommendationService.js ───────────────────────────────────────────────────
// Canonical service file for AI recommendations and semantic search.
// This file satisfies the spec requirement for a dedicated recommendationService.
//
// The actual logic lives in behaviorService.js (getRecommendations, aiSearch)
// because recommendations are derived from behavior data. This file re-exports
// those functions under the recommendationService namespace so all callers
// can import from here without touching behaviorService.js directly.

export {
  getRecommendations,
  aiSearch,
  buildUserProfile,
} from './behaviorService.js'

// ── stockLevelHelper.js ───────────────────────────────────────────────────────
// Categorises a numeric stock count into one of four urgency levels.
// Used by the abandoned cart cron job to select the right notification tone.
//
// Level table:
//   CRITICAL  1–3    → mention exact count, loss-aversion messaging
//   LOW       4–10   → "selling fast", do NOT mention exact number
//   MEDIUM    11–49  → value / limited-time feel, no stock number
//   HIGH      50+    → excitement / dopamine / deal — NEVER mention stock

/**
 * Get the stock urgency level for abandoned cart notifications.
 * @param {number} stock - Current stock count
 * @returns {'CRITICAL'|'LOW'|'MEDIUM'|'HIGH'}
 */
export const getStockLevel = (stock) => {
  if (stock >= 1  && stock <= 3)  return 'CRITICAL'
  if (stock >= 4  && stock <= 10) return 'LOW'
  if (stock >= 11 && stock <= 49) return 'MEDIUM'
  return 'HIGH'
}

/**
 * Get the hardcoded fallback message for when Gemini API is unavailable.
 * @param {'CRITICAL'|'LOW'|'MEDIUM'|'HIGH'} stockLevel
 * @param {string} userName
 * @param {string} productName
 * @param {number} stockCount - Only used for CRITICAL level
 * @returns {string}
 */
export const getFallbackMessage = (stockLevel, userName, productName, stockCount) => {
  const firstName = userName?.split(' ')[0] || userName
  switch (stockLevel) {
    case 'CRITICAL':
      return `${firstName}, only ${stockCount} left of ${productName}! Order now before it sells out 🔥`
    case 'LOW':
      return `${firstName}, your ${productName} is selling fast! Grab it before it's gone ⚡`
    case 'MEDIUM':
      return `${firstName}, your cart is waiting! Complete your order today 🛍️`
    case 'HIGH':
    default:
      return `${firstName}, great picks are saved in your cart! Order now 🎉`
  }
}

export default { getStockLevel, getFallbackMessage }

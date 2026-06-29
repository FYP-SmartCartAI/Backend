import cron from 'node-cron'
import { runAbandonedCartJob } from '../services/abandonedCartService.js'
import { ABANDONED_CART_CRON, ABANDONED_CART_POLL_INTERVAL_MINUTES } from '../config/env.js'

// ── Abandoned Cart Cron Job ────────────────────────────────────────────────────
//
// Poll interval: ABANDONED_CART_POLL_INTERVAL_MINUTES in .env (dev default: 2, prod: 60)
// Advanced override: ABANDONED_CART_CRON (raw cron expression)
//
// Calls abandonedCartService.runAbandonedCartJob() which handles:
//   1. Detecting carts idle longer than ABANDONED_CART_IDLE_MINUTES
//   2. Generating personalised push messages via Gemini
//   3. Sending Firebase Cloud Messaging notifications
//   4. Saving notification records to MongoDB
//   5. Marking carts as abandoned + reminderSent
//
// The concurrent-run guard prevents a second tick from starting before
// the previous one finishes (e.g. if processing takes > 1 hour).

// ── Concurrent-run guard ──────────────────────────────────────────────────────
let isRunning = false

// ── Scheduled task ────────────────────────────────────────────────────────────
const CRON_SCHEDULE = ABANDONED_CART_CRON

// NODE_ENV === 'test' guard prevents the job from running during unit tests
if (process.env.NODE_ENV !== 'test') {
  cron.schedule(CRON_SCHEDULE, async () => {
    if (isRunning) {
      console.warn('[abandonedCartJob] Previous run still in progress — skipping this tick')
      return
    }

    isRunning = true
    const startTime = new Date().toISOString()
    console.info(`[abandonedCartJob] Started at ${startTime}`)

    try {
      const results = await runAbandonedCartJob()
      const endTime = new Date().toISOString()
      console.info(
        `[abandonedCartJob] Completed at ${endTime} — ` +
        `cartsFound: ${results.cartsFound}, ` +
        `notificationsSent: ${results.notificationsSent}, ` +
        `skippedNoToken: ${results.skippedNoToken}, ` +
        `failed: ${results.failed}, ` +
        `executionTimeMs: ${results.executionTimeMs}ms`
      )
    } catch (e) {
      console.error('[abandonedCartJob] Unexpected error:', e.message)
    } finally {
      isRunning = false
    }
  })

  console.info(
    `[abandonedCartJob] Scheduled — every ${ABANDONED_CART_POLL_INTERVAL_MINUTES} min ` +
    `(cron "${CRON_SCHEDULE}") ✅`,
  )
}

export { runAbandonedCartJob }

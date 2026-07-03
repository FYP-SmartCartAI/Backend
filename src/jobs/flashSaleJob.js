import cron from 'node-cron'
import { expireOverdueSales } from '../services/flashSaleService.js'

// ── Flash Sale Expiry Cron ─────────────────────────────────────────────────────
//
// Runs every minute. Finds all flash sales where isActive: true AND
// endTime has passed, and bulk-sets isActive: false.
//
// This acts as a server-side safety net — even if the admin never clicks
// "Terminate", the sale will stop being served to the public hero.
//
// Concurrent-run guard prevents a second tick from starting if the DB
// query from the previous tick is still in flight.

let isRunning = false

if (process.env.NODE_ENV !== 'test') {
  cron.schedule('* * * * *', async () => {
    if (isRunning) {
      console.warn('[flashSaleJob] Previous run still in progress — skipping this tick')
      return
    }

    isRunning = true
    try {
      const expired = await expireOverdueSales()
      if (expired > 0) {
        console.info(`[flashSaleJob] Expired ${expired} flash sale(s) ✅`)
      }
    } catch (e) {
      console.error('[flashSaleJob] Error during expiry check:', e.message)
    } finally {
      isRunning = false
    }
  })

  console.info('[flashSaleJob] Scheduled — checks every 1 min ✅')
}

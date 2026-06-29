import cron from 'node-cron'
import Ticket from '../models/Ticket.js'
import { notifyAllAdmins } from '../services/notificationService.js'

// ── Concurrent-run guard ──────────────────────────────────────────────────────
let isRunning = false

export const runUnresolvedTicketJob = async () => {
  const targetTime = new Date(Date.now() - 24 * 60 * 60 * 1000) // 24 hours ago
  
  // Find open tickets older than 24 hours that haven't been notified yet
  const tickets = await Ticket.find({
    status: 'open',
    createdAt: { $lt: targetTime },
    unresolvedNotified: false
  })

  let count = 0
  for (const ticket of tickets) {
    ticket.unresolvedNotified = true
    await ticket.save()

    const ticketSubject = ticket.subject || 'Support Ticket'
    await notifyAllAdmins({
      type: 'unresolved_ticket',
      title: '⏳ Unresolved Support Ticket',
      body: `Ticket "${ticketSubject}" has been open for over 24 hours without response.`,
      refId: ticket._id,
      refModel: 'Ticket',
      data: { ticketId: ticket._id.toString(), screen: 'support' }
    })
    count++
  }

  return { ticketsFound: tickets.length, notifiedCount: count }
}

// ── Scheduled task ────────────────────────────────────────────────────────────
// '0 * * * *' → fires at minute 0 of every hour
// NODE_ENV === 'test' guard prevents the job from running during unit tests
if (process.env.NODE_ENV !== 'test') {
  cron.schedule('0 * * * *', async () => {
    if (isRunning) {
      console.warn('[unresolvedTicketJob] Previous run still in progress — skipping this tick')
      return
    }

    isRunning = true
    const startTime = new Date().toISOString()
    console.info(`[unresolvedTicketJob] Started at ${startTime}`)

    try {
      const results = await runUnresolvedTicketJob()
      const endTime = new Date().toISOString()
      console.info(
        `[unresolvedTicketJob] Completed at ${endTime} — ` +
        `ticketsFound: ${results.ticketsFound}, ` +
        `notifiedCount: ${results.notifiedCount}`
      )
    } catch (e) {
      console.error('[unresolvedTicketJob] Unexpected error:', e.message)
    } finally {
      isRunning = false
    }
  })

  console.info('[unresolvedTicketJob] Scheduled — runs every hour at :00 ✅')
}

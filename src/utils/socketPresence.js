import { getIO } from '../config/socket.js'

const TICKET_CHAT_TYPES = new Set(['ticket_reply', 'new_message'])

export function resolveTicketIdFromNotifyPayload({ type, refId, refModel, data }) {
  if (!TICKET_CHAT_TYPES.has(type)) return null
  if (data?.ticketId) return String(data.ticketId)
  if (refModel === 'Ticket' && refId) return refId.toString()
  return null
}

export async function isUserViewingTicket(userId, ticketId) {
  if (!userId || !ticketId) return false

  try {
    const io = getIO()
    const room = `ticket_${String(ticketId)}`
    const sockets = await io.in(room).fetchSockets()
    const uid = String(userId)

    return sockets.some((remoteSocket) => remoteSocket.data?.userId === uid)
  } catch {
    return false
  }
}

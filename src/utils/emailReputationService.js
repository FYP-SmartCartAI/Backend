import { ABSTRACT_EMAIL_API_KEY, NODE_ENV } from '../config/env.js'
import { STATUS, ERRORS } from '../constants/httpConstants.js'

const err = (msg, code) => Object.assign(new Error(msg), { statusCode: code })

const API_URL = 'https://emailreputation.abstractapi.com/v1/'

/**
 * Validates an email via Abstract Email Reputation API.
 * Rejects undeliverable and disposable/temporary addresses.
 * Skips silently when ABSTRACT_EMAIL_API_KEY is not configured.
 */
export const validateEmailReputation = async (email) => {
  if (!ABSTRACT_EMAIL_API_KEY) {
    if (NODE_ENV !== 'test') {
      console.warn('[emailReputation] ABSTRACT_EMAIL_API_KEY not set — skipping email reputation check')
    }
    return
  }

  const url = new URL(API_URL)
  url.searchParams.set('api_key', ABSTRACT_EMAIL_API_KEY)
  url.searchParams.set('email', email.trim().toLowerCase())

  let response
  try {
    response = await fetch(url, { signal: AbortSignal.timeout(10_000) })
  } catch (e) {
    console.error('[emailReputation] Request failed:', e.message)
    throw err(ERRORS.EMAIL_VALIDATION_UNAVAILABLE, STATUS.SERVICE_UNAVAILABLE)
  }

  if (!response.ok) {
    const body = await response.text().catch(() => '')
    console.error('[emailReputation] API error:', response.status, body)
    throw err(ERRORS.EMAIL_VALIDATION_UNAVAILABLE, STATUS.SERVICE_UNAVAILABLE)
  }

  const data = await response.json()
  const deliverable = data.deliverability === 'DELIVERABLE'
  const disposable  = data.is_disposable_email?.value === true

  if (!deliverable || disposable) {
    throw err(ERRORS.INVALID_EMAIL_ADDRESS, STATUS.BAD_REQUEST)
  }
}

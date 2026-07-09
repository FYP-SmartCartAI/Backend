import fs from 'fs'
import Stripe from 'stripe'
import 'dotenv/config'

try {
  if (!fs.existsSync('webhook_debug.json')) {
    console.error('Error: webhook_debug.json not found. Run a payment checkout first to generate it!')
    process.exit(1)
  }

  const data = JSON.parse(fs.readFileSync('webhook_debug.json', 'utf8'))
  
  // Use STRIPE_SECRET_KEY from environment or a dummy value
  const stripeSecretKey = process.env.STRIPE_SECRET_KEY || 'sk_test_dummy'
  const stripe = new Stripe(stripeSecretKey)

  console.log('=== Stripe Webhook Diagnostic ===')
  console.log('Webhook Secret:', data.secret)
  console.log('Signature Header:', data.signature)
  console.log('Received Body Length (bytes):', data.bodyLength)
  console.log('Received Body isBuffer equivalent length:', Buffer.byteLength(data.bodyString, 'utf8'))

  // Test 1: Original body string as received
  try {
    stripe.webhooks.signature.verifyHeader(data.bodyString, data.signature, data.secret)
    console.log('✅ Test 1 (Original received body): SIGNATURE MATCHED!')
  } catch (err) {
    console.log('❌ Test 1 (Original received body): FAILED -', err.message)
  }

  // Test 2: Minified body string (removing all pretty-printing whitespace/newlines)
  try {
    const minified = JSON.stringify(JSON.parse(data.bodyString))
    stripe.webhooks.signature.verifyHeader(minified, data.signature, data.secret)
    console.log('✅ Test 2 (Minified/Compact JSON): SIGNATURE MATCHED!')
  } catch (err) {
    console.log('❌ Test 2 (Minified/Compact JSON): FAILED -', err.message)
  }

  // Test 3: Normalizing line endings to CRLF (\r\n)
  try {
    const crlf = data.bodyString.replace(/\r?\n/g, '\r\n')
    stripe.webhooks.signature.verifyHeader(crlf, data.signature, data.secret)
    console.log('✅ Test 3 (CRLF line endings normalized): SIGNATURE MATCHED!')
  } catch (err) {
    console.log('❌ Test 3 (CRLF line endings normalized): FAILED -', err.message)
  }
} catch (err) {
  console.error('Error running diagnostic:', err.message)
}

import fs from 'fs'
import crypto from 'crypto'

try {
  if (!fs.existsSync('webhook_debug.json')) {
    console.error('Error: webhook_debug.json not found.')
    process.exit(1)
  }

  const data = JSON.parse(fs.readFileSync('webhook_debug.json', 'utf8'))
  const payload = data.bodyString
  const header = data.signature
  const secret = data.secret

  console.log('=== Raw Cryptographic Diagnostic ===')
  console.log('Secret:', secret)
  console.log('Header:', header)
  
  // Parse signature header
  const parts = header.split(',')
  const t = parts.find(p => p.startsWith('t=')).split('=')[1]
  const v1 = parts.find(p => p.startsWith('v1='))?.split('=')[1]
  const v0 = parts.find(p => p.startsWith('v0='))?.split('=')[1]

  console.log('\n--- Signatures in Header ---')
  console.log('Timestamp (t):', t)
  console.log('Received v1:', v1)
  console.log('Received v0:', v0)

  // 1. Expected signature on original payload
  const signedPayloadOriginal = `${t}.${payload}`
  const expectedV1Original = crypto.createHmac('sha256', secret).update(signedPayloadOriginal).digest('hex')
  const expectedV0Original = crypto.createHmac('sha256', secret).update(signedPayloadOriginal).digest('hex') // v0 uses same algorithm, check if different key
  console.log('\n--- Test 1: Original Payload ---')
  console.log('Expected v1:', expectedV1Original)
  console.log('Matches v1:', expectedV1Original === v1)
  console.log('Matches v0:', expectedV1Original === v0)

  // 2. Expected signature on minified payload
  const minified = JSON.stringify(JSON.parse(payload))
  const signedPayloadMinified = `${t}.${minified}`
  const expectedV1Minified = crypto.createHmac('sha256', secret).update(signedPayloadMinified).digest('hex')
  console.log('\n--- Test 2: Minified Payload ---')
  console.log('Minified Payload Length:', minified.length)
  console.log('Expected v1:', expectedV1Minified)
  console.log('Matches v1:', expectedV1Minified === v1)

  // 3. Expected signature on CRLF normalized payload
  const crlf = payload.replace(/\r?\n/g, '\r\n')
  const signedPayloadCrlf = `${t}.${crlf}`
  const expectedV1Crlf = crypto.createHmac('sha256', secret).update(signedPayloadCrlf).digest('hex')
  console.log('\n--- Test 3: CRLF Normalized Payload ---')
  console.log('Expected v1:', expectedV1Crlf)
  console.log('Matches v1:', expectedV1Crlf === v1)

  // 4. Expected signature on double-space to tab replacement
  const tabs = payload.replace(/  /g, '\t')
  const signedPayloadTabs = `${t}.${tabs}`
  const expectedV1Tabs = crypto.createHmac('sha256', secret).update(signedPayloadTabs).digest('hex')
  console.log('\n--- Test 4: Tab Indented Payload ---')
  console.log('Expected v1:', expectedV1Tabs)
  console.log('Matches v1:', expectedV1Tabs === v1)

} catch (err) {
  console.error('Error:', err.message)
}

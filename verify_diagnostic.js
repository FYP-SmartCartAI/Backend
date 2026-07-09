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
  const baseSecret = data.secret

  console.log('=== Advanced Cryptographic & Typos Diagnostic ===')
  console.log('Base Secret in environment:', baseSecret)
  console.log('Signature Header:', header)
  
  const parts = header.split(',')
  const t = parts.find(p => p.startsWith('t=')).split('=')[1]
  const v1 = parts.find(p => p.startsWith('v1='))?.split('=')[1]
  const v0 = parts.find(p => p.startsWith('v0='))?.split('=')[1]

  console.log('Timestamp (t):', t)
  console.log('Received v1:', v1)

  const signedPayload = `${t}.${payload}`

  // Let's identify visually ambiguous characters in the key:
  // "whsec_zvDjsseqkKG5XCPvdbN56G1Bbge7I3nx"
  // Ambiguous characters:
  // 1. Character at index 28 (currently 'I'): Could it be 'l' (lowercase L) or '1' (number one)?
  // 2. Character at index 22 (currently '1'): Could it be 'l' (lowercase L) or 'I' (uppercase I)?
  // 3. Character at index 9  (currently 'K'): Could it be 'k' (lowercase K)?
  // 4. Character at index 26 (currently 'e'): Could it be 'c' or 'o'?
  
  // We'll generate combinations of the secret key by swapping these ambiguous characters
  const secretPrefix = "whsec_"
  const keyPart = baseSecret.substring(6) // "zvDjsseqkKG5XCPvdbN56G1Bbge7I3nx"

  const charReplacements = {
    9: ['K', 'k'],      // index 9 of keyPart (currently 'K')
    22: ['1', 'l', 'I'], // index 22 of keyPart (currently '1')
    28: ['I', 'l', '1']  // index 28 of keyPart (currently 'I')
  }

  console.log('\nBrute-forcing visually ambiguous characters in the secret key...')

  let matched = false
  
  // Helper to replace character at specific index in string
  function replaceAt(str, index, replacement) {
    return str.substring(0, index) + replacement + str.substring(index + 1)
  }

  // Generate combinations
  for (const c9 of charReplacements[9]) {
    for (const c22 of charReplacements[22]) {
      for (const c28 of charReplacements[28]) {
        let testKey = keyPart
        testKey = replaceAt(testKey, 9, c9)
        testKey = replaceAt(testKey, 22, c22)
        testKey = replaceAt(testKey, 28, c28)
        
        const fullSecret = secretPrefix + testKey
        
        // Calculate HMAC
        const expectedHash = crypto.createHmac('sha256', fullSecret).update(signedPayload).digest('hex')
        
        if (expectedHash === v1) {
          console.log(`\n🎉 SUCCESS! MATCH FOUND!`)
          console.log(`👉 Actual matching secret is: ${fullSecret}`)
          console.log(`Differences from your current .env:`)
          console.log(` - Char at index 9:  expected '${c9}' (was '${baseSecret[15]}')`)
          console.log(` - Char at index 22: expected '${c22}' (was '${baseSecret[28]}')`)
          console.log(` - Char at index 28: expected '${c28}' (was '${baseSecret[34]}')`)
          matched = true
          break
        }
      }
      if (matched) break
    }
    if (matched) break
  }

  if (!matched) {
    console.log('\n❌ None of the ambiguous character combinations matched the signature.')
    console.log('This means the payload itself or the signature timestamp/key is fundamentally different.')
  }

} catch (err) {
  console.error('Error:', err.message)
}

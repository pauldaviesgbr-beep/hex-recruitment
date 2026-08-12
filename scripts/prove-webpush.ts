/**
 * Prove lib/webpush.ts encrypts correctly, and that a bad subscription is
 * handled rather than thrown into the send path.
 *
 * Run: npm run webpush:prove
 *
 * THE MAIN TEST IS THE RFC'S OWN PUBLISHED VECTOR (RFC 8291 §5), not a
 * round-trip against our own decryptor. A round trip only proves we are
 * self-consistent — encrypt and decrypt can be wrong in the same way and agree
 * with each other perfectly. Matching the RFC byte for byte proves we agree
 * with every other implementation in the world, which is the actual
 * requirement: the browser decrypting this was not written by us.
 *
 * Exits non-zero on any failure. Nothing here touches the network.
 */
import crypto from 'node:crypto'
import { createRequire } from 'node:module'

// lib/webpush.ts carries `import 'server-only'`, which throws outside a server
// component. That guard is deliberate — it is what stops the VAPID PRIVATE KEY
// path being bundled into the browser — so it is stubbed here rather than
// removed from the module. The code under test is the real one, unmodified.
const req = createRequire(import.meta.url)
req.cache[req.resolve('server-only')] = { id: 'server-only', filename: 'server-only', loaded: true, exports: {} } as any
const { encryptPayload, sendWebPush } = req('../lib/webpush') as typeof import('../lib/webpush')

// ── RFC 8291 Section 5, verbatim ────────────────────────────────────────────
const V = {
  plaintext: 'When I grow up, I want to be a watermelon',
  uaPublic: 'BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4',
  authSecret: 'BTBZMqHH6r4Tts7J_aSIgg',
  asPrivate: 'yfWPiYE-n46HLnH0KqZOF1fJJU3MYrct3AELtAQ-oRw',
  asPublic: 'BP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A8',
  salt: 'DGv6ra1nlYgDCS1FRnbzlw',
  expected:
    'DGv6ra1nlYgDCS1FRnbzlwAAEABBBP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6Tlz' +
    'AC8wEqKK6PBru3jl7A_yl95bQpu6cVPTpK4Mqgkf1CXztLVBSt2Ks3oZwbuwXPXLWyouBWLVWGNWQexSgSxsj_Qulcy4a-fN',
}

const fails: string[] = []
const check = (name: string, ok: boolean, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `\n        ${detail}` : ''}`)
  if (!ok) fails.push(name)
}

console.log('='.repeat(72))
console.log('RFC 8291 §5 — the published test vector')
console.log('='.repeat(72))

const actual = encryptPayload(
  { endpoint: 'https://example.com/x', p256dh: V.uaPublic, auth: V.authSecret },
  V.plaintext,
  { salt: Buffer.from(V.salt, 'base64url'), senderPrivate: Buffer.from(V.asPrivate, 'base64url') },
)
const actualB64 = actual.toString('base64url')

check('ciphertext matches the RFC byte for byte', actualB64 === V.expected,
  actualB64 === V.expected ? `${actual.length} bytes` : `expected ${V.expected.length} chars, got ${actualB64.length}\n        ours: ${actualB64.slice(0, 80)}…\n        rfc : ${V.expected.slice(0, 80)}…`)

// Decompose the header so a failure says WHERE it went wrong, not just "differs".
const salt = actual.subarray(0, 16)
const rs = actual.readUInt32BE(16)
const idlen = actual[20]
const keyid = actual.subarray(21, 21 + idlen)
check('header: salt is the one supplied', salt.toString('base64url') === V.salt)
check('header: record size is 4096', rs === 4096, String(rs))
check('header: key id length is 65 (uncompressed P-256 point)', idlen === 65, String(idlen))
check('header: key id is the sender public key', keyid.toString('base64url') === V.asPublic)

console.log()
console.log('='.repeat(72))
console.log('Freshness — production must never reuse a salt or a sender key')
console.log('='.repeat(72))

const sub = { endpoint: 'https://example.com/x', p256dh: V.uaPublic, auth: V.authSecret }
const a = encryptPayload(sub, 'hello')
const b = encryptPayload(sub, 'hello')
check('same payload encrypts differently each time', !a.equals(b))
check('salt differs between messages', !a.subarray(0, 16).equals(b.subarray(0, 16)))
check('sender key differs between messages', !a.subarray(21, 86).equals(b.subarray(21, 86)))

console.log()
console.log('='.repeat(72))
console.log('Bad input is HANDLED, not thrown — nothing here may reject')
console.log('='.repeat(72))

// Give the sender keys so it gets past the config gate and reaches the
// validation we are actually testing.
const { publicKey, privateKey } = crypto.generateKeyPairSync('ec', { namedCurve: 'prime256v1' })
process.env.VAPID_PUBLIC_KEY = publicKey.export({ type: 'spki', format: 'der' }).subarray(26).toString('base64url')
process.env.VAPID_PRIVATE_KEY = (privateKey.export({ type: 'pkcs8', format: 'der' }) as Buffer).subarray(36, 68).toString('base64url')

const cases: { name: string; sub: any; wantGone: boolean }[] = [
  { name: 'malformed endpoint', sub: { endpoint: 'not-a-url', p256dh: V.uaPublic, auth: V.authSecret }, wantGone: true },
  { name: 'http endpoint (not https)', sub: { endpoint: 'http://example.com/x', p256dh: V.uaPublic, auth: V.authSecret }, wantGone: true },
  { name: 'garbage p256dh', sub: { endpoint: 'https://example.com/x', p256dh: 'not-a-key', auth: V.authSecret }, wantGone: true },
  { name: 'empty auth secret', sub: { endpoint: 'https://example.com/x', p256dh: V.uaPublic, auth: '' }, wantGone: true },
]

async function runBadInput() {
 for (const c of cases) {
  let threw = false
  let res: any = null
  try {
    res = await sendWebPush(c.sub, { title: 't', body: 'b' })
  } catch (err: any) {
    threw = true
    res = { error: String(err?.message) }
  }
  check(`${c.name}: returns an outcome instead of throwing`, !threw, threw ? `THREW: ${res.error}` : `ok:${res.ok} gone:${res.gone} error:${res.error}`)
  if (!threw) {
    check(`${c.name}: marked permanently dead so it gets revoked`, res.gone === c.wantGone, `gone=${res.gone}`)
  }
 }
}
runBadInput().then(() => {
  // The transient/permanent distinction is the one that matters operationally.
  console.log()
  console.log('  Reminder of the rule this encodes: only 404/410 and unusable')
  console.log('  subscriptions are `gone`. A 5xx or a network error must NOT revoke,')
  console.log('  or one bad afternoon at a push service unsubscribes everybody.')

  console.log()
  console.log('='.repeat(72))
  if (fails.length) {
    console.log(`${fails.length} FAILED: ${fails.join(', ')}`)
    process.exit(1)
  }
  console.log('ALL PASSED — encryption matches RFC 8291 §5 exactly, and bad input is handled.')
})

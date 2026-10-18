/**
 * Prove lib/apns.ts builds what APNs requires, with no network and no real key.
 *
 * Run: npm run apns:prove
 *
 * THE TOKEN IS CHECKED BY VERIFYING IT, NOT BY READING IT. A throwaway P-256
 * key is made here; the JWT lib/apns.ts signs with it must verify against the
 * matching PUBLIC key as raw ES256 (r||s), which is what Apple does with the
 * real one. A DER signature, a wrong curve or a wrong signing input would all
 * produce a token that looks right and fails there, so looking is not enough.
 *
 * Positive control: the same verification run against a token whose claims
 * were altered after signing must FAIL, or the check proves nothing.
 */
import { generateKeyPairSync, createVerify } from 'node:crypto'
import { createRequire } from 'node:module'

// lib/apns.ts carries `import 'server-only'` (it handles the .p8 key), which
// throws outside a server component; stubbed here, the module itself unchanged.
const req = createRequire(import.meta.url)
req.cache[req.resolve('server-only')] = { id: 'server-only', filename: 'server-only', loaded: true, exports: {} } as any
const { buildApnsJwt, apnsPayload, loadApnsCredentials, APNS_TOPIC } = req('../lib/apns') as typeof import('../lib/apns')

const fails: string[] = []
const check = (ok: boolean, label: string) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}`); if (!ok) fails.push(label) }
const fromB64url = (s: string) => Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/'), 'base64')

const { privateKey, publicKey } = generateKeyPairSync('ec', { namedCurve: 'prime256v1' })
const keyPem = privateKey.export({ type: 'pkcs8', format: 'pem' }).toString()
const creds = { keyPem, keyId: 'ABCDE12345', teamId: '7RTA2FH8C7' }
const now = 1792300000

const jwt = buildApnsJwt(creds, now)
const [h, c, s] = jwt.split('.')
const header = JSON.parse(fromB64url(h).toString())
const claims = JSON.parse(fromB64url(c).toString())
check(header.alg === 'ES256' && header.kid === 'ABCDE12345', `header ${JSON.stringify(header)}`)
check(claims.iss === '7RTA2FH8C7' && claims.iat === now && Object.keys(claims).length === 2, `claims ${JSON.stringify(claims)}`)
check(fromB64url(s).length === 64, `signature is raw r||s, 64 bytes (got ${fromB64url(s).length})`)
check(!/[+/=]/.test(jwt), 'base64url throughout (no + / =)')

const verify = (input: string, sig: string) => {
  const v = createVerify('SHA256'); v.update(input)
  return v.verify({ key: publicKey, dsaEncoding: 'ieee-p1363' }, fromB64url(sig))
}
check(verify(`${h}.${c}`, s), 'the signature verifies against the public key, as ES256')
// Positive control: tamper with the claims; the same check must now fail.
const forged = Buffer.from(JSON.stringify({ iss: 'SOMEONEELS', iat: now })).toString('base64url')
check(!verify(`${h}.${forged}`, s), 'control: altered claims do NOT verify')

const p = JSON.parse(apnsPayload('New message from Goldenkeys', 'Are you free Tuesday?', '/messages?conversation=abc'))
check(p.aps?.alert?.title === 'New message from Goldenkeys' && p.aps?.alert?.body === 'Are you free Tuesday?', 'payload carries the title and body as an alert')
check(p.aps?.sound === 'default' && p.link === '/messages?conversation=abc', 'payload carries the sound and the link the app opens')
check(JSON.parse(apnsPayload('t', 'b', null)).link === '/', 'no link means home, never null')
check(APNS_TOPIC === 'uk.co.thrivecareer.app', 'topic is the bundle id')

// Credentials: absent → null (the dispatcher records no_credentials); a value
// that is not a .p8 → a thrown, named error rather than a bad signature later.
for (const k of ['APNS_KEY_BASE64', 'APNS_KEY_ID', 'APNS_TEAM_ID']) delete process.env[k]
check(loadApnsCredentials() === null, 'nothing configured → null')
process.env.APNS_KEY_BASE64 = Buffer.from('not a key').toString('base64')
process.env.APNS_KEY_ID = 'ABCDE12345'
process.env.APNS_TEAM_ID = '7RTA2FH8C7'
let threw = ''
try { loadApnsCredentials() } catch (e: any) { threw = e.message }
check(/did not decode to a \.p8/.test(threw), `garbage key → named error ("${threw}")`)
process.env.APNS_KEY_BASE64 = Buffer.from(keyPem).toString('base64')
check(loadApnsCredentials()?.keyPem === keyPem, 'a base64 .p8 decodes to the same PEM')

console.log(fails.length ? `${fails.length} FAILED` : 'all passed')
process.exitCode = fails.length ? 1 : 0

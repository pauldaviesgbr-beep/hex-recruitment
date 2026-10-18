import 'server-only'
import { createSign, createPrivateKey } from 'node:crypto'
import { connect } from 'node:http2'

/**
 * Apple Push Notification service, without a library — the iOS half of push,
 * beside lib/fcm.ts (Android) and lib/webpush.ts (browsers). The dispatcher
 * (/api/push/dispatch) chooses it for device_tokens rows with platform 'ios'.
 *
 * WHY NO SDK. Same reasoning as lib/fcm.ts: APNs needs a JWT signed with the
 * team's .p8 key (ES256) and one HTTP/2 POST. That is the code below.
 *
 * CREDENTIALS. APNS_KEY_BASE64 is the .p8 file base64-encoded, for the reason
 * lib/fcm.ts records: a PEM pasted into an env var with its newlines turned
 * into "\n" reaches here broken and fails as if the key were wrong. Base64 has
 * no newlines. APNS_KEY_ID is the key's 10-character id; APNS_TEAM_ID is the
 * team (7RTA2FH8C7). Nothing configured → null, and the dispatcher records
 * 'no_credentials' against the row instead of failing the request.
 *
 * WHICH SERVER. TestFlight and App Store builds are signed for production
 * (aps-environment = production in App.entitlements), so their tokens only
 * work against api.push.apple.com. APNS_HOST exists for a development build.
 */

export const APNS_TOPIC = 'uk.co.thrivecareer.app'

export type ApnsOutcome =
  | { ok: true; apnsId: string }
  | { ok: false; error: string; tokenIsDead: boolean }

export interface ApnsCredentials { keyPem: string; keyId: string; teamId: string }

export function loadApnsCredentials(): ApnsCredentials | null {
  const b64 = process.env.APNS_KEY_BASE64
  const keyId = process.env.APNS_KEY_ID
  const teamId = process.env.APNS_TEAM_ID
  if (!b64 || !keyId || !teamId) return null
  const keyPem = Buffer.from(b64, 'base64').toString('utf8')
  if (!keyPem.includes('BEGIN PRIVATE KEY')) {
    throw new Error('APNS_KEY_BASE64 did not decode to a .p8 private key')
  }
  return { keyPem, keyId, teamId }
}

const b64url = (b: Buffer | string) =>
  Buffer.from(b).toString('base64').replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_')

/** The provider token APNs wants: ES256, header {alg, kid}, claims {iss, iat}. */
export function buildApnsJwt(c: ApnsCredentials, nowSeconds: number): string {
  const head = b64url(JSON.stringify({ alg: 'ES256', kid: c.keyId }))
  const claims = b64url(JSON.stringify({ iss: c.teamId, iat: nowSeconds }))
  const signer = createSign('SHA256')
  signer.update(`${head}.${claims}`)
  // ieee-p1363: the raw r||s pair JWS requires, not DER.
  const sig = signer.sign({ key: createPrivateKey(c.keyPem), dsaEncoding: 'ieee-p1363' })
  return `${head}.${claims}.${b64url(sig)}`
}

// APNs refuses a token older than an hour and throttles one re-minted too
// often; 50 minutes sits safely between.
let jwtCache: { jwt: string; at: number; keyId: string } | null = null
function jwtFor(c: ApnsCredentials): string {
  const now = Math.floor(Date.now() / 1000)
  if (jwtCache && jwtCache.keyId === c.keyId && now - jwtCache.at < 50 * 60) return jwtCache.jwt
  jwtCache = { jwt: buildApnsJwt(c, now), at: now, keyId: c.keyId }
  return jwtCache.jwt
}

/** What the phone receives. `link` is read by the app when the alert is tapped. */
export function apnsPayload(title: string, body: string, link: string | null): string {
  return JSON.stringify({
    aps: { alert: { title, body }, sound: 'default' },
    link: link || '/',
  })
}

/** Reasons Apple uses for a token that will never work again. */
const DEAD = new Set(['BadDeviceToken', 'Unregistered', 'DeviceTokenNotForTopic'])

export async function sendApns(
  c: ApnsCredentials, deviceToken: string, title: string, body: string, link: string | null,
): Promise<ApnsOutcome> {
  const host = process.env.APNS_HOST || 'api.push.apple.com'
  return new Promise(resolve => {
    let settled = false
    const done = (o: ApnsOutcome) => { if (!settled) { settled = true; resolve(o) } }
    const session = connect(`https://${host}`)
    session.on('error', err => done({ ok: false, error: `connect: ${err.message}`, tokenIsDead: false }))
    const req = session.request({
      ':method': 'POST',
      ':path': `/3/device/${deviceToken}`,
      authorization: `bearer ${jwtFor(c)}`,
      'apns-topic': APNS_TOPIC,
      'apns-push-type': 'alert',
      'apns-priority': '10',
      'content-type': 'application/json',
    })
    let status = 0
    let apnsId = ''
    let raw = ''
    req.setTimeout(10_000, () => { done({ ok: false, error: 'timeout', tokenIsDead: false }); req.close() })
    req.on('response', h => { status = Number(h[':status']) || 0; apnsId = String(h['apns-id'] || '') })
    req.setEncoding('utf8')
    req.on('data', d => { raw += d })
    req.on('end', () => {
      session.close()
      if (status === 200) return done({ ok: true, apnsId })
      let reason = ''
      try { reason = JSON.parse(raw).reason || '' } catch { /* no body */ }
      // 410 is "no longer active for the topic"; the named reasons are tokens
      // that can never work. Anything else (a 5xx, 429, a bad key) must not
      // revoke, or one bad afternoon unsubscribes every iPhone.
      done({ ok: false, error: `${status} ${reason}`.trim(), tokenIsDead: status === 410 || DEAD.has(reason) })
    })
    req.on('error', err => { session.close(); done({ ok: false, error: `request: ${err.message}`, tokenIsDead: false }) })
    req.end(apnsPayload(title, body, link))
  })
}

import 'server-only'
import crypto from 'node:crypto'

/**
 * Web Push — RFC 8291 message encryption + RFC 8292 VAPID, over RFC 8188's
 * aes128gcm content encoding.
 *
 * NO web-push PACKAGE, for the same reason lib/fcm.ts has no firebase-admin:
 * this is a key agreement, two HKDFs and one AES-GCM seal. Node ships every
 * primitive. A dependency here would be a tree of code we do not read, sitting
 * in the path of every notification we send.
 *
 * WHY RAW WEB PUSH RATHER THAN FCM'S WEB SDK: FCM web push needs a Firebase web
 * app and a VAPID key that can only be minted by hand in the Firebase console,
 * plus the Firebase JS SDK in the browser bundle. This speaks the same standard
 * FCM wraps, generates its keys locally, and puts nothing extra in the browser.
 * Chrome, Edge, Firefox and iOS 16.4+ installed PWAs all speak it natively.
 *
 * The native FCM path in lib/fcm.ts is untouched and still handles device
 * tokens; this handles browser subscriptions. Two senders, deliberately — see
 * the migration comment on device_tokens.
 */

export interface PushSubscriptionRecord {
  endpoint: string
  /** Client public key, base64url, uncompressed P-256 point. */
  p256dh: string
  /** Shared auth secret, base64url, 16 bytes. A SECRET — never log it. */
  auth: string
}

export type WebPushOutcome =
  | { ok: true; status: number }
  | { ok: false; status: number; gone: boolean; error: string }

const b64u = (b: Buffer) => b.toString('base64url')
const fromB64u = (s: string) => Buffer.from(s, 'base64url')

/** Uncompressed P-256 point (0x04 ‖ X ‖ Y) from a node KeyObject. */
function rawPublicKey(key: crypto.KeyObject): Buffer {
  // SPKI for P-256 has a 26-byte prefix before the 65-byte point.
  return key.export({ type: 'spki', format: 'der' }).subarray(26)
}

function privateKeyFromRaw(d: Buffer): crypto.KeyObject {
  // Wrap a raw 32-byte scalar as a PKCS#8 EC key. The prefix is the fixed DER
  // for "P-256 private key, version 1" — only the scalar varies.
  const pkcs8 = Buffer.concat([
    Buffer.from('308141020100301306072a8648ce3d020106082a8648ce3d030107042730250201010420', 'hex'),
    d,
  ])
  return crypto.createPrivateKey({ key: pkcs8, format: 'der', type: 'pkcs8' })
}

function publicKeyFromRaw(point: Buffer): crypto.KeyObject {
  const spki = Buffer.concat([
    Buffer.from('3059301306072a8648ce3d020106082a8648ce3d030107034200', 'hex'),
    point,
  ])
  return crypto.createPublicKey({ key: spki, format: 'der', type: 'spki' })
}

const hkdf = (salt: Buffer, ikm: Buffer, info: Buffer, len: number) =>
  Buffer.from(crypto.hkdfSync('sha256', ikm, salt, info, len))

/**
 * Encrypt a payload for one subscription, per RFC 8291 §3.
 *
 * `salt` and `senderKeys` are injectable ONLY so the RFC's own published test
 * vector can be reproduced exactly in scripts/prove-webpush.ts. Production
 * never passes them — a reused salt or sender key would be a real weakness, so
 * the default generates fresh ones per message.
 */
export function encryptPayload(
  sub: PushSubscriptionRecord,
  payload: string,
  opts?: { salt?: Buffer; senderPrivate?: Buffer },
): Buffer {
  const clientPublicRaw = fromB64u(sub.p256dh)
  const authSecret = fromB64u(sub.auth)

  const senderPriv = opts?.senderPrivate
    ? privateKeyFromRaw(opts.senderPrivate)
    : crypto.generateKeyPairSync('ec', { namedCurve: 'prime256v1' }).privateKey
  const senderPubRaw = rawPublicKey(crypto.createPublicKey(senderPriv))

  // ECDH shared secret between us and the browser.
  const ecdhSecret = crypto.diffieHellman({
    privateKey: senderPriv,
    publicKey: publicKeyFromRaw(clientPublicRaw),
  })

  // RFC 8291 §3.4: the auth secret salts a first HKDF whose info binds BOTH
  // public keys, so a message can only be read by the subscription it was
  // sealed for.
  const keyInfo = Buffer.concat([
    Buffer.from('WebPush: info\0'),
    clientPublicRaw,
    senderPubRaw,
  ])
  const ikm = hkdf(authSecret, ecdhSecret, keyInfo, 32)

  const salt = opts?.salt ?? crypto.randomBytes(16)
  const cek = hkdf(salt, ikm, Buffer.from('Content-Encoding: aes128gcm\0'), 16)
  const nonce = hkdf(salt, ikm, Buffer.from('Content-Encoding: nonce\0'), 12)

  // RFC 8188 §2: the record is padded with a 0x02 delimiter (last record).
  const plaintext = Buffer.concat([Buffer.from(payload, 'utf8'), Buffer.from([0x02])])
  const cipher = crypto.createCipheriv('aes-128-gcm', cek, nonce)
  const body = Buffer.concat([cipher.update(plaintext), cipher.final(), cipher.getAuthTag()])

  // RFC 8188 §2.1 header: salt(16) ‖ rs(4, big-endian) ‖ idlen(1) ‖ keyid
  const rs = Buffer.alloc(4)
  rs.writeUInt32BE(4096, 0)
  return Buffer.concat([salt, rs, Buffer.from([senderPubRaw.length]), senderPubRaw, body])
}

/** RFC 8292 VAPID: a signed JWT proving the message came from us. */
function vapidAuthHeader(endpoint: string, subject: string, publicKeyB64u: string, privateKeyB64u: string): string {
  const aud = new URL(endpoint).origin
  const header = b64u(Buffer.from(JSON.stringify({ typ: 'JWT', alg: 'ES256' })))
  const claims = b64u(Buffer.from(JSON.stringify({
    aud,
    // 12 hours. The spec caps it at 24; shorter limits the damage if a token leaks.
    exp: Math.floor(Date.now() / 1000) + 12 * 60 * 60,
    sub: subject,
  })))
  const unsigned = `${header}.${claims}`

  // ES256 signatures must be raw r‖s (64 bytes), not the DER that node emits.
  const der = crypto.sign('sha256', Buffer.from(unsigned), {
    key: privateKeyFromRaw(fromB64u(privateKeyB64u)),
    dsaEncoding: 'ieee-p1363',
  })
  return `vapid t=${unsigned}.${b64u(der)}, k=${publicKeyB64u}`
}

function vapidKeys(): { publicKey: string; privateKey: string; subject: string } | null {
  const publicKey = process.env.VAPID_PUBLIC_KEY || process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
  const privateKey = process.env.VAPID_PRIVATE_KEY
  if (!publicKey || !privateKey) return null
  return {
    publicKey,
    privateKey,
    subject: process.env.VAPID_SUBJECT || 'mailto:support@thrivecareer.co.uk',
  }
}

/**
 * Send one push. Never throws — the dispatcher logs an outcome for every
 * attempt, and an exception escaping into that loop would lose the rest.
 *
 * `gone` is the answer to "should this subscription be revoked?". A push
 * service returns 404 or 410 when a subscription is permanently dead, which is
 * the web equivalent of FCM's NotRegistered. Anything else — a 5xx, a timeout,
 * a rate limit — is transient and MUST NOT revoke, or one bad afternoon at a
 * push service silently unsubscribes everybody.
 */
export async function sendWebPush(
  sub: PushSubscriptionRecord,
  payload: { title: string; body: string; url?: string; tag?: string },
  ttlSeconds = 60 * 60 * 24,
): Promise<WebPushOutcome> {
  const keys = vapidKeys()
  if (!keys) {
    return { ok: false, status: 0, gone: false, error: 'no_vapid_keys' }
  }

  let endpointOrigin: string
  try {
    endpointOrigin = new URL(sub.endpoint).origin
  } catch {
    // A malformed endpoint can never be delivered to, so it is permanently
    // dead — revoke it rather than retrying it forever.
    return { ok: false, status: 0, gone: true, error: 'malformed_endpoint' }
  }
  if (!endpointOrigin.startsWith('https://')) {
    return { ok: false, status: 0, gone: true, error: 'insecure_endpoint' }
  }

  // VALIDATE THE KEY SIZES BEFORE ENCRYPTING, because the crypto does NOT
  // reject a bad auth secret. HKDF happily accepts a zero-length salt, so an
  // empty `auth` produces a perfectly well-formed message that the browser
  // cannot decrypt — it would be accepted by the push service, counted as sent,
  // and silently never shown. Found by scripts/prove-webpush.ts, which caught
  // the empty-auth case sailing through to a real network POST.
  //
  // A genuine subscription is always a 65-byte P-256 point and a 16-byte
  // secret. Anything else can never yield a readable push, so it is dead.
  const p256dhLen = fromB64u(sub.p256dh || '').length
  const authLen = fromB64u(sub.auth || '').length
  if (p256dhLen !== 65 || authLen !== 16) {
    return {
      ok: false,
      status: 0,
      gone: true,
      error: `bad_subscription_keys: p256dh ${p256dhLen}B (want 65), auth ${authLen}B (want 16)`,
    }
  }

  let body: Buffer
  try {
    body = encryptPayload(sub, JSON.stringify(payload))
  } catch (err: any) {
    // Bad p256dh/auth — the row can never produce a valid message.
    return { ok: false, status: 0, gone: true, error: `encrypt_failed: ${err?.message}` }
  }

  try {
    const res = await fetch(sub.endpoint, {
      method: 'POST',
      headers: {
        'Content-Encoding': 'aes128gcm',
        'Content-Type': 'application/octet-stream',
        TTL: String(ttlSeconds),
        Urgency: 'normal',
        Authorization: vapidAuthHeader(sub.endpoint, keys.subject, keys.publicKey, keys.privateKey),
      },
      body: new Uint8Array(body),
    })
    if (res.ok) return { ok: true, status: res.status }
    const text = (await res.text().catch(() => '')).slice(0, 300)
    return {
      ok: false,
      status: res.status,
      gone: res.status === 404 || res.status === 410,
      error: text || `HTTP ${res.status}`,
    }
  } catch (err: any) {
    // Network failure. Transient by assumption — never revoke on this.
    return { ok: false, status: 0, gone: false, error: `network: ${err?.message}` }
  }
}

/** True when the server has what it needs to send at all. */
export function webPushConfigured(): boolean {
  return vapidKeys() !== null
}

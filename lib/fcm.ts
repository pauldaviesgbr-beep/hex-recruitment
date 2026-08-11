import 'server-only'
import { createSign } from 'node:crypto'

/**
 * Firebase Cloud Messaging v1, without firebase-admin.
 *
 * WHY NO SDK. firebase-admin exists to do three things here: decode a service
 * account, mint an OAuth token from it, and POST a message. That is the ~40
 * lines below. Against that it brings a large dependency tree into a serverless
 * bundle and a supply-chain surface, for a call we make from one file. Proven
 * before choosing: a JWT signed with node's crypto got an access token from
 * Google and a real response from FCM's v1 endpoint on the first attempt.
 *
 * CREDENTIALS ARE BASE64. The service-account JSON's private_key contains
 * newlines, and a dotenv value carrying them as literal \n reaches this file as
 * a broken PEM — a failure that surfaces as "Invalid PEM formatted message" and
 * reads like a bad key rather than a bad paste. Base64 has no escaping and no
 * newlines: it decodes to valid JSON or it does not.
 */

export type FcmOutcome =
  | { ok: true; messageId: string }
  | { ok: false; error: string; tokenIsDead: boolean }

interface ServiceAccount {
  project_id: string
  client_email: string
  private_key: string
}

let cached: { sa: ServiceAccount } | null = null

/**
 * Decode and validate the credentials once.
 *
 * THE PROJECT-ID GUARD. FIREBASE_PROJECT_ID is deliberately redundant with the
 * project_id inside the JSON, and they are compared here. A service account for
 * a DIFFERENT project authenticates perfectly and sends into a project nobody
 * is watching — a silent failure of exactly the shape this whole phase exists
 * to prevent. Failing loudly at the first send is much cheaper than a week of
 * pushes going somewhere else.
 *
 * Returns null rather than throwing when nothing is configured, so a
 * deployment without credentials records 'no_credentials' instead of 500ing.
 */
export function loadServiceAccount(): ServiceAccount | null {
  if (cached) return cached.sa
  const b64 = process.env.FIREBASE_SERVICE_ACCOUNT_BASE64
  const expected = process.env.FIREBASE_PROJECT_ID
  if (!b64 || !expected) return null

  let sa: ServiceAccount
  try {
    sa = JSON.parse(Buffer.from(b64, 'base64').toString('utf8'))
  } catch (err: any) {
    throw new Error(`FIREBASE_SERVICE_ACCOUNT_BASE64 did not decode to JSON: ${err?.message}`)
  }
  if (!sa.private_key || !sa.client_email || !sa.project_id) {
    throw new Error('Service account is missing project_id, client_email or private_key')
  }
  if (sa.project_id !== expected) {
    throw new Error(
      `Service account is for project "${sa.project_id}" but FIREBASE_PROJECT_ID is "${expected}" — refusing to send into the wrong project`,
    )
  }
  cached = { sa }
  return sa
}

let token: { value: string; expiresAt: number } | null = null

/** Mint (and briefly cache) a Google access token scoped to FCM. */
async function accessToken(sa: ServiceAccount): Promise<string> {
  const now = Math.floor(Date.now() / 1000)
  if (token && token.expiresAt > now + 60) return token.value

  const b64u = (o: unknown) => Buffer.from(JSON.stringify(o)).toString('base64url')
  const unsigned =
    `${b64u({ alg: 'RS256', typ: 'JWT' })}.` +
    `${b64u({
      iss: sa.client_email,
      scope: 'https://www.googleapis.com/auth/firebase.messaging',
      aud: 'https://oauth2.googleapis.com/token',
      iat: now,
      exp: now + 3600,
    })}`

  const signer = createSign('RSA-SHA256')
  signer.update(unsigned)
  signer.end()
  const jwt = `${unsigned}.${signer.sign(sa.private_key).toString('base64url')}`

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: jwt,
    }),
  })
  const body = await res.json().catch(() => ({} as any))
  if (!res.ok || !body.access_token) {
    throw new Error(`Google refused a token: ${res.status} ${body.error || ''}`)
  }
  token = { value: body.access_token, expiresAt: now + (body.expires_in || 3600) }
  return token.value
}

/**
 * Send one message to one device token.
 *
 * tokenIsDead is the part the caller acts on: FCM answers UNREGISTERED or
 * NOT_FOUND for a token that no longer belongs to an install, and that token
 * should be revoked rather than retried forever. Any other failure is
 * transient or ours, and the token stays.
 */
export async function sendToToken(
  sa: ServiceAccount,
  deviceToken: string,
  title: string,
  body: string,
  link?: string | null,
): Promise<FcmOutcome> {
  try {
    const at = await accessToken(sa)
    const res = await fetch(
      `https://fcm.googleapis.com/v1/projects/${sa.project_id}/messages:send`,
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${at}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: {
            token: deviceToken,
            notification: { title, body },
            // The link travels as data so the app decides where to go. A
            // notification payload alone cannot carry a route.
            ...(link ? { data: { link } } : {}),
          },
        }),
      },
    )
    const json: any = await res.json().catch(() => ({}))
    if (res.ok && json.name) return { ok: true, messageId: json.name }

    const status = json?.error?.status || `HTTP_${res.status}`
    const message = json?.error?.message || 'unknown FCM error'
    const dead = status === 'UNREGISTERED' || status === 'NOT_FOUND' || res.status === 404
    return { ok: false, error: `${status}: ${message}`.slice(0, 500), tokenIsDead: dead }
  } catch (err: any) {
    return { ok: false, error: (err?.message || 'send threw').slice(0, 500), tokenIsDead: false }
  }
}

// ── SEAMS, LEFT VISIBLY UNBUILT ───────────────────────────────────────────
//
// APNs — blocked on the Apple Developer enrolment (submitted 11 Aug 2026,
// 1–2 weeks of Apple's queue). It needs a .p8 auth key, a key id and a team id,
// none of which exist yet. There is deliberately no stub here: an apnsSend()
// returning a fake success would be indistinguishable from a working one, and
// this file would then be the fourth thing armed and never exercised.
//
// WEB PUSH — not blocked on anyone, but not the same work. It has no device
// token: it has a browser subscription minted by a service worker after a
// permission prompt, and neither the worker nor the prompt exists. VAPID keys
// were deliberately NOT collected for this phase for that reason.
//
// When either lands, it plugs in beside sendToToken and the dispatcher chooses
// on device_tokens.platform, which already carries 'ios' and 'web'.

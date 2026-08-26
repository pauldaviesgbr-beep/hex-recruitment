import { createPrivateKey, createPublicKey, sign, verify, type KeyObject } from 'crypto'

/**
 * APPLE'S OAUTH CLIENT SECRET IS A SIGNED JWT, NOT THE .p8.
 *
 * Supabase's Apple provider refuses the private key with "Secret key should be
 * a JWT", and it is right to. The .p8 is the SIGNING MATERIAL; the secret is a
 * short-lived token signed with it. That is also why the panel warns about
 * expiry: the JWT has a six-month maximum, while the .p8 itself never expires.
 *
 * THIS FILE IS THE SIGNING, AND NOTHING ELSE. The script that reads a .p8 and
 * the check that proves the signing is correct both call these functions, so
 * what is proven is what runs. A prove that reimplemented ES256 would only
 * demonstrate that two implementations agree with each other.
 *
 * ES256 IS ECDSA-P256-SHA256, AND THE ENCODING IS THE TRAP. Node's default
 * signature output for EC keys is DER; JOSE requires raw r||s. Get that wrong
 * and you produce a JWT with perfect claims and a signature Apple silently
 * rejects — indistinguishable from a working one until every Apple sign-in
 * fails. Hence dsaEncoding: 'ieee-p1363' on both sign and verify.
 */

/** Apple's documented ceiling: six months. Anything longer is rejected outright. */
export const APPLE_MAX_LIFETIME_SECONDS = 15_777_000

/** What we actually mint — comfortably inside the ceiling, and a round number. */
export const DEFAULT_LIFETIME_SECONDS = 180 * 24 * 60 * 60

export const APPLE_AUDIENCE = 'https://appleid.apple.com'

export interface AppleSecretInput {
  /** Apple Developer Team ID — the `iss` claim. */
  teamId: string
  /** The Sign in with Apple key id — the `kid` header. */
  keyId: string
  /** The Services ID (web) or bundle id (native) — the `sub` claim. */
  clientId: string
  /** PEM contents of the AuthKey_*.p8. Never logged, never returned. */
  privateKeyPem: string
  /** Seconds. Defaults to 180 days. Refused above Apple's ceiling. */
  lifetimeSeconds?: number
  /** Injected so a check can force a gap rather than mock the clock. */
  now?: Date
}

export interface AppleSecretResult {
  token: string
  issuedAt: Date
  expiresAt: Date
  claims: { iss: string; iat: number; exp: number; aud: string; sub: string }
  header: { alg: 'ES256'; kid: string; typ: 'JWT' }
}

const b64url = (b: Buffer) => b.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
const b64urlJson = (o: unknown) => b64url(Buffer.from(JSON.stringify(o), 'utf8'))

export function generateAppleClientSecret(input: AppleSecretInput): AppleSecretResult {
  const lifetime = input.lifetimeSeconds ?? DEFAULT_LIFETIME_SECONDS

  // REFUSE RATHER THAN CLAMP. A silently shortened lifetime would be a
  // different token from the one asked for, and the caller would go on
  // believing the expiry they chose. Apple rejects anything longer outright,
  // so a too-long request is a mistake to surface, not to paper over.
  if (!Number.isFinite(lifetime) || lifetime <= 0) {
    throw new Error('lifetimeSeconds must be a positive number')
  }
  if (lifetime > APPLE_MAX_LIFETIME_SECONDS) {
    throw new Error(
      `lifetimeSeconds ${lifetime} exceeds Apple's six-month maximum (${APPLE_MAX_LIFETIME_SECONDS}). Apple rejects it outright.`,
    )
  }
  for (const [name, v] of [['teamId', input.teamId], ['keyId', input.keyId], ['clientId', input.clientId]] as const) {
    if (!v || !v.trim()) throw new Error(`${name} is required`)
  }

  const now = input.now ?? new Date()
  const iat = Math.floor(now.getTime() / 1000)
  const exp = iat + lifetime

  const header = { alg: 'ES256' as const, kid: input.keyId, typ: 'JWT' as const }
  const claims = { iss: input.teamId, iat, exp, aud: APPLE_AUDIENCE, sub: input.clientId }

  let key: KeyObject
  try {
    key = createPrivateKey(input.privateKeyPem)
  } catch (e: any) {
    // Deliberately does not echo the input. A malformed key must not put key
    // material into an error string that ends up in a terminal or a log.
    throw new Error('the private key could not be read — is this the AuthKey_*.p8 file? (' + (e?.code || 'parse failed') + ')')
  }
  if (key.asymmetricKeyType !== 'ec') {
    throw new Error(`expected an EC key, got ${key.asymmetricKeyType} — Apple's .p8 is an EC P-256 key`)
  }

  const signingInput = `${b64urlJson(header)}.${b64urlJson(claims)}`
  // 'ieee-p1363' is the raw r||s JOSE needs. The default DER encoding produces
  // a token that looks right and fails at Apple.
  const signature = sign('sha256', Buffer.from(signingInput, 'utf8'), { key, dsaEncoding: 'ieee-p1363' })

  return {
    token: `${signingInput}.${b64url(signature)}`,
    issuedAt: new Date(iat * 1000),
    expiresAt: new Date(exp * 1000),
    claims,
    header,
  }
}

export interface AppleSecretCheck {
  ok: boolean
  problems: string[]
  header: Record<string, unknown> | null
  claims: Record<string, unknown> | null
  expiresAt: Date | null
  signatureValid: boolean
}

/**
 * Read a token back and check it against what it was supposed to be.
 *
 * IT VERIFIES THE SIGNATURE, WHICH IS THE HALF THAT CANNOT BE EYEBALLED. A JWT
 * with perfect claims and a bad signature is byte-for-byte plausible and fails
 * only at Apple — by which point it is configured, live, and every Apple
 * sign-in is broken with nothing on our side to look at.
 *
 * `alg` is checked against ES256 EXPLICITLY rather than read from the header
 * and trusted. Taking the algorithm from the token is the classic JWT fault:
 * a header saying 'none' with an empty signature passes every claim check
 * there is.
 */
export function inspectAppleClientSecret(
  token: string,
  expected: { teamId: string; keyId: string; clientId: string; publicKey?: KeyObject | string },
  now: Date = new Date(),
): AppleSecretCheck {
  const problems: string[] = []
  const parts = (token || '').split('.')
  if (parts.length !== 3) {
    return { ok: false, problems: ['not a three-part JWT'], header: null, claims: null, expiresAt: null, signatureValid: false }
  }
  const decode = (s: string) => {
    try { return JSON.parse(Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8')) }
    catch { return null }
  }
  const header = decode(parts[0]) as Record<string, unknown> | null
  const claims = decode(parts[1]) as Record<string, unknown> | null
  if (!header) problems.push('header is not JSON')
  if (!claims) problems.push('payload is not JSON')
  if (!header || !claims) {
    return { ok: false, problems, header, claims, expiresAt: null, signatureValid: false }
  }

  if (header.alg !== 'ES256') problems.push(`alg is ${JSON.stringify(header.alg)}, must be "ES256"`)
  if (header.kid !== expected.keyId) problems.push(`kid is ${JSON.stringify(header.kid)}, expected ${expected.keyId}`)
  if (claims.iss !== expected.teamId) problems.push(`iss is ${JSON.stringify(claims.iss)}, expected ${expected.teamId}`)
  if (claims.sub !== expected.clientId) problems.push(`sub is ${JSON.stringify(claims.sub)}, expected ${expected.clientId}`)
  if (claims.aud !== APPLE_AUDIENCE) problems.push(`aud is ${JSON.stringify(claims.aud)}, expected ${APPLE_AUDIENCE}`)

  const iat = typeof claims.iat === 'number' ? claims.iat : NaN
  const exp = typeof claims.exp === 'number' ? claims.exp : NaN
  if (!Number.isFinite(iat)) problems.push('iat is missing or not a number')
  if (!Number.isFinite(exp)) problems.push('exp is missing or not a number')
  if (Number.isFinite(iat) && Number.isFinite(exp)) {
    const life = exp - iat
    if (life <= 0) problems.push('exp is not after iat')
    if (life > APPLE_MAX_LIFETIME_SECONDS) {
      problems.push(`lifetime ${life}s exceeds Apple's six-month maximum (${APPLE_MAX_LIFETIME_SECONDS}s)`)
    }
  }
  if (Number.isFinite(exp) && exp * 1000 <= now.getTime()) problems.push('already expired')

  let signatureValid = false
  if (expected.publicKey) {
    try {
      signatureValid = verify(
        'sha256',
        Buffer.from(`${parts[0]}.${parts[1]}`, 'utf8'),
        { key: typeof expected.publicKey === 'string' ? createPublicKey(expected.publicKey) : expected.publicKey, dsaEncoding: 'ieee-p1363' },
        Buffer.from(parts[2].replace(/-/g, '+').replace(/_/g, '/'), 'base64'),
      )
    } catch { signatureValid = false }
    if (!signatureValid) problems.push('SIGNATURE DOES NOT VERIFY against the key it claims to come from')
  } else {
    problems.push('no key supplied, so the signature was not checked')
  }

  return {
    ok: problems.length === 0,
    problems,
    header,
    claims,
    expiresAt: Number.isFinite(exp) ? new Date(exp * 1000) : null,
    signatureValid,
  }
}

/** The public half of a .p8, for verifying what we just signed. */
export function publicKeyFromPrivatePem(pem: string): KeyObject {
  return createPublicKey(createPrivateKey(pem))
}

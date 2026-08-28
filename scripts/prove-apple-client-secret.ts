// THE APPLE CLIENT SECRET IS SIGNED CORRECTLY, OR WE FIND OUT HERE.
//
// A JWT with perfect claims and a bad signature is byte-for-byte plausible.
// Nothing about it looks wrong. It fails only at Apple — by which point it is
// pasted into Supabase, live, and every Apple sign-in is broken with nothing
// on our side to look at. That is the fault this file exists to catch, and it
// is why the signature check matters more than all the claim checks together.
//
// IT USES A THROWAWAY KEY GENERATED IN THIS PROCESS, never Paul's .p8. So it
// runs inside `npm run verify` on any machine, with no key material anywhere
// near the repo, and it still exercises the real signing path — the functions
// under test are the ones the generator script calls.
//
//   npx tsx --conditions=react-server scripts/prove-apple-client-secret.ts

import { generateKeyPairSync, createPublicKey, createPrivateKey } from 'crypto'
import {
  generateAppleClientSecret,
  inspectAppleClientSecret,
  publicKeyFromPrivatePem,
  APPLE_MAX_LIFETIME_SECONDS,
  DEFAULT_LIFETIME_SECONDS,
  APPLE_AUDIENCE,
} from '../lib/appleClientSecret'
import {
  APPLE_CLIENT_SECRET_EXPIRES,
  APPLE_SECRET_WARN_DAYS,
  appleSecretDaysRemaining,
} from '../lib/appleSignIn'

const TEAM = '7RTA2FH8C7'
const KID = 'Z9HFBUW93X'
const SUB = 'uk.co.thrivecareer.web'
const NOW = new Date('2026-08-26T13:30:00.000Z')
const DAY = 86_400

let bad = 0
const check = (label: string, ok: boolean, detail?: string) => {
  if (!ok) bad++
  console.log('  ' + (ok ? 'ok   ' : 'FAIL ') + label.padEnd(58) + (detail ?? ''))
  return ok
}

// A real EC P-256 key, the same shape as Apple's .p8, made here and thrown
// away. Never touches disk.
const { privateKey, publicKey } = generateKeyPairSync('ec', {
  namedCurve: 'P-256',
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  publicKeyEncoding: { type: 'spki', format: 'pem' },
})

// A SECOND key, so "the signature verifies" can be shown to be a real test
// rather than a function that returns true.
const other = generateKeyPairSync('ec', {
  namedCurve: 'P-256',
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  publicKeyEncoding: { type: 'spki', format: 'pem' },
})

const base = { teamId: TEAM, keyId: KID, clientId: SUB, privateKeyPem: privateKey, now: NOW }

function main() {
  console.log('\nEVERY CLAIM IS WHAT APPLE ASKS FOR')
  const r = generateAppleClientSecret(base)
  check('three parts', r.token.split('.').length === 3)
  check('alg is ES256', r.header.alg === 'ES256', r.header.alg)
  check('kid is the key id', r.header.kid === KID, r.header.kid)
  check('iss is the team id', r.claims.iss === TEAM, r.claims.iss)
  check('sub is the client id', r.claims.sub === SUB, r.claims.sub)
  check('aud is Apple', r.claims.aud === APPLE_AUDIENCE, r.claims.aud)
  check('iat is the injected clock, not the wall clock',
    r.claims.iat === Math.floor(NOW.getTime() / 1000), String(r.claims.iat))
  check('exp is iat + the lifetime', r.claims.exp - r.claims.iat === DEFAULT_LIFETIME_SECONDS,
    (r.claims.exp - r.claims.iat) / DAY + ' days')

  console.log('\nTHE SIGNATURE — the half that cannot be eyeballed')
  const good = inspectAppleClientSecret(r.token, { teamId: TEAM, keyId: KID, clientId: SUB, publicKey })
  check('it verifies against its own key', good.signatureValid)
  check('…and the whole token is clean', good.ok, good.problems.join('; ') || 'no problems')

  // THE CONTROL. Without this, `signatureValid` could be a function that
  // returns true and every check above would still pass.
  const wrong = inspectAppleClientSecret(r.token, { teamId: TEAM, keyId: KID, clientId: SUB, publicKey: other.publicKey })
  check('IT DOES NOT VERIFY AGAINST A DIFFERENT KEY', wrong.signatureValid === false,
    'otherwise the check above proves nothing')
  check('…and that is reported as a problem', wrong.problems.some(p => /SIGNATURE DOES NOT VERIFY/.test(p)))

  // The encoding trap: DER instead of raw r||s produces a token that looks
  // perfect and fails at Apple. A DER signature is a different length, so a
  // verify with the right key would fail — which is exactly what the check
  // above would catch.
  const sigBytes = Buffer.from(r.token.split('.')[2].replace(/-/g, '+').replace(/_/g, '/'), 'base64')
  check('the signature is raw r||s (64 bytes), not DER', sigBytes.length === 64, sigBytes.length + ' bytes')

  console.log('\nalg IS CHECKED AGAINST ES256, NOT READ FROM THE TOKEN')
  // The classic JWT fault: a header saying "none" with an empty signature
  // passes every claim check there is. The inspector must not take the
  // algorithm from the thing it is inspecting.
  {
    const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString('base64')
      .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
    const forged = `${b64({ alg: 'none', kid: KID, typ: 'JWT' })}.${b64(r.claims)}.`
    const v = inspectAppleClientSecret(forged, { teamId: TEAM, keyId: KID, clientId: SUB, publicKey })
    check('an alg:none token is refused', v.ok === false)
    check('…and named as an alg problem', v.problems.some(p => /alg is/.test(p)), v.problems[0])
    check('…and its signature does not verify either', v.signatureValid === false)
  }

  console.log('\nAPPLE’S SIX-MONTH CEILING IS REFUSED, NOT CLAMPED')
  // Clamping would hand back a different token from the one asked for while
  // the caller went on believing their own number.
  {
    let threw = ''
    try { generateAppleClientSecret({ ...base, lifetimeSeconds: 210 * DAY }) } catch (e: any) { threw = e.message }
    check('a seven-month lifetime throws', /six-month maximum/.test(threw), threw.slice(0, 60))
    const at = generateAppleClientSecret({ ...base, lifetimeSeconds: APPLE_MAX_LIFETIME_SECONDS })
    check('exactly six months is allowed', at.claims.exp - at.claims.iat === APPLE_MAX_LIFETIME_SECONDS)
    check('what we actually mint is inside it', DEFAULT_LIFETIME_SECONDS < APPLE_MAX_LIFETIME_SECONDS,
      Math.round(DEFAULT_LIFETIME_SECONDS / DAY) + 'd vs ' + Math.round(APPLE_MAX_LIFETIME_SECONDS / DAY) + 'd max')
    for (const [label, v] of [['zero', 0], ['negative', -1], ['NaN', NaN]] as [string, number][]) {
      let t = ''
      try { generateAppleClientSecret({ ...base, lifetimeSeconds: v }) } catch (e: any) { t = e.message }
      check(label + ' lifetime throws', t.length > 0, t.slice(0, 40))
    }
  }

  console.log('\nTHE INSPECTOR CATCHES A TOKEN THAT IS SIMPLY WRONG')
  // Each of these would be pasted into Supabase and fail at Apple with no
  // clue on our side. Asserted individually so the failure names itself.
  {
    const cases: [string, Parameters<typeof generateAppleClientSecret>[0], RegExp][] = [
      ['wrong team id', { ...base, teamId: 'WRONGTEAM1' }, /iss is/],
      ['wrong key id', { ...base, keyId: 'WRONGKEY99' }, /kid is/],
      ['the BUNDLE id instead of the Services ID', { ...base, clientId: 'uk.co.thrivecareer.app' }, /sub is/],
    ]
    for (const [label, input, pattern] of cases) {
      const t = generateAppleClientSecret(input)
      const v = inspectAppleClientSecret(t.token, { teamId: TEAM, keyId: KID, clientId: SUB, publicKey })
      check(label + ' is caught', v.ok === false && v.problems.some(p => pattern.test(p)),
        v.problems.find(p => pattern.test(p))?.slice(0, 44))
      check('  …though its SIGNATURE is perfectly valid', v.signatureValid === true,
        'which is why claims must be checked separately')
    }
  }

  console.log('\nAN EXPIRED TOKEN IS SPOTTED')
  {
    const old = generateAppleClientSecret({ ...base, now: new Date('2026-01-01T00:00:00.000Z'), lifetimeSeconds: 30 * DAY })
    const v = inspectAppleClientSecret(old.token, { teamId: TEAM, keyId: KID, clientId: SUB, publicKey }, NOW)
    check('already expired is reported', v.problems.some(p => /already expired/.test(p)))
    check('…and it is NOT ok', v.ok === false)
    // Two measurements taken apart, so "not expired" cannot be a constant.
    const fresh = inspectAppleClientSecret(r.token, { teamId: TEAM, keyId: KID, clientId: SUB, publicKey }, NOW)
    check('while a fresh one is not', !fresh.problems.some(p => /already expired/.test(p)))
  }

  console.log('\nRUBBISH IN')
  {
    for (const [label, t] of [['empty', ''], ['one part', 'abc'], ['two parts', 'a.b'], ['not base64 json', 'x.y.z']] as [string, string][]) {
      const v = inspectAppleClientSecret(t, { teamId: TEAM, keyId: KID, clientId: SUB, publicKey })
      check(label + ' is refused', v.ok === false, v.problems[0]?.slice(0, 40))
    }
    let msg = ''
    try { generateAppleClientSecret({ ...base, privateKeyPem: 'not a key' }) } catch (e: any) { msg = e.message }
    check('a non-key throws', msg.length > 0, msg.slice(0, 46))
    check('…without echoing the input back', !msg.includes('not a key'),
      'an error string is somewhere key material must never land')
  }

  console.log('\nTHE PUBLIC HALF COMES OUT OF THE PRIVATE ONE')
  {
    const derived = publicKeyFromPrivatePem(privateKey)
    const a = derived.export({ type: 'spki', format: 'pem' }).toString()
    const b = createPublicKey(publicKey).export({ type: 'spki', format: 'pem' }).toString()
    check('it matches the generated public key', a === b)
    const c = createPublicKey(createPrivateKey(other.privateKey)).export({ type: 'spki', format: 'pem' }).toString()
    check('…and differs from a different key', a !== c, 'so the comparison above is a real one')
  }

  // ── THE ALARM ────────────────────────────────────────────────────────────
  // THE SECRET IN SUPABASE LAPSES AND NOTHING ANNOUNCES IT. When it does,
  // every Apple sign-in stops at once — and the failure is a provider error on
  // somebody else's screen, not a red in anything we own. There is no cron and
  // no email here on purpose: this file already runs inside `npm run verify`,
  // which runs before every merge, so the reminder is loud for free.
  //
  // ⚠️ IT IS A REMINDER AGAINST A HARDCODED DATE, NOT A CHECK OF WHAT IS LIVE.
  // Nothing we run can read the real token — Supabase returns a 64-character
  // opaque value, not the JWT. If the secret is rotated and the constant in
  // lib/appleSignIn.ts is not updated in the same commit, THIS GOES ON SAYING
  // EVERYTHING IS FINE. That is the one way it can be wrong, and it is the
  // reassuring way, which is why the warning is written twice — here and there.
  console.log('\nTHE SECRET IN SUPABASE HAS A DATE ON IT')
  {
    const days = appleSecretDaysRemaining()
    check('the recorded expiry parses', !Number.isNaN(Date.parse(APPLE_CLIENT_SECRET_EXPIRES)),
      APPLE_CLIENT_SECRET_EXPIRES)
    check(`more than ${APPLE_SECRET_WARN_DAYS} days before it lapses`,
      days > APPLE_SECRET_WARN_DAYS,
      days >= 0
        ? `${days} days left — mint a new one with npm run apple:secret and UPDATE APPLE_CLIENT_SECRET_EXPIRES`
        : `IT LAPSED ${Math.abs(days)} DAYS AGO — Apple sign-in is broken right now`)

    // The window itself is asserted, so a future edit that sets it to 0 or a
    // negative cannot quietly disable the alarm while leaving it green.
    check('the warning window is a real one', APPLE_SECRET_WARN_DAYS >= 30,
      `${APPLE_SECRET_WARN_DAYS} days`)
  }

  console.log('')
  console.log(bad
    ? `  ${bad} FAILED — do not paste anything this produces`
    : '  the token Apple gets is the token we meant, and it is signed by the key we hold')
  process.exit(bad ? 1 : 0)
}

main()

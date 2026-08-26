// GENERATE THE APPLE OAUTH CLIENT SECRET, AND CHECK IT BEFORE ANYONE PASTES IT.
//
// Supabase's Apple provider refuses the .p8 with "Secret key should be a JWT".
// It is right to: Apple's client secret is a SIGNED JWT and the .p8 is the
// signing material. That is also why the panel warns about expiry — the JWT
// has a six-month maximum; the .p8 never expires.
//
//   npm run apple:secret -- /path/outside/the/repo/AuthKey_Z9HFBUW93X.p8
//
// TWO RULES THIS SCRIPT ENFORCES RATHER THAN ASKS FOR:
//
//   1. THE .p8 MAY NOT LIVE INSIDE THE WORKING TREE. Not "please don't" — it
//      refuses to read one from in here at all. A key that is never in the
//      directory cannot be committed by an `git add -A` at 1am, and *.p8 is
//      gitignored as well, because two independent guards is the right number
//      for something that cannot be un-leaked.
//
//   2. THE TOKEN IS PRINTED TO THIS TERMINAL AND NOWHERE ELSE. Not to a file,
//      not to a report, not to a draft, not to a commit. It is a credential:
//      anything holding it can sign in as our Apple client until it expires.
//
// It verifies its own output before printing — decoding every claim and
// checking the SIGNATURE against the public half of the same key. A JWT with
// perfect claims and a bad signature is byte-for-byte plausible and fails only
// at Apple, by which point it is configured, live, and every Apple sign-in is
// broken with nothing on our side to look at.

import { readFileSync, existsSync, realpathSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  generateAppleClientSecret,
  inspectAppleClientSecret,
  publicKeyFromPrivatePem,
  DEFAULT_LIFETIME_SECONDS,
} from '../lib/appleClientSecret'

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

// Paul's values, from the Apple Developer portal. Not secret — they are
// identifiers, and they appear in the JWT itself. The KEY is the secret.
const TEAM_ID = '7RTA2FH8C7'
const KEY_ID = 'Z9HFBUW93X'
const SERVICES_ID = 'uk.co.thrivecareer.web'   // the WEB client id
// The bundle id, uk.co.thrivecareer.app, is NOT used here. Native sign-in
// presents the bundle id as its client id and needs its own secret; see
// lib/appleSignIn.ts. Minting the web one against the bundle id would produce
// a token that verifies perfectly and is rejected by Apple for the web flow.

const keyPath = process.argv[2]
if (!keyPath) {
  console.error('usage: npm run apple:secret -- <path-to-AuthKey_*.p8>')
  console.error('       the path must be OUTSIDE this repository.')
  process.exit(2)
}

const resolved = path.resolve(keyPath)
if (!existsSync(resolved)) {
  console.error('no such file: ' + resolved)
  process.exit(2)
}

// realpath on both sides, so a symlink into the tree cannot slip past.
const realKey = realpathSync(resolved)
const realRepo = realpathSync(REPO)
const rel = path.relative(realRepo, realKey)
if (!rel.startsWith('..') && !path.isAbsolute(rel)) {
  console.error('')
  console.error('  REFUSED: that .p8 is inside the repository.')
  console.error('  ' + realKey)
  console.error('')
  console.error('  Move it somewhere outside the working tree and run again.')
  console.error('  A key that is never in the directory cannot be committed by accident,')
  console.error('  and this key cannot be un-leaked — it signs into our Apple client.')
  process.exit(2)
}

const pem = readFileSync(realKey, 'utf8')

let result
try {
  result = generateAppleClientSecret({
    teamId: TEAM_ID,
    keyId: KEY_ID,
    clientId: SERVICES_ID,
    privateKeyPem: pem,
    lifetimeSeconds: DEFAULT_LIFETIME_SECONDS,
  })
} catch (e: any) {
  console.error('\n  COULD NOT SIGN: ' + e.message)
  process.exit(1)
}

// ── check it before it is printed, not after it is pasted ───────────────
const check = inspectAppleClientSecret(
  result.token,
  { teamId: TEAM_ID, keyId: KEY_ID, clientId: SERVICES_ID, publicKey: publicKeyFromPrivatePem(pem) },
)

const line = (ok: boolean, label: string, detail?: string) =>
  console.log('  ' + (ok ? 'ok   ' : 'FAIL ') + String(label).padEnd(44) + (detail ?? ''))

console.log('')
console.log('  THE TOKEN CHECKS OUT BEFORE YOU SEE IT')
line(check.header?.alg === 'ES256', 'alg is ES256', String(check.header?.alg))
line(check.header?.kid === KEY_ID, 'kid is the key id', String(check.header?.kid))
line(check.claims?.iss === TEAM_ID, 'iss is the team id', String(check.claims?.iss))
line(check.claims?.sub === SERVICES_ID, 'sub is the Services ID', String(check.claims?.sub))
line(check.claims?.aud === 'https://appleid.apple.com', 'aud is Apple', String(check.claims?.aud))
line(check.signatureValid, 'THE SIGNATURE VERIFIES', 'against the public half of this same .p8')
line(check.ok, 'nothing else is wrong', check.problems.join('; ') || 'clean')

if (!check.ok) {
  console.error('\n  NOT PRINTING A TOKEN THAT DOES NOT CHECK OUT.')
  process.exit(1)
}

const days = Math.round((result.expiresAt.getTime() - result.issuedAt.getTime()) / 86_400_000)
const human = result.expiresAt.toLocaleDateString('en-GB', {
  weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
})

console.log('')
console.log('  ─────────────────────────────────────────────────────────────')
console.log('  PASTE THIS INTO SUPABASE')
console.log('    Authentication → Providers → Apple → Secret Key (for OAuth)')
console.log('    Client IDs:  ' + SERVICES_ID)
console.log('    "Allow users without an email" stays OFF.')
console.log('  ─────────────────────────────────────────────────────────────')
console.log('')
console.log(result.token)
console.log('')
console.log('  ─────────────────────────────────────────────────────────────')
console.log('  IT STOPS WORKING ON ' + human.toUpperCase())
console.log('  (' + days + ' days from now. Apple\'s maximum is six months.)')
console.log('')
console.log('  WHEN IT LAPSES, EVERY APPLE SIGN-IN BREAKS AND NOTHING TELLS US.')
console.log('  No error we see, no alert, no row anywhere — the same shape as')
console.log('  every far-end fault on this project. Regenerate before then by')
console.log('  running this again with the same .p8; the .p8 itself never expires.')
console.log('  ─────────────────────────────────────────────────────────────')
console.log('')
console.log('  This token is a CREDENTIAL. It is printed here and nowhere else —')
console.log('  not written to a file, and it must not go into a report, a draft,')
console.log('  a ticket, a chat or a commit. Anything holding it can sign in as')
console.log('  our Apple client until the date above.')
console.log('')

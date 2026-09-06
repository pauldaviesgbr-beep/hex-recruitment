// RESET THE THRIVE DEMO KITCHEN PASSWORD, AND PROVE IT IN THE SAME RUN.
//
//   npx tsx scripts/reset-apple-review-employer-password.ts            (dry run)
//   npx tsx scripts/reset-apple-review-employer-password.ts --confirm=RESET
//
// ── WHY THIS EXISTS ────────────────────────────────────────────────────────
//
// pauldavies.gbr+applereviewemployer@gmail.com — Thrive Demo Kitchen, the
// EMPLOYER credential a reviewer is meant to sign in with. Its password was
// generated on 1 Sept 2026, printed once to a terminal, and stored nowhere:
// not in .env.local, not in any script, and — as it turned out — not in App
// Store Connect either. `last_sign_in_at` was NULL, so it had never once been
// exercised and nobody had ever found out it was lost.
//
// create-apple-review-employer.ts CANNOT do this. It sets a password only when
// it CREATES the account; on an existing one it prints "password: unchanged".
// Read from that script, not assumed.
//
// ── WHAT IT DOES, AND THE ORDER MATTERS ───────────────────────────────────
//
// Reset, then IMMEDIATELY sign in with the new password against the auth API,
// and print the password only alongside that verdict. There is no window in
// which you hold a credential nobody has tried: the proof is in the same run
// as the change, which is the whole failure being fixed.
//
// signInWithPassword rather than a browser, deliberately: a rate-limited login
// page is indistinguishable on screen from a wrong password, and this project
// has already lost a session to exactly that.
//
// ── THE GUARDS ─────────────────────────────────────────────────────────────
//
// · The account is a CONSTANT — both its id and its email — and the run
//   refuses unless the live row agrees on BOTH. Nothing about the target comes
//   from an argument, so it cannot be pointed at another account by a typo.
// · It refuses to touch an account that owns a candidate_profiles row, which
//   no employer fixture does — a cheap second opinion that this is the account
//   the comments describe.
// · Dry by default. Without --confirm=RESET it reads, reports, and writes
//   nothing.
// · The password is printed ONCE, to your terminal, and is written to no file,
//   no log and no commit. Paste it into App Store Connect in the same sitting.

import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'
import { randomBytes } from 'node:crypto'

const CONFIRM = (process.argv.find(a => a.startsWith('--confirm=')) || '').split('=')[1]
const APPLY = CONFIRM === 'RESET'

const env: Record<string, string> = {}
try {
  for (const line of readFileSync('.env.local', 'utf8').split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/)
    if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '')
  }
} catch { /* fall through */ }

const URL_ = env.NEXT_PUBLIC_SUPABASE_URL
const SERVICE = env.SUPABASE_SERVICE_ROLE_KEY
const ANON = env.NEXT_PUBLIC_SUPABASE_ANON_KEY
if (!URL_ || !SERVICE || !ANON) {
  console.log('SKIP  need NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY and')
  console.log('      NEXT_PUBLIC_SUPABASE_ANON_KEY in .env.local.')
  process.exit(2)
}

// THE TARGET, AS TWO CONSTANTS THAT MUST AGREE WITH THE LIVE ROW.
const UID = 'dfad7ed4-21a7-4d61-b3ea-b784511f9c01'
const EMAIL = 'pauldavies.gbr+applereviewemployer@gmail.com'

const admin = createClient(URL_, SERVICE, { auth: { persistSession: false } })

let bad = 0
const check = (label: string, ok: boolean, detail = '') => {
  if (!ok) bad++
  console.log('  ' + (ok ? 'ok   ' : 'FAIL ') + label.padEnd(54) + detail)
}

async function main(): Promise<number> {
  console.log('')
  console.log('THE ACCOUNT, READ BEFORE ANYTHING IS WRITTEN')

  const { data: got, error: gErr } = await admin.auth.admin.getUserById(UID)
  if (gErr || !got?.user) {
    check('the account exists', false, gErr?.message || 'not found')
    return 1
  }
  const u = got.user
  check('the id and the email agree', u.email === EMAIL, u.email ?? '(none)')
  check('it is email-confirmed', !!u.email_confirmed_at)
  console.log(`       last sign-in: ${u.last_sign_in_at ?? 'NEVER'}`)

  // A SECOND OPINION ON WHICH ACCOUNT THIS IS. An employer fixture owns an
  // employer_profiles row and no candidate_profiles row; a candidate is the
  // other way round. Cheap, and it makes a mis-typed uid fail loudly.
  const { data: prof } = await admin.from('employer_profiles')
    .select('company_name').eq('user_id', UID).maybeSingle()
  const { count: candRows } = await admin.from('candidate_profiles')
    .select('*', { count: 'exact', head: true }).eq('user_id', UID)
  check('it owns an employer profile', !!prof, prof?.company_name ?? 'none')
  check('…and is NOT a candidate account', (candRows || 0) === 0, `${candRows} candidate rows`)

  if (bad) {
    console.log('')
    console.log('refusing to reset — the account is not what this script describes')
    return 1
  }

  if (!APPLY) {
    console.log('')
    console.log('DRY RUN. Nothing was written.')
    console.log('Re-run with --confirm=RESET to set a new password and prove it.')
    console.log('Have App Store Connect open first: the password is printed once.')
    return 0
  }

  // ── THE RESET ────────────────────────────────────────────────────────────
  const password = randomBytes(18).toString('base64url')
  const { error: uErr } = await admin.auth.admin.updateUserById(UID, { password })
  check('the password was reset', !uErr, uErr?.message ?? '')
  if (uErr) return 1

  // ── AND THE PROOF, IN THE SAME RUN ───────────────────────────────────────
  // The auth API, not a login page. If this fails the account is in a state
  // somebody has to look at, and you still need the value to investigate — so
  // it is printed either way, with the verdict attached to it.
  const anon = createClient(URL_!, ANON!, { auth: { persistSession: false } })
  const { data: signed, error: sErr } = await anon.auth.signInWithPassword({ email: EMAIL, password })
  const proven = !sErr && signed.user?.email === EMAIL
  check('IT WAS PROVEN BY A REAL SIGN-IN', proven, sErr?.message ?? (signed.user?.email ?? ''))
  await anon.auth.signOut({ scope: 'local' }).catch(() => {})

  console.log('')
  console.log('='.repeat(66))
  console.log(proven
    ? 'NEW PASSWORD — PROVEN TO WORK. Printed once, stored nowhere.'
    : 'NEW PASSWORD — SET BUT NOT PROVEN. Do NOT paste it anywhere yet.')
  console.log('Paste it into App Store Connect -> App Review Information now,')
  console.log('in this sitting. It is in no file, no log and no commit.')
  console.log('='.repeat(66))
  console.log('')
  console.log(`  email:    ${EMAIL}`)
  console.log(`  password: ${password}`)
  console.log('')
  console.log('Then run: npx tsx scripts/prove-fixture-logins.ts')
  console.log('(add this account to its list once the value lives somewhere it can read)')

  return proven ? 0 : 1
}

main()
  .then(c => { process.exitCode = c })
  .catch(e => { console.error('FAILED:', e.message); process.exitCode = 1 })

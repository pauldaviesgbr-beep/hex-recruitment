// EVERY FIXTURE CREDENTIAL IN .env.local ACTUALLY WORKS.
//
//   npx tsx scripts/prove-fixture-logins.ts
//
// Exit 0 all pass · 1 one or more fail · 2 SKIP (no env).
//
// ── WHY THIS EXISTS ────────────────────────────────────────────────────────
//
// On 6 Sept 2026 a take was blocked at 8pm because the Thrive Demo Kitchen
// password did not work. It had been generated on 1 September, printed once to
// a terminal, and never used — `last_sign_in_at` was NULL. NOBODY HAD EVER
// SIGNED IN AS IT, so nobody had ever found out.
//
// Checking the other fixtures the same evening found the same thing: Demo
// Bistro and Jordan Ellis had never been signed into either. THREE ACCOUNTS
// CREATED FOR A REVIEWER, NONE EVER EXERCISED.
//
// CREATING AN ACCOUNT AND PROVING IT WORKS ARE TWO DIFFERENT ACTS, and only
// the first was done. `protected:prove` asserts these accounts EXIST and are
// confirmed — which is a census, not a credential test. An account can be
// present, confirmed, unbanned and completely unusable.
//
// ── WHAT IT ASKS, AND WHAT IT REFUSES TO ASK ──────────────────────────────
//
// signInWithPassword against the auth API, NEVER a browser: a rate-limited
// login page is indistinguishable on screen from a wrong password, and this
// project has already lost a session to exactly that.
//
// It prints PASS or FAIL and the account's email. IT NEVER PRINTS A PASSWORD,
// A TOKEN, OR ANY PART OF EITHER — the whole point is that a credential can be
// checked without being disclosed.
//
// Not in `npm run verify`: it needs .env.local and the network, and it moves
// last_sign_in_at, which is a write. Run it before a shoot, or after minting
// any fixture credential.

import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'

const env: Record<string, string> = {}
try {
  for (const line of readFileSync('.env.local', 'utf8').split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/)
    if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '')
  }
} catch { /* fall through */ }

const URL_ = env.NEXT_PUBLIC_SUPABASE_URL
const ANON = env.NEXT_PUBLIC_SUPABASE_ANON_KEY
if (!URL_ || !ANON) {
  console.log('SKIP  no Supabase URL / anon key in .env.local.')
  process.exit(2)
}

// THE FIXTURES WHOSE PASSWORD WE ARE SUPPOSED TO HOLD. Demo Kitchen is
// deliberately ABSENT: its password lives only in App Store Connect by design,
// so there is nothing here to check it against and its omission is not an
// oversight. If it is ever moved into the environment, add it here.
const FIXTURES: { email: string; key: string; who: string }[] = [
  { email: 'pauldavies.gbr+candidate@gmail.com', key: 'TEST_ACCOUNT_PASSWORD', who: 'Drive Test — the standing test candidate' },
  { email: 'pauldavies.gbr+employer@gmail.com', key: 'TEST_EMPLOYER_PASSWORD', who: 'Thrive Test Employer' },
  { email: 'pauldavies.gbr+deletiontake@gmail.com', key: 'DELETION_TAKE_PASSWORD', who: 'Thrive Demo Bistro — the deletion take' },
  { email: 'pauldavies.gbr+deletiontakecandidate@gmail.com', key: 'DELETION_TAKE_CANDIDATE_PASSWORD', who: 'Jordan Ellis — the deletion take' },
]

let bad = 0
const check = (label: string, ok: boolean, detail = '') => {
  if (!ok) bad++
  console.log('  ' + (ok ? 'PASS ' : 'FAIL ') + label.padEnd(52) + detail)
}

async function main(): Promise<number> {
  console.log('')
  console.log('FIXTURE LOGINS — asked of the auth API, never a login page')
  console.log('')

  for (const f of FIXTURES) {
    const pass = env[f.key]
    if (!pass) {
      check(f.email, false, `${f.key} is not set`)
      continue
    }
    // A FRESH CLIENT PER ACCOUNT so one session cannot be mistaken for another.
    const anon = createClient(URL_!, ANON!, { auth: { persistSession: false } })
    const { data, error } = await anon.auth.signInWithPassword({ email: f.email, password: pass })
    if (error) {
      // The provider's own words, which distinguish a wrong password from a
      // rate limit — the two states a browser cannot tell apart.
      check(f.email, false, error.message)
      continue
    }
    // ASSERT THE SESSION IS FOR THE ACCOUNT WE ASKED FOR. A session is not a
    // session for the right person until its subject is checked.
    const gotEmail = data.user?.email ?? '(none)'
    check(f.email, gotEmail === f.email, gotEmail === f.email ? f.who : `signed in as ${gotEmail}`)
    await anon.auth.signOut({ scope: 'local' }).catch(() => {})
  }

  console.log('')
  console.log(bad
    ? `${bad} FAILED — a credential that has never been exercised is not a credential`
    : 'every fixture credential in .env.local works')
  return bad ? 1 : 0
}

main()
  .then(c => { process.exitCode = c })
  .catch(e => { console.error('FAILED:', e.message); process.exitCode = 1 })

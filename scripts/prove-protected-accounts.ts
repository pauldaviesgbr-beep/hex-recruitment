// THE CENSUS: THE ACCOUNTS THAT MUST NOT BE DELETED ARE STILL THERE.
//
//   npx tsx --conditions=react-server scripts/prove-protected-accounts.ts
//
// Reads only. It writes nothing and never has.
//
// ── WHAT IT IS FOR ────────────────────────────────────────────────────────
//
// Two accounts survive only because nobody has run the wrong thing:
//
//   the Apple review credential — if it goes, an app update is rejected with
//                                 NO VISIBLE CAUSE months from now
//   the tombstone owner         — if it goes, every archived advert, signed
//                                 contract and anonymised message goes with it
//                                 by CASCADE, silently
//
// NOTHING IN THE DATABASE WOULD RECORD EITHER LOSS. There is no instrument for
// a self-deletion, `is_test` is a label that nothing consults before deleting,
// and a sweep by email pattern is exactly how +demo and +e2e went on 14 Aug
// 2026. This cannot prevent the loss. It makes it impossible to miss.
//
// ── A MISSING ACCOUNT MUST NOT READ AS A PASSING RUN ──────────────────────
//
// The failure is deliberately loud and deliberately different in shape from a
// skip: it names the account, prints what breaks in full, and exits 1. A SKIP
// (exit 2, no credentials) prints the word SKIP and nothing that looks like an
// account. The two cannot be confused at a glance, which is the whole point —
// this project has been caught before reading a silence as an answer.

import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { PROTECTED_ACCOUNTS } from '../lib/protectedAccounts'

const env: Record<string, string> = {}
const envPath = path.join(process.cwd(), '.env.local')
if (existsSync(envPath)) {
  for (const line of readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/)
    if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '')
  }
}
const URL_ = env.NEXT_PUBLIC_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL
const KEY = env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY
if (!URL_ || !KEY) {
  console.log('SKIP  no Supabase service credentials — the census needs the database.')
  console.log('      This is NOT a pass. Nothing was checked.')
  process.exit(2)
}

const admin: SupabaseClient = createClient(URL_, KEY, { auth: { persistSession: false } })

const failures: string[] = []
const check = (label: string, ok: boolean, detail?: string) => {
  if (!ok) failures.push(label)
  console.log('  ' + (ok ? 'ok   ' : 'FAIL ') + label.padEnd(64) + (detail ?? ''))
}

async function main() {
  console.log(`checking ${PROTECTED_ACCOUNTS.length} protected accounts`)
  console.log('')

  // Collected so a missing account can be shouted about AFTER the per-check
  // lines, where it cannot scroll past unnoticed.
  const missing: typeof PROTECTED_ACCOUNTS = []

  for (const acct of PROTECTED_ACCOUNTS) {
    const label = acct.email
    console.log(`── ${label}`)

    // BY ID, NOT BY EMAIL. An account recreated under the same address is a
    // DIFFERENT account: App Store Connect holds a password for the old one,
    // and every row pointing at the old tombstone id would still be orphaned.
    // Looking up by email would report a recreated account as healthy.
    const { data, error } = await admin.auth.admin.getUserById(acct.id)
    const user = data?.user

    if (error || !user) {
      check(`${label} EXISTS`, false, 'GONE')
      missing.push(acct)
      console.log('')
      continue
    }
    check(`${label} exists`, true, acct.id)

    // The address is asserted too: an id that resolves to a DIFFERENT address
    // means somebody edited the account, and for the review credential that is
    // as bad as deletion — the password in App Store Connect no longer matches.
    check('…and still carries the address we expect', user.email === acct.email, user.email)

    if (acct.requires.emailConfirmed) {
      check('…and its email is confirmed, so reap-unconfirmed cannot take it',
        !!user.email_confirmed_at, String(user.email_confirmed_at))
    }

    if (acct.requires.banned) {
      const bannedUntil = (user as any).banned_until
      check('…and it is STILL BANNED, so nobody can authenticate as it',
        !!bannedUntil && new Date(bannedUntil) > new Date(), String(bannedUntil))
    }

    if (acct.requires.candidateProfile) {
      // NOTE: candidate_profiles is keyed on user_id, NOT on id. The table has
      // both columns and joining on the wrong one returns nulls that read
      // exactly like a missing profile.
      const { data: profile } = await admin.from('candidate_profiles')
        .select('full_name').eq('user_id', acct.id).maybeSingle()
      check('…and it still has a candidate profile — an empty login is not a fixture',
        !!profile, profile?.full_name || 'NO PROFILE ROW')
    }

    console.log('')
  }

  // ── THE LOUD PART ───────────────────────────────────────────────────────
  if (missing.length) {
    console.log('════════════════════════════════════════════════════════════════')
    console.log(`  ${missing.length} PROTECTED ACCOUNT(S) NO LONGER EXIST`)
    console.log('════════════════════════════════════════════════════════════════')
    for (const m of missing) {
      console.log('')
      console.log(`  ${m.email}`)
      console.log(`  ${m.id}`)
      console.log('')
      for (const line of m.whatBreaks.match(/.{1,72}(\s|$)/g) || []) {
        console.log('    ' + line.trim())
      }
    }
    console.log('')
    console.log('════════════════════════════════════════════════════════════════')
  }

  console.log('')
  if (failures.length) {
    console.log(`${failures.length} FAILED`)
    for (const f of failures) console.log('  - ' + f)
    process.exit(1)
  }
  console.log('every protected account is present and in the state it needs to be in')
  process.exit(0)
}

main().catch(e => { console.error('threw:', e.message); process.exit(1) })

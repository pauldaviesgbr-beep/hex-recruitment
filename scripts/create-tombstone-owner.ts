// THE TOMBSTONE OWNER — CREATE IT, AND PROVE IT CANNOT BE USED.
//
//   npx tsx --conditions=react-server scripts/create-tombstone-owner.ts
//
// Idempotent: if the account already exists it is found, re-checked and left
// alone. Safe to run again.
//
// ── WHAT IT IS FOR ────────────────────────────────────────────────────────
//
// Some rows must OUTLIVE the person they belong to, and their link to that
// person is a NOT NULL column with a CASCADE constraint behind it:
//
//     job_offers.candidate_id   NOT NULL → auth.users CASCADE   a signed contract
//     messages.sender_id        NOT NULL → auth.users CASCADE   a thread's shape
//     jobs.employer_id          NOT NULL → auth.users CASCADE   an archived advert
//
// They cannot be nulled, so the erasure points them HERE instead — at an
// account that is never deleted. The row survives, and it no longer refers to
// a real person. No schema change, no nullable column, reversible with an
// UPDATE.
//
// ── WHY THIS ACCOUNT IS DANGEROUS, AND WHAT MAKES IT SAFE ─────────────────
//
// RLS grants on `auth.uid() = employer_id` and `auth.uid() = candidate_id`.
// SO ANYONE WHO COULD AUTHENTICATE AS THIS ACCOUNT WOULD OWN EVERY ARCHIVED
// ADVERT AND EVERY HISTORICAL CONTRACT ON THE PLATFORM. "Unlikely" is not
// good enough. Three independent guards, none of which relies on a password
// staying secret:
//
//   1. THE ADDRESS CANNOT RECEIVE MAIL ANYWHERE ON THE INTERNET.
//      `.invalid` is reserved by RFC 2606 and is guaranteed never to be
//      delegated in the DNS root. There is no registry, no MX, and no way to
//      register it. So a password-reset email cannot be delivered to anyone,
//      including us — this is a property of the DNS root rather than of our
//      configuration, which is what makes it unreachable rather than merely
//      unlikely. An address at a domain we own would NOT do: thrivecareer.co.uk
//      forwards hello@, contact@ and support@ into a real inbox, so a reset
//      could be received by whoever controls it.
//
//   2. THE ACCOUNT IS BANNED. `ban_duration` makes Supabase refuse
//      authentication outright, so even a leaked password is useless. This is
//      the guard that does not depend on the address at all.
//
//   3. THE PASSWORD IS RANDOM AND IS NEVER RECORDED. Generated here, used
//      once, discarded. It is not printed, not returned, not stored.
//
// AND ONE GUARD AGAINST OURSELVES: `email_confirm: true`. Without it,
// /api/cron/reap-unconfirmed deletes any account with no `email_confirmed_at`
// after three days — so our own housekeeping would have removed the tombstone
// within a week and silently taken every row pointing at it.
//
// ── WHAT THIS SCRIPT DOES NOT DO ──────────────────────────────────────────
//
// It does not make the account UNDELETABLE. Nothing here refuses a
// `deleteUser` call. That is a separate piece of work, costed in the report,
// and it matters because this is now the third account whose survival depends
// on nobody running the wrong thing.

import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { randomBytes } from 'node:crypto'
import { TOMBSTONE_EMAIL } from '../lib/protectedAccounts'

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
const ANON = env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
if (!URL_ || !KEY || !ANON) {
  console.log('SKIP  no Supabase credentials — this needs the database.')
  process.exit(2)
}

const admin: SupabaseClient = createClient(URL_, KEY, { auth: { persistSession: false } })

let bad = 0
const check = (label: string, ok: boolean, detail?: string) => {
  if (!ok) bad++
  console.log('  ' + (ok ? 'ok   ' : 'FAIL ') + label.padEnd(58) + (detail ?? ''))
}

async function findByEmail(email: string) {
  // listUsers is paginated; the tombstone is one row among a few dozen, so one
  // generous page is enough — but assert we saw the whole list rather than
  // assuming, or "not found" could mean "on page two".
  const { data, error } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 })
  if (error) throw error
  if ((data.users || []).length >= 1000) {
    throw new Error('more than one page of users — this lookup would be unreliable')
  }
  return (data.users || []).find(u => u.email === email) || null
}

async function main() {
  console.log(`tombstone address: ${TOMBSTONE_EMAIL}`)
  console.log('')

  let user = await findByEmail(TOMBSTONE_EMAIL)

  if (user) {
    console.log(`already exists: ${user.id}`)
  } else {
    // A password nobody will ever know. Never printed, never returned.
    const password = randomBytes(48).toString('base64url')
    const { data, error } = await admin.auth.admin.createUser({
      email: TOMBSTONE_EMAIL,
      password,
      // WITHOUT THIS, reap-unconfirmed DELETES IT AFTER THREE DAYS.
      email_confirm: true,
      user_metadata: {
        role: 'system',
        full_name: 'Deleted account',
        tombstone: true,
        note: 'Placeholder owner for rows that outlive a deleted person. Never sign in. Never delete.',
      },
    })
    if (error || !data.user) throw new Error('could not create the tombstone: ' + error?.message)
    user = data.user
    console.log(`created: ${user.id}`)
  }

  // ── BAN IT, EVERY RUN ─────────────────────────────────────────────────
  // Re-applied rather than only set at creation: a ban can be lifted by
  // anybody with the dashboard, and this script is the place that re-asserts
  // the intended state. 100 years.
  const { error: banErr } = await admin.auth.admin.updateUserById(user.id, {
    ban_duration: '876000h',
  })
  check('the ban was applied', !banErr, banErr?.message)

  // ── PROVE IT, RATHER THAN ASSERT IT ───────────────────────────────────
  console.log('')

  const fresh = await admin.auth.admin.getUserById(user.id)
  const bannedUntil = (fresh.data?.user as any)?.banned_until
  check('the account reports a ban in the future', !!bannedUntil && new Date(bannedUntil) > new Date(),
    String(bannedUntil))
  check('its email is confirmed, so reap-unconfirmed will not take it',
    !!fresh.data?.user?.email_confirmed_at, String(fresh.data?.user?.email_confirmed_at))
  check('the address is on the RFC 2606 reserved .invalid TLD',
    (fresh.data?.user?.email || '').endsWith('.invalid'), fresh.data?.user?.email)

  // THE REAL TEST: a sign-in attempt, as anyone on the internet would make it.
  // A KNOWN password is set first so the attempt cannot fail for the boring
  // reason — this must prove the BAN refuses it, not that we guessed wrong.
  const probePassword = randomBytes(48).toString('base64url')
  await admin.auth.admin.updateUserById(user.id, { password: probePassword })
  const anonClient = createClient(URL_!, ANON!, { auth: { persistSession: false } })
  const { data: signIn, error: signInErr } = await anonClient.auth.signInWithPassword({
    email: TOMBSTONE_EMAIL, password: probePassword,
  })
  check('SIGN-IN IS REFUSED EVEN WITH THE CORRECT PASSWORD',
    !signIn?.session && !!signInErr, signInErr?.message || 'A SESSION WAS ISSUED')

  // And leave it on a password nobody holds.
  await admin.auth.admin.updateUserById(user.id, {
    password: randomBytes(48).toString('base64url'),
  })

  console.log('')
  console.log(`TOMBSTONE_USER_ID = '${user.id}'`)
  console.log('')
  console.log(bad ? `${bad} FAILED` : 'the tombstone exists and cannot be signed into')
  process.exit(bad ? 1 : 0)
}

main().catch(e => { console.error('threw:', e.message); process.exit(1) })

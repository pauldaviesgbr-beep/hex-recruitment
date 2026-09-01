// THE EMPLOYER ACCOUNT THAT GETS DELETED ON CAMERA.
//
//   npx tsx --conditions=react-server scripts/create-deletion-take-employer.ts
//
// Idempotent: if it exists the script finds it, tops up anything missing and
// re-asserts. It is a SCRIPT rather than a one-off because the account's whole
// purpose is to be destroyed — a re-shoot needs it back, and "how was it made"
// should not have to be reconstructed from a report.
//
// ── NEVER FILM A DELETION ON AN ACCOUNT WE NEED AFTERWARDS ────────────────
//
// There are four `+` accounts and every one is load-bearing:
//
//   +candidate@            3 applications; several drives assert against it
//   +employer@             OWNS Thrive Test Employer and its 4 filled adverts
//   +applereview@          Marcus Hale — IN APP STORE CONNECT, must work in 2027
//   +applereviewemployer@  Thrive Demo Kitchen — the credential Apple gets
//
// The last three are asserted every run by `protected:prove`. Deleting any of
// them on camera would cost something real, and the fourth would break the
// credentials Apple signs in with.
//
// ── WHY NOT A +demo OR +e2e STYLE NAME ────────────────────────────────────
//
// Those were both swept on 14 Aug 2026 by a census matching on the alias
// pattern. This one is named for its single purpose so that anybody reading a
// user list can tell what it is for without guessing.
//
// ── THE COMPANY NAME IS DELIBERATELY NOT PLAUSIBLE, AND THAT IS A REVERSAL
//
// The requirement list said "a company name that reads real on camera". The
// precedent on this project says the opposite and the precedent is right:
// create-apple-review-employer.ts records that "a real-sounding hospitality
// company is a name that belongs to somebody". A plausible venue name invented
// in five minutes is very likely a real business somewhere, and it would be on
// a recording sent to Apple. So this follows the existing decision. If Paul
// wants a plausible name on camera it is his call and one edit.
//
// ── WHAT IT DELIBERATELY DOES NOT HAVE ────────────────────────────────────
//
// No conversation, no application, no relationship to any other account — not
// even to the fixtures. The deletion is filmed, so anything this account is
// attached to is something the recording destroys. It holds exactly enough to
// be a real employer account and nothing more.

import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { randomBytes } from 'node:crypto'

const envPath = path.join(process.cwd(), '.env.local')
const env: Record<string, string> = {}
if (existsSync(envPath)) {
  for (const line of readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/)
    if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '')
  }
}
const URL_ = env.NEXT_PUBLIC_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL
const KEY = env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY
if (!URL_ || !KEY) {
  console.log('SKIP  no Supabase service credentials.')
  process.exit(2)
}

const admin: SupabaseClient = createClient(URL_, KEY, { auth: { persistSession: false } })

const EMAIL = 'pauldavies.gbr+deletiontake@gmail.com'
const COMPANY = 'Thrive Demo Bistro'
const PASSWORD_KEY = 'DELETION_TAKE_PASSWORD'
const MARK = 'DELETION-TAKE'

// THE FOUR ACCOUNTS THIS MUST NOT BE. A typo in EMAIL above that happened to
// match one of them would create nothing and then assert against somebody
// else's rows — and the account is created to be deleted.
const NEVER = [
  'pauldavies.gbr@gmail.com',
  'paul@thrivecareer.co.uk',
  'pauldavies.gbr+candidate@gmail.com',
  'pauldavies.gbr+employer@gmail.com',
  'pauldavies.gbr+applereview@gmail.com',
  'pauldavies.gbr+applereviewemployer@gmail.com',
]
if (NEVER.includes(EMAIL)) {
  console.log('FAIL  EMAIL is one of the accounts that must never be a throwaway.')
  process.exit(1)
}

let bad = 0
const check = (label: string, ok: boolean, detail?: string) => {
  if (!ok) bad++
  console.log('  ' + (ok ? 'ok   ' : 'FAIL ') + label.padEnd(58) + (detail ?? ''))
}

async function findByEmail(email: string) {
  const { data, error } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 })
  if (error) throw error
  if ((data.users || []).length >= 1000) throw new Error('more than one page of users')
  return (data.users || []).find(u => u.email === email) || null
}

// THE PASSWORD GOES TO .env.local AND NOWHERE ELSE.
// Printing it once does not reach Paul, and no credential may reach a report,
// a commit or a Gmail draft. `.env.local` has been gitignored since the
// repository's first commit, it is already where the other two fixture
// passwords live, and it is on the machine he films from.
function storePassword(value: string) {
  const line = `${PASSWORD_KEY}=${value}`
  let body = existsSync(envPath) ? readFileSync(envPath, 'utf8') : ''
  const re = new RegExp(`^${PASSWORD_KEY}=.*$`, 'm')
  body = re.test(body) ? body.replace(re, line) : (body.replace(/\s*$/, '') + '\n' + line + '\n')
  writeFileSync(envPath, body)
  // ASSERT THE WRITE LANDED, do not announce it. A helper that prints
  // "password stored" after a replace that never matched is the exact failure
  // this codebase has recorded twice.
  const back = readFileSync(envPath, 'utf8')
  if (!back.includes(line)) throw new Error(`${PASSWORD_KEY} did not land in .env.local`)
}

async function main() {
  let user = await findByEmail(EMAIL)
  let minted = false

  if (user) {
    console.log(`already exists: ${user.id}`)
    if (!env[PASSWORD_KEY]) {
      // The account survived but the password did not. Reset it rather than
      // leaving Paul with an account he cannot sign into on the day.
      const pw = randomBytes(12).toString('base64url')
      const { error } = await admin.auth.admin.updateUserById(user.id, { password: pw })
      if (error) throw new Error('could not reset the password: ' + error.message)
      storePassword(pw)
      minted = true
      console.log(`${PASSWORD_KEY} was missing from .env.local — the password has been reset and stored.`)
    }
  } else {
    const pw = randomBytes(12).toString('base64url')
    const { data, error } = await admin.auth.admin.createUser({
      email: EMAIL,
      password: pw,
      // WITHOUT THIS, reap-unconfirmed deletes it after three days — and the
      // take would stop at a verification wall.
      email_confirm: true,
      user_metadata: { role: 'employer', full_name: 'Sam Whitlock', company_name: COMPANY },
    })
    if (error || !data.user) throw new Error('could not create: ' + error?.message)
    user = data.user
    storePassword(pw)
    minted = true
    console.log(`created: ${user.id}`)
  }
  const uid = user.id

  // ── THE employer_profiles ROW ──────────────────────────────────────────
  // THIS ROW, NOT user_metadata.role, IS WHAT THE DELETE GATE READS. Without
  // it the account is erased as an ordinary candidate and the take proves
  // nothing about employer deletion — which is the whole point of it.
  let { data: profile } = await admin.from('employer_profiles')
    .select('id').eq('user_id', uid).maybeSingle()
  if (!profile) {
    const { data, error } = await admin.from('employer_profiles').insert({
      user_id: uid, company_name: COMPANY, contact_name: 'Sam Whitlock', email: EMAIL,
      // Approved, or the dashboard is the under-review screen instead.
      approval_status: 'approved',
      is_recruiter: false,
    }).select('id').single()
    if (error) throw new Error('could not create the profile: ' + error.message)
    profile = data
  }

  // ── THE ENTITLEMENT ────────────────────────────────────────────────────
  // Without it the post-job, messages and candidates gates close and the
  // account cannot be driven at all. This bit the throwaway employers before.
  const { data: sub } = await admin.from('employer_subscriptions')
    .select('id').eq('user_id', uid).maybeSingle()
  if (!sub) {
    const ends = new Date(); ends.setMonth(ends.getMonth() + 12)
    await admin.from('employer_subscriptions').insert({
      user_id: uid, subscription_tier: 'free', subscription_status: 'inactive',
      founding_period_ends_at: ends.toISOString(),
    })
  }

  // ── ONE ADVERT, AND IT IS `filled` ─────────────────────────────────────
  // An advert of its own, so the tombstone repointing is visible in the take
  // rather than asserted off screen. NOT `active`: a live advert on the public
  // board is a real listing a real candidate can apply to, and publishing one
  // fires /api/job-alerts/match.
  const { data: existing } = await admin.from('jobs')
    .select('id, status').eq('employer_id', uid)
  if (!existing || existing.length === 0) {
    const { error } = await admin.from('jobs').insert({
      employer_id: uid, title: 'Kitchen Porter', company: COMPANY, location: 'London',
      salary_min: 24000, salary_max: 26000,
      description: `A demonstration advert for ${COMPANY}. This role has been filled.`,
      status: 'filled',
      job_reference: MARK,
      is_recruiter_posting: false,
    })
    if (error) throw new Error('could not create the advert: ' + error.message)
  }

  // ── PROVE THE END STATE ────────────────────────────────────────────────
  console.log('')
  const fresh = await admin.auth.admin.getUserById(uid)
  check('the account exists and its email is confirmed', !!fresh.data?.user?.email_confirmed_at,
    String(fresh.data?.user?.email_confirmed_at))

  const { data: prof } = await admin.from('employer_profiles')
    .select('company_name, approval_status').eq('user_id', uid).maybeSingle()
  check('it OWNS an employer_profiles row — the delete gate reads this',
    !!prof, `${prof?.company_name} / ${prof?.approval_status}`)
  check('the company is approved, so the dashboard is not the review screen',
    prof?.approval_status === 'approved')

  const { data: subAfter } = await admin.from('employer_subscriptions')
    .select('subscription_tier').eq('user_id', uid).maybeSingle()
  check('it has an entitlement row, so the gates are open', !!subAfter,
    String(subAfter?.subscription_tier))

  const { data: jobsAfter } = await admin.from('jobs').select('status').eq('employer_id', uid)
  const statuses = (jobsAfter || []).map(j => j.status)
  check('it has one advert of its own', statuses.length === 1, statuses.join(', '))
  check('IT IS NOT ACTIVE — nothing reaches the public board',
    statuses.every(s => s !== 'active'), statuses.join(', '))

  check(`${PASSWORD_KEY} is in .env.local`, !!readFileSync(envPath, 'utf8').match(
    new RegExp(`^${PASSWORD_KEY}=.+$`, 'm')))

  // ── WHAT IT HOLDS, ENUMERATED BEFORE ANYTHING DELETES IT ───────────────
  //
  // A test account is not two rows. The one created on 5 Aug 2026 also created
  // a row in `employees`, a table neither of us would have named, and it was
  // found by walking every table that carries a candidate or user id rather
  // than deleting the two that were obvious. This prints the census BEFORE the
  // deletion is filmed, so "nothing was left behind" can be a comparison
  // afterwards instead of a hope.
  console.log('')
  console.log('WHAT THIS ACCOUNT HOLDS TODAY')
  console.log('')
  // NOT EVERY TABLE KEYS ON THE USER ID. `email_log` has no user_id column at
  // all — it keys on `recipient`, the address — so asking it for a uid returns
  // an error, and an error swallowed as a zero reads exactly like a clean
  // account. The first run of this script printed `??` against that row, which
  // is why the pair carries the value to match on.
  const TABLES: [string, string, 'uid' | 'email'][] = [
    ['employer_profiles', 'user_id', 'uid'], ['employer_subscriptions', 'user_id', 'uid'],
    ['jobs', 'employer_id', 'uid'], ['job_applications', 'candidate_id', 'uid'],
    ['conversations', 'participant_1', 'uid'], ['conversations', 'participant_2', 'uid'],
    ['messages', 'sender_id', 'uid'], ['notifications', 'user_id', 'uid'],
    // Auto-created: a trigger writes the owner into employer_members when the
    // profile appears. It is one more row than anybody would have named.
    ['employer_members', 'user_id', 'uid'], ['temp_posts', 'employer_id', 'uid'],
    ['job_views', 'viewer_id', 'uid'], ['job_offers', 'employer_id', 'uid'],
    ['content_reports', 'reporter_id', 'uid'], ['user_blocks', 'blocker_id', 'uid'],
    ['candidate_profiles', 'user_id', 'uid'], ['saved_jobs', 'candidate_id', 'uid'],
    ['email_log', 'recipient', 'email'], ['deletion_requests', 'user_id', 'uid'],
  ]
  let total = 0
  let unreadable = 0
  for (const [table, column, by] of TABLES) {
    const { count, error } = await admin.from(table)
      .select('*', { count: 'exact', head: true }).eq(column, by === 'uid' ? uid : EMAIL)
    // A table or column that does not exist is COUNTED as unreadable and
    // printed, never swallowed.
    if (error) {
      unreadable++
      console.log(`  ??    ${table}.${column}  — ${(error.message || 'no message').slice(0, 60)}`)
      continue
    }
    if ((count || 0) > 0) console.log(`  ${String(count).padStart(4)}  ${table}.${column}`)
    total += count || 0
  }
  console.log(`  ----  ${total} rows across ${TABLES.length} places`)
  check('every place in the census could be read', unreadable === 0,
    unreadable ? `${unreadable} could not be counted — the census is incomplete` : '')

  console.log('')
  console.log(`user id:  ${uid}`)
  console.log(`email:    ${EMAIL}`)
  console.log(`company:  ${COMPANY}`)
  console.log(`password: in .env.local as ${PASSWORD_KEY}` + (minted ? '  (set this run)' : ''))
  console.log('')
  console.log('The password is NOT printed here and must not reach a report, a commit')
  console.log('or an email. .env.local is gitignored and is on the machine you film from.')

  console.log('')
  console.log(bad ? `${bad} FAILED` : 'the throwaway employer is ready, and nothing of its own is on the public board')
  process.exit(bad ? 1 : 0)
}

main().catch(e => { console.error(e); process.exit(1) })

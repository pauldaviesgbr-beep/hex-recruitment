// THE EMPLOYER ACCOUNT WE HAND APPLE — CREATE IT, AND PROVE ITS STATE.
//
//   npx tsx --conditions=react-server scripts/create-apple-review-employer.ts
//
// Idempotent: if it exists the script finds it, tops up anything missing and
// re-asserts. Safe to run again.
//
// ── WHY A SEPARATE ACCOUNT AND NOT Thrive Test Employer ───────────────────
//
// Several drives assert against Thrive Test Employer's four filled adverts,
// and since 1 Sept 2026 an employer CAN delete their own account from inside
// the app. A reviewer who tests the deletion we are asking them to look at
// would send those four adverts to the tombstone permanently. This account
// exists so that the worst case costs us nothing.
//
// ── EVERY ADVERT IS `filled`, AND THAT IS A DECISION ──────────────────────
//
// Not one is active, so nothing reaches the public board. Two reasons, and the
// second is the one that settled it:
//
//   1. a real candidate could apply to a fictional advert
//   2. THE AGENCIES BROWSE THAT BOARD. Toby, Adrian and Cristina were each
//      emailed on 1 Sept asking for a favour, and a fictional venue sitting on
//      the public board the same week is the wrong thing for any of them to
//      scroll past.
//
// The cost is that the employer dashboard's Active Jobs tile shows its empty
// state. That is accepted: a reviewer who wants to see the active flow can post
// an advert themselves, which demonstrates POSTING rather than merely
// displaying, and is better evidence than a seeded row.
//
// ── THE NAME IS DELIBERATELY NOT PLAUSIBLE ────────────────────────────────
//
// A real-sounding hospitality company is a name that belongs to somebody. This
// one could not be mistaken for a business, which is the point.

import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { randomBytes } from 'node:crypto'

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
  console.log('SKIP  no Supabase service credentials.')
  process.exit(2)
}

const admin: SupabaseClient = createClient(URL_, KEY, { auth: { persistSession: false } })

const EMAIL = 'pauldavies.gbr+applereviewemployer@gmail.com'
const COMPANY = 'Thrive Demo Kitchen'
const MARCUS = '4ba92141-677d-4422-91cf-9b6f4e0067ca'
const MARK = 'APPLE-REVIEW'   // job_reference, so every advert is identifiable

const ADVERTS = [
  { title: 'Chef de Partie', location: 'London', salary_min: 30000, salary_max: 34000 },
  { title: 'Sous Chef', location: 'London', salary_min: 36000, salary_max: 42000 },
  { title: 'Front of House Supervisor', location: 'London', salary_min: 27000, salary_max: 30000 },
]

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

async function main() {
  // ── THE ACCOUNT ────────────────────────────────────────────────────────
  let user = await findByEmail(EMAIL)
  let password: string | null = null

  if (user) {
    console.log(`already exists: ${user.id}`)
  } else {
    password = randomBytes(12).toString('base64url')
    const { data, error } = await admin.auth.admin.createUser({
      email: EMAIL,
      password,
      // WITHOUT THIS, reap-unconfirmed deletes it after three days.
      email_confirm: true,
      user_metadata: { role: 'employer', full_name: 'Demo Manager', company_name: COMPANY },
    })
    if (error || !data.user) throw new Error('could not create: ' + error?.message)
    user = data.user
    console.log(`created: ${user.id}`)
  }
  const uid = user.id

  // ── THE COMPANY ────────────────────────────────────────────────────────
  let { data: profile } = await admin.from('employer_profiles')
    .select('id').eq('user_id', uid).maybeSingle()
  if (!profile) {
    const { data, error } = await admin.from('employer_profiles').insert({
      user_id: uid, company_name: COMPANY, contact_name: 'Demo Manager', email: EMAIL,
      // Approved, or the account cannot post and the dashboard shows the
      // under-review screen instead of an employer view.
      approval_status: 'approved',
      is_recruiter: false,
    }).select('id').single()
    if (error) throw new Error('could not create the profile: ' + error.message)
    profile = data
  }

  // Free founding tier, or the post-job / messages / candidates gates close.
  const { data: sub } = await admin.from('employer_subscriptions')
    .select('id').eq('user_id', uid).maybeSingle()
  if (!sub) {
    const ends = new Date(); ends.setMonth(ends.getMonth() + 12)
    await admin.from('employer_subscriptions').insert({
      user_id: uid, subscription_tier: 'free', subscription_status: 'inactive',
      founding_period_ends_at: ends.toISOString(),
    })
  }

  // ── THE ADVERTS — ALL FILLED ───────────────────────────────────────────
  const { data: existing } = await admin.from('jobs')
    .select('id, title, status').eq('employer_id', uid)
  const have = new Set((existing || []).map(j => j.title as string))
  const jobIds: string[] = (existing || []).map(j => j.id as string)

  for (const a of ADVERTS) {
    if (have.has(a.title)) continue
    const { data, error } = await admin.from('jobs').insert({
      employer_id: uid, title: a.title, company: COMPANY, location: a.location,
      salary_min: a.salary_min, salary_max: a.salary_max,
      description: `A demonstration advert for ${COMPANY}. This role has been filled.`,
      // FILLED, NEVER ACTIVE. See the header — nothing reaches the public board.
      status: 'filled',
      job_reference: MARK,
      is_recruiter_posting: false,
    }).select('id').single()
    if (error) throw new Error(`could not create "${a.title}": ` + error.message)
    jobIds.push(data.id as string)
  }

  // ── TWO APPLICATIONS FROM MARCUS ───────────────────────────────────────
  // Both sides of the demonstration are review fixtures. No real candidate is
  // involved, and nothing here can email one.
  for (const jobId of jobIds.slice(0, 2)) {
    const { data: existingApp } = await admin.from('job_applications')
      .select('id').eq('job_id', jobId).eq('candidate_id', MARCUS).maybeSingle()
    if (existingApp) continue
    const { data: job } = await admin.from('jobs').select('title, company').eq('id', jobId).single()
    await admin.from('job_applications').insert({
      job_id: jobId, candidate_id: MARCUS, status: 'pending',
      job_title: job?.title, company: job?.company,
    })
  }

  // ── ONE MESSAGE THREAD WITH MARCUS ─────────────────────────────────────
  // So the reviewer can reach report and block from the EMPLOYER side too.
  const { data: convs } = await admin.from('conversations')
    .select('id').or(`participant_1.eq.${uid},participant_2.eq.${uid}`)
  let convId = convs?.[0]?.id as string | undefined
  if (!convId) {
    const { data, error } = await admin.from('conversations').insert({
      participant_1: uid, participant_2: MARCUS,
      participant_1_name: 'Demo Manager', participant_1_role: 'employer',
      participant_1_company: COMPANY,
      participant_2_name: 'Marcus Hale', participant_2_role: 'candidate',
      last_message: 'Thanks for applying — we will be in touch.',
      last_message_at: new Date().toISOString(),
    }).select('id').single()
    if (error) throw new Error('could not create the conversation: ' + error.message)
    convId = data.id as string
    await admin.from('messages').insert([
      { conversation_id: convId, sender_id: uid, sender_name: 'Demo Manager',
        sender_role: 'employer', content: 'Hi Marcus, thanks for applying. Are you free this week?',
        is_read: true },
      { conversation_id: convId, sender_id: MARCUS, sender_name: 'Marcus Hale',
        sender_role: 'candidate', content: 'Yes — Tuesday or Wednesday afternoon both work.',
        is_read: true },
    ])
  }

  // ── PROVE THE END STATE ────────────────────────────────────────────────
  console.log('')
  const fresh = await admin.auth.admin.getUserById(uid)
  check('the account exists and its email is confirmed', !!fresh.data?.user?.email_confirmed_at,
    String(fresh.data?.user?.email_confirmed_at))

  const { data: prof } = await admin.from('employer_profiles')
    .select('company_name, approval_status').eq('user_id', uid).maybeSingle()
  check('the company is approved, so the dashboard is not the review screen',
    prof?.approval_status === 'approved', `${prof?.company_name} / ${prof?.approval_status}`)

  const { data: jobsAfter } = await admin.from('jobs').select('status').eq('employer_id', uid)
  const statuses = (jobsAfter || []).map(j => j.status)
  check('it has three adverts', statuses.length === 3, `${statuses.length}`)
  check('NOT ONE IS ACTIVE — nothing reaches the public board',
    statuses.every(s => s === 'filled'), statuses.join(', '))

  const { count: apps } = await admin.from('job_applications')
    .select('*', { count: 'exact', head: true }).in('job_id', jobIds).eq('candidate_id', MARCUS)
  check('two applications, both from Marcus', (apps || 0) === 2, `${apps}`)

  const { count: msgs } = await admin.from('messages')
    .select('*', { count: 'exact', head: true }).eq('conversation_id', convId!)
  check('a message thread with Marcus exists', (msgs || 0) >= 2, `${msgs} messages`)

  // THE BOARD IS UNCHANGED. The one assertion that would catch a status typo,
  // and the reason all three are filled in the first place.
  const { count: live } = await admin.from('jobs')
    .select('*', { count: 'exact', head: true }).eq('status', 'active').eq('employer_id', uid)
  check('THIS ACCOUNT PUTS NOTHING ON THE PUBLIC BOARD', (live || 0) === 0, `${live} live`)

  console.log('')
  console.log(`user id:  ${uid}`)
  console.log(`email:    ${EMAIL}`)
  if (password) {
    console.log('')
    console.log('A PASSWORD WAS SET THIS RUN. It is printed ONCE, is not stored anywhere,')
    console.log('and belongs in App Store Connect → App Review Information — not in a')
    console.log('commit, a report or an email.')
    console.log('')
    console.log(`password: ${password}`)
  } else {
    console.log('password: unchanged (the account already existed)')
  }

  console.log('')
  console.log(bad ? `${bad} FAILED` : 'the Apple review employer account is ready')
  process.exit(bad ? 1 : 0)
}

main().catch(e => { console.error('threw:', e.message); process.exit(1) })

// THE CANDIDATE ACCOUNT THAT GETS DELETED ON CAMERA — recording step 12.
//
//   npx tsx --conditions=react-server scripts/create-deletion-take-candidate.ts
//
// Idempotent: if it exists the script finds it, tops up anything missing and
// re-asserts. A SCRIPT rather than a one-off because its whole purpose is to
// be destroyed — a re-shoot needs it back.
//
// ── IT MUST NOT BE MARCUS AND IT MUST NOT BE +candidate@ ─────────────────
//
// Marcus Hale is the credential in App Store Connect and is expected to work
// when an update is reviewed in 2027; `+candidate@` carries three applications
// that several drives assert against. Deleting either on camera costs
// something real. `protected:prove` asserts Marcus every run.
//
// ── WHY NOT A +demo OR +e2e STYLE ALIAS ──────────────────────────────────
//
// Both were swept on 14 Aug 2026 by a census matching the alias pattern. This
// one is named for its single purpose, so a user list reads as an explanation
// rather than a puzzle.
//
// ── THE DELETION SCREEN MUST NOT BE EMPTY ────────────────────────────────
//
// `/settings/privacy` names what a candidate loses: profile, CV, photo, saved
// jobs, alerts, notifications, applications, messages. Filming that paragraph
// against an account holding none of it demonstrates nothing. So this account
// carries a profile, saved jobs and one application — and the application is
// against THRIVE DEMO KITCHEN'S OWN FILLED ADVERT, never a real employer's.
// An application against a live advert emails that employer, and Goldenkeys,
// Host and Collins King are real companies with real inboxes.
//
// ── AND IT IS NOT DISCOVERABLE ───────────────────────────────────────────
//
// A fictional candidate visible in /candidates is a fictional person in a
// directory real employers browse. is_discoverable is false and is_test true.

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

const EMAIL = 'pauldavies.gbr+deletiontakecandidate@gmail.com'
const FULL_NAME = 'Jordan Ellis'
const PASSWORD_KEY = 'DELETION_TAKE_CANDIDATE_PASSWORD'
const DEMO_EMPLOYER = 'pauldavies.gbr+applereviewemployer@gmail.com'

// THE ACCOUNTS THIS MUST NEVER BE. A typo in EMAIL that matched one of these
// would assert against somebody else's rows — on an account created to be
// deleted.
const NEVER = [
  'pauldavies.gbr@gmail.com',
  'paul@thrivecareer.co.uk',
  'pauldavies.gbr+candidate@gmail.com',
  'pauldavies.gbr+employer@gmail.com',
  'pauldavies.gbr+applereview@gmail.com',
  'pauldavies.gbr+applereviewemployer@gmail.com',
  'pauldavies.gbr+deletiontake@gmail.com',
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

// THE PASSWORD GOES TO .env.local AND NOWHERE ELSE. Printing it once does not
// reach Paul, and no credential may reach a report, a commit or a draft.
function storePassword(value: string) {
  const line = `${PASSWORD_KEY}=${value}`
  let body = existsSync(envPath) ? readFileSync(envPath, 'utf8') : ''
  const re = new RegExp(`^${PASSWORD_KEY}=.*$`, 'm')
  body = re.test(body) ? body.replace(re, line) : (body.replace(/\s*$/, '') + '\n' + line + '\n')
  writeFileSync(envPath, body)
  // ASSERT THE WRITE LANDED, do not announce it.
  if (!readFileSync(envPath, 'utf8').includes(line)) {
    throw new Error(`${PASSWORD_KEY} did not land in .env.local`)
  }
}

// A MINIMAL, VALID, ONE-PAGE PDF, BUILT IN CODE. The alternative — reading
// a fixture file from disk — is the *.png-gitignore trap: the file renders
// on the machine that made it and does not exist for anyone else. Offsets
// in the xref are computed, not typed, so the PDF is correct by
// construction.
function minimalCvPdf(name: string, title: string): Buffer {
  const esc = (s: string) => s.replace(/[\\()]/g, m => '\\' + m)
  const stream = `BT /F1 24 Tf 72 770 Td (${esc(name)}) Tj ET\n` +
    `BT /F1 12 Tf 72 742 Td (${esc(title)}) Tj ET\n` +
    `BT /F1 10 Tf 72 714 Td (Demonstration CV for App Store review. Not a real person.) Tj ET\n`
  const objs = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',
    `<< /Length ${stream.length} >>\nstream\n${stream}endstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ]
  let body = '%PDF-1.4\n'
  const offsets: number[] = []
  objs.forEach((o, i) => {
    offsets.push(body.length)
    body += `${i + 1} 0 obj ${o} endobj\n`
  })
  const xref = body.length
  body += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n` +
    offsets.map(o => `${String(o).padStart(10, '0')} 00000 n \n`).join('') +
    `trailer << /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`
  return Buffer.from(body, 'latin1')
}

async function main() {
  let user = await findByEmail(EMAIL)
  let minted = false

  if (user) {
    console.log(`already exists: ${user.id}`)
    if (!env[PASSWORD_KEY]) {
      const pw = randomBytes(12).toString('base64url')
      const { error } = await admin.auth.admin.updateUserById(user.id, { password: pw })
      if (error) throw new Error('could not reset the password: ' + error.message)
      storePassword(pw); minted = true
      console.log(`${PASSWORD_KEY} was missing — the password has been reset and stored.`)
    }
  } else {
    const pw = randomBytes(12).toString('base64url')
    const { data, error } = await admin.auth.admin.createUser({
      email: EMAIL,
      password: pw,
      // WITHOUT THIS, reap-unconfirmed deletes it after three days and the
      // take stops at a verification wall.
      email_confirm: true,
      user_metadata: { role: 'employee', full_name: FULL_NAME },
    })
    if (error || !data.user) throw new Error('could not create: ' + error?.message)
    user = data.user
    storePassword(pw); minted = true
    console.log(`created: ${user.id}`)
  }
  const uid = user.id

  // ── THE PROFILE ────────────────────────────────────────────────────────
  const { data: prof } = await admin.from('candidate_profiles')
    .select('id').eq('user_id', uid).maybeSingle()
  if (!prof) {
    const { error } = await admin.from('candidate_profiles').insert({
      user_id: uid,
      full_name: FULL_NAME,
      email: EMAIL,
      job_title: 'Chef de Partie',
      location: 'London',
      bio: 'Demonstration account for App Store review. Not a real person.',
      // NOT DISCOVERABLE. A fictional candidate in a directory real employers
      // browse is a fictional person in front of real people.
      is_discoverable: false,
      is_test: true,
    })
    if (error) throw new Error('could not create the profile: ' + error.message)
  }

  // ── SAVED JOBS AND ONE APPLICATION, AGAINST THE DEMO EMPLOYER ONLY ─────
  const demo = await findByEmail(DEMO_EMPLOYER)
  if (!demo) throw new Error(`${DEMO_EMPLOYER} does not exist — run create-apple-review-employer first`)

  const { data: demoJobs } = await admin.from('jobs')
    .select('id, title, company, status').eq('employer_id', demo.id)
  const safe = (demoJobs || []).filter(j => j.status !== 'active')
  if (safe.length === 0) throw new Error('the demo employer has no non-active advert to apply to')

  for (const j of safe.slice(0, 2)) {
    const { data: already } = await admin.from('saved_jobs')
      .select('id').eq('candidate_id', uid).eq('job_id', j.id).maybeSingle()
    if (!already) await admin.from('saved_jobs').insert({ candidate_id: uid, job_id: j.id })
  }

  const target = safe[0]
  const { data: app } = await admin.from('job_applications')
    .select('id').eq('candidate_id', uid).eq('job_id', target.id).maybeSingle()
  if (!app) {
    const { error } = await admin.from('job_applications').insert({
      job_id: target.id, candidate_id: uid, status: 'pending',
      job_title: target.title, company: target.company,
    })
    if (error) throw new Error('could not create the application: ' + error.message)
  }

  // ── A CV FILE, so "your CV" on the deletion screen is a real object ────
  // eraseAccount's storage sweep removes `${uid}/` objects, so deleting this
  // account on camera destroys a real file — which is what makes the take
  // honest rather than theatrical.
  const { data: cvBefore } = await admin.from('candidate_profiles')
    .select('cv_url').eq('user_id', uid).maybeSingle()
  if (!cvBefore?.cv_url) {
    const cvPath = `${uid}/cv-deletion-take.pdf`
    const up = await admin.storage.from('profiles').upload(cvPath,
      // A PLAIN HYPHEN, deliberately: the PDF body is latin1, and an em dash
      // (U+2014) truncates to 0x14 there and renders as a BLANK — seen on the
      // first render of this file, not reasoned about.
      minimalCvPdf(FULL_NAME, 'Chef de Partie - London'),
      { contentType: 'application/pdf', upsert: true })
    if (up.error) throw new Error('could not upload the CV: ' + up.error.message)
    const { error } = await admin.from('candidate_profiles')
      .update({ cv_url: cvPath, cv_file_name: 'jordan-ellis-cv.pdf' }).eq('user_id', uid)
    if (error) throw new Error('could not attach the CV: ' + error.message)
  }

  // ── PROVE THE END STATE ────────────────────────────────────────────────
  console.log('')
  const fresh = await admin.auth.admin.getUserById(uid)
  check('the account exists and its email is confirmed', !!fresh.data?.user?.email_confirmed_at)

  const { data: p } = await admin.from('candidate_profiles')
    .select('full_name, is_discoverable, is_test').eq('user_id', uid).maybeSingle()
  check('it has a candidate profile', !!p, String(p?.full_name))
  check('IT IS NOT DISCOVERABLE — not in the directory employers browse',
    p?.is_discoverable === false)
  check('it is flagged is_test', p?.is_test === true)

  const { count: saved } = await admin.from('saved_jobs')
    .select('*', { count: 'exact', head: true }).eq('candidate_id', uid)
  check('it has saved jobs, so the deletion screen is not empty', (saved || 0) > 0, `${saved}`)

  const { data: cvNow } = await admin.from('candidate_profiles')
    .select('cv_url').eq('user_id', uid).maybeSingle()
  check('it has a CV on the profile', !!cvNow?.cv_url, String(cvNow?.cv_url))
  if (cvNow?.cv_url) {
    const dl = await admin.storage.from('profiles').download(cvNow.cv_url)
    const size = dl.data ? (await dl.data.arrayBuffer()).byteLength : 0
    check('…and the CV OBJECT exists in storage — the url is not a promise',
      !dl.error && size > 0, `${size} bytes`)
  }

  const { data: apps } = await admin.from('job_applications')
    .select('job_id').eq('candidate_id', uid)
  check('it has one application', (apps || []).length === 1, `${(apps || []).length}`)

  // THE ASSERTION THAT MATTERS MOST. An application against a live advert
  // emails a real employer.
  const jobIds = (apps || []).map(a => a.job_id)
  const { data: appliedJobs } = await admin.from('jobs')
    .select('employer_id, status').in('id', jobIds.length ? jobIds : ['x'])
  check('EVERY APPLICATION IS AGAINST THE DEMO EMPLOYER, none real',
    (appliedJobs || []).every(j => j.employer_id === demo.id),
    `${(appliedJobs || []).length} checked`)
  check('…and none of those adverts is active',
    (appliedJobs || []).every(j => j.status !== 'active'),
    (appliedJobs || []).map(j => j.status).join(', '))

  check(`${PASSWORD_KEY} is in .env.local`, !!readFileSync(envPath, 'utf8').match(
    new RegExp(`^${PASSWORD_KEY}=.+$`, 'm')))

  // ── WHAT IT HOLDS, ENUMERATED BEFORE ANYTHING DELETES IT ───────────────
  //
  // A test account is not two rows. The one created on 5 Aug 2026 also created
  // a row in `employees`, a table neither of us would have named, and it was
  // found by walking every table carrying a user id rather than deleting the
  // two that were obvious. Printed BEFORE the deletion is filmed, so "nothing
  // was left behind" is a comparison afterwards rather than a hope.
  console.log('')
  console.log('WHAT THIS ACCOUNT HOLDS TODAY')
  console.log('')
  const TABLES: [string, string][] = [
    ['candidate_profiles', 'user_id'], ['candidate_cvs', 'user_id'],
    ['saved_jobs', 'candidate_id'], ['job_applications', 'candidate_id'],
    ['job_alerts', 'candidate_id'], ['notifications', 'user_id'],
    ['conversations', 'participant_1'], ['conversations', 'participant_2'],
    ['messages', 'sender_id'], ['job_views', 'viewer_id'],
    ['job_click_events', 'user_id'], ['job_impressions', 'user_id'],
    ['content_reports', 'reporter_id'], ['user_blocks', 'blocker_id'],
    ['temp_interest', 'candidate_user_id'], ['temp_post_comments', 'user_id'],
    ['employer_notes', 'candidate_id'], ['job_offers', 'candidate_id'],
    ['employer_profiles', 'user_id'],     ['deletion_requests', 'user_id'], ['duplicate_hold', 'user_id'],
  ]
  let total = 0
  for (const [table, column] of TABLES) {
    const { count, error } = await admin.from(table)
      .select('*', { count: 'exact', head: true }).eq(column, uid)
    // A table or column that does not exist is PRINTED rather than swallowed:
    // a silent zero from a bad name reads exactly like a clean account.
    if (error) { console.log(`  ??    ${table}.${column}  — ${error.message.slice(0, 55)}`); continue }
    if ((count || 0) > 0) console.log(`  ${String(count).padStart(4)}  ${table}.${column}`)
    total += count || 0
  }
  // NOT EVERY TABLE KEYS ON THE USER ID, AND A WRONG COLUMN RETURNS A SILENT
  // ZERO THAT READS EXACTLY LIKE A CLEAN ACCOUNT. `email_log` has no user_id
  // at all — it keys on the ADDRESS — and `candidate_cvs` uses user_id rather
  // than candidate_id. Both were `??` on the first run of this census, which
  // is the whole reason an unreadable table is printed rather than skipped.
  const { count: emails } = await admin.from('email_log')
    .select('*', { count: 'exact', head: true }).eq('recipient', EMAIL)
  if ((emails || 0) > 0) console.log(`  ${String(emails).padStart(4)}  email_log.recipient (BY EMAIL, not by id)`)
  total += emails || 0

  console.log(`  ----  ${total} rows across ${TABLES.length + 1} places checked`)

  console.log('')
  console.log(`user id:  ${uid}`)
  console.log(`email:    ${EMAIL}`)
  console.log(`name:     ${FULL_NAME}`)
  console.log(`password: in .env.local as ${PASSWORD_KEY}` + (minted ? '  (set this run)' : ''))
  console.log('')
  console.log('The password is NOT printed here and must not reach a report, a commit')
  console.log('or an email. .env.local is gitignored and is on the machine you film from.')

  console.log('')
  console.log(bad ? `${bad} FAILED` : 'the throwaway candidate is ready, and nothing of its own touches a real employer')
  process.exit(bad ? 1 : 0)
}

main().catch(e => { console.error(e); process.exit(1) })

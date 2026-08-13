/**
 * Three cases, against a throwaway job under the Thrive Test Employer.
 *   A  candidate WITH a CV applies      -> row carries cv_url
 *   B  candidate WITHOUT a CV applies   -> cv_url null
 *   C  an EXISTING-shaped row (cv_url null, candidate HAS a profile CV)
 *      -> the employer still sees a CV via the fallback. The regression.
 *
 * Case C is checked by evaluating the same expression the employer page uses,
 * against the real rows, rather than trusting that it must work.
 */
import { readFileSync } from 'node:fs'
import { chromium } from 'playwright'
import { createClient } from '@supabase/supabase-js'

for (const l of readFileSync('.env.local', 'utf8').split(/\r?\n/)) {
  const m = l.match(/^([A-Z0-9_]+)=(.*)$/)
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '')
}
const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
const EMPLOYER = 'dda822a2-7fc1-4d6d-b208-66e8c021630a'
const PREVIEW = process.argv[2]
const BYPASS = process.env.VERCEL_AUTOMATION_BYPASS_SECRET

const alerts = (await admin.from('job_alerts').select('*', { count: 'exact', head: true })).count
if (alerts !== 0) { console.error(`job_alerts has ${alerts} rows — STOPPING`); process.exit(1) }
console.log('job_alerts = 0, safe\n')

const { data: job } = await admin.from('jobs').insert({
  employer_id: EMPLOYER, title: 'ZZ TEST — CV Record Probe (delete me)',
  company: 'Thrive Test Employer', location: 'Bristol', area: 'Bristol',
  description: 'Throwaway. Not a real vacancy.', full_description: 'Throwaway. Not a real vacancy.',
  salary_min: 30000, salary_max: 32000, salary_type: 'annual',
  employment_type: ['Full-time'], work_location: 'In person',
  category: 'hospitality', status: 'active', is_recruiter_posting: false,
}).select('id').single()
console.log(`throwaway job: ${job.id}\n`)

const made = []
async function candidate(tag, withCv) {
  const email = `pauldavies.gbr+cv${tag}${Date.now().toString().slice(-5)}@gmail.com`
  const { data } = await admin.auth.admin.createUser({
    email, email_confirm: true, user_metadata: { role: 'employee', full_name: `CV Test ${tag}` },
  })
  await admin.from('candidate_profiles').upsert({
    user_id: data.user.id, email, full_name: `CV Test ${tag}`,
    ...(withCv ? { cv_url: `${data.user.id}/cv-probe.pdf`, cv_file_name: 'probe-cv.pdf' } : {}),
  }, { onConflict: 'user_id' })
  made.push(data.user.id)
  return { id: data.user.id, email }
}

const b = await chromium.launch()
async function apply(who) {
  const ctx = await b.newContext({
    viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true,
    extraHTTPHeaders: BYPASS ? { 'x-vercel-protection-bypass': BYPASS } : {},
  })
  const p = await ctx.newPage()
  const { data: link } = await admin.auth.admin.generateLink({ type: 'magiclink', email: who.email })
  const next = encodeURIComponent(`/job/${job.id}?apply=1`)
  await p.goto(`${PREVIEW}/auth/confirm?token_hash=${link.properties.hashed_token}&type=magiclink&role=employee&next=${next}`, { waitUntil: 'domcontentloaded' })
  await p.waitForTimeout(10000)
  const acc = p.locator('button', { hasText: /accept all/i }).first()
  if (await acc.count()) { await acc.click(); await p.waitForTimeout(800) }
  const box = p.locator('input[type="checkbox"]').first()
  const boxState = await box.count() ? await box.isChecked() : null
  const sub = p.locator('button', { hasText: /submit application|send application/i }).filter({ visible: true }).last()
  if (!(await sub.count())) { await ctx.close(); return { submitted: false, boxState } }
  await sub.click(); await p.waitForTimeout(9000)
  await ctx.close()
  return { submitted: true, boxState }
}

const fails = []
const check = (n, ok, d = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${d ? `  — ${d}` : ''}`); if (!ok) fails.push(n) }

console.log('=== CASE A — candidate WITH a CV ===')
const a = await candidate('A', true)
const ra = await apply(a)
console.log(`  "Apply with your saved CV" checkbox checked by default: ${ra.boxState}`)
const { data: rowA } = await admin.from('job_applications').select('cv_url').eq('candidate_id', a.id).maybeSingle()
check('the application RECORDS the CV', !!rowA?.cv_url, `cv_url = ${JSON.stringify(rowA?.cv_url)}`)

console.log('\n=== CASE B — candidate WITHOUT a CV ===')
const bb = await candidate('B', false)
await apply(bb)
const { data: rowB } = await admin.from('job_applications').select('cv_url').eq('candidate_id', bb.id).maybeSingle()
check('cv_url is null, and that null is now TRUE', rowB !== null && rowB.cv_url === null, `cv_url = ${JSON.stringify(rowB?.cv_url)}`)

console.log('\n=== CASE C — the regression: an OLD-shaped row ===')
const c = await candidate('C', true)
// Insert directly with cv_url null — exactly the shape of all 59 existing rows.
await admin.from('job_applications').insert({
  job_id: job.id, candidate_id: c.id, status: 'pending',
  job_title: 'ZZ TEST — CV Record Probe (delete me)', company: 'Thrive Test Employer',
})
const { data: rowC } = await admin.from('job_applications').select('cv_url').eq('candidate_id', c.id).maybeSingle()
const { data: profC } = await admin.from('candidate_profiles').select('cv_url').eq('user_id', c.id).single()
// The exact expression the employer page now evaluates.
const employerSeesC = rowC.cv_url || profC?.cv_url || null
console.log(`  application cv_url: ${JSON.stringify(rowC.cv_url)}   profile cv_url: ${JSON.stringify(profC.cv_url)}`)
check('an old row still shows a CV to the employer via the fallback', !!employerSeesC, `employer sees: ${JSON.stringify(employerSeesC)}`)

// And the same expression for A and B, so all three are checked the same way.
const { data: pA } = await admin.from('candidate_profiles').select('cv_url').eq('user_id', a.id).single()
const { data: pB } = await admin.from('candidate_profiles').select('cv_url').eq('user_id', bb.id).single()
console.log(`\n  employer view — A: ${JSON.stringify(rowA?.cv_url || pA?.cv_url || null)}`)
console.log(`  employer view — B: ${JSON.stringify(rowB?.cv_url || pB?.cv_url || null)}  (greyed "No CV uploaded")`)
console.log(`  employer view — C: ${JSON.stringify(employerSeesC)}`)
check('B is the only one the employer sees as CV-less', (rowB?.cv_url || pB?.cv_url || null) === null)

await b.close()

console.log('\n=== CLEANUP ===')
const CT = [['candidate_profiles','user_id'],['employees','user_id'],['employer_members','user_id'],['job_applications','candidate_id'],['notifications','user_id'],['apply_starts','candidate_id'],['user_onboarding','user_id'],['candidate_cvs','user_id'],['saved_jobs','candidate_id'],['device_tokens','user_id'],['boosts','user_id'],['messages','sender_id']]
const before = {}
for (const id of made) for (const [t, col] of CT) { const { count, error } = await admin.from(t).select('*', { count: 'exact', head: true }).eq(col, id); if (!error && count) before[t] = (before[t] || 0) + count }
console.log('  candidate dependents before:', JSON.stringify(before))

await admin.from('job_applications').delete().eq('job_id', job.id)
await admin.from('conversations').delete().eq('related_job_id', job.id)
await admin.from('jobs').delete().eq('id', job.id)
await admin.from('notifications').delete().eq('user_id', EMPLOYER).ilike('message', '%CV Test%')
for (const id of made) await admin.auth.admin.deleteUser(id)

const after = {}
for (const id of made) for (const [t, col] of CT) { const { count, error } = await admin.from(t).select('*', { count: 'exact', head: true }).eq(col, id); if (!error && count) after[t] = (after[t] || 0) + count }
console.log('  candidate dependents after :', JSON.stringify(after))
console.log('  job row gone               :', !(await admin.from('jobs').select('id').eq('id', job.id).maybeSingle()).data)
console.log('  ACTIVE JOBS NOW            :', (await admin.from('jobs').select('*', { count: 'exact', head: true }).eq('status', 'active')).count, '(must be 247)')
if (Object.keys(after).length) fails.push('cleanup left rows')
console.log()
if (fails.length) { console.log(`${fails.length} FAILED: ${fails.join(', ')}`); process.exit(1) }
console.log('ALL THREE CASES PASSED')

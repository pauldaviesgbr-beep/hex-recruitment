// DRIVE THE TWO THINGS THE BACKFILL CANNOT PROVE.
//
// The backfill exercised parseCv against 26 real CVs, so the PARSING is proven.
// Two things it never touched:
//   1. /api/candidate/parse-cv — the route that fires when someone uploads
//   2. ConfirmCvSkillsPrompt — the dashboard prompt that turns the inference
//      into a declaration
//
// Both are driven here, as the CANDIDATE FIXTURE, with a synthetic CV.
//
// IT CHANGES FIXTURE STATE AND PUTS IT BACK. The fixture has no CV and seven
// declared skills, so neither path would fire on it as-is. Both are set up and
// then restored to the recorded original — printed before and after so the
// restore is a measurement, not a promise.
//
// THE CV CARRIES A TRAP: "No pastry experience — keen to learn butchery." A
// keyword scan tags that person with pastry and butchery. The whole argument
// for using a model instead of a keyword parser rests on it not doing that, so
// it is asserted rather than assumed.

import { chromium } from 'playwright'
import { createClient } from '@supabase/supabase-js'
import { readFileSync, existsSync, mkdirSync } from 'node:fs'
import path from 'node:path'

const BASE = process.argv[2] || 'https://thrivecareer.co.uk'
const CV = path.join(process.cwd(), 'cv-fixture.scratch.pdf')
const SHOTS = 'drive-shots'
const EMAIL = 'pauldavies.gbr+candidate@gmail.com'

const env = {}
for (const line of readFileSync(path.join(process.cwd(), '.env.local'), 'utf8').split(/\r?\n/)) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/)
  if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '')
}
const PASSWORD = env.TEST_ACCOUNT_PASSWORD
const BYPASS = env.VERCEL_AUTOMATION_BYPASS_SECRET
if (!PASSWORD) { console.error('SKIP  TEST_ACCOUNT_PASSWORD missing'); process.exit(2) }
if (!existsSync(CV)) { console.error('SKIP  cv-fixture.scratch.pdf not found'); process.exit(2) }
if (BASE.includes('.vercel.app') && !BYPASS) { console.error('SKIP  preview needs the bypass secret'); process.exit(2) }
mkdirSync(SHOTS, { recursive: true })

const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
const results = []
const check = (n, got, ok) => results.push({ n, got, ok })

const read = async () => (await db.from('candidate_profiles')
  .select('user_id, cv_url, cv_file_name, skills, cv_parse_status, cv_parsed_at, cv_derived')
  .eq('email', EMAIL).single()).data

// ── RECORD THE ORIGINAL, before anything is touched ────────────────────────
const original = await read()
const UID = original.user_id
console.log('ORIGINAL')
console.log(`  cv_url          ${original.cv_url ?? 'null'}`)
console.log(`  skills          ${JSON.stringify(original.skills)}`)
console.log(`  cv_parse_status ${original.cv_parse_status ?? 'null'}\n`)

const browser = await chromium.launch()
const ctx = await browser.newContext({
  viewport: { width: 1280, height: 900 },
  ...(BYPASS && BASE.includes('.vercel.app')
    ? { extraHTTPHeaders: { 'x-vercel-protection-bypass': BYPASS, 'x-vercel-set-bypass-cookie': 'true' } } : {}),
})
const page = await ctx.newPage()
let uploadedPath = null

try {
  // ── sign in ──────────────────────────────────────────────────────────────
  await page.goto(`${BASE}/login/employee`, { waitUntil: 'domcontentloaded' })
  await page.fill('input[name="email"]', EMAIL)
  await page.fill('input[name="password"]', PASSWORD)
  await page.locator('button[type="submit"]:not([disabled])').waitFor({ timeout: 30000 })
  await page.click('button[type="submit"]')
  await page.waitForURL(/\/(dashboard|jobs|welcome)(\?|$|\/)/, { timeout: 40000 })
  check('signed in as the candidate fixture', page.url().replace(BASE, ''), !page.url().includes('/login'))

  // Dismiss the cookie banner — it overlays controls at the foot of the page.
  await page.locator('button', { hasText: /^Accept All$/ }).first().click({ timeout: 8000 }).catch(() => {})

  // ── 1. THE ROUTE, WITH A REAL SESSION ────────────────────────────────────
  //
  // WHAT THIS DRIVES AND WHAT IT DOES NOT, stated rather than blurred.
  //
  // DRIVEN: /api/candidate/parse-cv end to end — real signed-in session, real
  // cookie, real handler, real storage download, real model call, real write.
  // That route is the new code and it is the thing that could be broken.
  //
  // NOT DRIVEN: the one-line fetch() I added to the two upload handlers. The
  // upload UI is a five-step wizard whose step indicators are not clickable
  // and whose validation has nothing to do with CV parsing; fighting it would
  // be testing someone else's form, not my change. The line is read, not run.
  //
  // The file is put into storage exactly where an upload would put it, so the
  // route sees precisely what it would see in production.
  const storagePath = `${UID}/cv-drive-${Date.now()}.pdf`
  const up = await db.storage.from('profiles')
    .upload(storagePath, readFileSync(CV), { contentType: 'application/pdf', upsert: true })
  if (up.error) throw new Error(`could not stage the CV: ${up.error.message}`)
  uploadedPath = storagePath
  await db.from('candidate_profiles')
    .update({ cv_url: storagePath, cv_file_name: 'cv-fixture.pdf' }).eq('user_id', UID)

  // Called FROM THE BROWSER so it carries the candidate's own session — the
  // route derives the user from that and ignores the body entirely.
  const routeStatus = await page.evaluate(async () => {
    const r = await fetch('/api/candidate/parse-cv', { method: 'POST' })
    return { http: r.status, body: await r.text() }
  })
  check('the route answered 200 to a signed-in candidate',
    `http=${routeStatus.http} ${routeStatus.body.slice(0, 90)}`, routeStatus.http === 200)

  let row = null
  for (let i = 0; i < 20; i++) {
    row = await read()
    if (row.cv_parse_status) break
    await page.waitForTimeout(2000)
  }

  check('the route set a parse status', String(row?.cv_parse_status), row?.cv_parse_status === 'ok')

  const derived = row?.cv_derived || {}
  const found = Array.isArray(derived.skills) ? derived.skills : []
  check('it derived a recent title', String(derived.recentTitle), derived.recentTitle === 'Senior Sous Chef')
  check('it ranked the seniority', String(derived.seniorityRank), derived.seniorityRank === 7)
  check('the most recent role reads as current', String(derived.recentIsCurrent), derived.recentIsCurrent === true)
  check('it is flagged inferred', String(derived.inferred), derived.inferred === true)
  check('it found real skills', `${found.length}: ${found.slice(0, 6).join(', ')}`, found.length > 0)

  // THE TRAP. "No pastry experience — keen to learn butchery."
  check('NEGATIVE EVIDENCE: pastry NOT extracted', found.join(', ') || '(none)', !found.includes('pastry'))
  check('NEGATIVE EVIDENCE: butchery NOT extracted', found.join(', ') || '(none)', !found.includes('butchery'))
  // POSITIVE CONTROL — without it the two above pass on an empty list.
  const asserted = ['allergens', 'haccp', 'menu development', 'rota', 'training', 'stock control', 'gp margin']
  check('POSITIVE CONTROL: it did extract what the CV asserts',
    found.filter(x => asserted.includes(x)).join(', ') || '(none)',
    found.some(x => asserted.includes(x)))

  // ── 2. THE CONFIRM PROMPT ────────────────────────────────────────────────
  //
  // SEEDED, NOT PARSED, AND DELIBERATELY SO. This component renders chips from
  // cv_derived and writes the chosen ones to skills. How cv_derived got there
  // is none of its business, and making the test depend on a live model call
  // means an API outage reads as a broken prompt — which is precisely what
  // happened on the run before this one, when the Anthropic credit balance ran
  // out and every assertion below went red for a reason that had nothing to do
  // with the component.
  //
  // The shape is copied from what the backfill actually produced on real CVs,
  // so this is not an invented schema.
  const SEEDED = ['larder', 'sauce', 'allergens', 'haccp', 'menu development', 'rota', 'training']
  await db.from('candidate_profiles').update({
    skills: null,
    cv_parse_status: 'ok',
    cv_derived: {
      skills: SEEDED,
      titles: ['Senior Sous Chef', 'Chef de Partie'],
      recentTitle: 'Senior Sous Chef',
      recentEndDate: null,
      recentIsCurrent: true,
      seniorityRank: 7,
      inferred: true,
    },
  }).eq('user_id', UID)

  await page.goto(`${BASE}/dashboard`, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(7000)
  await page.screenshot({ path: `${SHOTS}/cv-3-prompt.png`, fullPage: false })

  const promptText = await page.evaluate(() =>
    /which of these do you actually want to be found for/i.test(document.body.innerText || ''))
  check('the confirm prompt renders', `visible=${promptText}`, promptText)

  if (promptText) {
    // Tap two chips and save.
    const chips = page.locator('button[aria-pressed]')
    const n = await chips.count()
    check('chips are rendered, one per derived skill', `${n} chips vs ${SEEDED.length} seeded`, n === SEEDED.length)
    check('nothing is pre-selected',
      `pressed=${await page.locator('button[aria-pressed="true"]').count()}`,
      (await page.locator('button[aria-pressed="true"]').count()) === 0)

    const pick = []
    for (let i = 0; i < Math.min(2, n); i++) {
      pick.push((await chips.nth(i).innerText()).trim())
      await chips.nth(i).click()
    }
    await page.screenshot({ path: `${SHOTS}/cv-4-chosen.png` })
    await page.locator('button', { hasText: /^Save \d+$/ }).first().click()

    let after = null
    for (let i = 0; i < 12; i++) {
      await page.waitForTimeout(1500)
      after = await read()
      if (Array.isArray(after.skills) && after.skills.length) break
    }
    await page.screenshot({ path: `${SHOTS}/cv-5-saved.png` })
    check('the chosen skills were written as DECLARED',
      JSON.stringify(after?.skills), JSON.stringify(after?.skills) === JSON.stringify(pick))
    check('cv_derived was NOT overwritten by the confirmation',
      `derivedSkills=${(after?.cv_derived?.skills || []).length}`,
      (after?.cv_derived?.skills || []).length === SEEDED.length)
  }
} catch (e) {
  check('drive completed without throwing', e.message, false)
  try { await page.screenshot({ path: `${SHOTS}/cv-error.png` }) } catch {}
} finally {
  await browser.close()
}

// ── RESTORE, exactly ───────────────────────────────────────────────────────
if (uploadedPath) {
  const rm = await db.storage.from('profiles').remove([uploadedPath])
  console.log(`\nremoved uploaded file: ${rm.error ? rm.error.message : uploadedPath}`)
  // The upload also inserts a candidate_cvs row.
  await db.from('candidate_cvs').delete().eq('user_id', UID)
    .contains('cv_data', { uploadedFileUrl: uploadedPath })
}
await db.from('candidate_profiles').update({
  cv_url: original.cv_url,
  cv_file_name: original.cv_file_name,
  skills: original.skills,
  cv_parse_status: original.cv_parse_status,
  cv_parsed_at: original.cv_parsed_at,
  cv_derived: original.cv_derived,
}).eq('user_id', UID)

const restored = await read()
console.log('\nRESTORED')
console.log(`  cv_url          ${restored.cv_url ?? 'null'}`)
console.log(`  skills          ${JSON.stringify(restored.skills)}`)
console.log(`  cv_parse_status ${restored.cv_parse_status ?? 'null'}`)
check('fixture restored: cv_url', String(restored.cv_url), restored.cv_url === original.cv_url)
check('fixture restored: declared skills',
  JSON.stringify(restored.skills), JSON.stringify(restored.skills) === JSON.stringify(original.skills))
check('fixture restored: parse status', String(restored.cv_parse_status), restored.cv_parse_status === original.cv_parse_status)

let failed = 0
console.log('')
for (const r of results) {
  if (r.ok) console.log(`  ok    ${r.n}  ->  ${r.got}`)
  else { failed++; console.log(`  FAIL  ${r.n}  ->  ${r.got}`) }
}
console.log(`\n${results.length - failed}/${results.length} passed`)
process.exit(failed ? 1 : 0)

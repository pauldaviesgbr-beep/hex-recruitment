// WHAT AN EMPLOYER SEES WHEN A CANDIDATE'S ADDRESS IS AN APPLE RELAY.
//
// WHY THIS USES FIXTURES RATHER THAN THE REAL APPLE SIGNUP. The genuine
// Apple-origin candidate exists, but the duplicate check correctly HELD it, so
// it is not discoverable and no employer can load it at all. The state this
// question needs — a VISIBLE relay candidate — does not exist and will not for
// seven days. Driving the fixture is the honest way to answer it now; the
// relay-ness under test is a property of the address string, which a fixture
// reproduces exactly.
//
// TWO CANDIDATES, AND THE SECOND IS THE POINT. "No mailto is rendered" is true
// of a page that failed to load, of a candidate with no email, and of a bug
// that hides every address. So a control candidate with an ORDINARY address
// runs alongside: its mailto MUST render. Without that, this check cannot
// distinguish the two states it exists to tell apart.
//
// Both are deleted by the run that makes them, and dependents are counted.
//
//   node scripts/drive-relay-candidate-view.mjs <baseUrl>

import { chromium } from 'playwright'
import { createClient } from '@supabase/supabase-js'
import { existsSync, readFileSync, mkdirSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { withSeededStorage } from './lib/seed-storage.mjs'

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const env = {}
{
  const f = path.join(REPO, '.env.local')
  if (!existsSync(f)) { console.error('SKIP  .env.local not found'); process.exit(2) }
  for (const line of readFileSync(f, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/)
    if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '')
  }
}
const BASE = process.argv[2]
if (!BASE) { console.error('usage: node scripts/drive-relay-candidate-view.mjs <baseUrl>'); process.exit(2) }
const EMPLOYER = 'pauldavies.gbr+employer@gmail.com'
const PW = env.TEST_EMPLOYER_PASSWORD || env.TEST_ACCOUNT_PASSWORD
if (!PW || !env.SUPABASE_SERVICE_ROLE_KEY) { console.error('SKIP  credentials missing'); process.exit(2) }

const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
const BYPASS = env.VERCEL_AUTOMATION_BYPASS_SECRET
mkdirSync(path.join(REPO, 'drive-shots'), { recursive: true })

let bad = 0
const check = (l, ok, d) => { if (!ok) bad++; console.log('  ' + (ok ? 'ok   ' : 'FAIL ') + String(l).padEnd(56) + (d ?? '')); return ok }

const stamp = Date.now()
// Names that no real person shares, so a duplicate hold cannot fire on them
// and quietly hide the fixture — which would look exactly like a broken drive.
const SUBJECTS = [
  { key: 'relay',   name: `Zzqx Relayfixture${stamp}`,  email: `zz${stamp}@privaterelay.appleid.com`, title: `Relay Test ${stamp}` },
  { key: 'control', name: `Zzqx Controlfixture${stamp}`, email: `zz${stamp}@example.com`,              title: `Control Test ${stamp}` },
]
const made = []

const browser = await chromium.launch()
try {
  console.log('\n1. TWO DISCOVERABLE FIXTURES — one relay, one ordinary')
  for (const s of SUBJECTS) {
    const { data: u, error: e1 } = await admin.auth.admin.createUser({
      email: s.email, email_confirm: true, user_metadata: { role: 'employee' },
    })
    if (e1) throw new Error('createUser ' + s.key + ': ' + e1.message)
    s.userId = u.user.id
    made.push(s.userId)
    const { error: e2 } = await admin.from('candidate_profiles').insert({
      user_id: s.userId, email: s.email, full_name: s.name,
      job_title: s.title, location: 'Bath', is_discoverable: true,
      // NOT a show_email column — it is a key inside the visibility_settings
      // JSONB, and writing the flat column silently fails the whole insert.
      // Read the schema, not the prop name the component happens to use.
      visibility_settings: { show_email: true },
    })
    if (e2) throw new Error('insert ' + s.key + ': ' + e2.message)
    const { data: row } = await admin.from('candidate_profiles')
      .select('is_discoverable, visibility_settings, duplicate_hold').eq('user_id', s.userId).maybeSingle()
    check(`${s.key} fixture is discoverable`, row?.is_discoverable === true)
    check(`  …and show_email is ON`, row?.visibility_settings?.show_email === true, 'so a hidden address is a RENDER decision')
    check(`  …and it was not itself held`, !row?.duplicate_hold?.heldAt,
      row?.duplicate_hold?.heldAt || 'unheld')
  }

  const ctx = await browser.newContext({
    viewport: { width: 1280, height: 900 },
    ...(BYPASS && BASE.includes('.vercel.app')
      ? { extraHTTPHeaders: { 'x-vercel-protection-bypass': BYPASS, 'x-vercel-set-bypass-cookie': 'true' } } : {}),
  })
  const page = await ctx.newPage()
  const errs = []
  page.on('pageerror', e => errs.push(e.message))
  await withSeededStorage(page, 'consentAccepted')

  console.log('\n2. SIGNED IN AS THE TEST EMPLOYER')
  await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(3500)
  await page.fill('#login-email', EMPLOYER)
  await page.fill('#login-password', PW)
  await page.locator('button[type="submit"]:not([disabled])').first().waitFor({ timeout: 30000 })
  await page.click('button[type="submit"]')
  await page.waitForURL(u => !u.toString().includes('/login'), { timeout: 30000 }).catch(() => {})
  check('signed in', !page.url().includes('/login'))

  console.log('\n3. EACH CANDIDATE, OPENED')
  for (const s of SUBJECTS) {
    await page.goto(`${BASE}/candidates`, { waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(9000)
    const search = page.locator('input[placeholder="Name, role or skill"]').first()
    if (await search.count()) { await search.fill(String(stamp)); await page.waitForTimeout(3000) }

    const card = page.locator(`text=${s.title}`).first()
    if (!(await card.count())) { check(`${s.key} — found on the board`, false, 'card not found'); continue }
    check(`${s.key} — found on the board`, true)
    await card.click()
    await page.waitForTimeout(5000)

    // THE CONTACT PANEL IS BEHIND A BUTTON. A first pass checked for a mailto
    // straight after opening the card and found none — for the relay candidate
    // AND for the control. That reads as "the relay fix works", and it was the
    // instrument looking at a panel that had not been opened. The control is
    // the only reason it was caught.
    const viewContact = page.getByRole('button', { name: /View contact/i }).first()
    if (await viewContact.count()) {
      await viewContact.click()
      await page.waitForTimeout(3000)
    } else {
      check(`${s.key} — a View contact control was found`, false, 'selector found nothing — check the instrument')
    }

    const found = await page.evaluate((addr) => {
      const links = Array.from(document.querySelectorAll('a[href^="mailto:"]')).map(a => a.getAttribute('href'))
      return {
        anyMailto: links.length,
        mailtoToThisAddress: links.filter(h => (h || '').includes(addr)).length,
        text: document.body.innerText || '',
      }
    }, s.email)

    if (s.key === 'relay') {
      check('RELAY — no mailto to the relay address', found.mailtoToThisAddress === 0,
        found.mailtoToThisAddress + ' link(s)')
      check('RELAY — the address is not printed either', !found.text.includes(s.email),
        found.text.includes(s.email) ? 'IT IS ON THE PAGE' : 'absent')
      check('RELAY — a Messages route is offered instead',
        /message/i.test(found.text), (found.text.match(/[^\n]*[Mm]essage[^\n]*/) || ['NOT FOUND'])[0].slice(0, 54))
      await page.screenshot({ path: 'drive-shots/relay-candidate-employer-view.png', fullPage: false })
    } else {
      // THE CONTROL. If this fails, "no mailto" above proves nothing at all.
      check('CONTROL — an ordinary address DOES render a mailto', found.mailtoToThisAddress > 0,
        found.mailtoToThisAddress + ' link(s) — this is what makes the relay result meaningful')
      await page.screenshot({ path: 'drive-shots/control-candidate-employer-view.png', fullPage: false })
    }
  }
  check('no page errors', errs.length === 0, errs.join(' | ') || 'clean')
  await ctx.close()
} catch (e) {
  console.error('\nDRIVE FAILED: ' + e.message)
  bad++
} finally {
  console.log('\n4. CLEAN UP — counted, not hoped')
  for (const id of made) {
    await admin.from('candidate_profiles').delete().eq('user_id', id).then(() => {}, () => {})
    await admin.auth.admin.deleteUser(id).catch(() => {})
  }
  for (const id of made) {
    const { data } = await admin.from('candidate_profiles').select('user_id').eq('user_id', id).maybeSingle()
    check('fixture profile gone', !data, id.slice(0, 8))
  }
  await browser.close()
  console.log('')
  console.log(bad ? `  ${bad} FAILED` : '  a relay address is never offered as a mailto, and an ordinary one still is')
  process.exit(bad ? 1 : 0)
}

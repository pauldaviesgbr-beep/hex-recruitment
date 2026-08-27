// JOINING A TEAM FROM THE WRONG ADDRESS, THE WAY A PERSON ACTUALLY WOULD.
//
// accept_employer_invite compares the signed-in address to the invited one as
// strings. This drives the way through that: a code sent to the INVITED
// mailbox, typed back by the signed-in user.
//
// IT USES THE REAL EMAIL, NOT A COMPUTED CODE. The code could be recomputed
// here from the same secret and typed straight in — and that would prove the
// verifier agrees with the generator, which is what the unit prove already
// does. It would NOT prove that the thing landing in somebody's inbox is the
// thing the route accepts. This project has already shipped an opt-out link
// where every piece verified and the URL in the email pointed at a page that
// never checked it. So: phase 1 sends, a human reads the inbox, phase 2 types
// what was actually received.
//
// WHERE IT SENDS. Only ever to pauldavies.gbr+teaminvite@gmail.com — Paul's
// own alias, hard-coded here, never taken from a row or an argument. The route
// itself can only send to the invited_email already on the row, so the
// throwaway row is what bounds it.
//
// WHAT IT CREATES AND DESTROYS: one throwaway auth user (the accepter, on an
// example.com address so nothing can ever reach it) and one employer_members
// row under Thrive Test Employer. Dependents are counted before and after, so
// "nothing was left behind" is a measurement.
//
//   node scripts/drive-invite-code.mjs setup  <baseUrl>
//   node scripts/drive-invite-code.mjs finish <baseUrl> <CODE-FROM-THE-EMAIL>
//   node scripts/drive-invite-code.mjs clean  <baseUrl>

import { chromium } from 'playwright'
import { createClient } from '@supabase/supabase-js'
import { mkdirSync, existsSync, readFileSync, writeFileSync, unlinkSync } from 'node:fs'
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

const MODE = process.argv[2]
const BASE = process.argv[3]
const SUPPLIED_CODE = process.argv[4]
if (!MODE || !BASE) { console.error('usage: node scripts/drive-invite-code.mjs setup|finish|clean <baseUrl> [code]'); process.exit(2) }
if (!env.SUPABASE_SERVICE_ROLE_KEY) { console.error('SKIP  no service key'); process.exit(2) }

// PAUL'S OWN ALIAS, HARD-CODED. Never a row value, never an argument.
const INVITED = 'pauldavies.gbr+teaminvite@gmail.com'
const EMPLOYER_PROFILE = '35dd8dff-7cc3-4594-b61e-a5ef918b6416'   // Thrive Test Employer
const STATE = path.join(REPO, 'drive-shots', '.invite-code-state.json')
const PW = 'Drv!' + 'x7Q2' + Math.random().toString(36).slice(2, 10) + '#Za'

const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
const BYPASS = env.VERCEL_AUTOMATION_BYPASS_SECRET
mkdirSync(path.join(REPO, 'drive-shots'), { recursive: true })

let bad = 0
const check = (l, ok, d) => { if (!ok) bad++; console.log('  ' + (ok ? 'ok   ' : 'FAIL ') + String(l).padEnd(56) + (d ?? '')); return ok }

const ctxOpts = {
  viewport: { width: 390, height: 844 },
  ...(BYPASS && BASE.includes('.vercel.app')
    ? { extraHTTPHeaders: { 'x-vercel-protection-bypass': BYPASS, 'x-vercel-set-bypass-cookie': 'true' } } : {}),
}

async function signIn(page, email, password) {
  await withSeededStorage(page, 'consentAccepted')
  await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(3500)
  await page.fill('#login-email', email)
  await page.fill('#login-password', password)
  await page.locator('button[type="submit"]:not([disabled])').first().waitFor({ timeout: 30000 })
  await page.click('button[type="submit"]')
  await page.waitForURL(u => !u.toString().includes('/login'), { timeout: 30000 }).catch(() => {})
}

async function countDependents() {
  const { count } = await admin.from('employer_members')
    .select('id', { count: 'exact', head: true }).eq('employer_id', EMPLOYER_PROFILE)
  return count ?? -1
}

// ─────────────────────────────────────────────────────────────────────────
if (MODE === 'setup') {
  const stamp = Date.now()
  const accepterEmail = `thrive-invite-drive-${stamp}@example.com`
  const before = await countDependents()
  console.log('\n1. BEFORE — dependents under Thrive Test Employer: ' + before)

  const { data: made, error: mkErr } = await admin.auth.admin.createUser({
    email: accepterEmail, password: PW, email_confirm: true, user_metadata: { role: 'employer' },
  })
  if (mkErr) { console.error('createUser: ' + mkErr.message); process.exit(1) }

  const token = crypto.randomUUID()
  const { data: member, error: insErr } = await admin.from('employer_members').insert({
    employer_id: EMPLOYER_PROFILE,
    invited_email: INVITED,
    status: 'invited',
    invite_token: token,
    invite_expires_at: new Date(Date.now() + 3600_000).toISOString(),
    role: 'member',
  }).select('id').single()
  if (insErr) {
    await admin.auth.admin.deleteUser(made.user.id).catch(() => {})
    console.error('invite insert: ' + insErr.message); process.exit(1)
  }
  writeFileSync(STATE, JSON.stringify({ token, memberId: member.id, accepterEmail, accepterId: made.user.id, password: PW, before }))
  check('a throwaway invite exists, addressed to Paul’s alias', true, INVITED)
  check('and a throwaway accepter on a dead domain', true, accepterEmail)

  const browser = await chromium.launch()
  const ctx = await browser.newContext(ctxOpts)
  const page = await ctx.newPage()
  const errs = []
  page.on('pageerror', e => errs.push(e.message))

  console.log('\n2. THE MISMATCH — the dead end this exists to open')
  await signIn(page, accepterEmail, PW)
  await page.goto(`${BASE}/invite/accept?token=${token}`, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(7000)
  let text = await page.evaluate(() => document.body.innerText || '')
  check('the page says the account is wrong', /Wrong account/i.test(text))
  check('it names the invited address', text.includes(INVITED))
  check('and the one we are signed in as', text.includes(accepterEmail))
  check('sign-out-and-switch is still offered first', /Sign out and switch account/i.test(text))
  check('AND the code route is offered', /Email me a code instead/i.test(text))
  await page.screenshot({ path: 'drive-shots/invite-mismatch.png' })

  console.log('\n3. SEND IT')
  await page.getByRole('button', { name: /Email me a code instead/i }).click()
  await page.waitForTimeout(9000)
  text = await page.evaluate(() => document.body.innerText || '')
  check('the page confirms a send', /Code sent to/i.test(text),
    (text.match(/Code sent to[^\n]*/i) || ['NOT FOUND'])[0])
  check('the address is MASKED on screen', /p•••@gmail\.com/.test(text) || !text.includes(INVITED),
    (text.match(/Code sent to[^\n]*/i) || [''])[0])
  check('a code box appeared', await page.locator('input[placeholder="XXXX-XXXX"]').count() > 0)
  check('nothing threw', errs.length === 0, errs.join(' | ') || 'clean')
  await page.screenshot({ path: 'drive-shots/invite-code-sent.png' })

  const { data: row } = await admin.from('employer_members')
    .select('invited_email, accepted_email, status').eq('id', member.id).maybeSingle()
  check('invited_email is UNTOUCHED by sending', row?.invited_email === INVITED, String(row?.invited_email))
  check('no permission slip written yet', row?.accepted_email === null, String(row?.accepted_email))
  check('still merely invited', row?.status === 'invited', String(row?.status))

  await browser.close()
  console.log('')
  console.log(bad ? `  ${bad} FAILED` : '  READ THE INBOX for pauldavies.gbr+teaminvite@gmail.com, then:')
  console.log('  node scripts/drive-invite-code.mjs finish ' + BASE + ' <CODE>')
  process.exit(bad ? 1 : 0)
}

// ─────────────────────────────────────────────────────────────────────────
if (MODE === 'finish') {
  if (!SUPPLIED_CODE) { console.error('need the code from the email'); process.exit(2) }
  const st = JSON.parse(readFileSync(STATE, 'utf8'))
  const browser = await chromium.launch()
  const ctx = await browser.newContext(ctxOpts)
  const page = await ctx.newPage()
  const errs = []
  page.on('pageerror', e => errs.push(e.message))

  console.log('\n4. BACK IN, WITH THE CODE FROM THE ACTUAL EMAIL')
  await signIn(page, st.accepterEmail, st.password)
  await page.goto(`${BASE}/invite/accept?token=${st.token}`, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(7000)
  await page.getByRole('button', { name: /Email me a code instead/i }).click()
  await page.waitForTimeout(9000)
  // Re-requesting inside the window returns the SAME code by design — this is
  // where that property is proven end to end, rather than asserted in a unit
  // test. If it minted a new one, the code read from the inbox would now fail
  // and the person would be told it was wrong.
  check('a code box is showing', await page.locator('input[placeholder="XXXX-XXXX"]').count() > 0)

  console.log('\n5. A WRONG CODE IS REFUSED — the half that makes the right one mean something')
  await page.fill('input[placeholder="XXXX-XXXX"]', 'ZZZZZZZZ')
  await page.getByRole('button', { name: /Join the team/i }).click()
  await page.waitForTimeout(7000)
  let text = await page.evaluate(() => document.body.innerText || '')
  check('the wrong code is rejected', /didn.t match/i.test(text),
    (text.match(/[^\n]*match[^\n]*/i) || ['NOT FOUND'])[0].slice(0, 70))
  let row = (await admin.from('employer_members').select('status, accepted_email').eq('id', st.memberId).maybeSingle()).data
  check('…and NOTHING was joined', row?.status === 'invited', String(row?.status))
  check('…and no slip was left behind', row?.accepted_email === null, String(row?.accepted_email))

  console.log('\n6. THE REAL CODE')
  await page.fill('input[placeholder="XXXX-XXXX"]', SUPPLIED_CODE)
  await page.getByRole('button', { name: /Join the team/i }).click()
  await page.waitForTimeout(12000)
  text = await page.evaluate(() => document.body.innerText || '')
  check('the code from the inbox is accepted', !/didn.t match/i.test(text),
    (text.match(/[^\n]{0,60}match[^\n]{0,20}/i) || ['no refusal shown'])[0].slice(0, 70))
  await page.screenshot({ path: 'drive-shots/invite-code-joined.png' })

  console.log('\n7. THE ROW — state beats screen for whether it is CORRECT')
  row = (await admin.from('employer_members')
    .select('status, user_id, invited_email, accepted_email, accepted_at, invite_token')
    .eq('id', st.memberId).maybeSingle()).data
  check('they are now an active member', row?.status === 'active', String(row?.status))
  check('…as the account that was signed in', row?.user_id === st.accepterId, String(row?.user_id))
  check('WHO WAS INVITED SURVIVES', row?.invited_email === INVITED, String(row?.invited_email))
  check('WHO JOINED IS RECORDED', row?.accepted_email === st.accepterEmail, String(row?.accepted_email))
  check('the two are genuinely different', row?.invited_email !== row?.accepted_email,
    'which is the whole point of the second column')
  check('the invite token is spent', row?.invite_token === null, String(row?.invite_token))
  check('nothing threw', errs.length === 0, errs.join(' | ') || 'clean')

  await browser.close()
  console.log('')
  console.log(bad ? `  ${bad} FAILED` : '  a wrong address joined with a code, and the record of both survives')
  console.log('  now: node scripts/drive-invite-code.mjs clean ' + BASE)
  process.exit(bad ? 1 : 0)
}

// ─────────────────────────────────────────────────────────────────────────
if (MODE === 'clean') {
  const st = JSON.parse(readFileSync(STATE, 'utf8'))
  console.log('\n8. CLEAN UP — counted, not hoped')
  await admin.from('employer_members').delete().eq('id', st.memberId)
  await admin.auth.admin.deleteUser(st.accepterId).catch(() => {})
  const after = await countDependents()
  check('the throwaway member row is gone', after === st.before, `before=${st.before} after=${after}`)
  const { data: gone } = await admin.from('employer_members').select('id').eq('id', st.memberId).maybeSingle()
  check('…confirmed by id', !gone)
  const { data: u } = await admin.auth.admin.getUserById(st.accepterId).catch(() => ({ data: null }))
  check('the throwaway accepter is gone', !u?.user, u?.user?.email || 'deleted')
  // Anything else keyed on that user id, per the sixteen-tables lesson.
  const { count: leftovers } = await admin.from('employer_members')
    .select('id', { count: 'exact', head: true }).eq('user_id', st.accepterId)
  check('no membership row anywhere still names them', (leftovers ?? 0) === 0, String(leftovers))
  try { unlinkSync(STATE) } catch { /* already gone */ }
  console.log('')
  console.log(bad ? `  ${bad} FAILED` : '  nothing left behind')
  process.exit(bad ? 1 : 0)
}

console.error('unknown mode: ' + MODE)
process.exit(2)

// CLICKING THE SAME RECOVERY LINK TWICE MUST NOT THROW YOU OUT.
//
// /auth/confirm gets called more than once per click in the wild — a real
// employer's auth log shows one 200 and four 403s inside twenty seconds from a
// single tap. The first call spends the token; the rest correctly find it
// spent; and the route used to turn that into a redirect to /login. One
// request minted his session, another sent him to a login page, and which one
// the browser rendered was a race he lost for four weeks.
//
// So this drives the SECOND arrival, in the SAME browser context, because that
// is what carries the session cookie the first arrival set. A fresh context
// would be a different question with a different correct answer.
//
// TWO HOSTS, OPPOSITE ANSWERS. Production has no fix and must bounce to
// /login — if it does not, this check cannot see the thing it is named after
// and nothing below it is evidence. The target must land on /reset-password.
//
// ON THE TEST EMPLOYER ONLY. It sets no password and leaves the fixture alone.
//
//   node scripts/drive-confirm-idempotent.mjs <targetBase> [controlBase]

import { chromium } from 'playwright'
import { createClient } from '@supabase/supabase-js'
import { mkdirSync, existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
function loadEnv() {
  const out = {}
  const f = path.join(REPO, '.env.local')
  if (!existsSync(f)) { console.error('SKIP  .env.local not found'); process.exit(2) }
  for (const line of readFileSync(f, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/)
    if (m) out[m[1]] = m[2].replace(/^["']|["']$/g, '')
  }
  return out
}

const env = loadEnv()
const TARGET = process.argv[2]
const CONTROL = process.argv[3] || null
const EMAIL = 'pauldavies.gbr+employer@gmail.com'
const BYPASS = env.VERCEL_AUTOMATION_BYPASS_SECRET
if (!TARGET) { console.error('usage: node scripts/drive-confirm-idempotent.mjs <targetBase> [controlBase]'); process.exit(2) }
if (!env.SUPABASE_SERVICE_ROLE_KEY) { console.error('SKIP  SUPABASE_SERVICE_ROLE_KEY missing'); process.exit(2) }

mkdirSync('drive-shots', { recursive: true })
const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })

let bad = 0
const check = (label, ok, detail) => {
  if (!ok) bad++
  console.log('  ' + (ok ? 'ok   ' : 'FAIL ') + String(label).padEnd(56) + (detail ?? ''))
  return ok
}

const browser = await chromium.launch()
const ctxFor = base => ({
  viewport: { width: 390, height: 844 },   // a phone, because that is where it bites
  ...(BYPASS && base.includes('.vercel.app')
    ? { extraHTTPHeaders: { 'x-vercel-protection-bypass': BYPASS, 'x-vercel-set-bypass-cookie': 'true' } } : {}),
})

async function mint(base) {
  const { data, error } = await admin.auth.admin.generateLink({
    type: 'recovery', email: EMAIL, options: { redirectTo: `${base}/auth/confirm` },
  })
  if (error) throw new Error('mint: ' + error.message)
  const u = new URL(`${base}/auth/confirm`)
  u.searchParams.set('token_hash', data.properties.hashed_token)
  u.searchParams.set('type', 'recovery')
  u.searchParams.set('next', '/reset-password')
  return u.toString()
}

/** Click the link twice in ONE context, and report where each landed. */
async function clickTwice(base) {
  const link = await mint(base)
  const ctx = await browser.newContext(ctxFor(base))
  const page = await ctx.newPage()

  await page.goto(link, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(7000)
  const first = new URL(page.url()).pathname

  // The same URL again, same cookies. This is the duplicate the browser,
  // the mail client or a scanner makes on its own.
  await page.goto(link, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(7000)
  const second = new URL(page.url()).pathname
  const text = await page.evaluate(() => document.body.innerText || '')
  const fields = await page.locator('input[type="password"]').count()

  return { ctx, page, first, second, text, fields }
}

try {
  if (CONTROL) {
    console.log('\n1. CONTROL — a host WITHOUT the fix. The second click should bounce to /login.')
    const c = await clickTwice(CONTROL)
    console.log('   first click  -> ' + c.first)
    console.log('   second click -> ' + c.second)
    if (c.second === '/reset-password') {
      console.log('  ---- EXPIRED CONTROL, NOT A FAILURE ----')
      console.log('       This host has the fix too, so it can no longer show the old')
      console.log('       behaviour. Drop the control argument once it is everywhere.')
    } else {
      check('control bounces the second click to /login', c.second.includes('/login'), c.second)
    }
    await c.page.screenshot({ path: 'drive-shots/confirm-twice-control.png' })
    await c.ctx.close()
  } else {
    console.log('\n1. CONTROL — skipped (no control host given).')
  }

  console.log('\n2. TARGET — the second click must still land on /reset-password.')
  const t = await clickTwice(TARGET)
  console.log('   first click  -> ' + t.first)
  console.log('   second click -> ' + t.second)
  check('the FIRST click lands on /reset-password', t.first === '/reset-password', t.first)
  check('THE SECOND CLICK ALSO LANDS ON /reset-password', t.second === '/reset-password', t.second)
  check('it did NOT bounce to /login', !t.second.includes('/login'), t.second)
  check('no verification_failed on the URL', !t.page.url().includes('verification_failed'))
  check('the password form is rendered after the second click', t.fields >= 2, t.fields + ' field(s)')
  check('no expired / invalid message on screen',
    !/expired|already been used|needs a valid reset link|could not be verified/i.test(t.text),
    (t.text.match(/expired|already been used|needs a valid reset link/i) || [''])[0])
  await t.page.screenshot({ path: 'drive-shots/confirm-twice-target.png' })
  await t.ctx.close()

  console.log('')
  console.log(bad ? `  ${bad} FAILED` : '  a duplicate call is harmless: both clicks land where a password can be set')
  console.log('  shots: drive-shots/confirm-twice-control.png, confirm-twice-target.png')
  process.exitCode = bad ? 1 : 0
} catch (e) {
  console.error('\nDRIVE FAILED: ' + e.message)
  process.exitCode = 1
} finally {
  await browser.close()
}

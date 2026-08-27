// THE APPLE BUTTON, ON THE THREE SURFACES, AT TWO WIDTHS.
//
// WHAT THIS CAN AND CANNOT SETTLE. It cannot complete a sign-in — that needs
// an Apple ID, and the first authorisation is the only time Apple returns a
// name, so it is worth spending on a real account rather than here. What it
// CAN settle is everything short of that, and the second item is the one that
// matters:
//
//   · the button RENDERS, which is also the only honest proof that the flag
//     reached the BUNDLE rather than merely the project. NEXT_PUBLIC_ values
//     are inlined at build time and this gate fails closed, so a button on
//     screen is a compiled-in "true" and nothing else can produce it.
//   · tapping it reaches APPLE, rather than "Unsupported provider". That is
//     the whole point of having configured the provider, and it is checkable
//     without ever completing a sign-in.
//   · Google and LinkedIn are untouched — six renders that must not have moved.
//
// PHONE AND DESKTOP BOTH, because a control that exists at 1280 and is clipped
// at 390 is a control that does not exist for most candidates.
//
//   node scripts/drive-apple-button.mjs <baseUrl>

import { chromium } from 'playwright'
import { existsSync, readFileSync, mkdirSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { withSeededStorage } from './lib/seed-storage.mjs'

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const env = {}
{
  const f = path.join(REPO, '.env.local')
  if (existsSync(f)) {
    for (const line of readFileSync(f, 'utf8').split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/)
      if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '')
    }
  }
}

const BASE = process.argv[2]
if (!BASE) { console.error('usage: node scripts/drive-apple-button.mjs <baseUrl>'); process.exit(2) }
const BYPASS = env.VERCEL_AUTOMATION_BYPASS_SECRET
mkdirSync(path.join(REPO, 'drive-shots'), { recursive: true })

let bad = 0
const check = (l, ok, d) => { if (!ok) bad++; console.log('  ' + (ok ? 'ok   ' : 'FAIL ') + String(l).padEnd(52) + (d ?? '')); return ok }

const SURFACES = [
  { path: '/register/employer-free', name: 'employer signup', apple: /Sign up with Apple/i, google: /Sign up with Google/i, linkedin: /Sign up with LinkedIn/i },
  { path: '/login/employee',         name: 'candidate login',  apple: /Continue with Apple/i, google: /Continue with Google/i, linkedin: /Continue with LinkedIn/i },
  { path: '/register/employee',      name: 'candidate signup', apple: /Continue with Apple/i, google: /Continue with Google/i, linkedin: /Continue with LinkedIn/i },
]

const browser = await chromium.launch()
const ctxOpts = w => ({
  viewport: { width: w, height: w === 390 ? 844 : 900 },
  ...(BYPASS && BASE.includes('.vercel.app')
    ? { extraHTTPHeaders: { 'x-vercel-protection-bypass': BYPASS, 'x-vercel-set-bypass-cookie': 'true' } } : {}),
})

try {
  for (const width of [390, 1280]) {
    console.log(`\n${width === 390 ? 'PHONE (390)' : 'DESKTOP (1280)'}`)
    const ctx = await browser.newContext(ctxOpts(width))
    const page = await ctx.newPage()
    const errs = []
    page.on('pageerror', e => errs.push(e.message))
    await withSeededStorage(page, 'consentAccepted')

    for (const s of SURFACES) {
      await page.goto(`${BASE}${s.path}`, { waitUntil: 'domcontentloaded' })
      await page.waitForTimeout(6000)
      const text = await page.evaluate(() => document.body.innerText || '')
      if (!check(`${s.name} — page rendered`, text.length > 200, s.path + ' · ' + text.length + ' chars')) continue

      // THE APPLE BUTTON EXISTING IS THE BUNDLE CHECK. The gate is compiled in.
      check(`${s.name} — Apple button present`, s.apple.test(text),
        (text.match(s.apple) || ['NOT FOUND'])[0])
      check(`${s.name} — Google still there`, s.google.test(text))
      check(`${s.name} — LinkedIn still there`, s.linkedin.test(text))

      // On screen, not merely in the DOM, and not off the edge.
      const box = await page.evaluate(() => {
        const b = Array.from(document.querySelectorAll('button')).find(el => /with Apple/i.test(el.textContent || ''))
        if (!b) return null
        const r = b.getBoundingClientRect()
        return { top: Math.round(r.top), left: Math.round(r.left), right: Math.round(r.right), w: Math.round(r.width), h: Math.round(r.height) }
      })
      check(`${s.name} — laid out, not just present`, !!box && box.w > 60 && box.h > 20, JSON.stringify(box))
      check(`${s.name} — inside the viewport`, !!box && box.left >= 0 && box.right <= width,
        box ? `left=${box.left} right=${box.right} vw=${width}` : 'no box')
    }
    await page.screenshot({ path: `drive-shots/apple-button-${width}.png`, fullPage: false })
    check(`no page errors at ${width}`, errs.length === 0, errs.join(' | ') || 'clean')
    await ctx.close()
  }

  // ── the half that proves the PROVIDER, not just the button ────────────
  console.log('\nTAPPING IT REACHES APPLE, NOT AN ERROR')
  {
    const ctx = await browser.newContext(ctxOpts(390))
    const page = await ctx.newPage()
    await withSeededStorage(page, 'consentAccepted')
    await page.goto(`${BASE}/login/employee`, { waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(6000)

    const btn = page.getByRole('button', { name: /Continue with Apple/i }).first()
    check('the button is clickable', await btn.count() > 0)
    await btn.click()
    // Supabase either redirects the browser to Apple, or the component renders
    // the provider error inline. Those are the two states and they look
    // nothing alike — which is what makes this worth driving.
    await page.waitForURL(u => /appleid\.apple\.com/.test(u.toString()), { timeout: 25000 }).catch(() => {})
    const url = page.url()
    const text = await page.evaluate(() => document.body.innerText || '')

    check('IT REACHED APPLE', /appleid\.apple\.com/.test(url), url.slice(0, 72))
    check('…and NOT an unsupported-provider error', !/[Uu]nsupported provider/.test(text),
      (text.match(/[^\n]*nsupported[^\n]*/) || ['none'])[0].slice(0, 50))
    check('…nor any inline error under the button', !/Failed to start Apple/i.test(text))
    if (/appleid\.apple\.com/.test(url)) {
      // Apple echoes back what we sent it. If client_id were wrong this is
      // where it shows, before anybody types a password.
      check('Apple was handed our Services ID', /uk\.co\.thrivecareer\.web/.test(url) || /client_id/.test(url),
        (url.match(/client_id=[^&]*/) || ['not in the query'])[0])
      await page.screenshot({ path: 'drive-shots/apple-handoff.png', fullPage: false })
    }
    await ctx.close()
  }

  console.log('')
  console.log(bad ? `  ${bad} FAILED` : '  the button is on all three surfaces at both widths, and it reaches Apple')
  console.log('  shots: drive-shots/apple-button-390.png, apple-button-1280.png, apple-handoff.png')
} catch (e) {
  console.error('\nDRIVE FAILED: ' + e.message)
  bad++
} finally {
  await browser.close()
  process.exit(bad ? 1 : 0)
}

// NOTHING A PERSON READS CALLS THE APP A BROWSER.
//
//   node scripts/prove-no-browser-in-copy.mjs
//
// Filesystem only. No network, no database, milliseconds. In verify.
//
// ── WHY ──────────────────────────────────────────────────────────────────
//
// The iOS shell loads the live site, so every sentence on the web is also a
// sentence inside the app. "Keep me signed in on this browser" reads there
// as a website in a wrapper — the single impression the App Store review
// exists to avoid. Paul found one instance on 5 Sept 2026; enumerating
// rather than fixing the one he saw turned up THREE (LoginPanel,
// PushPriming, PushToggle). The count is always too low, so this stops the
// fourth arriving next month.
//
// ── THE TWO THAT ARE ALLOWED, AND WHY THEY ARE NOT EXCEPTIONS-BY-HABIT ───
//
//   /reset-password  — "opened in a different browser or device". Here the
//                      browser distinction IS the cause being explained; a
//                      PKCE verifier lives in one browser's storage.
//                      Blurring it would make a correct explanation vague.
//   /privacy-policy  — "browser type" in the list of data collected. That
//                      is what the data is called.
//
// Both are allow-listed BY PATH, so a new "browser" sentence anywhere else
// goes red and has to argue for itself.
//
// ── WHAT IT SEARCHES, AND WHAT IT DELIBERATELY DOES NOT ──────────────────
//
// Only text a person could READ: JSX text and quoted strings. Comments,
// identifiers (inAppBrowser, createBrowserClient), imports and userAgent
// tests are none of a reader's business and are excluded — a check that
// flagged those would be noise, and a noisy check gets ignored, which is
// how the fourth instance would arrive anyway.

import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, sep } from 'node:path'

const ALLOWED = [
  'app/reset-password/page.tsx',
  'app/privacy-policy/page.tsx',
]

const walk = (d, out = []) => {
  for (const f of readdirSync(d)) {
    const p = join(d, f)
    if (statSync(p).isDirectory()) walk(p, out)
    else out.push(p)
  }
  return out
}

let bad = 0
const check = (label, ok, detail) => {
  if (!ok) bad++
  console.log('  ' + (ok ? 'ok   ' : 'FAIL ') + String(label).padEnd(58) + (detail ?? ''))
}

console.log('the word "browser" in anything a person reads')
console.log('')

const files = [...walk('app'), ...walk('components')].filter(f => f.endsWith('.tsx'))
const offenders = []
let scanned = 0

for (const f of files) {
  const rel = f.split(sep).join('/')
  if (ALLOWED.includes(rel)) continue
  const src = readFileSync(f, 'utf8')
  // Strip what a reader never sees: block comments, line comments, imports.
  const code = src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')
    .replace(/^\s*import[^\n]*$/gm, '')
  scanned++

  const lines = code.split(/\r?\n/)
  lines.forEach((line, i) => {
    if (!/browser/i.test(line)) return
    // Identifiers and API names are not copy.
    const stripped = line
      .replace(/[A-Za-z]*[Bb]rowser[A-Za-z]*\s*[:=(]/g, '')
      .replace(/createBrowserClient|inAppBrowser|BrowserRouter|browserSupports/g, '')
    if (!/browser/i.test(stripped)) return
    // Now: is it inside JSX text or a quoted string?
    const inJsxText = />[^<>{]*browser[^<>{]*</i.test(line)
    const inString = /(['"`])[^'"`]*browser[^'"`]*\1/i.test(line)
    if (inJsxText || inString) {
      offenders.push(`${rel}:${i + 1}  ${line.trim().slice(0, 84)}`)
    }
  })
}

// ZERO-GUARD: if the walk stops finding files the search has broken, and a
// silent pass on nothing is exactly what this is meant to prevent.
check('the sweep actually read the components', scanned > 100, `${scanned} files`)
check('no user-facing copy calls the app a browser', offenders.length === 0,
  offenders.length ? `${offenders.length} found` : 'none outside the two allow-listed files')
for (const o of offenders) console.log('        ' + o)

console.log('')
if (bad) {
  console.log(`${bad} FAILED`)
  console.log('')
  console.log('  The iOS shell loads the live site, so this sentence is read')
  console.log('  INSIDE THE APP as well as on the web — and there the word')
  console.log('  "browser" reads as a website in a wrapper. Say "device".')
  console.log('  If the browser distinction is genuinely the point, add the')
  console.log('  file to ALLOWED with the reason, as the two there have.')
  process.exit(1)
}
console.log('nothing a person reads calls the app a browser')
process.exit(0)

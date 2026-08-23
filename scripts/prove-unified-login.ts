// ONE LOGIN, AND NOWHERE TO BE WRONG.
//
//   npm run unifiedlogin:prove
//
// There were two login screens and a chooser in front of them. Signing in on
// the wrong one produced a dead end — "This login is for job seekers only.
// Please use the employer login." — for somebody who had typed the right
// password. The role is read AFTER the session exists now and decides only
// where the person lands, so the bounce is gone by construction rather than by
// a fix.
//
// THE REDIRECTS ARE THE RISKY PART, not the form. Seventy-nine references
// across fifty-one files point at the two old paths, plus bookmarks, nine sent
// emails and Google's index. Deleting a page turned /register/employer into a
// 404 once already: a dead href is a string and tsc cannot see it. So both
// paths still resolve, and they must CARRY THE QUERY — everything that bounces
// somebody there sends ?redirect=, and dropping it lands them on a dashboard
// instead of the page they were opening.
//
// COMMENT-STRIPPED SOURCE where the question is "what does a person see".
// A previous check in this repo went red on its own comment about a deleted
// link, which answers a question about the text rather than about the product.
//
// Filesystem only. No network, no database.

import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = join(__dirname, '..')
const read = (rel: string) => readFileSync(join(ROOT, rel), 'utf8')
const stripComments = (src: string) =>
  src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split(/\r?\n/)
    .filter(l => !/^\s*\/\//.test(l))
    .join('\n')

let failed = 0
let ran = 0
const check = (name: string, got: () => unknown, want: unknown) => {
  ran++
  let v: unknown
  try { v = got() } catch (err) {
    console.log(`FAIL  ${name}`)
    console.log(`        threw: ${(err as Error).message}`)
    failed++
    return
  }
  const a = JSON.stringify(v), b = JSON.stringify(want)
  if (a !== b) {
    console.log(`FAIL  ${name}`)
    console.log(`        want ${b}`)
    console.log(`        got  ${a}`)
    failed++
  } else console.log(`ok    ${name}`)
}

// ── ONE FORM, NO FORK ──────────────────────────────────────────────────────

check('/login renders the one panel', () => read('app/login/page.tsx').includes('<LoginPanel'), true)
check(
  '/login no longer forks by role',
  () => {
    const src = stripComments(read('app/login/page.tsx'))
    return src.includes('/login/employer') || src.includes('/login/employee')
  },
  false
)
check(
  'THE WRONG-DOOR BOUNCE IS GONE from what a person can see',
  () => {
    const files = ['app/login/page.tsx', 'components/LoginPanel.tsx']
    return files.filter(f => stripComments(read(f)).includes('This login is for job seekers only'))
  },
  []
)
check(
  'and the panel does not refuse anybody by role',
  () => stripComments(read('components/LoginPanel.tsx')).includes('signOut()\n      setLoading'),
  false
)
check(
  'the role decides only WHERE THEY LAND',
  () => read('components/LoginPanel.tsx').includes("role === 'employer' ? '/employer/dashboard' : '/dashboard'"),
  true
)

// ── BOTH OLD PATHS STILL RESOLVE, AND CARRY THE QUERY ──────────────────────

for (const who of ['employee', 'employer']) {
  check(`/login/${who} still exists as a route`, () => existsSync(join(ROOT, `app/login/${who}/page.tsx`)), true)
  check(`/login/${who} is a redirect, not a form`, () => {
    const src = read(`app/login/${who}/page.tsx`)
    return src.includes('redirect(') && !src.includes('signInWithPassword')
  }, true)
  check(`/login/${who} PRESERVES the query string`, () => {
    const src = read(`app/login/${who}/page.tsx`)
    return src.includes('URLSearchParams') && src.includes('`/login?${query}`')
  }, true)
}

// ── THE SITEMAP STOPS ADVERTISING A BOUNCE ─────────────────────────────────
// It was also publishing the bare "Job Seeker Login" face to Google, which is
// one of the doors strangers arrived at instead of a sign-up form.

check(
  'neither role login is in the sitemap',
  () => {
    const src = read('app/sitemap.ts')
    return /\$\{SITE_URL\}\/login\/(employee|employer)`/.test(src)
  },
  false
)
check('but /login itself still is', () => read('app/sitemap.ts').includes('${SITE_URL}/login`'), true)

// ── ONE NAME FOR THE RETURN PATH ───────────────────────────────────────────
// ?next= was sent to a screen that only read ?redirect=, so the return path was
// silently dropped and somebody opening a review landed on their dashboard.

check(
  'NOTHING sends ?next= to a login screen any more',
  () => {
    const files = [
      'app/applications/[applicationId]/review/page.tsx',
      'app/login/page.tsx',
      'components/LoginPanel.tsx',
      'components/SignupPanel.tsx',
    ]
    return files.filter(f => /\/login[^"'`]*\?next=/.test(stripComments(read(f))))
  },
  []
)
check(
  'the review page sends ?redirect= instead',
  () => read('app/applications/[applicationId]/review/page.tsx').includes('/login?redirect='),
  true
)

// ── NOBODY READS A LIBRARY'S SENTENCE ──────────────────────────────────────

check(
  'the panel routes every error through our own copy',
  () => read('components/LoginPanel.tsx').includes('loginErrorCopy(loginError.message)'),
  true
)
check(
  'and never prints the raw message',
  () => stripComments(read('components/LoginPanel.tsx')).includes('setError(loginError.message)'),
  false
)

// ── WHAT THE OLD SCREEN CARRIED MUST SURVIVE ───────────────────────────────
// Each of these was earned by a real fault. Losing one in a rewrite is the
// easiest way to reintroduce a bug somebody already paid for.

for (const [what, needle] of [
  ['Remember me, per browser', "localStorage.setItem('hex_prev_volatile', '1')"],
  ['the pending-confirm notice', 'getPendingConfirm()'],
  ['its resend', "type: 'signup'"],
  ['the wrong-role notice from OAuth', "authError === 'wrong-role'"],
  ['the in-app-browser hint', 'LinkedInApp|FBAN'],
  ['the just-registered message', 'justRegistered'],
  ['redirect threading into OAuth', 'next={safeReturn || undefined}'],
] as [string, string][]) {
  check(`carried over: ${what}`, () => read('components/LoginPanel.tsx').includes(needle), true)
}

console.log(`\n${ran - failed}/${ran} passed`)
if (failed) {
  console.error(`${failed} FAILED`)
  process.exit(1)
}

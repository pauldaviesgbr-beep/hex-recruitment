// THE HEADER'S TWO DOORS, AND THE ROUTES THEY POINT AT.
//
//   npm run headerdoors:prove
//
// A DEAD href IS A STRING, AND tsc CANNOT SEE IT. That has shipped twice on
// this project: /register/employer 404ing after its page was deleted, and the
// last click of posting a job landing on "City Not Found". This header is one
// wrong string from the same fault, and it is now the ONLY join affordance on
// every page — including a job post, where "Find a Job" used to be the only
// one and was 5,294 sq px of chip in the top bar.
//
// THE SIZE GAP IS THE DESIGN AND IT IS ASSERTED HERE. Sign up is a filled
// button; Log in is a text link. Every review will want to balance them. If
// somebody gives Log in a border or a background, this goes red — which is the
// only way a design decision survives contact with six months of edits.
//
// Filesystem only. No network, no database, milliseconds.

import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = join(__dirname, '..')
const read = (rel: string) => readFileSync(join(ROOT, rel), 'utf8')
const header = read('components/Header.tsx')
const headerCss = read('components/Header.module.css')

/**
 * The header with COMMENTS STRIPPED.
 *
 * The first version of this file searched the raw source for "Find a Job" and
 * went red — because the comment explaining why that link was DELETED contains
 * the words. A check that cannot tell a deletion from a note about a deletion
 * is the same fault as searching for the class you just removed: it answers a
 * question about the text, not about the product.
 *
 * Anything asserting what a person SEES reads this. Anything asserting code
 * structure can read the raw source.
 */
const headerMarkup = header
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

// ── THE ROUTES EXIST ───────────────────────────────────────────────────────
// Not "is the string there" — does the page file exist on disk.

check(
  'the header links to /signup AND that route exists',
  () => header.includes('href="/signup"') && existsSync(join(ROOT, 'app/signup/page.tsx')),
  true
)

check(
  'the header links to /login AND that route exists',
  () => header.includes('href="/login"') && existsSync(join(ROOT, 'app/login/page.tsx')),
  true
)

check(
  'the fork points at routes that exist',
  () => {
    const fork = read('app/signup/page.tsx')
    const targets = Array.from(fork.matchAll(/href="(\/[^"]*)"/g)).map(m => m[1])
    const missing = targets.filter(t => {
      const clean = t.split('?')[0]
      return !existsSync(join(ROOT, 'app' + clean + '/page.tsx'))
    })
    return missing
  },
  []
)

check(
  'and the fork actually has targets, so that check is not vacuous',
  () => Array.from(read('app/signup/page.tsx').matchAll(/href="(\/[^"]*)"/g)).length >= 3,
  true
)

// ── THE OLD DOORS ARE GONE, BOTH OF THEM ───────────────────────────────────
// Deleted in the SAME COMMIT as the replacement, deliberately: a window in
// which a job post has no way to join at all is the fault being fixed.

check('"Find a Job" is gone from the rendered header', () => headerMarkup.includes('Find a Job'), false)
check('"Hire People" is gone from the rendered header', () => headerMarkup.includes('Hire People'), false)
check(
  'and their styles went with them',
  () => /^\s*\.(employer|employee)LoginBtn/m.test(headerCss),
  false
)

// ── THE HIERARCHY, WHICH IS THE DESIGN ─────────────────────────────────────

check(
  'SIGN UP IS A FILLED BUTTON — yellow ground, navy text',
  () => {
    const block = headerCss.split('.headerSignUp {')[1]?.split('}')[0] || ''
    return /background:\s*#FFE500/i.test(block) && /color:\s*#0F172A/i.test(block)
  },
  true
)

check(
  'LOG IN IS A TEXT LINK — no background, no border',
  () => {
    const block = headerCss.split('.headerLogIn {')[1]?.split('}')[0] || ''
    return /background:\s*none/i.test(block) && /border:\s*none/i.test(block)
  },
  true
)

check(
  'and Log in was not "balanced" with a fill later on',
  () => /\.headerLogIn[^{]*\{[^}]*background:\s*#/i.test(headerCss),
  false
)

// ── THE RETURNING USER IS NOT LOST ─────────────────────────────────────────
// The first of Paul's two negatives: it would be easy to fix the stranger's
// path and break the person who already has an account.

check(
  'Log in is hidden ONLY on the login screens themselves',
  () => header.includes('onLoginPage') && header.includes("pathname === '/login'"),
  true
)

check(
  'Sign up is hidden ONLY on the sign-up screens themselves',
  () => header.includes('onSignupPage') && header.includes("pathname === '/signup'"),
  true
)

check(
  'LOG IN SURVIVES ON THE APPLY GATE — the gate has no password box, so a '
  + 'returning chef who taps Apply has nowhere else to go',
  () => {
    // /login/employee is a login screen, so Log in is correctly hidden there —
    // but the gate must not ALSO be in the signup-hidden list, or a returning
    // visitor would face a sign-up form with no way out.
    const signupBlock = header.split('const onSignupPage =')[1]?.split('const onLoginPage')[0] || ''
    return signupBlock.includes('/login/employee')
  },
  false
)

// ── THE SIGNED-OUT APPLY TAP IS COUNTED ────────────────────────────────────
// 64 apply_click events in thirty days, zero anonymous, because the redirect
// returned before the tracking call. The number we most needed did not exist.

check(
  'the signed-out Apply tap is tracked BEFORE the redirect',
  () => {
    const src = read('app/job/[id]/page.tsx')
    const branch = src.split('if (!currentUserRole) {')[1]?.split('return\n    }')[0] || ''
    const iTrack = branch.indexOf("trackClickEvent(job.id, 'apply_click')")
    const iRedirect = branch.indexOf('window.location.href')
    return iTrack >= 0 && iRedirect >= 0 && iTrack < iRedirect
  },
  true
)

console.log(`\n${ran - failed}/${ran} passed`)
if (failed) {
  console.error(`${failed} FAILED`)
  process.exit(1)
}

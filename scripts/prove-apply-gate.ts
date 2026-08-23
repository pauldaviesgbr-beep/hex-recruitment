// THE APPLY GATE IS A SIGN-UP SCREEN, NOT A LOGIN SCREEN.
//
//   npm run applygate:prove
//
// THIS IS THE FAULT THE WHOLE WEEK STARTED WITH, and it is worth writing down
// exactly, because the shape of it is easy to recreate.
//
// The gate was /login/employee. Since 15 August it had been headed "Create a
// free account to apply" — and the form underneath that heading was an EMAIL
// AND PASSWORD LOGIN FORM with a Login button. A stranger read the invitation,
// typed their email, invented a password, pressed the only button on the
// screen, and got "Invalid login credentials". Paul did it three times on
// production on his own phone, at 13:24, 13:25 and 13:26 on 22 Aug 2026.
//
// The heading had been fixed. The form had not. Nobody noticed because every
// check asked whether the RIGHT WORDS were on the page, and they were.
//
// SO THIS DOES NOT CHECK THE HEADING. It checks that the gate route renders a
// SIGN-UP form and offers no password login, and that Apply points at it.
// A check that asked "does it say Create a free account" would have passed
// happily for the entire week the fault was live.
//
// Filesystem and pure functions. No network, no database.

import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { applyGateJobId } from '../lib/applyGate'

const ROOT = join(__dirname, '..')
const read = (rel: string) => readFileSync(join(ROOT, rel), 'utf8')

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

// ── APPLY GOES TO A SIGN-UP ROUTE ──────────────────────────────────────────

check(
  'the JOB PAGE sends a signed-out Apply to the sign-up route',
  () => read('app/job/[id]/page.tsx').includes('/register/employee?redirect='),
  true
)
check(
  'and no longer to the login route',
  () => read('app/job/[id]/page.tsx').includes('/login/employee?redirect=${encodeURIComponent(`/job/'),
  false
)
check(
  'the BOARD MODAL does the same — both call sites, not just the one noticed',
  () => read('components/JobDetailModal.tsx').includes('/register/employee?redirect='),
  true
)
check(
  'and neither still carries the old target',
  () => read('components/JobDetailModal.tsx').includes('/login/employee?redirect=${encodeURIComponent(`/job/'),
  false
)
check(
  'the route it points at exists on disk',
  () => existsSync(join(ROOT, 'app/register/employee/page.tsx')),
  true
)

// ── THE GATE OFFERS NO PASSWORD LOGIN ──────────────────────────────────────
// The heart of it. The panel may contain a password FIELD — it is a sign-up
// form — but it must not contain a sign-IN.

check(
  'the gate panel never calls signInWithPassword',
  () => read('components/SignupPanel.tsx').includes('signInWithPassword'),
  false
)
// The first version of this case compared the value to ITSELF, so it passed
// whatever the file said — a check that could not fail, in a file about a check
// that could not fail. tsc caught it. The expectation is a literal now.
check(
  'and neither does the form it renders',
  () => read('components/CandidateSignupForm.tsx').includes('signInWithPassword'),
  false
)
check(
  'the panel DOES sign people up',
  () => read('components/CandidateSignupForm.tsx').includes('supabase.auth.signUp'),
  true
)
check(
  'the gate route renders the panel, not a login form',
  () => {
    const src = read('app/register/employee/page.tsx')
    return src.includes('<SignupPanel') && !src.includes('signInWithPassword')
  },
  true
)

// ── THE ROLE STRIP IS DRIVEN BY THE RETURN PATH, NOT A SECOND FLAG ─────────
// Two pieces of state that must agree need one path that sets both. Here there
// is only one piece of state, and this is it.

check('an apply return path yields the job id', () => applyGateJobId('/job/190425db-fc88-41c6-9536-9a315cef5c34?apply=1'), '190425db-fc88-41c6-9536-9a315cef5c34')
check('without ?apply too — the strip is about the ROLE, not the flag', () => applyGateJobId('/job/190425db-fc88-41c6-9536-9a315cef5c34'), '190425db-fc88-41c6-9536-9a315cef5c34')
check('a non-job return path is NOT the gate', () => applyGateJobId('/dashboard'), null)
check('nothing is not the gate', () => applyGateJobId(null), null)
check('a lookalike path is not the gate', () => applyGateJobId('/jobs?id=190425db-fc88-41c6-9536-9a315cef5c34'), null)

// THE SECURITY ONE. The id comes out of a URL parameter, and the same value is
// threaded into OAuth `next` and the confirmation email. It goes through
// safeInternalPath first, so an off-origin value cannot ride in on it.
check('an absolute url is refused', () => applyGateJobId('https://evil.com/job/190425db-fc88-41c6-9536-9a315cef5c34'), null)
check('a protocol-relative url is refused', () => applyGateJobId('//evil.com/job/190425db-fc88-41c6-9536-9a315cef5c34'), null)
check('a backslash trick is refused', () => applyGateJobId('/\\evil.com/job/190425db-fc88-41c6-9536-9a315cef5c34'), null)
check('a non-uuid id is refused', () => applyGateJobId('/job/not-a-uuid?apply=1'), null)

// ── THE PROMISE IS ON THE SCREEN ───────────────────────────────────────────
// Not the heading — the sentence that answers the question in the person's
// head, and which is now true because it was driven end to end.

check(
  'the gate promises to bring them back to the role',
  () => read('components/SignupPanel.tsx').includes('bring you straight back to the role'),
  true
)
check(
  'and the strip says it too, so it survives a subtitle rewrite',
  () => read('components/SignupPanel.tsx').includes('straight back here when'),
  true
)

console.log(`\n${ran - failed}/${ran} passed`)
if (failed) {
  console.error(`${failed} FAILED`)
  process.exit(1)
}

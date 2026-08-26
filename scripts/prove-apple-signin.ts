// SIGN IN WITH APPLE — THE VISIBLE HALF, AND THE GATE IN FRONT OF IT.
//
// The button cannot work until a Services ID and a signing key exist in the
// Supabase dashboard. Those are Apple Developer portal items and they are
// Paul's to create. Until then signInWithOAuth returns "Unsupported provider"
// and the person is left on a dead button with an error.
//
// A SIGN-IN BUTTON THAT SIGNS NOBODY IN IS WORSE THAN NO BUTTON. It reads as
// our product being broken, on the screen where that costs most. So the whole
// point of this file is the direction of failure: the flag must be OFF for
// everything except the one exact string, because being wrongly off costs a
// missing option and being wrongly on costs a dead one.
//
//   npx tsx --conditions=react-server scripts/prove-apple-signin.ts

import { readFileSync } from 'node:fs'
import { appleSignInEnabled } from '../lib/appleSignIn'

let bad = 0
const check = (label: string, ok: boolean, detail?: string) => {
  if (!ok) bad++
  console.log('  ' + (ok ? 'ok   ' : 'FAIL ') + label.padEnd(58) + (detail ?? ''))
  return ok
}

const withFlag = (v: string | undefined, fn: () => void) => {
  const saved = process.env.NEXT_PUBLIC_APPLE_SIGNIN_ENABLED
  if (v === undefined) delete process.env.NEXT_PUBLIC_APPLE_SIGNIN_ENABLED
  else process.env.NEXT_PUBLIC_APPLE_SIGNIN_ENABLED = v
  try { fn() } finally {
    if (saved === undefined) delete process.env.NEXT_PUBLIC_APPLE_SIGNIN_ENABLED
    else process.env.NEXT_PUBLIC_APPLE_SIGNIN_ENABLED = saved
  }
}

function main() {
  console.log('\nTHE GATE FAILS CLOSED')
  // Every one of these is a plausible way for the flag to be set wrongly, and
  // every one must mean OFF. Only the exact string opens it.
  const off: [string, string | undefined][] = [
    ['unset', undefined],
    ['empty', ''],
    ['"false"', 'false'],
    ['"TRUE" — wrong case', 'TRUE'],
    ['"True"', 'True'],
    ['"1"', '1'],
    ['"yes"', 'yes'],
    ['" true " with spaces', ' true '],
    ['"truthy"', 'truthy'],
  ]
  for (const [label, v] of off) {
    withFlag(v, () => check(label + ' -> off', appleSignInEnabled() === false, JSON.stringify(v)))
  }

  console.log('\nAND IT DOES OPEN')
  // Without this the whole suite would pass on a function that returns false
  // unconditionally — a gate nobody can ever open is not a gate, it is a
  // deletion, and it would look identical above.
  withFlag('true', () => check('the exact string "true" -> on', appleSignInEnabled() === true))

  console.log('\nTHE BUTTON ASKS THE GATE, AND NOTHING ELSE STARTS AN APPLE FLOW')
  const btn = readFileSync('components/AppleSignInButton.tsx', 'utf8')
  check('the button imports the shared gate', btn.includes(`from '@/lib/appleSignIn'`))
  check('…and returns nothing when it is shut', btn.includes('if (!appleSignInEnabled()) return null'))
  check('the gate sits AFTER the hooks', btn.indexOf('useState') < btn.indexOf('appleSignInEnabled()'),
    'a conditional hook would break the moment the flag changed between renders')
  check('it asks Apple for the name', btn.includes(`scopes: 'name email'`),
    'Apple returns it once, on first authorisation, and never again')

  // THE DISCRIMINATING ONE. If any other file started an Apple flow directly,
  // the flag would be bypassable and every check above would still pass.
  const sources = [
    'components/AppleSignInButton.tsx',
    'components/GoogleSignInButton.tsx',
    'components/LinkedInSignInButton.tsx',
    'components/LoginPanel.tsx',
    'components/SignupPanel.tsx',
    'app/register/employer-free/page.tsx',
  ]
  const startsAppleFlow = sources.filter(f => /provider:\s*'apple'/.test(readFileSync(f, 'utf8')))
  check('exactly one file starts an Apple flow', startsAppleFlow.length === 1, startsAppleFlow.join(', '))
  check('…and it is the gated button', startsAppleFlow[0] === 'components/AppleSignInButton.tsx')

  console.log('\nTHREE SURFACES, AND THE OTHER SIX RENDERS ARE UNTOUCHED')
  const surfaces = [
    'app/register/employer-free/page.tsx',
    'components/LoginPanel.tsx',
    'components/SignupPanel.tsx',
  ]
  for (const f of surfaces) {
    const s = readFileSync(f, 'utf8')
    check(f.replace(/^.*\//, ''),
      (s.split('<AppleSignInButton').length - 1) === 1
      && s.includes('<GoogleSignInButton') && s.includes('<LinkedInSignInButton'),
      'apple×1, google, linkedin')
  }
  const roles = surfaces.map(f => (readFileSync(f, 'utf8').match(/<AppleSignInButton role="(\w+)"/) || [])[1])
  check('the employer surface asks for the employer role', roles[0] === 'employer', String(roles[0]))
  check('the two candidate surfaces ask for employee',
    roles[1] === 'employee' && roles[2] === 'employee', roles.slice(1).join(', '))

  console.log('\nWHAT PAUL STILL HAS TO DO IS WRITTEN DOWN, NOT ONLY IN A REPORT')
  const gate = readFileSync('lib/appleSignIn.ts', 'utf8')
  check('the portal prerequisites are listed in the file', gate.includes('APPLE_PORTAL_PREREQUISITES'))
  check('…including the key that downloads exactly once', /\.p8/.test(gate))
  check('…and the SPF/email-source point is kept SEPARATE',
    gate.includes('BOUNCES') && gate.includes('not needed for the button to work'),
    'it governs delivery, not sign-in')

  console.log('')
  console.log(bad
    ? `  ${bad} FAILED`
    : '  the button exists on three surfaces and shows to nobody until Apple is configured')
  process.exit(bad ? 1 : 0)
}

main()

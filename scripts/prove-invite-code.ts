// THE CODE THAT PROVES CONTROL OF THE INVITED MAILBOX.
//
// It exists because accept_employer_invite compares the signed-in address to
// the invited one as STRINGS, and that proxy fails for real people — most
// permanently for Sign in with Apple, whose private relay address can never
// equal what was typed into the invite form.
//
// THIS IS NOT A LOOSENING AND THE TESTS HAVE TO SHOW WHY. A code is stronger
// evidence than a string match: a string can be typed by anybody, a code can
// only be READ by whoever holds the inbox. So the assertions that matter are
// the ones proving a code is bound to ONE invite and ONE address and a short
// window — because a code that opened any invite would be a weaker gate, not
// a stronger one, and it would look identical in a happy-path test.
//
//   npx tsx --conditions=react-server scripts/prove-invite-code.ts

process.env.FOUNDING_APPROVAL_SECRET ||= 'prove-invite-code-fixture-secret'

import { inviteCode, verifyInviteCode, formatInviteCode, maskEmail } from '../lib/inviteCode'

const A = 'aaaaaaaa-1111-1111-1111-aaaaaaaaaaaa'
const B = 'bbbbbbbb-2222-2222-2222-bbbbbbbbbbbb'
const MAIL = 'jane@restaurant.co.uk'
const OTHER = 'jane@otherplace.co.uk'
const NOW = new Date('2026-08-26T12:07:30.000Z')
const MIN = 60_000

let bad = 0
const check = (label: string, ok: boolean, detail?: string) => {
  if (!ok) bad++
  console.log('  ' + (ok ? 'ok   ' : 'FAIL ') + label.padEnd(60) + (detail ?? ''))
  return ok
}

function main() {
  console.log('\nTHE HAPPY PATH')
  const code = inviteCode(A, MAIL, NOW)
  check('a code is produced', /^[A-Z0-9]{8}$/.test(code), code)
  check('and it verifies for its own invite', verifyInviteCode(A, MAIL, code, NOW))
  check('shown to a person as XXXX-XXXX', formatInviteCode(code) === code.slice(0, 4) + '-' + code.slice(4),
    formatInviteCode(code))

  console.log('\nWHAT A PERSON ACTUALLY TYPES STILL WORKS')
  // Read off one screen, typed into another. Every one of these is the same
  // code and refusing any of them would read as "the code is wrong".
  for (const [label, typed] of [
    ['with the dash', formatInviteCode(code)],
    ['lower case', code.toLowerCase()],
    ['with spaces', code.slice(0, 4) + ' ' + code.slice(4)],
    ['pasted with whitespace', '  ' + code + '\n'],
  ] as [string, string][]) {
    check(label, verifyInviteCode(A, MAIL, typed, NOW), JSON.stringify(typed))
  }

  console.log('\nBOUND TO ONE INVITE — the load-bearing property')
  // If this failed, a code obtained legitimately for your own invite would
  // open somebody else's. That is the shape in which "prove the mailbox"
  // would become weaker than the string compare it replaced.
  check('a code for invite A does NOT open invite B', !verifyInviteCode(B, MAIL, code, NOW))
  check('nor does it work for a different invited address', !verifyInviteCode(A, OTHER, code, NOW))
  check('and B genuinely has a code of its own', /^[A-Z0-9]{8}$/.test(inviteCode(B, MAIL, NOW)))
  check('…which is a DIFFERENT code', inviteCode(B, MAIL, NOW) !== code,
    'otherwise the two checks above would pass for the wrong reason')

  console.log('\nBOUND TO A WINDOW')
  check('still good 14 minutes later', verifyInviteCode(A, MAIL, code, new Date(+NOW + 14 * MIN)))
  check('still good 20 minutes later (previous bucket)', verifyInviteCode(A, MAIL, code, new Date(+NOW + 20 * MIN)))
  check('dead after 45 minutes', !verifyInviteCode(A, MAIL, code, new Date(+NOW + 45 * MIN)))
  // A code issued at 14:59 must not die at 15:00. Without honouring the
  // previous bucket it would, and the person would be told it was wrong when
  // it was right when we sent it.
  {
    const edge = new Date('2026-08-26T14:59:40.000Z')
    const c = inviteCode(A, MAIL, edge)
    check('a code issued seconds before a bucket rolls survives it',
      verifyInviteCode(A, MAIL, c, new Date(+edge + 3 * MIN)))
  }

  console.log('\nREFUSALS')
  for (const [label, supplied] of [
    ['empty', ''],
    ['too short', code.slice(0, 7)],
    ['too long', code + 'X'],
    ['right length, wrong code', 'ZZZZZZZZ'],
  ] as [string, string][]) {
    check(label + ' is refused', !verifyInviteCode(A, MAIL, supplied, NOW), JSON.stringify(supplied))
  }

  console.log('\nTHE ALPHABET CANNOT PRODUCE AN AMBIGUOUS CHARACTER')
  // 0/O and 1/I/L are where "the code is wrong" comes from when it is not.
  // Sampled across many invites rather than asserted about the constant, so
  // this fails if the alphabet is ever widened.
  {
    let all = ''
    for (let i = 0; i < 500; i++) all += inviteCode(`fixture-${i}`, MAIL, NOW)
    check('no 0, O, 1, I, L or U in 500 codes', !/[01IOLU]/.test(all),
      Array.from(new Set(all)).sort().join(''))
    check('and the generator is not stuck on one code',
      new Set([inviteCode('x1', MAIL, NOW), inviteCode('x2', MAIL, NOW), inviteCode('x3', MAIL, NOW)]).size === 3)
  }

  console.log('\nIT FAILS CLOSED WITHOUT A SECRET')
  // A missing secret must never mean "no code needed". The route turns this
  // throw into a refusal; if it returned a code instead, the whole proof
  // would be worthless and nothing would look wrong.
  {
    const saved = process.env.FOUNDING_APPROVAL_SECRET
    delete process.env.FOUNDING_APPROVAL_SECRET
    let threw = false
    try { inviteCode(A, MAIL, NOW) } catch { threw = true }
    let verifyThrew = false
    try { verifyInviteCode(A, MAIL, code, NOW) } catch { verifyThrew = true }
    process.env.FOUNDING_APPROVAL_SECRET = saved
    check('generating throws rather than returning a code', threw)
    check('verifying throws rather than returning true', verifyThrew)
    check('and it works again once restored', verifyInviteCode(A, MAIL, code, NOW))
  }

  console.log('\nTHE MASK')
  check('shows enough to recognise', maskEmail(MAIL) === 'j•••@restaurant.co.uk', maskEmail(MAIL))
  check('and copes with rubbish', maskEmail('not-an-email') === 'your invited address')

  console.log('')
  console.log(bad
    ? `  ${bad} FAILED — the code is not a safe proof of the mailbox`
    : '  a code opens exactly one invite, for one address, for half an hour')
  process.exit(bad ? 1 : 0)
}

main()

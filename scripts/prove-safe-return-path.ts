// THE POSITIVE CONTROL FOR THE APPLY-GATE RETURN PATH.
//
//   npm run returnpath:prove
//
// Two things are proved here, and they are different things.
//
// 1. safeReturnPath ACCEPTS the one new shape it exists for — an absolute URL
//    on our own origin, which is what Supabase's {{ .RedirectTo }} hands us —
//    and REFUSES everything safeInternalPath already refused. The danger in
//    this change was never "does the happy path work", it was that widening
//    the input to accept absolute URLs is exactly how an open redirect gets
//    reintroduced. lib/safeRedirect.ts already carries the scar: the check it
//    replaced was `startsWith('/') && !startsWith('//')`, which a backslash
//    walks straight through.
//
// 2. The email template string no longer hardcodes a destination. That string
//    is pasted into the Supabase dashboard by hand and NOTHING ELSE IN THIS
//    REPO CAN SEE IT — not tsc, not the build. This is the only automated
//    thing standing between "someone edits the template" and "every candidate
//    silently stops coming back to the job" again.
//
// IMPORT THE GATE, NEVER RESTATE IT. Every case below calls the real
// safeReturnPath. A restated rule proves only that it was restated
// consistently, which is what let the /welcome skip live for eleven weeks.
//
// EVERY ASSERTION IS A THUNK. prove-first-touch.mjs was watched failing on
// purpose and the first case THREW, which killed the process and left twelve
// checks unreported — output that reads as a broken script rather than as the
// fault it found. The failure mode of a check is part of the check.

import { safeReturnPath, safeInternalPath } from '../lib/safeRedirect'
import { CONFIRM_SIGNUP_LINK, confirmSignupTemplate } from '../emails/supabase-auth-templates'

const OURS = 'https://thrivecareer.co.uk'

type Case = { name: string; got: () => unknown; want: unknown }

const cases: Case[] = [
  // ── THE SHAPE THIS FUNCTION EXISTS FOR ────────────────────────────────
  {
    name: 'absolute same-origin url reduces to its path',
    got: () => safeReturnPath(`${OURS}/job/abc-123`, OURS),
    want: '/job/abc-123',
  },
  {
    name: 'the apply return path survives intact, query and all',
    got: () => safeReturnPath(`${OURS}/job/abc-123?apply=1`, OURS),
    want: '/job/abc-123?apply=1',
  },
  {
    name: 'a bare origin reduces to root rather than being refused',
    got: () => safeReturnPath(OURS, OURS),
    want: '/',
  },

  // ── STILL A PATH-ACCEPTING FUNCTION ───────────────────────────────────
  {
    name: 'a plain path still works (delegates to safeInternalPath)',
    got: () => safeReturnPath('/dashboard', OURS),
    want: '/dashboard',
  },

  // ── THE WHOLE REASON THIS IS RISKY ────────────────────────────────────
  {
    name: 'another origin is refused',
    got: () => safeReturnPath('https://evil.com/x', OURS),
    want: null,
  },
  {
    name: 'a SUFFIX lookalike host is refused (origin equality, not endsWith)',
    got: () => safeReturnPath('https://thrivecareer.co.uk.evil.com/x', OURS),
    want: null,
  },
  {
    name: 'a PREFIX lookalike host is refused (not startsWith either)',
    got: () => safeReturnPath('https://thrivecareer.co.uk@evil.com/x', OURS),
    want: null,
  },
  {
    name: 'right host, wrong scheme is refused',
    got: () => safeReturnPath('http://thrivecareer.co.uk/x', OURS),
    want: null,
  },
  {
    name: 'right host, wrong port is refused',
    got: () => safeReturnPath('https://thrivecareer.co.uk:8443/x', OURS),
    want: null,
  },
  {
    name: 'protocol-relative is refused',
    got: () => safeReturnPath('//evil.com', OURS),
    want: null,
  },
  {
    name: 'the backslash trick is refused',
    got: () => safeReturnPath('/\\evil.com', OURS),
    want: null,
  },
  {
    name: 'javascript: is refused',
    got: () => safeReturnPath('javascript:alert(1)', OURS),
    want: null,
  },
  {
    name: 'double-encoded protocol-relative is refused',
    got: () => safeReturnPath('/%252F%252Fevil.com', OURS),
    want: null,
  },
  {
    name: 'a garbage origin argument refuses rather than throws',
    got: () => safeReturnPath(`${OURS}/x`, 'not-a-url'),
    want: null,
  },
  {
    name: 'null input is refused',
    got: () => safeReturnPath(null, OURS),
    want: null,
  },

  // ── safeInternalPath IS UNCHANGED ─────────────────────────────────────
  // The new function must not have loosened the old one. If someone
  // "simplifies" safeReturnPath by editing safeInternalPath instead, this is
  // the case that goes red.
  {
    name: 'safeInternalPath STILL refuses an absolute url on its own',
    got: () => safeInternalPath(`${OURS}/job/abc-123`),
    want: null,
  },

  // ── THE TEMPLATE STRING NOBODY ELSE CHECKS ────────────────────────────
  // Two questions with DIFFERENT answers before and after the fix. Asking
  // only "does it contain RedirectTo" would pass on a template that carried
  // both, which is precisely the indistinguishable check CLAUDE.md warns
  // about.
  {
    name: 'the confirm template no longer hardcodes a destination',
    got: () => CONFIRM_SIGNUP_LINK.includes('next=/dashboard'),
    want: false,
  },
  {
    name: 'the confirm template passes RedirectTo through as next',
    got: () => CONFIRM_SIGNUP_LINK.includes('next={{ .RedirectTo }}'),
    want: true,
  },
  {
    name: 'the confirm template still uses the verified token_hash pattern',
    got: () => CONFIRM_SIGNUP_LINK.includes('token_hash={{ .TokenHash }}'),
    want: true,
  },

  // ── THE FOOTER ENTITIES ───────────────────────────────────────────────
  // The live dashboard template entity-encodes the two non-ASCII marks and
  // this file did not, so the repo produced HTML subtly worse than what is
  // in production and a paste from here would have reverted someone's fix.
  // Convergence was proved by diffing the whole string against live on
  // 22 Aug 2026; these two cases keep it that way offline, because the real
  // comparison needs the Management API and verify must never need a network.
  {
    name: 'the footer em dash is an entity, not a literal',
    got: () => confirmSignupTemplate.includes('&mdash; The Thrive Team'),
    want: true,
  },
  {
    name: 'the footer middot is an entity, not a literal',
    got: () => confirmSignupTemplate.includes('Thrive &middot; hospitality'),
    want: true,
  },
]

let failed = 0
for (const c of cases) {
  let got: unknown
  try {
    got = c.got()
  } catch (err) {
    console.log(`FAIL  ${c.name}`)
    console.log(`        threw: ${(err as Error).message}`)
    failed++
    continue
  }
  const ok = got === c.want
  if (!ok) {
    console.log(`FAIL  ${c.name}`)
    console.log(`        want ${JSON.stringify(c.want)}  got ${JSON.stringify(got)}`)
    failed++
  } else {
    console.log(`ok    ${c.name}`)
  }
}

console.log(`\n${cases.length - failed}/${cases.length} passed`)
if (failed) {
  console.error(`${failed} FAILED`)
  process.exit(1)
}

// THE DELETE PANEL AND THE DELETE ROUTE DECIDE "IS THIS AN EMPLOYER" FROM THE
// SAME FACT.
//
//   node scripts/prove-deletion-gate-key.mjs
//
// Filesystem only. No network, no database, milliseconds.
//
// ── THE FAULT THIS EXISTS FOR ─────────────────────────────────────────────
//
// Two gates keyed on DIFFERENT facts, disagreeing about one class of user.
//
//   the UI    branched on user_metadata.role
//   the route checks    owning an employer_profiles row
//
// All three team-invite routes stamp `role: 'employer'` into a member's
// metadata, and a member owns NO employer_profiles row. So the screen told
// them "your account is closed by hand, email us" while the API would have
// erased them normally on request. We refused a deletion to the one class of
// user entitled to it, and told them something false about their own account
// to do it. Nothing errored; both halves were individually correct.
//
// ── WHY IT ASSERTS WHAT IT DOES ───────────────────────────────────────────
//
// `userType === 'employer'` legitimately appears three times in that file for
// choosing which TABLE to read settings from. A check that simply banned the
// string would fail on correct code. So this asks about the JSX BRANCH form
// specifically — `userType === 'employer' ? (` — which is the shape the fault
// had and which the table ternaries never take.
//
// Two questions with different answers before and after, which is the whole
// requirement: the old branch is GONE, and the new one is PRESENT.

import { readFileSync } from 'node:fs'

const PAGE = 'app/settings/privacy/page.tsx'
const ROUTE = 'app/api/account/delete/route.ts'

const page = readFileSync(PAGE, 'utf8')
const route = readFileSync(ROUTE, 'utf8')

const out = []
const rec = (name, got, want) => out.push({ name, got, want, ok: JSON.stringify(got) === JSON.stringify(want) })

// THE OLD SHAPE IS GONE. Counted, not merely "not found", so the number is on
// the screen and a future second occurrence is visible rather than absorbed.
rec('no JSX branch on user_metadata.role decides the deletion panel',
  (page.match(/userType === 'employer' \? \(/g) || []).length, 0)

// THE NEW SHAPE IS PRESENT. Without this the check passes on a file where the
// panel was deleted entirely — the classic pass-on-nothing.
rec('the deletion panel branches on owning an employer_profiles row',
  /ownsEmployerProfile/.test(page), true)

rec('and it treats "not asked yet" as its own state rather than as false',
  /ownsEmployerProfile === null/.test(page), true)

// THE PAGE ASKS THE DATABASE, rather than inferring from the role it already
// has. This is what makes the two gates the same fact.
rec('the page reads employer_profiles to answer it',
  /from\('employer_profiles'\)/.test(page), true)

// AND THE ROUTE STILL ASKS THE SAME QUESTION. If this ever moves to metadata
// the gates diverge again, in the other direction.
rec('the route still decides from the employer_profiles row',
  /from\('employer_profiles'\)/.test(route), true)

// COMMENTS ARE STRIPPED FIRST, AND THIS CAUGHT ITSELF ON THE FIRST RUN.
// The route's own comment explains at length why user_metadata.role must NOT
// gate anything — so a naive search finds the phrase and reports the fault it
// was written to prevent. A check that cannot tell prose from code is reading
// the wrong file. The comment is worth keeping; the check has to be sharper.
const code = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '')

rec('no CODE in the route gates on user_metadata.role',
  /user_metadata\??\.role/.test(code(route)), false)

// The table-selection ternaries are correct and must survive — if they vanish,
// somebody has "fixed" this by deleting the wrong thing.
rec('the settings table is still chosen by role (3 legitimate uses remain)',
  (page.match(/userType === 'employer'/g) || []).length >= 3, true)

for (const r of out) {
  console.log(`  ${r.ok ? 'PASS' : 'FAIL'}  ${r.name}`)
  if (!r.ok) console.log(`        got  ${JSON.stringify(r.got)}\n        want ${JSON.stringify(r.want)}`)
}
const bad = out.filter(r => !r.ok).length
console.log(`\n${out.length - bad}/${out.length} passed`)
process.exit(bad ? 1 : 0)

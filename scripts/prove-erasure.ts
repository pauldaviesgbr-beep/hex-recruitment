// THE ERASURE PLAN IS COMPLETE, CONSISTENT, AND POSSIBLE.
//
//   npx tsx scripts/prove-erasure.ts
//
// No network, no database. Everything here is a property of the plan itself.
//
// WHY A PLAN NEEDS ITS OWN CHECK. There is not one foreign key from public to
// auth.users, so nothing cascades and erasure is a hand-written list. A list
// goes stale the day someone adds a table and does not think about deletion —
// and the failure is silent, because a missing table looks exactly like a
// table with no rows. The companion check `erasure:catalogue` (needs the
// database) compares this plan against the live catalogue and names anything
// missing; this one proves the plan is internally sound.
//
// THE STORAGE CHECK IS THE ONE THAT MATTERS MOST. objectBelongsTo has to
// handle all five layouts including the bare <uuid>/ one, because a script
// that assumes a prefix misses 23 of 83 objects — the precise mechanism that
// orphaned 51 files.

import {
  ERASURE_PLAN, STORAGE_LAYOUTS, objectBelongsTo, blockers, BUCKET,
} from '../lib/erasure'
import { metadataDue, SIGNATURE_METADATA_RETENTION_DAYS } from '../lib/signatureRetention'

const out: { name: string; got: any; want: any; ok: boolean }[] = []
const rec = (name: string, get: () => any, want: any) => {
  let got: any
  try { got = get() } catch (e: any) { got = 'threw: ' + e.message }
  out.push({ name, got, want, ok: JSON.stringify(got) === JSON.stringify(want) })
}

const USER = '11111111-2222-3333-4444-555555555555'
const OTHER = '99999999-8888-7777-6666-555555555555'

// ── THE STORAGE MATCHER — ALL FIVE LAYOUTS ────────────────────────────────

rec('bare <uuid>/file  — THE LEGACY LAYOUT, 23 objects live here',
  () => objectBelongsTo(`${USER}/1770136846699.jpg`, USER), true)

rec('photos/<uuid>/file',      () => objectBelongsTo(`photos/${USER}/a.jpg`, USER), true)
rec('cvs/<uuid>/file',         () => objectBelongsTo(`cvs/${USER}/a.docx`, USER), true)
rec('signatures/<uuid>/file',  () => objectBelongsTo(`signatures/${USER}/a.png`, USER), true)
rec('offer-letters/<uuid>/file', () => objectBelongsTo(`offer-letters/${USER}/a.pdf`, USER), true)

// The other direction, which is the one that causes damage if wrong: it must
// NOT claim someone else's file.
rec('does NOT match another person under a prefix',
  () => objectBelongsTo(`photos/${OTHER}/a.jpg`, USER), false)
rec('does NOT match another person in the bare layout',
  () => objectBelongsTo(`${OTHER}/a.jpg`, USER), false)
rec('does NOT match on a coincidental prefix segment',
  () => objectBelongsTo(`photos/${OTHER}/${USER}.jpg`, USER), false)
rec('does NOT match an unknown top folder that happens to contain the id',
  () => objectBelongsTo(`exports/${USER}/a.jpg`, USER), false)

rec('all five layouts are declared', () => STORAGE_LAYOUTS.length, 5)
rec('exactly one of them is the bare layout',
  () => STORAGE_LAYOUTS.filter(l => l.prefix === null).length, 1)
rec('the bare layout reads the owner at position 1, not 2',
  () => STORAGE_LAYOUTS.find(l => l.prefix === null)?.ownerAt, 1)
rec('the bucket is the private one', () => BUCKET, 'profiles')

// ── THE PLAN IS INTERNALLY CONSISTENT ─────────────────────────────────────

rec('every rule names a table and a column',
  () => ERASURE_PLAN.filter(r => !r.table || !r.column).length, 0)

rec('every rule carries a REASON — a plan without one cannot be reviewed',
  () => ERASURE_PLAN.filter(r => !r.why || r.why.length < 20).map(r => r.table), [])

rec('every anonymise rule actually changes something',
  () => ERASURE_PLAN
    .filter(r => r.action === 'anonymise')
    .filter(r => !(r.nullColumns?.length) && !(r.literalColumns?.length))
    .map(r => r.table), [])

// A rule that neither deletes, anonymises, keeps nor blocks would be a silent
// no-op — the most dangerous kind of entry, because it LOOKS handled.
rec('no rule has an action outside the four',
  () => ERASURE_PLAN
    .filter(r => !['delete', 'anonymise', 'keep', 'blocked'].includes(r.action))
    .map(r => r.table), [])

rec("every 'keep' says why it is kept rather than just keeping it",
  () => ERASURE_PLAN.filter(r => r.action === 'keep' && !/because|audit|IS the|legitimate|contract|proves/i.test(r.why))
    .map(r => r.table), [])

// ── THE DECISIONS ARE THE ONES THAT WERE MADE ─────────────────────────────
//
// Asserted individually, so quietly reversing one is a failing test rather
// than a diff nobody reads.

const rule = (t: string) => ERASURE_PLAN.find(r => r.table === t)

rec('(a) applications are ANONYMISED, not deleted',
  () => rule('job_applications')?.action, 'anonymise')
rec('(a) and candidate_id is dropped — without this it is pseudonymisation',
  () => rule('job_applications')?.nullColumns?.includes('candidate_id'), true)
// REVERSED 27 AUG 2026. This used to assert the opposite — that the
// employer's notes were left alone, "because those are the employer's words".
// The question is not who wrote it, it is who it IDENTIFIES: a note reading
// "spoke to Sarah, strong on pastry" is personal data about Sarah whoever
// typed it, and leaving it defeats the unlinkability the line above demands.
rec("(a) the employer's notes are cleared too — they name the CANDIDATE",
  () => rule('job_applications')?.nullColumns?.includes('employer_notes'), true)
rec('(b) messages keep the row and blank the body',
  () => [rule('messages')?.action,
         rule('messages')?.literalColumns?.[0]?.value], ['anonymise', '[deleted]'])
rec('(c) notifications about them are DELETED outright',
  () => rule('notifications')?.action, 'delete')
rec('(e) the offer CONTRACT is kept',
  () => rule('job_offers')?.action, 'anonymise')
rec('(e) but the surveillance columns are cleared',
  () => rule('job_offers')?.nullColumns, ['signature_ip', 'signature_user_agent'])
rec('(e) the offer audit log is kept',
  () => rule('offer_audit_log')?.action, 'keep')
rec('the erasure audit trail itself survives the erasure',
  () => rule('deletion_requests')?.action, 'keep')

// ── THE EMAIL-MATCHED TABLES ──────────────────────────────────────────────
//
// The group a *_id sweep silently misses. If one of these ever loses its
// entry, someone is "deleted" and still in the system.
for (const t of ['email_log', 'waitlist', 'employer_members']) {
  rec(`${t} is matched by EMAIL and deleted`,
    () => [rule(t)?.action, /EMAIL|email/.test(rule(t)?.why || '')], ['delete', true])
}

// ── DEVICE TOKENS, BECAUSE THE FAILURE IS SO VISIBLE ──────────────────────
rec('device_tokens are deleted — otherwise push keeps reaching a deleted person',
  () => rule('device_tokens')?.action, 'delete')

// ── BLOCKERS ARE DECLARED, NOT SILENTLY SKIPPED ───────────────────────────

// NOTHING IS BLOCKED ANY MORE. If a future decision cannot be carried out this
// goes red, rather than the executor quietly doing the half that works — and
// the route refuses entirely while any blocker stands, because erasing 30
// tables of 31 and reporting success is the fault this feature exists to end.
rec('NOTHING is blocked — every decision can be carried out',
  () => blockers().map(b => b.table), [])

// (d) NEEDED A SCHEMA CHANGE, and the part that makes it actually work is not
// the nullable column — it is clearing the DENORMALISED name and avatar.
// Nulling user_id alone would have left the erased person's name and
// photograph sitting on a public comment.
rec('(d) comments are anonymised, not deleted',
  () => rule('temp_post_comments')?.action, 'anonymise')
rec('(d) the body is blanked',
  () => rule('temp_post_comments')?.literalColumns?.[0]?.value, '[deleted]')
rec('(d) AND the denormalised author_name and author_avatar go too',
  () => rule('temp_post_comments')?.nullColumns, ['user_id', 'author_name', 'author_avatar'])

// ── SIGNATURE METADATA: TWELVE MONTHS ─────────────────────────────────────
//
// A RULE ABOUT THE PASSAGE OF TIME CANNOT BE PROVED BY LOOKING ONCE, so this
// asks at two instants either side of the boundary. metadataDue takes its
// "now" as a real parameter of the shipped function, not a mocked clock.

const signed = '2026-01-01T12:00:00Z'
rec('the retention period is twelve months',
  () => SIGNATURE_METADATA_RETENTION_DAYS, 365)
rec('the day BEFORE twelve months: not due',
  () => metadataDue(signed, new Date('2026-12-30T12:00:00Z')), false)
rec('the day AFTER twelve months: due — the two instants differ',
  () => metadataDue(signed, new Date('2027-01-02T12:00:00Z')), true)
rec('an unsigned offer is never due',
  () => metadataDue(null), false)
rec('an unparseable timestamp is never due, rather than due by accident',
  () => metadataDue('not a date'), false)

// ── REPORT ────────────────────────────────────────────────────────────────

let failed = 0
for (const r of out) {
  if (r.ok) console.log(`  PASS  ${r.name}`)
  else {
    failed++
    console.log(`  FAIL  ${r.name}\n          got:  ${JSON.stringify(r.got)}\n          want: ${JSON.stringify(r.want)}`)
  }
}
console.log(`\n${out.length - failed}/${out.length} passed`)
if (blockers().length) {
  console.log(`\n  NOTE: ${blockers().length} table(s) BLOCKED and awaiting a decision:`)
  for (const b of blockers()) console.log(`    ${b.table} — ${b.blocker}`)
}
process.exit(failed ? 1 : 0)

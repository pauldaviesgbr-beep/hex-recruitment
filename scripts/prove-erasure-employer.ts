// THE EMPLOYER ERASURE PLAN IS COMPLETE, CONSISTENT, AND POINTED AT THE RIGHT IDS.
//
//   npx tsx scripts/prove-erasure-employer.ts
//
// No network, no database. Everything here is a property of the plan itself.
// The companion `erasureemployerlive:prove` runs it against a throwaway
// employer and reads the rows back, because a plan can name a column the
// executor never applies.
//
// ── WHY THIS EXISTS SEPARATELY FROM prove-erasure.ts ────────────────────────
//
// THE FAILURE THIS IS BUILT AROUND IS SILENT AND IT IS NOT A TYPE ERROR.
// Employer tables use TWO ID SPACES: every `employer_id` in the schema is the
// owner's USER id, except `employer_members.employer_id`, which is the employer
// PROFILE id. Both are `uuid`. The compiler cannot tell them apart, and the
// executor treats zero matches as success — so a rule pointed at the wrong
// space deletes nothing, reports `matched: 0`, and reads exactly like an
// employer who happened to have no team. Nothing goes red. The team simply
// survives the deletion of the company they belonged to.
//
// So the assertion that earns this file is `idSpace`, and it is asserted by
// NAME rather than by counting: a plan where employer_members drifts back to
// the user id must fail here, loudly, before it reaches a database.

import {
  EMPLOYER_ERASURE_PLAN, ERASURE_PLAN, employerBlockers,
  type TableRule,
} from '../lib/erasure'

const out: { name: string; got: any; want: any; ok: boolean }[] = []
const rec = (name: string, get: () => any, want: any) => {
  let got: any
  try { got = get() } catch (e: any) { got = 'threw: ' + e.message }
  out.push({ name, got, want, ok: JSON.stringify(got) === JSON.stringify(want) })
}

const rule = (t: string): TableRule | undefined => EMPLOYER_ERASURE_PLAN.find(r => r.table === t)

// ── THE PLAN IS READABLE AND INTERNALLY SOUND ─────────────────────────────

rec('every rule names a table and a column',
  () => EMPLOYER_ERASURE_PLAN.filter(r => !r.table || !r.column).map(r => r.table), [])

rec('every rule carries a REASON — a plan without one cannot be reviewed',
  () => EMPLOYER_ERASURE_PLAN.filter(r => !r.why || r.why.length < 20).map(r => r.table), [])

rec('every anonymise/archive rule actually changes something',
  () => EMPLOYER_ERASURE_PLAN
    .filter(r => (r.action === 'anonymise' || r.action === 'archive'))
    .filter(r => !(r.nullColumns?.length) && !(r.literalColumns?.length))
    .map(r => r.table), [])

rec('no rule has an action outside the five',
  () => EMPLOYER_ERASURE_PLAN
    .filter(r => !['delete', 'anonymise', 'archive', 'keep', 'blocked'].includes(r.action))
    .map(r => r.table), [])

// NOTHING IS BLOCKED. This was ['jobs'] for part of 1 Sept 2026, while the
// cascade on jobs.employer_id had no answer — a blocked rule makes
// /api/account/delete refuse with a 503 rather than quietly destroy candidate
// applications, which was the right failure to have. The tombstone removed the
// need for it. If this ever goes red again, something has an unmade decision
// behind it and the route will be refusing employers.
rec('NOTHING is blocked — every decision can be carried out',
  () => employerBlockers().map(b => b.table), [])

// `conversations` appears twice, once per participant column, exactly as
// profile_views does in the candidate plan. Counted by table+column so a real
// duplicate is still caught.
rec('no table+column pair appears twice',
  () => {
    const seen = new Set<string>(); const dupes: string[] = []
    for (const r of EMPLOYER_ERASURE_PLAN) {
      const k = `${r.table}.${r.column}`
      if (seen.has(k)) dupes.push(k); seen.add(k)
    }
    return dupes
  }, [])

// ── THE ID SPACES — THE POINT OF THE FILE ─────────────────────────────────

rec('employer_members is matched on the PROFILE id, not the user id',
  () => rule('employer_members')?.idSpace, 'profile')

rec('and it is the ONLY rule that is — every other id is the owner user id',
  () => EMPLOYER_ERASURE_PLAN.filter(r => r.idSpace === 'profile').map(r => r.table),
  ['employer_members'])

rec('the email-matched tables say so explicitly rather than relying on a name list',
  () => EMPLOYER_ERASURE_PLAN.filter(r => r.idSpace === 'email').map(r => r.table).sort(),
  ['email_log', 'waitlist'])

rec('jobs is matched on the owner user id — 319/319 live rows do',
  () => rule('jobs')?.idSpace ?? 'user', 'user')

// ── PAUL'S DECISIONS, ASSERTED AS BEHAVIOUR ───────────────────────────────

rec('(a) adverts are ARCHIVED, not deleted — deleting takes the applications\' context',
  () => rule('jobs')?.action, 'archive')

rec('(a) and archiving means status = archived',
  () => rule('jobs')?.literalColumns, [{ column: 'status', value: 'archived' }])

// WITHOUT THIS THE ARCHIVE IS UNDONE A MOMENT LATER. jobs.employer_id is NOT
// NULL with an ON DELETE CASCADE, so the row is destroyed by the auth delete
// unless it is repointed first. The archive assertion above passes either way —
// this is the one that distinguishes the working state from the broken one.
rec('(a) and employer_id is repointed at the tombstone, or the cascade wins',
  () => rule('jobs')?.tombstoneColumns, ['employer_id'])

rec('(b) applications are KEPT — the candidate\'s record of applying survives',
  () => rule('job_applications')?.action, 'anonymise')

rec('(b) and they are reached through the employer\'s JOBS, not a user id',
  () => rule('job_applications')?.viaEmployerJobs, true)

rec('(b) the employer\'s notes about a named candidate are what goes',
  () => rule('job_applications')?.nullColumns, ['employer_notes'])

rec('(b) NOTHING nulls candidate_id here — that would erase the candidate too',
  () => (rule('job_applications')?.nullColumns || []).includes('candidate_id'), false)

rec('reviews people wrote about the company are KEPT — their words, not the employer\'s',
  () => rule('company_reviews')?.action, 'keep')

rec('a signed offer is KEPT, exactly as it is when a candidate leaves',
  () => rule('job_offers')?.action, 'keep')

rec('the erasure audit trail survives the erasure',
  () => rule('deletion_requests')?.action, 'keep')

rec('the company profile itself is DELETED',
  () => rule('employer_profiles')?.action, 'delete')

rec('the subscription goes — nothing has ever been charged, so no financial record is lost',
  () => rule('employer_subscriptions')?.action, 'delete')

rec('device tokens go, or push keeps arriving after the account is gone',
  () => rule('device_tokens')?.action, 'delete')

// sender_id is NOT NULL, so it is REPOINTED rather than nulled — nulling it
// would throw. This assertion was ['anonymise', ['sender_id']] until the live
// run showed the column could not take a null.
rec('messages keep the row, blank the body, and repoint the sender',
  () => [rule('messages')?.action, rule('messages')?.tombstoneColumns],
  ['anonymise', ['sender_id']])

// AND THE THREAD ABOVE THE MESSAGES. conversations was missing from BOTH plans
// until the live proof found the message still gone after sender_id was fixed:
// both participant columns cascade, and messages cascade from conversations, so
// the whole thread was destroyed one level up.
rec('conversations are handled on BOTH sides, or half the threads are destroyed',
  () => EMPLOYER_ERASURE_PLAN.filter(r => r.table === 'conversations').map(r => r.column).sort(),
  ['participant_1', 'participant_2'])

// ── COVERAGE: THE CHECK THAT CATCHES THE NEXT TABLE ───────────────────────
//
// THE WHOLE CLASS OF FAULT THIS PLAN CAN HAVE IS OMISSION, and omission is
// invisible — a table nobody listed looks identical to a table with no rows.
// So the list of employer-bearing tables is written down here, read from
// information_schema on 1 Sept 2026, and every one must have a decision.
//
// WHEN THIS FAILS, THE ANSWER IS NOT TO EDIT THIS LIST. It is that somebody
// added a table carrying an employer id and nobody decided what erasure does
// with it. Decide, add the rule, then add the name here.
const EMPLOYER_BEARING_TABLES = [
  'ai_generation_usage',
  'company_reviews',
  'employer_availability',
  'employer_availability_overrides',
  'employer_email_templates',
  'employer_members',
  'employer_profiles',
  'employer_subscriptions',
  'interview_bookings',
  'interview_notes',
  'interviews',
  'job_offers',
  'jobs',
  'saved_candidates',
  'temp_posts',
]

rec('every table carrying an employer id has a decision in the plan',
  () => EMPLOYER_BEARING_TABLES.filter(t => !rule(t)), [])

// ── THE CANDIDATE PLAN IS UNTOUCHED ───────────────────────────────────────
//
// This build added a plan; it must not have quietly changed the other one.
// 31 rules, and the three that matter most, asserted by value.
// 31 until 1 Sept 2026; 33 once `conversations` was added on both sides. The
// number is asserted rather than the shape because this check exists to notice
// that the OTHER plan moved while somebody was editing this one.
rec('the candidate plan still has 33 rules',
  () => ERASURE_PLAN.length, 33)

rec('and the candidate plan handles conversations on both sides too',
  () => ERASURE_PLAN.filter(r => r.table === 'conversations').map(r => r.column).sort(),
  ['participant_1', 'participant_2'])

rec('the candidate plan still anonymises applications rather than deleting them',
  () => ERASURE_PLAN.find(r => r.table === 'job_applications')?.action, 'anonymise')

rec('the candidate plan still deletes the candidate profile',
  () => ERASURE_PLAN.find(r => r.table === 'candidate_profiles')?.action, 'delete')

// ── REPORT ────────────────────────────────────────────────────────────────

for (const r of out) {
  console.log(`  ${r.ok ? 'PASS' : 'FAIL'}  ${r.name}`)
  if (!r.ok) console.log(`        got  ${JSON.stringify(r.got)}\n        want ${JSON.stringify(r.want)}`)
}
const bad = out.filter(r => !r.ok).length
console.log(`\n${out.length - bad}/${out.length} passed`)
process.exit(bad ? 1 : 0)

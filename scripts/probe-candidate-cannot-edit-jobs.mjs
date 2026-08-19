// CAN A CANDIDATE REACH THE EMPLOYER EDITING TOOLS?
//
// The UI half of that question is cosmetic. /my-jobs hiding a kebab from a
// candidate proves nothing about whether a candidate can WRITE, because the
// inline editor added today talks to Supabase straight from the browser — so
// the boundary is RLS, and anyone can open a console.
//
// Every probe below is a PAIR: the same statement, on the same row, as the
// candidate and as the owning employer. Without the employer control a refusal
// means nothing — the write might have been refused because the payload was
// malformed, the row id was wrong, or the table was misspelled, and all three
// look exactly like a policy doing its job.
//
// USES THE PROJECT'S rls-probe, which sends the write with return=minimal and
// asks the read-back separately, so a "violates row-level security" coming
// from the READ can never be reported as the WRITE being refused. That exact
// mistake once nearly shipped as a security pass.
//
// IT NAMES THE STATEMENT KIND because a passing insert proves nothing about an
// update, and the editor does an UPDATE.

import { loadEnv, sessionFor, probeWrite } from './lib/rls-probe.mjs'
import { createClient } from '@supabase/supabase-js'

const env = loadEnv()
const CANDIDATE = 'pauldavies.gbr+candidate@gmail.com'
const EMPLOYER = 'pauldavies.gbr+employer@gmail.com'

const results = []
const check = (name, got, ok) => results.push({ name, got, ok })

const candidate = await sessionFor(env, CANDIDATE)
const employer = await sessionFor(env, EMPLOYER)

// The target row: one of the fixture employer's own adverts. Chosen with the
// service key so the probe is pointed at a row that definitely exists —
// probing a non-existent id would be refused for the wrong reason.
const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
const { data: jobs } = await admin
  .from('jobs')
  .select('id, title, employer_id, status')
  .eq('employer_id', employer.userId)
  .limit(1)

if (!jobs?.length) {
  console.error('SKIP  the fixture employer owns no adverts to probe against')
  process.exit(2)
}
const job = jobs[0]
const originalTitle = job.title

// Counted BEFORE any probe runs, so "nothing cascaded" is a comparison rather
// than a hope.
const { count: appsBefore } = await admin
  .from('job_applications').select('*', { count: 'exact', head: true }).eq('job_id', job.id)

console.log(`target: "${job.title}" (${job.id})`)
console.log(`candidate ${candidate.userId}\nemployer  ${employer.userId}\n`)

// ── 1. UPDATE — the statement the inline editor runs ──────────────────────
const candUpdate = await probeWrite(env, {
  kind: 'update',
  table: 'jobs',
  match: { id: job.id },
  payload: { title: 'PWNED BY A CANDIDATE' },
  auth: candidate,
})
// READ THE ROW BEFORE ANYTHING ELSE TOUCHES IT.
//
// The probe reports "the update was allowed (204)" here, and that is NOT a
// hole — it is the one thing rls-probe cannot see. PostgREST answers 204 for
// an UPDATE that matched ZERO rows, and RLS on UPDATE does not raise: its
// USING clause filters the row out, so "allowed, nothing affected" and
// "allowed, row rewritten" are the same status code. Only the row tells them
// apart.
//
// AND THE ORDER IS LOAD-BEARING. The first version of this file read the title
// at the END, after the owner control had already written the original value
// back — so a genuine breach would have been silently repaired before it was
// measured, and the probe would have reported secure. Read here, between the
// attempt and the control, or the control is an alibi.
const { data: afterCandUpdate } = await admin
  .from('jobs').select('title').eq('id', job.id).maybeSingle()
check('candidate UPDATE changed nothing on someone else\'s job',
  `http=${candUpdate.writeAllowed ? '204' : 'refused'} title now "${afterCandUpdate?.title}"`,
  afterCandUpdate?.title === originalTitle)

// THE CONTROL. If this is also refused, the probe above proves nothing — it
// would mean the statement fails for everyone and RLS was never consulted.
const ownerUpdate = await probeWrite(env, {
  kind: 'update',
  table: 'jobs',
  match: { id: job.id },
  payload: { title: originalTitle },   // its own value: a no-op write
  auth: employer,
})
check('CONTROL: the owning employer CAN update the same row',
  ownerUpdate.verdict, ownerUpdate.writeAllowed === true)

// ── 2. DELETE — there is a DELETE POLICY on jobs even though no app code
//      deletes. Probe it as the candidate; do NOT probe it as the owner,
//      because a successful control would destroy the advert and cascade to
//      its applications. The control for this one is the UPDATE pair above:
//      it already establishes that RLS distinguishes the two identities.
const candDelete = await probeWrite(env, {
  kind: 'delete',
  table: 'jobs',
  match: { id: job.id },
  auth: candidate,
})
// Same reasoning as the UPDATE: a DELETE that matches zero rows is a 204. The
// only honest question is whether the advert is still there.
const { data: afterCandDelete } = await admin
  .from('jobs').select('id, title').eq('id', job.id).maybeSingle()
check('candidate DELETE removed nothing',
  `http=${candDelete.writeAllowed ? '204' : 'refused'} row ${afterCandDelete ? 'still present' : 'GONE'}`,
  !!afterCandDelete)

// AND THE CASCADE DID NOT FIRE. A job delete would take job_applications with
// it, so counting the applications is a second, independent way of asking
// whether the row survived — one that does not depend on the same SELECT.
const { count: appsAfter } = await admin
  .from('job_applications').select('*', { count: 'exact', head: true }).eq('job_id', job.id)
check('this advert\'s applications are intact', `applications=${appsAfter}`, appsAfter === appsBefore)

// ── 3. INSERT — could a candidate post an advert in an employer's name? ────
const candInsert = await probeWrite(env, {
  kind: 'insert',
  table: 'jobs',
  payload: {
    title: 'PROBE — should never exist',
    company: 'PROBE',
    employer_id: employer.userId,
    location: 'Nowhere',
    status: 'active',
  },
  auth: candidate,
})
check('candidate cannot INSERT a job as an employer',
  candInsert.verdict, candInsert.writeAllowed === false)

// A candidate inserting under THEIR OWN id is the other half — is_active_employer()
// should stop it even though auth.uid() = employer_id would be satisfied.
const candInsertSelf = await probeWrite(env, {
  kind: 'insert',
  table: 'jobs',
  payload: {
    title: 'PROBE SELF — should never exist',
    company: 'PROBE',
    employer_id: candidate.userId,
    location: 'Nowhere',
    status: 'active',
  },
  auth: candidate,
})
check('candidate cannot INSERT a job under their own id',
  candInsertSelf.verdict, candInsertSelf.writeAllowed === false)

// ── 4. Nothing was actually changed ───────────────────────────────────────
const { data: after } = await admin
  .from('jobs').select('id, title, status').eq('id', job.id).maybeSingle()
check('the advert still exists with its original title',
  `exists=${!!after} title="${after?.title}"`,
  !!after && after.title === originalTitle)

const { count: strays } = await admin
  .from('jobs').select('*', { count: 'exact', head: true })
  .like('title', 'PROBE%')
check('no probe rows were left behind', `strays=${strays}`, strays === 0)

// ── POSITIVE CONTROL: CAN THIS PROBE SEE A TITLE CHANGE AT ALL? ───────────
//
// Every "changed nothing" above would read exactly the same if the read-back
// were broken, pointed at the wrong row, or cached. So change the title for
// real — as the OWNER, which is allowed — confirm the check notices, and put
// it straight back. Without this the eight passes are a claim about the
// instrument, not about the policies.
const SENTINEL = `${originalTitle} [control]`
await admin.from('jobs').update({ title: SENTINEL }).eq('id', job.id)
const { data: sentinelRead } = await admin
  .from('jobs').select('title').eq('id', job.id).maybeSingle()
const controlSaw = sentinelRead?.title === SENTINEL

await admin.from('jobs').update({ title: originalTitle }).eq('id', job.id)
const { data: restored } = await admin
  .from('jobs').select('title').eq('id', job.id).maybeSingle()

check('CONTROL: the probe detects a title change when one really happens',
  `saw sentinel=${controlSaw}`, controlSaw)
check('CONTROL: the title was restored', `title="${restored?.title}"`,
  restored?.title === originalTitle)

let failed = 0
for (const r of results) {
  if (r.ok) console.log(`  ok    ${r.name}\n          ${r.got}`)
  else { failed++; console.log(`  FAIL  ${r.name}\n          ${r.got}`) }
}
console.log(`\n${results.length - failed}/${results.length} passed`)
process.exit(failed ? 1 : 0)

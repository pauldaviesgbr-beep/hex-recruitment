import { NextRequest, NextResponse } from 'next/server'
import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { getCurrentEmployerOwnerId } from '@/lib/employer'

/**
 * Take an employer's own live advert off the public board (active -> archived).
 *
 * WHY THIS IS A SERVER ROUTE WHEN EVERY OTHER EMPLOYER JOB WRITE IS NOT.
 *
 * Every existing employer mutation on `jobs` goes browser -> Supabase and leans
 * entirely on RLS: /my-jobs reactivates, closes and reposts with a bare
 * `.eq('id', jobId)` and nothing else. That is genuinely safe for OWNERSHIP —
 * the "Employers update own jobs" policy has `auth.uid() = employer_id` in both
 * USING and WITH CHECK, so one employer cannot touch another's row — but it is
 * safe for ownership ONLY. The policy permits ANY status value, so RLS cannot
 * express "active -> archived and nothing else". A client-side archive would be
 * one typo away from writing an arbitrary status, and the transition rule would
 * live in the browser, where it is advisory.
 *
 * So the rule lives here. The endpoint is the only thing that can state it.
 *
 * THE EMPLOYER ID COMES FROM THE SESSION AND IS NEVER READ FROM THE PAYLOAD.
 * The body is ignored entirely — there is nothing a caller can put in it. The
 * id in the URL is a job id, and it is only ever used INSIDE a filter that is
 * already pinned to the caller's own employer_id, so a guessed or copied id
 * from another employer's account matches zero rows.
 *
 * employer_id IS NOT auth.uid(). Multi-user accounts key every employer-scoped
 * table to the OWNER's user_id, so a team member's own id would match nothing.
 * The owner id is resolved through `current_employer_ids()` — a SECURITY
 * DEFINER RPC keyed on auth.uid() — exactly as /my-jobs does when it loads the
 * list. Deriving it any other way would show a member a button that 404s.
 *
 * RLS IS STILL ON. This uses the session-scoped client, not the service role,
 * so both policies still apply underneath. That is deliberate: it means a
 * member WITHOUT `manage_jobs` is refused by the database even though the owner
 * id resolved correctly, and the refusal does not depend on this file getting
 * the capability check right. Belt and braces, with the database as the braces.
 *
 * THIS ENDPOINT DOES NOT REACTIVATE. One direction only, guarded on the current
 * status so an already-archived row cannot be re-archived and a filled one
 * cannot be quietly reopened.
 *
 * NOTHING HERE EMAILS ANYONE. Checked rather than assumed: `jobs` carries no
 * triggers at all (pg_trigger, non-internal: zero rows), and the only caller of
 * /api/job-alerts/match in the repo is the publish path in app/post-job, which
 * fires on a new advert and not on a status change.
 */

export const dynamic = 'force-dynamic'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const jobId = params.id

  // A malformed id is a 404, not a 500: PostgREST would reject a non-uuid with
  // a 22P02 and this would surface as a server error for what is really "no
  // such advert".
  if (!jobId || !UUID.test(jobId)) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 })
  }

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) { return req.cookies.get(name)?.value },
        set(_n: string, _v: string, _o: CookieOptions) {},
        remove(_n: string, _o: CookieOptions) {},
      },
    },
  )

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'unauthenticated' }, { status: 401 })
  }
  if (user.user_metadata?.role !== 'employer') {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  }

  // Owner id, resolved the same way /my-jobs resolves it. The fallback to the
  // user's own id preserves single-user accounts, which have no membership row.
  const ownerId = (await getCurrentEmployerOwnerId(supabase)) ?? user.id

  // Read the advert INSIDE the caller's own scope. Another employer's id and a
  // wholly invented one both land here as "no row", so the response cannot be
  // used to discover whether a job exists.
  const { data: job, error: readErr } = await supabase
    .from('jobs')
    .select('id, status, title')
    .eq('id', jobId)
    .eq('employer_id', ownerId)
    .maybeSingle()

  if (readErr) {
    console.error('[jobs/remove] read failed:', readErr.message)
    return NextResponse.json({ error: 'read_failed' }, { status: 500 })
  }
  if (!job) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 })
  }
  if (job.status !== 'active') {
    return NextResponse.json(
      { error: 'not_active', status: job.status },
      { status: 409 },
    )
  }

  // The write. All three filters are load-bearing:
  //   id          — the advert asked for
  //   employer_id — the caller's own, from the session
  //   status      — 'active', so a row that changed underneath us since the
  //                 read above is not archived on stale information
  // With employer_id pinned, the wrong target is not merely unlikely, it is
  // unmatched. .select() makes the row count a measurement rather than a hope.
  const { data: updated, error: writeErr } = await supabase
    .from('jobs')
    .update({ status: 'archived' })
    .eq('id', jobId)
    .eq('employer_id', ownerId)
    .eq('status', 'active')
    .select('id, status')

  if (writeErr) {
    console.error('[jobs/remove] write failed:', writeErr.message)
    return NextResponse.json({ error: 'write_failed' }, { status: 500 })
  }

  // Zero rows after a read that found an ACTIVE advert means RLS refused the
  // UPDATE while allowing the SELECT — which is precisely a team member without
  // `manage_jobs`. The database, not this file, made that call.
  if (!updated || updated.length === 0) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  }
  if (updated.length !== 1) {
    // Cannot happen: id is a primary key. Loud rather than silent if it ever does.
    console.error('[jobs/remove] expected 1 row, updated', updated.length)
    return NextResponse.json({ error: 'unexpected_row_count' }, { status: 500 })
  }

  return NextResponse.json({ ok: true, id: updated[0].id, status: updated[0].status })
}

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { countryFromHeaders } from '@/lib/geo'

/**
 * Record that a job advert was opened.
 *
 * WHY THIS IS A SERVER ROUTE AND NOT A CLIENT INSERT.
 *
 * The client used to insert into job_views directly. That works for a signed-in
 * user and CANNOT work for a signed-out one: job_views has a single INSERT
 * policy, "Anyone can insert job views", granted to `authenticated` only — so
 * RLS rejects anon — and `anon` has no EXECUTE on increment_job_views either.
 * A signed-out visitor failed twice, silently, which is why every shared link
 * has counted for nothing.
 *
 * The obvious fix is to grant anon both. That opens an unauthenticated public
 * write to a number the business makes decisions from, with no way to throttle
 * it later without another migration. Doing it here instead means:
 *
 *   • NO DATABASE CHANGE AT ALL — no policy, no grant, no migration. The whole
 *     change is code, so it can sit on a branch and be reviewed before it is
 *     live, which a migration cannot.
 *   • one place to add rate limiting when it is needed, rather than a permission
 *     that has to be revoked.
 *
 * NOTHING IDENTIFYING IS STORED. viewer_id is the signed-in user when there is
 * one and null otherwise. No cookie is set, no IP is recorded, no fingerprint is
 * derived. An anonymous view is a bare increment.
 *
 * RATE LIMITED PER JOB, DELIBERATELY NOT PER CALLER.
 *
 * Per-IP would be more precise. It would also mean holding an IP address, even
 * transiently, to decide whether to accept a request — and the standing rule
 * here is that a view stores nothing about the person viewing. Applying that to
 * deduplication and then quietly breaking it for rate limiting would be
 * choosing the convenient reading of my own constraint.
 *
 * So the cap is on the JOB, which is the thing being protected. Nothing about
 * the caller is read, hashed or held. The harm this exists to bound is "one
 * advert's count gets inflated", and a per-job ceiling bounds exactly that.
 *
 * WHAT IT DOES NOT STOP: a caller spreading requests thinly across many adverts
 * still adds volume, and the limit is per serverless instance, so the real
 * ceiling is the cap times however many instances are warm. Both are accepted:
 * the number that matters is per advert, and no individual advert can be run up.
 *
 * The window is generous on purpose. A single job genuinely taking more than
 * this many opens a minute would be remarkable at current scale, so a real
 * surge is never truncated — only a loop is.
 */
const MAX_VIEWS_PER_JOB_PER_WINDOW = 60
const WINDOW_MS = 60_000

// jobId → timestamps within the current window. In memory only; never
// persisted, gone on cold start, and keyed on the JOB rather than the caller.
const recent = new Map<string, number[]>()

function withinRateLimit(jobId: string): boolean {
  const now = Date.now()
  const hits = (recent.get(jobId) || []).filter(t => now - t < WINDOW_MS)
  if (hits.length >= MAX_VIEWS_PER_JOB_PER_WINDOW) {
    recent.set(jobId, hits)
    return false
  }
  hits.push(now)
  recent.set(jobId, hits)

  // Keep the map from growing without bound on a long-lived instance.
  // Array.from rather than iterating the Map directly — the build targets ES5
  // and a for..of over a Map needs downlevelIteration.
  if (recent.size > 5000) {
    Array.from(recent.keys()).forEach(k => {
      const v = recent.get(k)
      if (v && v.every((t: number) => now - t >= WINDOW_MS)) recent.delete(k)
    })
  }
  return true
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const jobId = params.id
  if (!jobId || !/^[0-9a-f-]{36}$/i.test(jobId)) {
    return NextResponse.json({ error: 'bad job id' }, { status: 400 })
  }

  // Checked before any database work, so a loop costs nothing downstream.
  if (!withinRateLimit(jobId)) {
    return NextResponse.json({ ok: false, reason: 'rate-limited' }, { status: 429 })
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    // Tracking must never be the reason a page breaks.
    return NextResponse.json({ ok: false, reason: 'not-configured' })
  }
  const db = createClient(url, key, { auth: { persistSession: false } })

  // Resolve the viewer only if the caller sent a token. No token is the normal
  // case here, not an error.
  let viewerId: string | null = null
  const auth = req.headers.get('authorization')
  if (auth?.startsWith('Bearer ')) {
    const { data } = await db.auth.getUser(auth.slice(7))
    viewerId = data?.user?.id ?? null
  }

  let body: { source?: string; device?: string } = {}
  try { body = await req.json() } catch { /* body is optional */ }

  // The job must exist. Without this the endpoint would happily increment
  // nothing and return success, and a typo'd id would look like a working call.
  const { data: job } = await db.from('jobs').select('id').eq('id', jobId).maybeSingle()
  if (!job) return NextResponse.json({ error: 'no such job' }, { status: 404 })

  // WHERE THE VIEW CAME FROM. Straight off the edge header — this route is the
  // one place BOTH signed-in and signed-out views pass through, so it is the
  // only honest place to count a country for the board. Null locally, and null
  // is already this column's "we did not know".
  const { error } = await db.from('job_views').insert({
    job_id: jobId,
    viewer_id: viewerId,
    source: body.source || 'direct',
    device_type: body.device || null,
    country: countryFromHeaders(req.headers),
  })
  if (error) {
    console.error('[view] insert failed:', error.message)
    return NextResponse.json({ ok: false }, { status: 500 })
  }

  await db.rpc('increment_job_views', { p_job_id: jobId })

  return NextResponse.json({ ok: true, anonymous: viewerId === null })
}

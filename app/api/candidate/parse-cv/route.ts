import { NextRequest, NextResponse } from 'next/server'
import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { createClient } from '@supabase/supabase-js'
import Anthropic from '@anthropic-ai/sdk'
import { parseCv } from '@/lib/cvParse'

/**
 * PARSE THE CALLER'S OWN CV. Phase 1 — nothing reads the result yet.
 *
 * WHY A SERVER ROUTE. The model call needs ANTHROPIC_API_KEY, which cannot go
 * near a browser. That is the whole reason this exists rather than living in
 * the upload handler.
 *
 * THE CANDIDATE ID COMES FROM THE SESSION AND IS NEVER READ FROM THE BODY.
 * There is nothing a caller can put in the request that changes whose CV is
 * parsed or whose row is written — the body is ignored entirely. Without that,
 * an endpoint that writes to candidate_profiles by id is an invitation.
 *
 * FIRE AND FORGET FROM THE CLIENT. The upload has already succeeded by the
 * time this is called, and parsing is not the candidate's problem: a failure
 * here must never surface as "your CV did not upload", because it did.
 *
 * WRITES ONLY THE THREE PHASE-1 COLUMNS. Never skills, never job_title. A
 * candidate's own words are not ours to overwrite with an inference.
 */
export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function POST(req: NextRequest) {
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
  if (!user) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 })

  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    // FAILS CLOSED AND SAYS SO. Silently recording 'failed' would make a
    // missing key indistinguishable from 26 unreadable CVs.
    console.error('[parse-cv] ANTHROPIC_API_KEY not set — cannot parse')
    return NextResponse.json({ error: 'not_configured' }, { status: 503 })
  }

  // Service role for the read of cv_url and the write-back: the candidate's own
  // RLS would allow both, but this route must not depend on a policy staying
  // permissive for a column they never see.
  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  )

  const { data: profile } = await admin
    .from('candidate_profiles')
    .select('user_id, cv_url')
    .eq('user_id', user.id)
    .maybeSingle()

  if (!profile?.cv_url) {
    return NextResponse.json({ error: 'no_cv' }, { status: 404 })
  }

  let status: string = 'failed'
  let derived: unknown = null

  const dl = await admin.storage.from('profiles').download(profile.cv_url)
  if (dl.error || !dl.data) {
    console.error('[parse-cv] download failed:', dl.error?.message)
  } else {
    const bytes = new Uint8Array(await dl.data.arrayBuffer())
    if (bytes.byteLength === 0) {
      status = 'empty'
    } else {
      const result = await parseCv(bytes, profile.cv_url, new Anthropic({ apiKey }))
      status = result.status
      derived = result.derived
      if (result.status === 'failed') console.error('[parse-cv] parse failed:', result.note)
    }
  }

  const { error: wErr } = await admin
    .from('candidate_profiles')
    .update({
      cv_parsed_at: new Date().toISOString(),
      cv_parse_status: status,
      cv_derived: derived,
    })
    .eq('user_id', user.id)

  if (wErr) {
    console.error('[parse-cv] write failed:', wErr.message)
    return NextResponse.json({ error: 'write_failed' }, { status: 500 })
  }

  // The status is returned but nothing in the product reads it yet. Phase 1.
  return NextResponse.json({ ok: true, status })
}

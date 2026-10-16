// POST /api/report/alert — tell Thrive about a report the caller just filed.
//
// Called by ReportControl straight after its insert. The caller must be signed
// in and must be the reporter of that report, so nobody can make us email
// about someone else's report. Safe to call twice (lib/reportAlert.ts).

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { alertReport } from '@/lib/reportAlert'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  const header = req.headers.get('authorization') || ''
  const token = header.toLowerCase().startsWith('bearer ') ? header.slice(7).trim() : ''
  if (!token) return NextResponse.json({ error: 'signed_out' }, { status: 401 })

  let userId: string | null = null
  try {
    const anon = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { auth: { persistSession: false } })
    const { data } = await anon.auth.getUser(token)
    userId = data.user?.id ?? null
  } catch {
    // No binding: an auth error can carry the token.
  }
  if (!userId) return NextResponse.json({ error: 'signed_out' }, { status: 401 })

  let reportId = ''
  try { reportId = String((await req.json())?.reportId || '') } catch {}
  if (!/^[0-9a-f-]{36}$/i.test(reportId)) return NextResponse.json({ error: 'bad_request' }, { status: 400 })

  const { data: own } = await getSupabaseAdmin()
    .from('content_reports').select('id').eq('id', reportId).eq('reporter_id', userId).maybeSingle()
  if (!own) return NextResponse.json({ error: 'not_found' }, { status: 404 })

  const outcome = await alertReport(reportId)
  return NextResponse.json({ outcome }, { status: outcome === 'failed' ? 502 : 200 })
}

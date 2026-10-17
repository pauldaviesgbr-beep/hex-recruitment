// PUT /api/app/me/visibility — the native "Employers can find you" switch
// (Build 17 review, Profile). The same write the dashboard switch makes
// (app/dashboard/page.tsx handleToggleDiscoverable), as the user, so RLS
// applies exactly as on the website. Refused while a duplicate check holds the
// profile, where the dashboard shows the switch disabled as "Being checked".

import { NextRequest, NextResponse } from 'next/server'
import { userFromRequest } from '@/lib/appApi'
import { parseHold, holdState } from '@/lib/duplicateHold'

export const dynamic = 'force-dynamic'

export async function PUT(req: NextRequest) {
  const me = await userFromRequest(req)
  if (!me) return NextResponse.json({ error: 'signed_out' }, { status: 401 })

  let next: unknown
  try { next = (await req.json())?.discoverable } catch { next = undefined }
  if (typeof next !== 'boolean') return NextResponse.json({ error: 'bad_request' }, { status: 400 })

  const { data: row } = await me.client
    .from('candidate_profiles').select('duplicate_hold').eq('user_id', me.userId).maybeSingle()
  if (!row) return NextResponse.json({ error: 'no_profile' }, { status: 404 })
  if (holdState(parseHold(row.duplicate_hold)) === 'held') {
    return NextResponse.json({ error: 'held' }, { status: 409 })
  }

  const { error } = await me.client
    .from('candidate_profiles').update({ is_discoverable: next }).eq('user_id', me.userId)
  if (error) return NextResponse.json({ error: 'not_saved' }, { status: 503 })
  return NextResponse.json({ isDiscoverable: next }, { headers: { 'Cache-Control': 'no-store' } })
}

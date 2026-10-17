// GET /api/app/shifts — the live line under "Shifts" on the app's Jobs home
// (design H2): how much short-notice and temp work is open right now.
//
// Counted the way the website's /temp-work feed decides it: shift posts with
// status 'open', plus live job adverts marked Temporary, which that page lists
// too. Public, like the feed.

import { NextResponse } from 'next/server'
import { publicClient } from '@/lib/appApi'

export const dynamic = 'force-dynamic'

export async function GET() {
  const db = publicClient()
  const [shifts, temp] = await Promise.all([
    db.from('temp_posts').select('id', { count: 'exact', head: true }).eq('status', 'open'),
    db.from('jobs').select('id', { count: 'exact', head: true }).eq('status', 'active').contains('employment_type', ['Temporary']),
  ])
  if (shifts.error || temp.error) return NextResponse.json({ error: 'shifts_unavailable' }, { status: 503 })
  const open = (shifts.count || 0) + (temp.count || 0)
  return NextResponse.json(
    { open, shiftPosts: shifts.count || 0, temporaryJobs: temp.count || 0 },
    { headers: { 'Cache-Control': 'no-store' } },
  )
}

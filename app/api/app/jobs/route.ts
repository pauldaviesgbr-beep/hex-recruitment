// GET /api/app/jobs — the live board for the iOS app's native Jobs screen.
//
// Public, like the board itself: browsing needs no account. Returns every live
// job already formatted by the website's own rules (lib/appApi.ts), plus the
// "Where" list: regions derived from the live jobs, sorted by count, with no
// zero-count regions, so picking one never gives "no results" (design A5).

import { NextResponse } from 'next/server'
import { publicClient, toAppJob, APP_JOB_COLUMNS } from '@/lib/appApi'

export const dynamic = 'force-dynamic'

export async function GET() {
  const { data, error } = await publicClient()
    .from('jobs')
    .select(APP_JOB_COLUMNS)
    .eq('status', 'active')
    .order('posted_at', { ascending: false })
  if (error) return NextResponse.json({ error: 'jobs_unavailable' }, { status: 503 })

  const jobs = await Promise.all((data || []).map(toAppJob))

  const counts = new Map<string, { key: string; label: string; count: number }>()
  for (const j of jobs) {
    if (!j.region) continue
    const c = counts.get(j.region.key) || { key: j.region.key, label: j.region.label, count: 0 }
    c.count++
    counts.set(j.region.key, c)
  }
  const regions = Array.from(counts.values()).sort((a, b) => b.count - a.count || a.label.localeCompare(b.label))

  return NextResponse.json(
    { total: jobs.length, regions, jobs, fetchedAt: new Date().toISOString() },
    { headers: { 'Cache-Control': 'no-store' } },
  )
}

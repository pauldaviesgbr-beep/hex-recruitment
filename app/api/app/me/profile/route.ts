// GET /api/app/me/profile — what the app's Jobs home needs about the person
// (design H3): a first name for the greeting, and the job title that For you
// matches on. Nothing else, and nothing an employer could not already see.

import { NextRequest, NextResponse } from 'next/server'
import { userFromRequest } from '@/lib/appApi'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const me = await userFromRequest(req)
  if (!me) return NextResponse.json({ error: 'signed_out' }, { status: 401 })

  const { data, error } = await me.client
    .from('candidate_profiles')
    .select('full_name, job_title, job_sector')
    .eq('user_id', me.userId)
    .maybeSingle()
  if (error) return NextResponse.json({ error: 'profile_unavailable' }, { status: 503 })

  // NO NAME IS BETTER THAN AN INVENTED ONE (lib/displayName.ts): with no name
  // the greeting is just "Evening." rather than "Evening, User."
  const first = (data?.full_name || '').trim().split(/\s+/)[0] || null
  return NextResponse.json(
    { firstName: first, jobTitle: data?.job_title?.trim() || null, sector: data?.job_sector || null },
    { headers: { 'Cache-Control': 'no-store' } },
  )
}

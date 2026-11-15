// THE FOUNDING-SPOTS COUNT, ON THE SERVER — for the home page's strip, so the
// number arrives with the page (design 26, round 2 follow-up: it used to land
// ~6 seconds after first paint, because the page fetched /api/check-spots from
// the browser and that route is dynamic and cold-starts).
//
// Same count as /api/check-spots: count_founding_spots_claimed() — a SECURITY
// DEFINER function that joins confirmed users, free subscriptions and approved
// profiles — taken from EMPLOYER_COHORT_CAP.
//
// ONE DIFFERENCE, AND IT IS DELIBERATE: on any error this returns null, never a
// number. The API route turns an error into "0 claimed", i.e. "100 of 100 spots
// left" — a money claim we did not count. null drops the claim; the client then
// tries the API as its fallback, and the strip keeps its reserved height.

import { createClient } from '@supabase/supabase-js'
import { EMPLOYER_COHORT_CAP } from '@/lib/constants/cohort'

export async function getFoundingSpotsRemaining(): Promise<number | null> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !key) return null
  try {
    const supabase = createClient(url, key, { auth: { persistSession: false } })
    const { data, error } = await supabase.rpc('count_founding_spots_claimed')
    if (error || typeof data !== 'number') return null
    return Math.max(0, EMPLOYER_COHORT_CAP - data)
  } catch {
    return null
  }
}

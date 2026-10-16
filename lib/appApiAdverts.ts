import 'server-only'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { APP_JOB_COLUMNS } from '@/lib/appApi'

// THE ADVERT BEHIND A CANDIDATE'S OWN SAVED JOB OR APPLICATION, EVEN AFTER IT CLOSES.
//
// `jobs` lets a candidate read only `status = 'active'` rows. So a saved job
// that has since closed came back from the user-scoped query as nothing, and
// vanished from Saved instead of showing "This job has closed" (design B2);
// and an application's "View the job" had no advert to open. Found 16 Oct 2026
// by drive-app-api-signed-in: the standing fixture's 3 saved jobs are all
// archived, and the endpoint returned 0 of them.
//
// THE ELEVATION IS SCOPED BY THE CALLER'S OWN ROWS. `ids` must come from a
// query of saved_jobs or job_applications made AS THE USER (RLS applied), so
// this can only ever return an advert the person saved or applied to — every
// one of which was public when they did. Never pass ids from the request.
export async function advertsForOwnRows(ids: string[]): Promise<Map<string, any>> {
  const unique = Array.from(new Set(ids.filter(Boolean)))
  if (unique.length === 0) return new Map()
  const { data } = await getSupabaseAdmin().from('jobs').select(APP_JOB_COLUMNS).in('id', unique)
  return new Map((data || []).map((r: any) => [r.id, r]))
}

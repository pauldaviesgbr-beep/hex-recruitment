import { resolveJobArea, countyName, regionName } from './areas'

// Server-side "make sure this job has an area" helper, shared by every path
// that creates or revives a listing:
//   • POST /api/jobs/resolve-area  (called by the post-job hook)
//   • admin "reactivate"           (filled → active)
//
// A job with no resolved area is never hidden from candidates, so failure here
// is degraded-but-safe: we log and move on rather than blocking the status
// change the user actually asked for.

export interface JobAreaSyncResult {
  ok: boolean
  region: string | null
  county: string | null
  method?: string
  reason?: string
}

/**
 * Resolve a job's text location to a canonical area and store it.
 * `db` is any Supabase client with write access to jobs (service role).
 */
export async function resolveAndStoreJobArea(
  db: { from: (table: string) => any },
  jobId: string
): Promise<JobAreaSyncResult> {
  const { data: job, error } = await db
    .from('jobs')
    .select('id, location, area')
    .eq('id', jobId)
    .single()

  if (error || !job) {
    return { ok: false, region: null, county: null, reason: 'job-not-found' }
  }

  const area = await resolveJobArea(job)

  // `jobs.area` is the label the boards, the location filter and the city pages
  // read — the post-job form used to fill it with a hard-coded 'London' when the
  // employer typed the town rather than picking it. It now arrives empty, so the
  // canonical county (falling back to the region) is written here instead: the
  // same resolution that produces area_region, put where the product reads it.
  //
  // ONLY WHEN IT IS EMPTY. An employer who used the picker, and every imported
  // row, has an `area` that is theirs — resolution must never overwrite it.
  // THE LABEL, NOT THE SLUG. area_region and area_county hold ids — 'somerset',
  // 'south-west' — while `area` is displayed verbatim next to the town on every
  // card and job page. Writing the id straight across would print "Bath,
  // somerset". Read off the live rows, not assumed: existing Bath rows carry
  // area 'Somerset' with area_county 'somerset'.
  const existingArea = (job.area || '').trim()
  const resolvedLabel =
    (area.county && countyName(area.county)) ||
    (area.region && regionName(area.region)) ||
    null
  const areaFill = !existingArea && resolvedLabel ? { area: resolvedLabel } : {}

  const { error: updateError } = await db
    .from('jobs')
    .update({ area_region: area.region, area_county: area.county, ...areaFill })
    .eq('id', jobId)

  if (updateError) {
    return { ok: false, region: area.region, county: area.county, reason: 'write-failed' }
  }

  return { ok: true, region: area.region, county: area.county, method: area.method }
}

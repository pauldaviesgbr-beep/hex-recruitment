import { Job } from './mockJobs'

// ─── Job Alert Types ─────────────────────────────────────────────

export interface JobAlert {
  id: string
  candidate_id: string
  alert_name: string
  sectors: string[]
  locations: string[]
  min_salary: number | null
  max_salary: number | null
  job_types: string[]
  tags: string[]
  is_active: boolean
  frequency: 'instant' | 'daily' | 'weekly'
  created_at: string
  updated_at: string
}

// ─── Supabase row → JobAlert conversion ─────────────────────────

export function supabaseRowToJobAlert(row: any): JobAlert {
  return {
    id: row.id,
    candidate_id: row.candidate_id,
    alert_name: row.alert_name,
    sectors: row.sectors || [],
    locations: row.locations || [],
    min_salary: row.min_salary ?? null,
    max_salary: row.max_salary ?? null,
    job_types: row.job_types || [],
    tags: row.tags || [],
    is_active: row.is_active ?? true,
    frequency: row.frequency || 'instant',
    created_at: row.created_at,
    updated_at: row.updated_at,
  }
}

// ─── Matching Algorithm ──────────────────────────────────────────

/**
 * Determines whether a newly posted job matches a given alert.
 *
 * Matching rules (ALL specified criteria must match — AND logic):
 *   - sectors:    if alert.sectors is non-empty, job.category must be in the list
 *   - locations:  if alert.locations is non-empty, job.location or job.area must
 *                 contain at least one of the alert locations (case-insensitive partial match)
 *   - salary:     if alert.min_salary is set, job.salaryMax must be >= alert.min_salary
 *                 if alert.max_salary is set, job.salaryMin must be <= alert.max_salary
 *   - job_types:  if alert.job_types is non-empty, at least one must appear in
 *                 job.employmentType array
 *   - tags:       if alert.tags is non-empty, at least one must appear in job.tags
 *
 * Empty criteria arrays are treated as "match anything" for that dimension.
 */
export function jobMatchesAlert(job: Job, alert: JobAlert): boolean {
  // 1. Sector match
  if (alert.sectors.length > 0) {
    if (!alert.sectors.includes(job.category)) {
      return false
    }
  }

  // 2. Location match (case-insensitive partial)
  if (alert.locations.length > 0) {
    const jobLocationLower = (job.location || '').toLowerCase()
    const jobAreaLower = ((job as any).area || '').toLowerCase()
    const locationMatch = alert.locations.some(loc => {
      const locLower = loc.toLowerCase()
      return jobLocationLower.includes(locLower) || jobAreaLower.includes(locLower)
    })
    if (!locationMatch) return false
  }

  // 3. Salary overlap
  if (alert.min_salary !== null && alert.min_salary > 0) {
    if (job.salaryMax < alert.min_salary) return false
  }
  if (alert.max_salary !== null && alert.max_salary > 0) {
    if (job.salaryMin > alert.max_salary) return false
  }

  // 4. Job type match (at least one overlap)
  if (alert.job_types.length > 0) {
    const jobTypes = Array.isArray(job.employmentType)
      ? job.employmentType
      : [job.employmentType]
    const typeMatch = alert.job_types.some(t =>
      jobTypes.some(jt => jt.toLowerCase() === t.toLowerCase())
    )
    if (!typeMatch) return false
  }

  // 5. Tags match (at least one overlap)
  if (alert.tags.length > 0) {
    const jobTags = (job.tags || []).map(t => t.toLowerCase())
    const tagMatch = alert.tags.some(t => jobTags.includes(t.toLowerCase()))
    if (!tagMatch) return false
  }

  return true
}

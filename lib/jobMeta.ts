// Server-side single-job fetch for metadata / OG image generation on the
// /job/[id] route. Deliberately lightweight: a direct REST read with the anon
// key (public, active jobs only) rather than pulling in the supabase-js client,
// so it stays cheap to run inside generateMetadata and the OG image route.

export interface JobMeta {
  title: string
  company: string
  location: string | null
  salaryMin: number | null
  salaryMax: number | null
  salaryType: string | null
  /** Public banner photo URL (Storage). Only http(s) URLs are usable in the OG image. */
  bannerUrl: string | null
  /** Company logo (may be a data: URI or a URL). */
  logoUrl: string | null
  // ── Added for the server-rendered JobPosting schema ──────────────
  // The JSON-LD is built in the /job/[id] LAYOUT, which is a server
  // component, because the page itself is 'use client' and Google's job
  // crawler never runs its JavaScript. These are the fields JobPosting
  // requires beyond what a preview card needs.
  description: string | null
  employmentType: string[] | null
  postedAt: string | null
  workLocation: string | null
  area: string | null
  fullLocation: { addressLine1?: string; city?: string; postcode?: string } | null
  isRecruiterPosting: boolean | null
}

export async function getJobForMeta(id: string): Promise<JobMeta | null> {
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!base || !key) return null
  // Basic UUID guard so we never build a weird REST query from junk input.
  if (!/^[0-9a-f-]{16,}$/i.test(id)) return null
  try {
    const url =
      `${base}/rest/v1/jobs?select=title,company,location,salary_min,salary_max,salary_type,company_banner_url,company_logo_url` +
      `,description,employment_type,posted_at,work_location,area,full_location,is_recruiter_posting` +
      `&status=eq.active&id=eq.${encodeURIComponent(id)}&limit=1`
    const res = await fetch(url, {
      headers: { apikey: key, Authorization: `Bearer ${key}` },
      // Revalidate occasionally — job copy rarely changes and previews are cached
      // by the social platforms anyway.
      next: { revalidate: 300 },
    })
    if (!res.ok) return null
    const rows = await res.json()
    const row = Array.isArray(rows) ? rows[0] : null
    if (!row) return null
    // Only treat an http(s) banner as usable for the OG image. (Legacy base64
    // data: URIs can't be embedded by the OG renderer; those fall back to the
    // branded card.)
    const banner = typeof row.company_banner_url === 'string' && /^https?:\/\//.test(row.company_banner_url)
      ? row.company_banner_url
      : null
    return {
      title: row.title,
      company: row.company,
      location: row.location ?? null,
      salaryMin: row.salary_min != null ? Number(row.salary_min) : null,
      salaryMax: row.salary_max != null ? Number(row.salary_max) : null,
      salaryType: row.salary_type ?? null,
      bannerUrl: banner,
      logoUrl: row.company_logo_url ?? null,
      description: row.description ?? null,
      employmentType: Array.isArray(row.employment_type) ? row.employment_type : (row.employment_type ? [row.employment_type] : null),
      postedAt: row.posted_at ?? null,
      workLocation: row.work_location ?? null,
      area: row.area ?? null,
      fullLocation: row.full_location ?? null,
      isRecruiterPosting: row.is_recruiter_posting ?? null,
    }
  } catch {
    return null
  }
}

/**
 * Short salary string, e.g. "£38,000–£45,000/yr" or "£14–£18/hr". Collapses to
 * a single figure ("£70,000/yr") when min == max or max is absent. null if no
 * salary at all.
 */
export function formatSalaryShort(job: JobMeta): string | null {
  const lo = job.salaryMin
  if (lo == null) return null
  const hi = job.salaryMax
  const single = hi == null || hi === lo
  if (job.salaryType === 'annual') {
    return single ? `£${lo.toLocaleString()}/yr` : `£${lo.toLocaleString()}–£${hi.toLocaleString()}/yr`
  }
  return single ? `£${lo}/hr` : `£${lo}–£${hi}/hr`
}

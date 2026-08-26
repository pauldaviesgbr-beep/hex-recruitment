import { providerLabel } from '@/lib/authProviders'
// Shared profile-completeness definition for the admin user views.
// Used by both the user LIST (percentage + bar) and the user DETAIL panel
// (per-signal checklist), so the score and the breakdown always agree.

export type ProfileRole = 'candidate' | 'employer'

export interface CompletenessSignal {
  key: string
  label: string
  filled: boolean
  /**
   * MAX POINTS THIS FIELD CAN CONTRIBUTE TO MATCHING, read from the scorer in
   * lib/recommendations.ts rather than from an opinion about what ought to
   * matter. 0 means the matcher never reads it — the field is for a human
   * looking at the profile, not for the ranking.
   *
   * THE DESIGN HANDOFF SAYS "CV and work history matter most for matching".
   * HALF OF THAT IS FALSE AND IT IS THE HALF AN OPERATOR WOULD ACT ON.
   * `cv_url` appears NOWHERE in lib/recommendations.ts — a CV contributes
   * exactly nothing to a candidate's ranking. Work history genuinely does:
   * its titles feed calcTitleMatch as a second source of job titles.
   * The two fields the matcher weights highest are skills (35) and job title
   * (30). Chasing a candidate for a CV to "improve their matching" would have
   * been chasing the wrong field, on our say-so.
   */
  matchWeight: number
}

export interface Completeness {
  percent: number // 0–100
  filledCount: number
  total: number
  signals: CompletenessSignal[]
}

const str = (v: unknown): boolean =>
  typeof v === 'string' ? v.trim().length > 0 : v != null && v !== ''

const arr = (v: unknown): boolean => Array.isArray(v) && v.length > 0

// work_history / education etc. arrive as jsonb — could be an array, object or
// a stringified blank. Treat only genuinely-populated values as filled.
const json = (v: unknown): boolean => {
  if (v == null) return false
  if (Array.isArray(v)) return v.length > 0
  if (typeof v === 'object') return Object.keys(v as object).length > 0
  if (typeof v === 'string') {
    const t = v.trim()
    return t.length > 0 && t !== '[]' && t !== '{}' && t !== 'null'
  }
  return false
}

// Candidate: 10 signals. Name + email are always present at sign-up, so they
// don't count toward "how much extra have they filled in".
function candidateSignals(p: Record<string, any>): CompletenessSignal[] {
  // matchWeight values are the per-component maxima in
  // calculateMatchScore (lib/recommendations.ts). Change them there, change
  // them here.
  return [
    { key: 'phone', label: 'Phone', filled: str(p.phone), matchWeight: 0 },
    { key: 'location', label: 'Location', filled: str(p.location) || str(p.city) || str(p.postcode), matchWeight: 15 },
    { key: 'job_title', label: 'Job title', filled: str(p.job_title) || str(p.headline), matchWeight: 30 },
    { key: 'bio', label: 'Bio', filled: str(p.bio) || str(p.personal_bio), matchWeight: 0 },
    // years_experience is not one of the ten scoring components.
    { key: 'experience', label: 'Experience', filled: p.years_experience != null && Number(p.years_experience) > 0, matchWeight: 0 },
    { key: 'skills', label: 'Skills', filled: arr(p.skills), matchWeight: 35 },
    // ZERO, and this is the one worth knowing: the matcher never opens a CV.
    { key: 'cv', label: 'CV', filled: str(p.cv_url), matchWeight: 0 },
    { key: 'photo', label: 'Photo', filled: str(p.profile_picture_url) || str(p.dashboard_photo_url), matchWeight: 0 },
    // Feeds calcTitleMatch as a second source of job titles, so it is worth
    // what a title is worth.
    { key: 'work_history', label: 'Work history', filled: json(p.work_history), matchWeight: 30 },
    { key: 'salary', label: 'Desired salary', filled: str(p.desired_salary) || p.salary_min != null, matchWeight: 15 },
  ]
}

// Employer: 6 signals (company name is always present at sign-up).
function employerSignals(p: Record<string, any>): CompletenessSignal[] {
  return [
    // ALL ZERO, AND CORRECTLY SO. The scorer ranks JOBS for a candidate; an
    // employer's own profile fields are not an input to it. These six matter
    // for how the company reads on a job page, which is a different question
    // from matching — and the drawer must not imply otherwise.
    { key: 'phone', label: 'Phone', filled: str(p.phone), matchWeight: 0 },
    { key: 'location', label: 'Location', filled: str(p.location), matchWeight: 0 },
    { key: 'industry', label: 'Industry', filled: str(p.industry), matchWeight: 0 },
    { key: 'website', label: 'Website', filled: str(p.website), matchWeight: 0 },
    { key: 'description', label: 'Description', filled: str(p.description), matchWeight: 0 },
    { key: 'logo', label: 'Logo', filled: str(p.logo_url), matchWeight: 0 },
  ]
}

/**
 * The line above the drawer's checklist: how many fields are missing, and
 * which of the MISSING ones the matcher actually weights.
 *
 * Derived, not written down. The handoff's fixed string ("CV and work history
 * matter most for matching") is wrong about the CV and, more importantly,
 * would say the same thing about a profile whose CV is already there. This
 * names what is missing on THIS profile, and says plainly when none of the
 * gaps affect matching at all — which is the common case for an employer.
 */
export function completenessSummary(signals: CompletenessSignal[]): string | null {
  const missing = signals.filter(s => !s.filled)
  if (missing.length === 0) return null

  const count = `${missing.length} thing${missing.length === 1 ? '' : 's'} missing`
  const weighted = missing
    .filter(s => s.matchWeight > 0)
    .sort((a, b) => b.matchWeight - a.matchWeight)

  if (weighted.length === 0) {
    return `${count} — none of them affect matching; they are what an employer reads on the profile.`
  }

  const top = weighted.slice(0, 2).map(s => s.label.toLowerCase())
  const named = top.length === 2 ? `${top[0]} and ${top[1]}` : top[0]
  return `${count} — ${named} ${top.length === 2 ? 'matter' : 'matters'} most for matching.`
}

/** Missing first, then by what the matcher weights. The reader is scanning
 *  for gaps, so the gaps go at the top and the heaviest gap goes first. */
export function sortByGapThenWeight(signals: CompletenessSignal[]): CompletenessSignal[] {
  return [...signals].sort((a, b) => {
    if (a.filled !== b.filled) return a.filled ? 1 : -1
    return b.matchWeight - a.matchWeight
  })
}

export function computeCompleteness(
  profile: Record<string, any> | null | undefined,
  role: ProfileRole
): Completeness {
  const p = profile || {}
  const signals = role === 'employer' ? employerSignals(p) : candidateSignals(p)
  const filledCount = signals.filter(s => s.filled).length
  const percent = signals.length ? Math.round((filledCount / signals.length) * 100) : 0
  return { percent, filledCount, total: signals.length, signals }
}

// Normalise the sign-up channel from the auth user's OAuth provider, with an
// optional UTM/source refinement from the profile row.
export function signupSource(
  authUser: { app_metadata?: { provider?: string } | null; identities?: { provider?: string }[] | null } | null,
  profile?: Record<string, any> | null
): string {
  // ONE MAP, in lib/authProviders.ts. This one had no 'apple' entry, so an
  // Apple identity would have shown in the admin user list as lowercase
  // 'apple' — the raw key, mid-sentence. The security page had a SECOND,
  // hardcoded copy that said 'Google' to everyone.
  const base = providerLabel(authUser)
  const utm = profile?.utm_source || profile?.signup_source
  return utm && String(utm).toLowerCase() !== base.toLowerCase()
    ? `${base} · ${utm}`
    : base
}

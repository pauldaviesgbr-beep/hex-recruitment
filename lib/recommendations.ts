import { Job } from './mockJobs'
import { Candidate } from './mockCandidates'
import { parsePreferredAreas, jobMatchesPreferredAreas } from './areas'
import { keepKnownWorkTypes } from './workTypes'
import { annualisedOrNull } from './salaryInput'

export interface RecommendedJob extends Job {
  matchPercentage: number
  matchReasons: string[]
  /**
   * RELEVANCE POINTS THIS JOB ACTUALLY EARNED — title, skills and sector, with
   * every neutral payout excluded. Zero means "nothing about job fit was
   * matched", and now genuinely means it.
   *
   * An earlier version summed the raw breakdown and was worthless as a
   * confidence measure: those components pay out for MISSING data, so a
   * completely empty profile arrived with 20 points it had done nothing to
   * earn, and any gate of the form `relevancePoints > 0` was true for
   * everybody. See ComponentScore for the four neutrals.
   *
   * THE RANKING DOES NOT READ THIS. The neutral points still count towards
   * `score` and `matchPercentage`, so every list is ordered exactly as before —
   * this figure exists so a CLAIM can be honest without changing what anyone is
   * shown.
   */
  relevancePoints: number
}

/**
 * Does this candidate carry anything the matching can use for RELEVANCE?
 *
 * Title, sector, skills. Deliberately NOT location, salary, experience,
 * preferred areas, job types or work style: those are worth up to 70 of the
 * ~130 points and will happily clear the threshold, but a salary expectation is
 * not a reason to believe a job suits someone. Calling the result of that a
 * recommendation is the claim this exists to stop.
 *
 * One definition, because the dashboard heading and /jobs/recommended's
 * percentage both hang off the same question and must not drift.
 */
export function hasRelevanceSignal(candidate: Candidate | null | undefined): boolean {
  if (!candidate) return false
  return !!(candidate.jobTitle || '').trim()
    || !!(candidate.jobSector || '').trim()
    || (candidate.skills || []).length > 0
    // WORK HISTORY COUNTS, and leaving it out was a bug in the first draft of
    // this function. calcTitleMatch scores against `[candidateTitle,
    // ...historyTitles]`, so someone with no job title but three previous roles
    // listed IS matched on relevance — and would have been told "Latest roles"
    // while the scorer was doing exactly the work the heading denies.
    // Nobody is in that state today (all 23 empty profiles have no history
    // either), which is precisely why it would have gone unnoticed.
    || (candidate.workHistory || []).some(w => !!(w?.title || '').trim())
}

/**
 * What one scoring component returns.
 *
 * `unearned` MARKS A NEUTRAL PAYOUT — points awarded because something was
 * MISSING rather than because anything matched. Four of them exist:
 *
 *   calcTitleMatch    10   no candidate title and no work history
 *   calcTitleMatch     8   neither side could be classified into a sector
 *   calcSkillMatch     5   the JOB lists no skills — true of all 246 live rows
 *   calcSectorMatch    5   no candidate sector and no title to infer one from
 *
 * The points still count towards `score`, so RANKING IS COMPLETELY UNCHANGED.
 * The flag exists only so a user-facing CLAIM can ask "did we actually match
 * anything" without the answer being yes by default.
 *
 * WHY A FLAG AND NOT `reason === null`: because that is not the same question.
 * calcExperienceLevelMatch pays 8 for a genuine adjacent-band match with a null
 * reason, and calcRecencyBonus pays 2 for a real one-week-old job the same way.
 * Reading the absence of a reason as "unearned" would have marked both of those
 * as nothing, which is how the last version of this went wrong.
 */
interface ComponentScore {
  points: number
  reason: string | null
  unearned?: true
}

// Points added when a job sits explicitly inside one of the candidate's chosen
// areas. Small on purpose: area is a filter first (see AREA FILTER below), and
// this only breaks ties between an in-area job and a job whose location we
// couldn't resolve (those are shown to everyone and earn no boost).
const AREA_MATCH_BONUS = 10

interface JobView {
  job_id: string
  viewed_at: string
}

// ─── Main scoring function ──────────────────────────────────────

export function scoreAndRankJobs(
  jobs: Job[],
  candidate: Candidate,
  appliedJobIds: Set<string>,
  viewedJobs: JobView[]
): RecommendedJob[] {
  // ── DIAGNOSTIC LOG — candidate fields that drive scoring ──────
  console.log('[recommendations] candidate profile received:', {
    jobTitle:    candidate.jobTitle      || '(empty)',
    jobSector:   candidate.jobSector     || '(empty)',
    skills:      candidate.skills?.length
                   ? candidate.skills
                   : '(empty)',
    salaryMin:   candidate.salaryMin     ?? '(not set)',
    salaryMax:   candidate.salaryMax     ?? '(not set)',
    salaryPeriod: candidate.salaryPeriod ?? '(not set)',
    location:    candidate.location      || '(empty)',
    preferredLocations:       candidate.preferredLocations       || '(empty)',
    preferredAreas:          candidate.preferredAreas?.length
                               ? candidate.preferredAreas
                               : '(none — no area filter)',
    preferredJobTypes:        candidate.preferredJobTypes        || [],
    workLocationPreferences:  candidate.workLocationPreferences  || [],
    workHistoryTitles: (candidate.workHistory || []).map(w => w.title).filter(Boolean),
  })

  // Filter out jobs the candidate already applied to
  const appliedFiltered = jobs.filter(j => !appliedJobIds.has(j.id))

  // ── AREA FILTER (Phase 2, preferred areas) ────────────────────
  // Applied as a filter rather than folded into the score, because "I won't
  // travel there" is a hard no, not a weak signal. Three guarantees:
  //   • no preferred areas set  → nothing is filtered (the feature is opt-in)
  //   • job with no resolved area → shown to everyone, never hidden
  //   • picking a region covers all its counties, and picking a county still
  //     surfaces region-only jobs in that region
  const prefs = parsePreferredAreas(candidate.preferredAreas)
  const eligibleJobs = prefs.isEmpty
    ? appliedFiltered
    : appliedFiltered.filter(j => jobMatchesPreferredAreas(j, prefs))

  if (!prefs.isEmpty) {
    console.log('[recommendations] area filter:', {
      regions: Array.from(prefs.regions),
      counties: Array.from(prefs.counties),
      before: appliedFiltered.length,
      after: eligibleJobs.length,
      unresolvedShown: eligibleJobs.filter(j => !j.areaRegion && !j.areaCounty).length,
    })
  }

  const scored = eligibleJobs.map(job => {
    const { score, relevanceEarned, reasons, breakdown } = calculateMatchScore(job, candidate, viewedJobs, jobs)

    // Rank an explicit area match above a job we couldn't place. Stated in
    // full rather than inferred from "it survived the filter", so it stays
    // correct if the filter above ever changes.
    const inPickedArea =
      !prefs.isEmpty &&
      !!(job.areaRegion || job.areaCounty) &&
      jobMatchesPreferredAreas(job, prefs)
    const areaBonus = inPickedArea ? AREA_MATCH_BONUS : 0

    return {
      ...job,
      matchPercentage: Math.min(Math.round(score + areaBonus), 99),
      matchReasons: inPickedArea ? [...reasons, 'In your preferred area'] : reasons,
      relevancePoints: relevanceEarned,
      _breakdown: { ...breakdown, area: areaBonus },
    }
  })

  // Sort by match percentage descending
  scored.sort((a, b) => b.matchPercentage - a.matchPercentage)

  // ── DIAGNOSTIC LOG — top 5 results with per-component scores ──
  console.log('[recommendations] top 5 scored jobs:')
  scored.slice(0, 5).forEach((j, i) => {
    console.log(`  #${i + 1} "${j.title}" (${j.company}) → ${j.matchPercentage}%`, j._breakdown)
  })

  // Apply minimum score threshold (25 out of ~130 max ≈ 19%).
  // If fewer than 3 jobs pass, lower the bar enough to show at least 3.
  const THRESHOLD = 25
  const MIN_RESULTS = 3
  let filtered = scored.filter(j => j.matchPercentage >= THRESHOLD)
  if (filtered.length < MIN_RESULTS) {
    filtered = scored.slice(0, MIN_RESULTS)
  }

  return filtered
}

// ─── Score calculation ──────────────────────────────────────────

function calculateMatchScore(
  job: Job,
  candidate: Candidate,
  viewedJobs: JobView[],
  allJobs: Job[]
): { score: number; relevanceEarned: number; reasons: string[]; breakdown: Record<string, number> } {
  let score = 0
  let relevanceEarned = 0
  const reasons: string[] = []
  const breakdown: Record<string, number> = {}

  // 1. Title / industry semantic match (max 30 points) — highest-weight signal
  const titleScore = calcTitleMatch(job, candidate)
  score += titleScore.points
  breakdown.title = titleScore.points
  if (titleScore.reason) reasons.push(titleScore.reason)

  // THE HONEST RELEVANCE TOTAL. Title, skills and sector are the three
  // components that say something about whether this person can do this job —
  // but only when they actually MATCHED. A neutral payout adds to `score` (so
  // the ranking is untouched) and contributes nothing here (so the claim is
  // true). See ComponentScore for the four neutrals and why the flag is
  // explicit rather than inferred from a null reason.
  if (!titleScore.unearned) relevanceEarned += titleScore.points

  // 2. Skills match (max 35 points)
  const skillScore = calcSkillMatch(job, candidate)
  score += skillScore.points
  breakdown.skills = skillScore.points
  if (skillScore.reason) reasons.push(skillScore.reason)
  if (!skillScore.unearned) relevanceEarned += skillScore.points

  // 3. Job type / employment type match (max 15 points)
  const typeScore = calcTypeMatch(job, candidate)
  score += typeScore.points
  breakdown.jobType = typeScore.points
  if (typeScore.reason) reasons.push(typeScore.reason)

  // 4. Salary match (max 15 points)
  const salaryScore = calcSalaryMatch(job, candidate)
  score += salaryScore.points
  breakdown.salary = salaryScore.points
  if (salaryScore.reason) reasons.push(salaryScore.reason)

  // 5. Location match (max 15 points)
  const locationScore = calcLocationMatch(job, candidate)
  score += locationScore.points
  breakdown.location = locationScore.points
  if (locationScore.reason) reasons.push(locationScore.reason)

  // 6. Sector / category match (max 10 points)
  const sectorScore = calcSectorMatch(job, candidate)
  score += sectorScore.points
  breakdown.sector = sectorScore.points
  if (sectorScore.reason) reasons.push(sectorScore.reason)
  if (!sectorScore.unearned) relevanceEarned += sectorScore.points

  // 7. Browsing pattern bonus (max 5 points)
  const browsingScore = calcBrowsingBonus(job, viewedJobs)
  score += browsingScore.points
  breakdown.browsing = browsingScore.points
  if (browsingScore.reason) reasons.push(browsingScore.reason)

  // 8. Recency bonus (max 5 points)
  const recencyScore = calcRecencyBonus(job)
  score += recencyScore.points
  breakdown.recency = recencyScore.points
  if (recencyScore.reason) reasons.push(recencyScore.reason)

  // 9. Tag affinity (max 10 points)
  const tagScore = calcTagAffinity(job, viewedJobs, allJobs)
  score += tagScore.points
  breakdown.tagAffinity = tagScore.points
  if (tagScore.reason) reasons.push(tagScore.reason)

  // 10. Work style tag match (max 10 points)
  const workStyleScore = calcWorkStyleTagMatch(job, candidate)
  score += workStyleScore.points
  breakdown.workStyle = workStyleScore.points
  if (workStyleScore.reason) reasons.push(workStyleScore.reason)

  // 11. Experience level tag match (max 15 points)
  const expLevelScore = calcExperienceLevelMatch(job, candidate)
  score += expLevelScore.points
  breakdown.expLevel = expLevelScore.points
  if (expLevelScore.reason) reasons.push(expLevelScore.reason)

  return { score, relevanceEarned, reasons, breakdown }
}

// ─── Individual scoring components ──────────────────────────────

// Keyword groups mapping industry terms to sector buckets.
// Used to infer a candidate's/job's industry from free-text titles.
const SECTOR_KEYWORDS: Record<string, string[]> = {
  admin:       ['administration', 'admin', 'coordinator', 'officer', 'clerk', 'secretary', 'receptionist', 'pa ', 'executive assistant', 'office manager', 'support manager'],
  digital:     ['software', 'developer', 'engineer', 'programmer', 'web ', 'frontend', 'backend', 'fullstack', 'devops', 'cloud', 'cybersecurity', 'data scientist', 'machine learning', 'ai engineer', 'sysadmin', 'it support', 'network'],
  data:        ['data analyst', 'data engineer', 'business intelligence', 'bi analyst', 'data manager', 'reporting analyst'],
  business:    ['director', 'operations manager', 'business analyst', 'strategy', 'management consultant', 'project manager', 'programme manager', 'chief operating', 'chief executive', 'managing director', 'general manager'],
  hospitality: ['chef', 'cook ', 'hotel', 'restaurant', 'catering', 'bartender', 'waiter', 'waitress', 'sommelier', 'barista', 'kitchen', 'front of house', 'housekeeper', 'concierge'],
  healthcare:  ['nurse', 'doctor', 'carer', 'care assistant', 'health visitor', 'medical', 'clinical', 'physiotherapist', 'occupational therapist', 'pharmacy', 'social worker', 'support worker', 'healthcare'],
  marketing:   ['marketing', 'brand', 'advertising', 'pr manager', 'content', 'seo', 'social media', 'communications', 'campaign'],
  finance:     ['accountant', 'accounting', 'finance', 'financial analyst', 'banking', 'tax', 'audit', 'investment', 'treasury', 'bookkeeper', 'payroll'],
  teaching:    ['teacher', 'lecturer', 'tutor', 'education', 'training', 'instructor', 'academic', 'teaching assistant', 'senco'],
  retail:      ['retail', 'sales assistant', 'shop', 'store manager', 'buyer', 'merchandiser', 'visual merchandiser'],
  sales:       ['sales manager', 'account manager', 'business development', 'sales executive', 'sales rep'],
  engineering: ['mechanical engineer', 'electrical engineer', 'civil engineer', 'structural engineer', 'manufacturing', 'production engineer', 'quality engineer'],
  legal:       ['solicitor', 'lawyer', 'legal', 'paralegal', 'barrister', 'compliance', 'regulatory'],
  creative:    ['designer', 'graphic design', 'artist', 'creative', 'photographer', 'animator', 'ux', 'ui designer'],
  hr:          ['hr ', 'human resources', 'talent acquisition', 'people manager', 'recruitment consultant', 'resourcing'],
  property:    ['property manager', 'estate agent', 'construction', 'architect', 'surveyor', 'building manager'],
  logistics:   ['driver', 'logistics', 'transport', 'warehouse', 'delivery', 'supply chain', 'fleet'],
  science:     ['scientist', 'researcher', 'laboratory', 'lab technician', 'chemist', 'biologist', 'r&d'],
  media:       ['journalist', 'editor', 'producer', 'broadcaster', 'media', 'copywriter', 'content writer'],
}

function inferSectors(text: string): Set<string> {
  const lower = ` ${text.toLowerCase()} `
  const found = new Set<string>()
  for (const [sector, keywords] of Object.entries(SECTOR_KEYWORDS)) {
    if (keywords.some(kw => lower.includes(kw))) found.add(sector)
  }
  return found
}

// Title / industry semantic match (max 30 points)
function calcTitleMatch(
  job: Job,
  candidate: Candidate
): ComponentScore {
  const candidateTitle = (candidate.jobTitle || '').toLowerCase().trim()

  // Collect all title sources: current title + work history roles
  const historyTitles = (candidate.workHistory || [])
    .map(w => (w.title || '').toLowerCase().trim())
    .filter(Boolean)

  const allCandidateTitles = [candidateTitle, ...historyTitles].filter(Boolean)

  // No title info at all — neutral, don't penalise
  if (allCandidateTitles.length === 0) return { points: 10, reason: null, unearned: true }

  const jobTitle = (job.title || '').toLowerCase()
  const jobCategory = (job.category || '').toLowerCase()
  const jobText = `${jobTitle} ${jobCategory}`

  // 1. Direct word overlap between candidate title and job title
  const candWords = candidateTitle.split(/\s+/).filter(w => w.length > 3)
  const jobWords = jobTitle.split(/\s+/).filter(w => w.length > 3)
  const wordOverlap = candWords.filter(cw =>
    jobWords.some(jw => jw.includes(cw) || cw.includes(jw))
  )
  if (wordOverlap.length > 0) {
    return { points: 30, reason: 'Matches your job title' }
  }

  // 2. Also check work history titles against job title
  for (const histTitle of historyTitles) {
    const histWords = histTitle.split(/\s+/).filter(w => w.length > 3)
    const histOverlap = histWords.filter(hw =>
      jobWords.some(jw => jw.includes(hw) || hw.includes(jw))
    )
    if (histOverlap.length > 0) {
      return { points: 25, reason: 'Matches your experience' }
    }
  }

  // 3. Sector inference — map both candidate and job to sector buckets
  const candidateSectors = new Set<string>()
  for (const t of allCandidateTitles) inferSectors(t).forEach(s => candidateSectors.add(s))

  const jobSectors = inferSectors(jobText)

  const sectorOverlap = Array.from(candidateSectors).filter(s => jobSectors.has(s))

  if (sectorOverlap.length > 0) {
    return { points: 20, reason: 'In your industry' }
  }

  // Both sides have identifiable sectors but they don't overlap — clearly different field
  if (candidateSectors.size > 0 && jobSectors.size > 0) {
    return { points: 0, reason: null }
  }

  // One or both sides unclassified — neutral
  return { points: 8, reason: null, unearned: true }
}

function calcSkillMatch(
  job: Job,
  candidate: Candidate
): ComponentScore {
  const jobSkills = (job.skillsRequired || []).map(s => s.toLowerCase().trim())
  const candidateSkills = (candidate.skills || []).map(s => s.toLowerCase().trim())

  if (jobSkills.length === 0) {
    // No skills required — small neutral credit, not a match signal
    return { points: 5, reason: null, unearned: true }
  }

  const matchedSkills = jobSkills.filter(js =>
    candidateSkills.some(cs => cs.includes(js) || js.includes(cs))
  )
  const ratio = matchedSkills.length / jobSkills.length
  const points = Math.round(ratio * 35)

  if (matchedSkills.length > 0) {
    return {
      points,
      reason: `${matchedSkills.length}/${jobSkills.length} skills match`,
    }
  }
  return { points: 0, reason: null }
}

function calcTypeMatch(
  job: Job,
  candidate: Candidate
): ComponentScore {
  // READ THROUGH THE SHARED VOCABULARY, so a word that has been retired cannot
  // be treated as a stated preference. A profile still holding 'Freelance'
  // would otherwise count as "stated", and then score ZERO against every job on
  // the board — strictly worse than having said nothing. Dropping unknown words
  // lets them fall back to the neutral 8, which is what a preference nobody can
  // express any more should be worth.
  const preferred = keepKnownWorkTypes(candidate.preferredJobTypes).map(t => t.toLowerCase())
  const jobTypes = (Array.isArray(job.employmentType)
    ? job.employmentType
    : [job.employmentType]
  ).map(t => t.toLowerCase())

  if (preferred.length === 0) return { points: 8, reason: null }

  const match = jobTypes.some(jt => preferred.some(pt => jt.includes(pt) || pt.includes(jt)))
  if (match) {
    return { points: 15, reason: 'Matches preferred job type' }
  }
  return { points: 0, reason: null }
}

function calcSalaryMatch(
  job: Job,
  candidate: Candidate
): ComponentScore {
  const candPeriod = candidate.salaryPeriod || 'year'

  let candMin = candidate.salaryMin ? Number(candidate.salaryMin) : null
  let candMax = candidate.salaryMax ? Number(candidate.salaryMax) : null
  const desired = candidate.desiredSalary ? Number(candidate.desiredSalary) : null

  // If salary_min is missing but salary_max exists, derive a floor at 70% of max.
  // This prevents a £0–£200K range that matches every job on the platform.
  if (!candMin && candMax) {
    candMin = Math.round(candMax * 0.7)
  }

  // If both are missing, fall back to desired_salary ± 20% as effective range.
  if (!candMin && !candMax && desired) {
    candMin = Math.round(desired * 0.8)
    candMax = Math.round(desired * 1.2)
  }

  if (!candMin && !candMax) return { points: 8, reason: null }

  // Convert to annual for comparison — GUARDED, both sides.
  //
  // A figure that cannot mean what it says is worth less than no figure at all,
  // because the score treats it as a real ask. The £38-a-year profile that
  // prompted lib/salaryInput.ts would score the entire board as a wild
  // overpayment; a job whose period was left on hourly enters at £66m and
  // overlaps nobody. Both now read as "not stated" and fall to the same neutral
  // 8 points as a candidate who never filled the field in — unranked on pay
  // rather than ranked on a number we know is wrong.
  const jobMinAnnual = annualisedOrNull(job.salaryMin, job.salaryPeriod)
  const jobMaxAnnual = annualisedOrNull(job.salaryMax, job.salaryPeriod)
  if (jobMinAnnual === null && jobMaxAnnual === null) return { points: 8, reason: null }

  const candMinRaw = annualisedOrNull(candMin, candPeriod)
  const candMaxRaw = candMax ? annualisedOrNull(candMax, candPeriod) : null
  if (candMinRaw === null && candMaxRaw === null) return { points: 8, reason: null }

  const jobLo = jobMinAnnual ?? (jobMaxAnnual as number)
  const jobHi = jobMaxAnnual ?? (jobMinAnnual as number)
  const candMinAnnual = candMinRaw ?? (candMaxRaw as number)
  const candMaxAnnual = candMaxRaw ?? Infinity

  // Check overlap between ranges
  const hasOverlap = jobHi >= candMinAnnual && jobLo <= candMaxAnnual

  if (hasOverlap) {
    return { points: 15, reason: 'Salary matches your range' }
  }

  // Partial credit if close (within 20%)
  const gap = Math.min(
    Math.abs(jobHi - candMinAnnual),
    Math.abs(jobLo - candMaxAnnual)
  )
  const midpoint = (candMinAnnual + (candMaxAnnual === Infinity ? candMinAnnual * 2 : candMaxAnnual)) / 2
  if (midpoint > 0 && gap / midpoint < 0.2) {
    return { points: 8, reason: 'Salary close to your range' }
  }

  return { points: 0, reason: null }
}

function calcLocationMatch(
  job: Job,
  candidate: Candidate
): ComponentScore {
  const candLocation = (candidate.location || '').toLowerCase()
  const candPreferred = (candidate.preferredLocations || '').toLowerCase()
  const jobLocation = (job.location || '').toLowerCase()
  const jobArea = (job.area || '').toLowerCase()

  if (!candLocation && !candPreferred) return { points: 8, reason: null }

  // Check work location type preference
  const workLocPrefs = (candidate.workLocationPreferences || []).map(p => p.toLowerCase())
  const jobWorkLoc = (job.workLocationType || '').toLowerCase()
  if (workLocPrefs.length > 0 && jobWorkLoc === 'remote' && workLocPrefs.includes('remote')) {
    return { points: 15, reason: 'Remote — matches your preference' }
  }

  // Direct location match
  const locationParts = [candLocation, candPreferred].join(' ').split(/[,\s]+/).filter(Boolean)
  const jobParts = [jobLocation, jobArea].join(' ').split(/[,\s]+/).filter(Boolean)

  const directMatch = locationParts.some(cl =>
    jobParts.some(jl => jl.includes(cl) || cl.includes(jl))
  )

  if (directMatch) {
    return { points: 15, reason: `Located in ${job.location}` }
  }

  // Same region partial credit
  const regions: Record<string, string[]> = {
    'london': ['london', 'city of london', 'greater london'],
    'south east': ['kent', 'surrey', 'sussex', 'hampshire', 'berkshire', 'oxfordshire', 'buckinghamshire'],
    'south west': ['devon', 'cornwall', 'somerset', 'dorset', 'wiltshire', 'bristol', 'gloucestershire'],
    'midlands': ['birmingham', 'coventry', 'nottingham', 'leicester', 'derby', 'wolverhampton', 'staffordshire', 'warwickshire'],
    'north west': ['manchester', 'liverpool', 'chester', 'lancashire', 'cheshire', 'cumbria'],
    'north east': ['newcastle', 'sunderland', 'durham', 'northumberland'],
    'yorkshire': ['leeds', 'sheffield', 'york', 'bradford', 'hull'],
    'east': ['cambridge', 'norfolk', 'suffolk', 'essex', 'hertfordshire'],
    'scotland': ['edinburgh', 'glasgow', 'aberdeen', 'dundee', 'inverness'],
    'wales': ['cardiff', 'swansea', 'newport', 'bangor'],
  }

  for (const [, cities] of Object.entries(regions)) {
    const candInRegion = locationParts.some(cl => cities.some(c => c.includes(cl) || cl.includes(c)))
    const jobInRegion = jobParts.some(jl => cities.some(c => c.includes(jl) || jl.includes(c)))
    if (candInRegion && jobInRegion) {
      return { points: 10, reason: 'Same region as you' }
    }
  }

  return { points: 0, reason: null }
}

// Generic role-level words that appear across all industries and must not
// be used alone to infer a sector match (e.g. "manager" in "Nurse Manager"
// should not match a Business Support Manager).
const GENERIC_ROLE_WORDS = new Set([
  'manager', 'senior', 'junior', 'lead', 'head', 'chief', 'deputy',
  'assistant', 'associate', 'specialist', 'officer', 'executive',
  'coordinator', 'advisor', 'consultant', 'analyst', 'support',
])

function calcSectorMatch(
  job: Job,
  candidate: Candidate
): ComponentScore {
  const candSector = (candidate.jobSector || '').toLowerCase().trim()
  const candTitle = (candidate.jobTitle || '').toLowerCase().trim()
  const jobCategory = (job.category || '').toLowerCase()
  const jobTitle = (job.title || '').toLowerCase()

  if (!candSector && !candTitle) return { points: 5, reason: null, unearned: true }

  // Direct sector match
  if (candSector && jobCategory) {
    const sectorWords = candSector.split(/[\s,&]+/).filter(w => w.length > 2)
    const catWords = jobCategory.split(/[\s,&]+/).filter(w => w.length > 2)
    const match = sectorWords.some(sw => catWords.some(cw => sw.includes(cw) || cw.includes(sw)))
    if (match) {
      return { points: 10, reason: 'Matches your industry' }
    }
  }

  // Job title similarity — only use meaningful, domain-specific words
  // (length > 4 and not a generic role-level word) to avoid cross-sector false matches
  if (candTitle && jobTitle) {
    const titleWords = candTitle.split(/\s+/).filter(
      w => w.length > 4 && !GENERIC_ROLE_WORDS.has(w)
    )
    const match = titleWords.some(tw => jobTitle.includes(tw))
    if (match) {
      return { points: 10, reason: 'Similar to your role' }
    }
  }

  return { points: 0, reason: null }
}

function calcBrowsingBonus(
  job: Job,
  viewedJobs: JobView[]
): ComponentScore {
  if (viewedJobs.length === 0) return { points: 0, reason: null }

  // Check if they viewed this specific job before
  const viewed = viewedJobs.find(v => v.job_id === job.id)
  if (viewed) {
    return { points: 5, reason: 'You viewed this before' }
  }

  return { points: 0, reason: null }
}

function calcRecencyBonus(job: Job): ComponentScore {
  const postedLower = (job.postedAt || '').toLowerCase()

  if (postedLower.includes('just') || postedLower.includes('hour')) {
    return { points: 5, reason: 'Just posted' }
  }
  if (postedLower.includes('yesterday') || postedLower === '1 day ago') {
    return { points: 4, reason: 'Posted recently' }
  }
  if (postedLower.includes('day')) {
    const match = postedLower.match(/(\d+)/)
    if (match && parseInt(match[1]) <= 3) {
      return { points: 3, reason: 'Posted recently' }
    }
  }
  if (postedLower.includes('week')) {
    const match = postedLower.match(/(\d+)/)
    if (match && parseInt(match[1]) <= 1) {
      return { points: 2, reason: null }
    }
  }

  return { points: 0, reason: null }
}

function calcTagAffinity(
  job: Job,
  viewedJobs: JobView[],
  allJobs: Job[]
): ComponentScore {
  const jobTags = job.tags || []
  if (jobTags.length === 0 || viewedJobs.length === 0) return { points: 0, reason: null }

  // Build frequency map of tags from previously viewed jobs
  const tagFreq: Record<string, number> = {}
  const viewedIds = new Set(viewedJobs.map(v => v.job_id))
  for (const vJob of allJobs) {
    if (!viewedIds.has(vJob.id)) continue
    for (const tag of vJob.tags || []) {
      tagFreq[tag] = (tagFreq[tag] || 0) + 1
    }
  }

  if (Object.keys(tagFreq).length === 0) return { points: 0, reason: null }

  // Count how many of the current job's tags match viewed-job tags
  const matchCount = jobTags.filter(t => tagFreq[t]).length
  if (matchCount === 0) return { points: 0, reason: null }

  const ratio = matchCount / jobTags.length
  const points = Math.min(Math.round(ratio * 10), 10)

  if (points >= 5) {
    return { points, reason: 'Tags match your interests' }
  }
  return { points, reason: null }
}

// Work style tag match (max 10 points)
// Awards points when the job has a Remote/Hybrid/On-site tag that matches
// the candidate's workLocationPreferences. Complements the location score
// which uses job.workLocationType; this uses the explicit tag signal.
function calcWorkStyleTagMatch(
  job: Job,
  candidate: Candidate
): ComponentScore {
  const prefs = (candidate.workLocationPreferences || []).map(p => p.toLowerCase())
  if (prefs.length === 0) return { points: 0, reason: null }

  const jobTags = (job.tags || []).map(t => t.toLowerCase())

  if (prefs.includes('remote') && jobTags.includes('remote')) {
    return { points: 10, reason: 'Remote role' }
  }
  if (prefs.includes('hybrid') && jobTags.includes('hybrid')) {
    return { points: 8, reason: 'Hybrid role' }
  }
  if ((prefs.includes('on-site') || prefs.includes('onsite') || prefs.includes('on site')) && jobTags.includes('on-site')) {
    return { points: 6, reason: 'On-site role' }
  }
  return { points: 0, reason: null }
}

// Ordered experience levels used for adjacent-level partial credit
const EXPERIENCE_LEVELS = [
  'no experience required',
  'entry level',
  'mid level',
  'senior level',
  'management',
] as const

// Experience level tag match (max 15 points)
// Maps candidate's years of experience to expected tag levels and awards
// full points for a direct match, partial for an adjacent level.
function calcExperienceLevelMatch(
  job: Job,
  candidate: Candidate
): ComponentScore {
  const years = candidate.yearsExperience != null ? Number(candidate.yearsExperience) : null
  if (years === null) return { points: 5, reason: null }

  // Map years → primary level index (each band covers 2 adjacent levels)
  // 0-1 → idx 0 (No exp / Entry), 2-4 → idx 1 (Entry / Mid),
  // 5-9 → idx 2 (Mid / Senior),  10+  → idx 3 (Senior / Management)
  let primaryIdx: number
  if (years <= 1) primaryIdx = 0
  else if (years <= 4) primaryIdx = 1
  else if (years <= 9) primaryIdx = 2
  else primaryIdx = 3

  const jobTags = (job.tags || []).map(t => t.toLowerCase())

  // Full match: job tag is at the primary level or the next level up
  const primaryTags = [
    EXPERIENCE_LEVELS[primaryIdx],
    EXPERIENCE_LEVELS[primaryIdx + 1] ?? null,
  ].filter(Boolean) as string[]

  if (primaryTags.some(t => jobTags.includes(t))) {
    return { points: 15, reason: 'Matches your experience level' }
  }

  // Partial match: one level outside the primary band
  const adjacentTags = [
    primaryIdx > 0 ? EXPERIENCE_LEVELS[primaryIdx - 1] : null,
    primaryIdx + 2 < EXPERIENCE_LEVELS.length ? EXPERIENCE_LEVELS[primaryIdx + 2] : null,
  ].filter(Boolean) as string[]

  if (adjacentTags.some(t => jobTags.includes(t))) {
    return { points: 8, reason: null }
  }

  // Job has no experience-level tag at all → neutral
  const hasAnyLevelTag = EXPERIENCE_LEVELS.some(l => jobTags.includes(l))
  if (!hasAnyLevelTag) return { points: 5, reason: null }

  return { points: 0, reason: null }
}

// ─── Reverse matching: score candidates against a job ──────────────

export interface SuggestedCandidate {
  id: string
  /** NULL when we were not told one. See lib/displayName.ts. */
  fullName: string | null
  jobTitle: string
  location: string
  profilePictureUrl: string | null
  matchPercentage: number
  matchReasons: string[]
}

export function scoreAndRankCandidates(
  job: Job,
  candidates: Candidate[],
  alreadyAppliedIds: Set<string>
): SuggestedCandidate[] {
  const eligible = candidates.filter(c => !alreadyAppliedIds.has(c.id))

  const scored = eligible.map(candidate => {
    const { score, reasons } = calculateMatchScore(job, candidate, [], [])
    return {
      id: candidate.id,
      // WAS `|| 'Candidate'`. The sixth invented name, and invisible to the
      // compiler because the fallback made the type check out. A nameless
      // person appeared in recommendations as somebody called "Candidate".
      fullName: candidate.fullName,
      jobTitle: candidate.jobTitle || '',
      location: candidate.location || '',
      profilePictureUrl: candidate.profilePictureUrl || null,
      matchPercentage: Math.min(Math.round(score), 99),
      matchReasons: reasons.slice(0, 2),
    }
  })

  return scored
    .filter(c => c.matchPercentage >= 30)
    .sort((a, b) => b.matchPercentage - a.matchPercentage)
    .slice(0, 3)
}

export function scoreAllCandidates(
  job: Job,
  candidates: Candidate[]
): Record<string, number> {
  const scores: Record<string, number> = {}
  for (const candidate of candidates) {
    const { score } = calculateMatchScore(job, candidate, [], [])
    scores[candidate.id] = Math.min(Math.round(score), 99)
  }
  return scores
}

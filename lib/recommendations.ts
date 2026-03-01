import { Job } from './mockJobs'
import { Candidate } from './mockCandidates'

export interface RecommendedJob extends Job {
  matchPercentage: number
  matchReasons: string[]
}

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
  // Filter out jobs the candidate already applied to
  const eligibleJobs = jobs.filter(j => !appliedJobIds.has(j.id))

  const scored = eligibleJobs.map(job => {
    const { score, reasons } = calculateMatchScore(job, candidate, viewedJobs, jobs)
    return {
      ...job,
      matchPercentage: Math.min(Math.round(score), 99),
      matchReasons: reasons,
    }
  })

  // Sort by match percentage descending
  scored.sort((a, b) => b.matchPercentage - a.matchPercentage)

  return scored
}

// ─── Score calculation ──────────────────────────────────────────

function calculateMatchScore(
  job: Job,
  candidate: Candidate,
  viewedJobs: JobView[],
  allJobs: Job[]
): { score: number; reasons: string[] } {
  let score = 0
  const reasons: string[] = []

  // 1. Skills match (max 35 points)
  const skillScore = calcSkillMatch(job, candidate)
  score += skillScore.points
  if (skillScore.reason) reasons.push(skillScore.reason)

  // 2. Job type / employment type match (max 15 points)
  const typeScore = calcTypeMatch(job, candidate)
  score += typeScore.points
  if (typeScore.reason) reasons.push(typeScore.reason)

  // 3. Salary match (max 15 points)
  const salaryScore = calcSalaryMatch(job, candidate)
  score += salaryScore.points
  if (salaryScore.reason) reasons.push(salaryScore.reason)

  // 4. Location match (max 15 points)
  const locationScore = calcLocationMatch(job, candidate)
  score += locationScore.points
  if (locationScore.reason) reasons.push(locationScore.reason)

  // 5. Sector / category match (max 10 points)
  const sectorScore = calcSectorMatch(job, candidate)
  score += sectorScore.points
  if (sectorScore.reason) reasons.push(sectorScore.reason)

  // 6. Browsing pattern bonus (max 5 points)
  const browsingScore = calcBrowsingBonus(job, viewedJobs)
  score += browsingScore.points
  if (browsingScore.reason) reasons.push(browsingScore.reason)

  // 7. Recency bonus (max 5 points)
  const recencyScore = calcRecencyBonus(job)
  score += recencyScore.points
  if (recencyScore.reason) reasons.push(recencyScore.reason)

  // 8. Tag affinity (max 10 points)
  const tagScore = calcTagAffinity(job, viewedJobs, allJobs)
  score += tagScore.points
  if (tagScore.reason) reasons.push(tagScore.reason)

  return { score, reasons }
}

// ─── Individual scoring components ──────────────────────────────

function calcSkillMatch(
  job: Job,
  candidate: Candidate
): { points: number; reason: string | null } {
  const jobSkills = (job.skillsRequired || []).map(s => s.toLowerCase().trim())
  const candidateSkills = (candidate.skills || []).map(s => s.toLowerCase().trim())

  if (jobSkills.length === 0) {
    // No skills required — give partial credit
    return { points: 15, reason: 'No specific skills required' }
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
): { points: number; reason: string | null } {
  const preferred = (candidate.preferredJobTypes || []).map(t => t.toLowerCase())
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
): { points: number; reason: string | null } {
  // Normalize both to same period for comparison
  const candMin = candidate.salaryMin ? Number(candidate.salaryMin) : null
  const candMax = candidate.salaryMax ? Number(candidate.salaryMax) : null
  const candPeriod = candidate.salaryPeriod || 'year'

  if (!candMin && !candMax) return { points: 8, reason: null }

  // Convert to annual for comparison
  const toAnnual = (val: number, period: string) =>
    period === 'hour' ? val * 2080 : val // 40hrs * 52 weeks

  const jobMinAnnual = toAnnual(job.salaryMin, job.salaryPeriod)
  const jobMaxAnnual = toAnnual(job.salaryMax, job.salaryPeriod)
  const candMinAnnual = candMin ? toAnnual(candMin, candPeriod) : 0
  const candMaxAnnual = candMax ? toAnnual(candMax, candPeriod) : Infinity

  // Check overlap between ranges
  const hasOverlap = jobMaxAnnual >= candMinAnnual && jobMinAnnual <= candMaxAnnual

  if (hasOverlap) {
    return { points: 15, reason: 'Salary matches your range' }
  }

  // Partial credit if close (within 20%)
  const gap = Math.min(
    Math.abs(jobMaxAnnual - candMinAnnual),
    Math.abs(jobMinAnnual - candMaxAnnual)
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
): { points: number; reason: string | null } {
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

function calcSectorMatch(
  job: Job,
  candidate: Candidate
): { points: number; reason: string | null } {
  const candSector = (candidate.jobSector || '').toLowerCase()
  const candTitle = (candidate.jobTitle || '').toLowerCase()
  const jobCategory = (job.category || '').toLowerCase()
  const jobTitle = (job.title || '').toLowerCase()

  if (!candSector && !candTitle) return { points: 5, reason: null }

  // Direct sector match
  if (candSector && jobCategory) {
    const sectorWords = candSector.split(/[\s,&]+/).filter(w => w.length > 2)
    const catWords = jobCategory.split(/[\s,&]+/).filter(w => w.length > 2)
    const match = sectorWords.some(sw => catWords.some(cw => sw.includes(cw) || cw.includes(sw)))
    if (match) {
      return { points: 10, reason: 'Matches your industry' }
    }
  }

  // Job title similarity
  if (candTitle && jobTitle) {
    const titleWords = candTitle.split(/\s+/).filter(w => w.length > 2)
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
): { points: number; reason: string | null } {
  if (viewedJobs.length === 0) return { points: 0, reason: null }

  // Check if they viewed this specific job before
  const viewed = viewedJobs.find(v => v.job_id === job.id)
  if (viewed) {
    return { points: 5, reason: 'You viewed this before' }
  }

  return { points: 0, reason: null }
}

function calcRecencyBonus(job: Job): { points: number; reason: string | null } {
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
): { points: number; reason: string | null } {
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

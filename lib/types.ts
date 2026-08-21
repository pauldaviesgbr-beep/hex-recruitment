import { Job, JobLocation } from './mockJobs'
import { normalizeTags } from './jobTags'
import { Candidate, WorkHistory, Education, Language } from './mockCandidates'

// Re-export for convenience
export type { Job, JobLocation, Candidate, WorkHistory, Education, Language }

// ─── Interview Types ─────────────────────────────────────────────

export interface Interview {
  id: string
  applicationId: string
  jobId: string
  employerId: string
  candidateId: string
  interviewDate: string // YYYY-MM-DD
  interviewTime: string // HH:MM
  durationMinutes: number
  interviewType: 'in-person' | 'video' | 'phone'
  locationOrLink: string
  notes: string
  status: 'pending_selection' | 'scheduled' | 'confirmed' | 'completed' | 'cancelled' | 'rescheduled'
  proposedSlots?: { date: string; time: string }[]
  schedulingToken?: string
  createdAt: string
  updatedAt: string
}

// ─── Offer Types ────────────────────────────────────────────────

export interface Offer {
  id: string
  applicationId: string
  jobId: string
  employerId: string
  candidateId: string
  salary: string
  startDate: string
  contractType: 'full-time' | 'part-time' | 'temporary' | 'fixed-term' | 'zero-hours' | 'casual'
  additionalTerms: string | null
  offerLetterUrl: string | null
  /** Body text persisted at offer creation. Used at withdraw-time for
   *  conditional-clause detection (rescind modal scenario picker). Null on
   *  legacy / employer-uploaded offers. */
  offerLetterText: string | null
  status: 'pending' | 'accepted' | 'declined' | 'withdrawn' | 'rescinded'
  signatureName: string | null
  signatureTimestamp: string | null
  signatureImageUrl: string | null
  employerSignatureImageUrl: string | null
  employerSignatureName: string | null
  employerSignatureTimestamp: string | null
  // Hiring-readiness flag: employer-confirmed right to work (status only, no
  // documents). The Hired step is gated on this being true.
  rightToWorkConfirmed: boolean
  rightToWorkConfirmedAt: string | null
  rightToWorkConfirmedBy: string | null
  declineReason: string | null
  createdAt: string
  updatedAt: string
}

// ─── Company Review Types ───────────────────────────────────────

export interface CompanyReview {
  id: string
  reviewer_id: string
  company_name: string
  employer_id: string | null
  overall_rating: number
  pros: string
  cons: string
  job_title: string | null
  employment_status: 'current' | 'former' | null
  work_life_balance: number | null
  career_progression: number | null
  management: number | null
  salary_benefits: number | null
  culture: number | null
  recommend_to_friend: boolean | null
  review_title: string | null
  is_verified: boolean
  is_flagged: boolean
  helpful_count: number
  created_at: string
  updated_at: string
  reviewer?: {
    full_name: string
    avatar_url: string | null
  }
}

export interface ReviewHelpfulVote {
  id: string
  review_id: string
  user_id: string
  created_at: string
}

// ─── Supabase jobs row → Frontend Job ───────────────────────────

export function supabaseJobToJob(row: any): Job {
  return {
    id: row.id,
    company: row.company,
    companyLogo: row.company_logo_url || '',
    companyBanner: row.company_banner_url || undefined,
    companyDescription: row.company_description || undefined,
    employerId: row.employer_id,
    title: row.title,
    jobReference: row.job_reference || '',
    salaryMin: Number(row.salary_min),
    salaryMax: Number(row.salary_max),
    salaryPeriod: row.salary_type === 'annual' ? 'year' : 'hour',
    employmentType: row.employment_type || ['Full-time'],
    location: row.location,
    area: row.area || '',
    areaRegion: row.area_region ?? null,
    areaCounty: row.area_county ?? null,
    venue: row.venue || undefined,
    fullLocation: row.full_location || { addressLine1: row.location, city: '', postcode: '' },
    shiftSchedule: row.shift_schedule || '',
    description: row.description || '',
    fullDescription: row.full_description || row.description || '',
    brandColour: row.brand_colour ?? null,
    responsibilities: row.responsibilities || [],
    requirements: row.requirements || [],
    benefits: row.benefits || [],
    skillsRequired: row.skills_required || [],
    educationRequired: row.education_required || undefined,
    experienceRequired: row.experience_required || '',
    workAuthorization: row.work_authorization || [],
    workLocationType: row.work_location || 'In person',
    tags: normalizeTags(row.tags || []),
    urgent: row.urgent || false,
    noExperience: row.no_experience || false,
    postedAt: formatPostedAt(row.posted_at),
    postedDate: row.posted_at ? new Date(row.posted_at).toISOString().split('T')[0] : new Date().toISOString().split('T')[0],
    expiresDate: row.expires_at || undefined,
    category: row.category || '',
    // THE LIVE COLUMNS, NOT THE DEAD ONES. This read view_count and
    // application_count. Nothing writes either: view_count is 0 on every real
    // row and application_count is 0 despite 33 applications existing. So every
    // Job built through this mapper carried viewCount 0 and applicationCount 0,
    // forever, and any screen showing them showed a zero that looked like data.
    //
    // jobs.views is the maintained counter. Applications have no counter at
    // all, so applicationCount stays best-effort here — callers that need a
    // true number count job_applications, as the admin route now does.
    viewCount: row.views || row.view_count || 0,
    applicationCount: row.application_count || 0,
    status: row.status || 'active',
    screeningQuestions: row.screening_questions || [],
    isRecruiterPosting: row.is_recruiter_posting || false,
  }
}

// ─── Frontend Job → Supabase insert payload ─────────────────────

export function jobToSupabaseInsert(job: Partial<Job> & { company: string; title: string }, employerId: string) {
  return {
    employer_id: employerId,
    title: job.title,
    company: job.company,
    company_logo_url: job.companyLogo || null,
    company_banner_url: job.companyBanner || null,
    company_description: job.companyDescription || null,
    // Stamped at publish, never joined at read: see the payload in post-job for
    // why an advert keeps the colour it was posted with.
    brand_colour: job.brandColour ?? null,
    job_reference: job.jobReference || `JOB-${Date.now().toString(36).toUpperCase()}`,
    description: job.description || null,
    full_description: job.fullDescription || job.description || null,
    responsibilities: job.responsibilities || [],
    requirements: job.requirements || [],
    benefits: job.benefits || [],
    skills_required: job.skillsRequired || [],
    experience_required: job.experienceRequired || null,
    education_required: job.educationRequired || null,
    work_authorization: job.workAuthorization || [],
    location: job.location || '',
    area: job.area || null,
    venue: job.venue || null,
    full_location: job.fullLocation || null,
    salary_min: job.salaryMin || 0,
    salary_max: job.salaryMax || 0,
    salary_type: job.salaryPeriod === 'year' ? 'annual' : 'hourly',
    employment_type: job.employmentType || ['Full-time'],
    work_location: job.workLocationType || 'In person',
    shift_schedule: job.shiftSchedule || null,
    category: job.category || null,
    tags: job.tags || [],
    urgent: job.urgent || false,
    no_experience: job.noExperience || false,
    status: job.status || 'active',
    screening_questions: (job as any).screeningQuestions || [],
    is_recruiter_posting: (job as any).isRecruiterPosting || false,
  }
}

// ─── Supabase candidate_profiles row → Frontend Candidate ───────

export function supabaseProfileToCandidate(row: any): Candidate {
  // ── DIAGNOSTIC LOG — raw DB row for scoring fields ────────────
  return {
    id: row.user_id || row.id,
    userId: row.user_id || row.id,
    fullName: row.full_name || 'Unknown',
    profilePictureUrl: row.profile_picture_url || null,
    jobTitle: row.job_title || '',
    jobSector: row.job_sector || undefined,
    headline: row.headline || undefined,
    // No 'UK' fallback. It made every profile look location-complete on the
    // dashboard (25/25) when only 6 had actually set one — the same cosmetic
    // default that hid the job_sector bug, just in the opposite direction:
    // falsely COMPLETE rather than falsely missing. An empty location now
    // reads as empty, so the dashboard prompts for it and scoring treats it
    // as unknown instead of matching on a placeholder.
    location: row.location || [row.city, row.county].filter(Boolean).join(', ') || '',
    yearsExperience: row.years_experience || 0,
    // personal_bio is the SINGLE SOURCE for a candidate's written intro — it's
    // the column the one visible "About Me" box writes. `bio` is kept only as a
    // read alias so the older surfaces that reference it (candidate search,
    // employer dashboard) show the same text instead of nothing; the legacy
    // bio column is still read as a fallback but nothing writes it any more.
    bio: row.personal_bio || row.bio || '',
    personalBio: row.personal_bio || '',
    skills: row.skills || [],
    specialties: row.specialties || [],
    notableVenues: row.notable_venues || [],
    workHistory: (row.work_history || []).map((job: any) => ({
      title: job.role || job.title || '',
      company: job.company || '',
      location: job.location || '',
      startDate: job.start_date || job.startDate || '',
      endDate: job.end_date !== undefined ? job.end_date : (job.endDate !== undefined ? job.endDate : null),
      description: job.description || '',
    })),
    cvUrl: row.cv_url || null,
    cvFileName: row.cv_file_name || null,
    availability: row.availability || 'Available',
    email: row.email || '',
    phone: row.phone || '',
    certifications: row.certifications || [],
    interests: row.interests || [],
    createdAt: row.created_at || new Date().toISOString(),
    dateOfBirth: row.date_of_birth || undefined,
    nationality: row.nationality || undefined,
    desiredSalary: row.desired_salary || undefined,
    salaryMin: row.salary_min ? String(row.salary_min) : undefined,
    salaryMax: row.salary_max ? String(row.salary_max) : undefined,
    salaryPeriod: row.salary_period || undefined,
    preferredJobTypes: row.preferred_job_types || [],
    workLocationPreferences: row.work_location_preferences || [],
    preferredLocations: row.preferred_locations || undefined,
    preferredAreas: row.preferred_areas || [],
    education: (row.education || []).map((edu: any) => ({
      institution: edu.institution || '',
      qualification: edu.qualification || '',
      fieldOfStudy: edu.field_of_study || edu.fieldOfStudy || '',
      startDate: edu.start_date || edu.startDate || '',
      endDate: edu.end_date || edu.endDate || '',
      inProgress: edu.in_progress ?? edu.inProgress ?? false,
      grade: edu.grade || '',
    })),
    languages: (row.languages || []).map((lang: any) => ({
      name: lang.name || '',
      proficiency: lang.proficiency || 'Basic',
    })),
    linkedinUrl: row.linkedin_url || undefined,
    instagramUrl: row.instagram_url || undefined,
    facebookUrl: row.facebook_url || undefined,
    hasNiNumber: row.has_ni_number || false,
    hasBankAccount: row.has_bank_account || false,
    hasRightToWork: row.has_right_to_work || false,
    hasP45: row.has_p45 || false,
  }
}

// ─── Helpers ─────────────────────────────────────────────────────

function formatPostedAt(isoDate: string | null): string {
  if (!isoDate) return 'Recently'
  const now = new Date()
  const posted = new Date(isoDate)
  const diffMs = now.getTime() - posted.getTime()
  const diffHours = Math.floor(diffMs / 3600000)
  const diffDays = Math.floor(diffMs / 86400000)

  if (diffHours < 1) return 'Just now'
  if (diffHours < 24) return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`
  if (diffDays === 1) return 'Yesterday'
  if (diffDays < 7) return `${diffDays} days ago`
  if (diffDays < 30) return `${Math.floor(diffDays / 7)} week${Math.floor(diffDays / 7) > 1 ? 's' : ''} ago`
  return posted.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
}

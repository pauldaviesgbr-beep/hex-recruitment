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
  status: 'scheduled' | 'confirmed' | 'completed' | 'cancelled' | 'rescheduled'
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
  status: 'pending' | 'accepted' | 'declined' | 'withdrawn'
  signatureName: string | null
  signatureTimestamp: string | null
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
    fullLocation: row.full_location || { addressLine1: row.location, city: '', postcode: '' },
    shiftSchedule: row.shift_schedule || '',
    description: row.description || '',
    fullDescription: row.full_description || row.description || '',
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
    viewCount: row.view_count || 0,
    applicationCount: row.application_count || 0,
    status: row.status || 'active',
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
  }
}

// ─── Supabase candidate_profiles row → Frontend Candidate ───────

export function supabaseProfileToCandidate(row: any): Candidate {
  // ── DIAGNOSTIC LOG — raw DB row for scoring fields ────────────
  console.log('[supabaseProfileToCandidate] raw DB columns relevant to scoring:', {
    job_title:                  row.job_title,
    job_sector:                 row.job_sector,
    skills:                     row.skills,
    salary_min:                 row.salary_min,
    salary_max:                 row.salary_max,
    salary_period:              row.salary_period,
    location:                   row.location,
    city:                       row.city,
    county:                     row.county,
    preferred_locations:        row.preferred_locations,
    preferred_job_types:        row.preferred_job_types,
    work_location_preferences:  row.work_location_preferences,
    work_history_count:         (row.work_history || []).length,
    work_history_first_entry:   (row.work_history || [])[0] ?? null,
  })
  return {
    id: row.user_id || row.id,
    userId: row.user_id || row.id,
    fullName: row.full_name || 'Unknown',
    profilePictureUrl: row.profile_picture_url || null,
    jobTitle: row.job_title || '',
    jobSector: row.job_sector || undefined,
    location: row.location || [row.city, row.county].filter(Boolean).join(', ') || 'UK',
    yearsExperience: row.years_experience || 0,
    bio: row.bio || '',
    personalBio: row.personal_bio || '',
    skills: row.skills || [],
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

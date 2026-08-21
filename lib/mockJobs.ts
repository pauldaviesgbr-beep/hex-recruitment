import type { WorkType } from './workTypes'
export interface JobLocation {
  addressLine1: string
  addressLine2?: string
  city: string
  postcode: string
  coordinates?: { lat: number; lng: number }
}

export interface Job {
  id: string
  company: string
  companyLogo: string
  companyBanner?: string
  companyWebsite?: string
  companyDescription?: string
  employerId?: string  // ID of the employer who posted the job
  title: string
  jobReference: string
  salaryMin: number
  salaryMax: number
  salaryPeriod: 'hour' | 'year'
  // Was its own hand-written union, and wrong in BOTH directions: it permitted
  // 'Contract', which nothing has ever written, and omitted 'Fixed-term', which
  // the post-job form has always offered. An `as` cast in post-job hid the
  // second half. Now the shared vocabulary, so it cannot disagree with the form.
  employmentType: WorkType[]
  location: string
  area: string
  /** Phase 2 (preferred areas): canonical region id resolved from the text
   *  location (e.g. 'south-east'). Null/absent = un-resolvable — such jobs are
   *  never hidden by the candidate's area filter. */
  areaRegion?: string | null
  /** Canonical ceremonial-county id (e.g. 'surrey'); null when only the region
   *  is known (job posted at region granularity). */
  areaCounty?: string | null
  /** Optional property/site name for multi-venue operators (e.g. "The Ember", "Ember Soho").
   *  Null for single-site operators or multi-site roles. Surfaced on /my-jobs row + card. */
  venue?: string
  fullLocation: JobLocation
  shiftSchedule: string
  description: string
  fullDescription: string
  responsibilities: string[]
  requirements: string[]
  benefits: string[]
  skillsRequired: string[]
  educationRequired?: string
  experienceRequired: string
  workAuthorization: string[]
  workLocationType: 'In person' | 'Remote' | 'Hybrid'
  tags: string[]
  urgent: boolean
  noExperience: boolean
  postedAt: string
  postedDate: string
  expiresDate?: string
  category: string
  viewCount: number
  applicationCount: number
  status: 'active' | 'expired' | 'filled'
  screeningQuestions?: { id: string; question: string; required: boolean }[]
  isRecruiterPosting?: boolean
  /** Stored hex for the no-photograph panel, computed from the employer logo
   *  at upload time. Absent/null = navy. Never read when a banner exists. */
  brandColour?: string | null
}

// Mock data removed — all jobs now come from Supabase
export const mockJobs: Job[] = []

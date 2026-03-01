export interface WorkHistory {
  title: string
  company: string
  location: string
  startDate: string
  endDate: string | null
  description: string
}

export interface Education {
  institution: string
  qualification: string
  fieldOfStudy: string
  startDate: string
  endDate: string
  inProgress: boolean
  grade: string
}

export interface Language {
  name: string
  proficiency: 'Native' | 'Fluent' | 'Conversational' | 'Basic'
}

export interface Candidate {
  id: string
  userId: string
  fullName: string
  profilePictureUrl: string | null
  jobTitle: string
  jobSector?: string
  location: string
  yearsExperience: number
  bio: string
  personalBio?: string
  skills: string[]
  workHistory: WorkHistory[]
  education?: Education[]
  languages?: Language[]
  cvUrl: string | null
  cvFileName?: string
  availability: string
  email: string
  phone: string
  interests?: string[]
  certifications?: string[]
  createdAt: string
  // Extended profile fields
  dateOfBirth?: string
  age?: number
  nationality?: string
  desiredSalary?: string
  salaryMin?: string
  salaryMax?: string
  salaryPeriod?: 'hour' | 'year'
  preferredJobTypes?: string[]
  workLocationPreferences?: string[]
  preferredLocations?: string
  linkedinUrl?: string
  instagramUrl?: string
  facebookUrl?: string
  // Verification badges
  hasNiNumber?: boolean
  hasBankAccount?: boolean
  hasRightToWork?: boolean
  hasP45?: boolean
}

// Mock data removed — all candidates now come from Supabase candidate_profiles
export const mockCandidates: Candidate[] = []

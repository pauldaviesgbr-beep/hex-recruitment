// THE CANDIDATE PROFILE CHECKLIST: the dashboard's "x of 14" and the iOS
// app's profile bar both count these, so the two cannot disagree. Moved here
// from app/dashboard/page.tsx (Build 17 review, native Profile).
import type { Candidate } from '@/lib/mockCandidates'

// Profile completion fields
export interface ProfileField {
  key: string
  label: string
  check: (c: Candidate) => boolean
  link: string
  // Benefit-framed reward shown next to the prompt ("add X → get Y"), so each
  // nudge offers a payoff rather than reading as a chore.
  benefit?: string
}

// Each field deep-links straight to its own section in Edit Profile via
// ?section=<slug>. JobSeekerProfileForm maps the slug to the right wizard step
// and scrolls to/highlights the control, so "Add →" is genuinely one click
// instead of dropping the user at the top of the form.
export const PROFILE_FIELDS: ProfileField[] = [
  { key: 'fullName', label: 'Full name', check: c => !!c.fullName, link: '/profile?section=name' },
  { key: 'phone', label: 'Phone number', check: c => !!c.phone, link: '/profile?section=phone', benefit: 'so employers can reach you' },
  { key: 'location', label: 'Location', check: c => !!c.location, link: '/profile?section=location', benefit: 'see what’s commutable' },
  { key: 'jobTitle', label: 'Job title', check: c => !!c.jobTitle, link: '/profile?section=job-title', benefit: 'match the right roles' },
  { key: 'experience', label: 'Years of experience', check: c => c.yearsExperience > 0, link: '/profile?section=experience', benefit: 'match your level' },
  { key: 'skills', label: 'Skills (at least 3)', check: c => (c.skills || []).length >= 3, link: '/profile?section=skills', benefit: 'see roles that match' },
  { key: 'bio', label: 'About me bio', check: c => !!c.personalBio, link: '/profile?section=bio', benefit: 'stand out to employers' },
  { key: 'cvUrl', label: 'Upload CV', check: c => !!c.cvUrl, link: '/profile?section=cv', benefit: 'apply in one tap' },
  { key: 'photo', label: 'Profile photo', check: c => !!c.profilePictureUrl, link: '/profile?section=photo', benefit: 'get noticed' },
  { key: 'jobSector', label: 'Job sector', check: c => !!c.jobSector, link: '/profile?section=job-sector', benefit: 'see roles that match' },
  { key: 'areas', label: 'Desired work location', check: c => (c.preferredAreas || []).length > 0, link: '/profile?section=areas', benefit: 'only see jobs you can get to' },
  { key: 'salary', label: 'Salary expectations', check: c => !!(c.salaryMin || c.salaryMax || c.desiredSalary), link: '/profile?section=job-preferences', benefit: 'filter to roles that pay' },
  { key: 'jobTypes', label: 'Preferred job type', check: c => !!(c.preferredJobTypes && c.preferredJobTypes.length > 0), link: '/profile?section=job-preferences', benefit: 'see roles that fit' },
  { key: 'workStyle', label: 'Work style (remote/hybrid/on-site)', check: c => !!(c.workLocationPreferences && c.workLocationPreferences.length > 0), link: '/profile?section=job-preferences', benefit: 'match remote or on-site' },
]

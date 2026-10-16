// WHAT AN APPLICATION'S STATUS IS CALLED, IN ONE PLACE.
//
// Moved out of app/applications/page.tsx on 16 Oct 2026 so the iOS app's data
// endpoint (app/api/app/me/applications) uses the same words and the same
// mapping as the website. The design handoff says "status labels come from the
// existing app/applications stepper — do not invent new ones", and a second
// copy is how they would drift.

export type ApplicationStatus =
  | 'applied' | 'viewed' | 'shortlisted' | 'interview' | 'offer' | 'hired' | 'rejected' | 'withdrawn'

export const APPLICATION_STATUS_LABELS: Record<ApplicationStatus, string> = {
  applied: 'Applied',
  viewed: 'Viewed',
  shortlisted: 'Shortlisted',
  interview: 'Interview Scheduled',
  offer: 'Offer Received',
  hired: 'Hired',
  rejected: 'Rejected',
  withdrawn: 'Withdrawn',
}

/** The database stores several spellings over the product's history; this is the one mapping. */
export function normalizeApplicationStatus(status: string | null | undefined): ApplicationStatus {
  const s = (status || 'applied').toLowerCase()
  if ((Object.keys(APPLICATION_STATUS_LABELS) as string[]).includes(s)) return s as ApplicationStatus
  if (s === 'pending' || s === 'pending review') return 'applied'
  if (s === 'reviewing' || s === 'under review') return 'viewed'
  if (s === 'interviewing') return 'interview'
  if (s === 'offered') return 'offer'
  if (s === 'hired') return 'hired'
  return 'applied'
}

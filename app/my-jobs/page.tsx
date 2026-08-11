'use client'

import { Suspense, useState, useEffect, useMemo } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import Header from '@/components/Header'
import { supabase } from '@/lib/supabase'
import { getSessionWithRetry } from '@/lib/getSessionWithRetry'
import { getCurrentEmployerOwnerId, getEmployerCapabilities } from '@/lib/employer'
import { formatWhen, type TempPost } from '@/lib/tempWork'
import { useJobs } from '@/lib/JobsContext' // refreshJobs only — data fetched directly from Supabase
import CompanyLogo from '@/components/CompanyLogo'
import BoostModal from '@/components/BoostModal'
import RemoveAdModal from '@/components/RemoveAdModal'
import { PAID_SURFACES_ENABLED } from '@/lib/paidSurfaces'
import { RowInlineFields } from '@/components/RowInlineFields'
import { MoreHorizontal } from 'lucide-react'
import { Boost, JOB_BOOST_TIERS, getDaysRemaining, isBoostActive } from '@/lib/boostTypes'
import styles from './page.module.css'

interface PostedJob {
  id: string
  title: string
  company: string
  companyLogo: string
  location: string
  /** Optional property/site name for multi-venue operators (e.g. "The Ember", "Ember Soho").
   *  Null for single-site operators or multi-site roles. */
  venue?: string
  postedDate: string
  applicationCount: number
  viewCount: number
  status: 'active' | 'paused' | 'closed' | 'filled' | 'archived'
  // New fields for enhanced card
  salaryMin: number
  salaryMax: number
  salaryPeriod: 'hour' | 'year'
  employmentType: string[]
  category: string
  description: string
  expiresDate?: string
  applicationStatuses: string[]
  hiredCandidate?: { name: string; hiredAt: string }
}

interface AppliedJob {
  jobId: string
  jobTitle: string
  company: string
  appliedAt: string
  status: 'pending' | 'reviewing' | 'interviewing' | 'rejected' | 'accepted'
}

export default function MyJobsPage() {
  return (
    <Suspense fallback={<main><Header /><div style={{ textAlign: 'center', padding: '4rem 0', color: '#666' }}>Loading...</div></main>}>
      <MyJobsContent />
    </Suspense>
  )
}

function MyJobsContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { refreshJobs } = useJobs()
  const [isEmployer, setIsEmployer] = useState(false)
  // Shifts live in their own table and their own page. This is the ROUTE to
  // them, not a second home for them — see the section below.
  const [shifts, setShifts] = useState<TempPost[] | null>(null)
  const [canManageShifts, setCanManageShifts] = useState(false)
  // Gates the Remove ad item. Defaults FALSE so the control is absent until the
  // capability is known — the wrong direction to fail is showing a button that
  // the endpoint will refuse.
  const [canManageJobs, setCanManageJobs] = useState(false)
  // The advert awaiting confirmation, or null. Holds the whole row rather than
  // an id so the dialog can name the advert it is about.
  const [removeTarget, setRemoveTarget] = useState<PostedJob | null>(null)
  const [loading, setLoading] = useState(true)
  const [postedJobs, setPostedJobs] = useState<PostedJob[]>([])
  const [appliedJobs, setAppliedJobs] = useState<AppliedJob[]>([])
  const [companyName, setCompanyName] = useState('')
  const [rawInterviews, setRawInterviews] = useState<{ jobId: string; status: string; interviewDate: string; interviewTime: string; candidateName: string }[]>([])
  const [detailedOffers, setDetailedOffers] = useState<{
    id: string; jobId: string; jobTitle: string; candidateId: string; candidateName: string;
    salary: string; startDate: string; contractType: string; status: string;
    signatureName?: string; signatureTimestamp?: string; declineReason?: string; createdAt: string;
  }[]>([])
  const [rawOffers, setRawOffers] = useState<{ jobId: string; status: string }[]>([])
  const [appCountsByJob, setAppCountsByJob] = useState<Record<string, Record<string, number>>>({})
  const [boostModalOpen, setBoostModalOpen] = useState(false)
  const [boostTargetJob, setBoostTargetJob] = useState<PostedJob | null>(null)
  const [jobBoosts, setJobBoosts] = useState<Record<string, Boost>>({})
  const [myJobsSearch, setMyJobsSearch] = useState('')
  const [myJobsLocationSearch, setMyJobsLocationSearch] = useState('')
  const [openMenuJobId, setOpenMenuJobId] = useState<string | null>(null)
  // Phase 1: recruiter vs single-company employer drives whether the
  // per-row company logo shows. Fetched from employer_profiles.is_recruiter
  // alongside the auth check. Default false (single-company employer →
  // logo hidden).
  const [isRecruiter, setIsRecruiter] = useState(false)

  // Read filter from URL query param (e.g. /my-jobs?filter=interviewing)
  const filterParam = searchParams.get('filter')
  const validFilters = ['all', 'active', 'interviewing', 'offers', 'hired', 'archived'] as const
  const activeTab = validFilters.includes(filterParam as any) ? (filterParam as typeof validFilters[number]) : 'all'

  useEffect(() => {
    const checkAuth = async () => {
      const session = await getSessionWithRetry()

      if (!session) {
        router.push('/login/employer')
        return
      }

      const userRole = session.user.user_metadata?.role

      if (userRole === 'employer') {
        setIsEmployer(true)
        const company = session.user.user_metadata?.company_name || 'Your Company'
        // Multi-user: jobs/apps are keyed employer_id = owner user_id.
        const employerId = (await getCurrentEmployerOwnerId(supabase)) ?? session.user.id
        setCompanyName(company)

        // Recruiter flag — drives the conditional company-logo column on
        // each row. Multi-client recruiters need to see whose ad is whose;
        // single-company employers don't.
        const { data: empProfile } = await supabase
          .from('employer_profiles')
          .select('is_recruiter')
          .eq('user_id', employerId)
          .maybeSingle()
        setIsRecruiter(!!empProfile?.is_recruiter)

        // Fetch ALL jobs for this employer directly from Supabase (consistent with dashboard)
        const { data: allJobsData } = await supabase
          .from('jobs')
          .select('*')
          .eq('employer_id', employerId)
          .order('posted_at', { ascending: false })

        const employerJobs: PostedJob[] = (allJobsData || []).map((row: any) => ({
          id: row.id,
          title: row.title,
          company: row.company,
          companyLogo: row.company_logo_url || '',
          location: row.location || '',
          venue: row.venue || undefined,
          postedDate: row.posted_at ? new Date(row.posted_at).toISOString().split('T')[0] : new Date().toISOString().split('T')[0],
          applicationCount: 0,
          viewCount: row.views || 0,
          status: (row.status === 'expired' ? 'closed' : row.status) as PostedJob['status'],
          salaryMin: Number(row.salary_min),
          salaryMax: Number(row.salary_max),
          salaryPeriod: row.salary_type === 'annual' ? 'year' : 'hour',
          employmentType: row.employment_type || ['Full-time'],
          category: row.category || '',
          description: row.description || '',
          expiresDate: row.expires_at || undefined,
          applicationStatuses: [],
        }))

        // Fetch real application counts and statuses from job_applications table
        const jobIds = employerJobs.map(j => j.id)

        if (jobIds.length > 0) {
          const { data: appData } = await supabase
            .from('job_applications')
            .select('job_id, status')
            .in('job_id', jobIds)

          if (appData) {
            const counts: Record<string, number> = {}
            const statusSets: Record<string, Set<string>> = {}
            const countsByJob: Record<string, Record<string, number>> = {}
            appData.forEach((row: any) => {
              counts[row.job_id] = (counts[row.job_id] || 0) + 1
              if (!statusSets[row.job_id]) statusSets[row.job_id] = new Set()
              statusSets[row.job_id].add(row.status)
              if (!countsByJob[row.job_id]) countsByJob[row.job_id] = {}
              countsByJob[row.job_id][row.status] = (countsByJob[row.job_id][row.status] || 0) + 1
            })
            employerJobs.forEach(j => {
              j.applicationCount = counts[j.id] || 0
              j.applicationStatuses = statusSets[j.id] ? Array.from(statusSets[j.id]) : []
            })
            setAppCountsByJob(countsByJob)
          }

          // Fetch hired candidate names for filled/archived jobs
          const filledJobIds = employerJobs.filter(j => j.status === 'filled' || j.status === 'archived').map(j => j.id)
          if (filledJobIds.length > 0) {
            const { data: hiredApps } = await supabase
              .from('job_applications')
              .select('job_id, updated_at, candidate_id')
              .in('job_id', filledJobIds)
              .eq('status', 'hired')

            if (hiredApps && hiredApps.length > 0) {
              const candidateIds = Array.from(new Set(hiredApps.map((h: any) => h.candidate_id)))
              const { data: profileData } = await supabase
                .from('candidate_profiles')
                .select('user_id, full_name')
                .in('user_id', candidateIds)

              const nameMap: Record<string, string> = {}
              profileData?.forEach((p: any) => { nameMap[p.user_id] = p.full_name })

              hiredApps.forEach((h: any) => {
                const job = employerJobs.find(j => j.id === h.job_id)
                if (job) {
                  job.hiredCandidate = {
                    name: nameMap[h.candidate_id] || 'Unknown',
                    hiredAt: h.updated_at || h.applied_at,
                  }
                }
              })
            }
          }

          // Fetch interviews with job_id for per-view filtering
          const { data: interviewData } = await supabase
            .from('interviews')
            .select('job_id, status, interview_date, interview_time, candidate_id')
            .eq('employer_id', employerId)

          if (interviewData) {
            // Resolve candidate names
            const interviewCandidateIds = Array.from(new Set(interviewData.map((r: any) => r.candidate_id).filter(Boolean)))
            let candidateNameMap: Record<string, string> = {}
            if (interviewCandidateIds.length > 0) {
              const { data: candidateProfiles } = await supabase
                .from('candidate_profiles')
                .select('user_id, full_name')
                .in('user_id', interviewCandidateIds)
              if (candidateProfiles) {
                candidateProfiles.forEach((p: any) => { candidateNameMap[p.user_id] = p.full_name })
              }
            }

            setRawInterviews(interviewData.map((r: any) => ({
              jobId: r.job_id,
              status: r.status,
              interviewDate: r.interview_date,
              interviewTime: r.interview_time || '',
              candidateName: candidateNameMap[r.candidate_id] || 'Candidate',
            })))
          }

          // Fetch offers with candidate + job details for the offers/hired tabs
          const { data: offerData } = await supabase
            .from('job_offers')
            .select('id, job_id, candidate_id, salary, start_date, contract_type, status, signature_name, signature_timestamp, decline_reason, created_at, jobs ( title )')
            .eq('employer_id', employerId)
            .order('created_at', { ascending: false })

          if (offerData) {
            setRawOffers(offerData.map((r: any) => ({
              jobId: r.job_id,
              status: r.status,
            })))

            // Enrich offers with candidate names
            const offerCandidateIds = Array.from(new Set(offerData.map((r: any) => r.candidate_id).filter(Boolean)))
            let offerNames: Record<string, string> = {}
            if (offerCandidateIds.length > 0) {
              const { data: profiles } = await supabase
                .from('candidate_profiles')
                .select('user_id, full_name')
                .in('user_id', offerCandidateIds)
              for (const p of profiles || []) {
                if (p.full_name) offerNames[p.user_id] = p.full_name
              }
            }

            setDetailedOffers(offerData.map((r: any) => {
              const job: any = r.jobs ? (Array.isArray(r.jobs) ? r.jobs[0] : r.jobs) : null
              return {
                id: r.id,
                jobId: r.job_id,
                jobTitle: job?.title || 'Role',
                candidateId: r.candidate_id,
                candidateName: offerNames[r.candidate_id] || 'Candidate',
                salary: r.salary,
                startDate: r.start_date,
                contractType: r.contract_type,
                status: r.status,
                signatureName: r.signature_name,
                signatureTimestamp: r.signature_timestamp,
                declineReason: r.decline_reason,
                createdAt: r.created_at,
              }
            }))
          }
        }

        // Fetch active boosts for this employer's jobs (non-blocking — table may not exist yet)
        try {
          const { data: boostData } = await supabase
            .from('boosts')
            .select('*')
            .eq('user_id', employerId)
            .eq('boost_type', 'job')

          if (boostData) {
            const boostMap: Record<string, Boost> = {}
            boostData.forEach((b: any) => {
              if (isBoostActive(b)) {
                boostMap[b.target_id] = b
              }
            })
            setJobBoosts(boostMap)
          }
        } catch {
          // Boosts table may not exist yet
        }

        setPostedJobs(employerJobs)
      } else {
        // Job seeker - fetch applications from Supabase
        setIsEmployer(false)
        const { data, error } = await supabase
          .from('job_applications')
          .select('job_id, status, applied_at, job_title, company, jobs(title, company)')
          .eq('candidate_id', session.user.id)
          .order('applied_at', { ascending: false })

        if (!error && data) {
          const applied = data.map((row: any) => ({
            jobId: row.job_id,
            jobTitle: row.jobs?.title || row.job_title || 'Unknown Position',
            company: row.jobs?.company || row.company || 'Unknown Company',
            appliedAt: row.applied_at,
            status: row.status || 'pending',
          }))
          setAppliedJobs(applied)
        }
      }

      setLoading(false)
    }

    checkAuth()
  }, [router])

  const formatDate = (dateString: string) => {
    const date = new Date(dateString)
    return date.toLocaleDateString('en-GB', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    })
  }

  const formatInterviewDate = (dateStr: string, timeStr: string) => {
    // Parse date parts directly to avoid timezone issues
    const [year, month, day] = dateStr.split('-').map(Number)
    const date = new Date(year, month - 1, day)
    const datePart = date.toLocaleDateString('en-GB', {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
    })
    if (!timeStr) return datePart
    // Format time from HH:MM to 12-hour format
    const [h, m] = timeStr.split(':').map(Number)
    const ampm = h >= 12 ? 'PM' : 'AM'
    const hour12 = h % 12 || 12
    const timePart = m === 0 ? `${hour12} ${ampm}` : `${hour12}:${String(m).padStart(2, '0')} ${ampm}`
    return `${datePart}, ${timePart}`
  }

  const formatSalary = (min: number, max: number, period: 'hour' | 'year') => {
    if (period === 'hour') {
      return `£${min}-£${max}/hr`
    }
    // For yearly, format as "£28k-£32k/year"
    const formatK = (n: number) => n >= 1000 ? `£${Math.round(n / 1000)}k` : `£${n}`
    return `${formatK(min)}-${formatK(max)}/year`
  }

  const truncateText = (text: string, maxLength: number) => {
    if (!text) return ''
    if (text.length <= maxLength) return text
    return text.substring(0, maxLength).trim() + '...'
  }

  const getStatusLabel = (status: string) => {
    const labels: Record<string, { label: string; className: string }> = {
      active: { label: 'Active', className: styles.statusActive },
      paused: { label: 'Paused', className: styles.statusPaused },
      closed: { label: 'Closed', className: styles.statusClosed },
      filled: { label: 'Filled', className: styles.statusFilled },
      archived: { label: 'Archived', className: styles.statusFilled },
      pending: { label: 'Pending Review', className: styles.statusPending },
      reviewing: { label: 'Under Review', className: styles.statusReviewing },
      interviewing: { label: 'Interviewing', className: styles.statusInterviewing },
      rejected: { label: 'Not Selected', className: styles.statusRejected },
      accepted: { label: 'Accepted', className: styles.statusAccepted },
    }
    return labels[status] || { label: status, className: '' }
  }

  // handleDeleteJob and handleArchiveJob used to live here. Both were defined
  // and never rendered — dead since before this branch, each doing a bare
  // client-side `update({status:'archived'}).eq('id', jobId)` with no check on
  // the CURRENT status, and the first one calling itself "delete" while
  // archiving. They are gone rather than left in place: with handleRemoveAd
  // below there would otherwise be three ways to archive an advert in one file,
  // two of them unreachable and both of them wrong, which is how the next
  // person wires up the wrong one.

  // A job status toggle used to live here and has been DELETED rather than
  // fixed. It was `job.status === 'active' ? 'paused' : 'active'` — a binary
  // over a four-state field — so filled and archived both fell through to
  // 'active', and a button labelled Pause would have republished a filled role.
  // It had no call site, so the fault never shipped.
  //
  // Deleted rather than corrected because the wrong idea is the part worth
  // removing: a Pause control should be written against active/paused/filled/
  // archived deliberately, not inherited from a ternary that thinks there are
  // two states.

  // Make sure a job that has just gone live has its canonical area resolved,
  // so preferred-areas matching can see it. Non-blocking and best-effort: a job
  // with no area is shown to every candidate rather than hidden, so a failure
  // here never costs the employer visibility.
  const ensureJobArea = async (jobId: string) => {
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session?.access_token) return
      await fetch('/api/jobs/resolve-area', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ jobId }),
      })
    } catch (err) {
      console.error('[my-jobs] area resolve failed (non-blocking):', err)
    }
  }

  const handleReactivateJob = async (jobId: string) => {
    const confirmed = confirm('Reactivate this job listing? It will appear in search results again.')
    if (!confirmed) return

    try {
      const { error } = await supabase
        .from('jobs')
        .update({ status: 'active' })
        .eq('id', jobId)

      if (error) {
        console.error('Error reactivating job:', error)
        alert('Failed to reactivate job. Please try again.')
        return
      }

      await ensureJobArea(jobId)
      await refreshJobs()
    } catch (err) {
      console.error('Error reactivating job:', err)
    }
  }

  const handleRepostJob = async (job: PostedJob) => {
    const confirmed = confirm(`Repost "${job.title}" as a new active listing?`)
    if (!confirmed) return

    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) return

      // Fetch the full original job data from Supabase
      const { data: originalJob } = await supabase
        .from('jobs')
        .select('*')
        .eq('id', job.id)
        .single()

      if (!originalJob) {
        alert('Could not find original job data.')
        return
      }

      // Create a copy with new status, reference, and timestamps
      const { id, created_at, updated_at, posted_at, view_count, application_count, ...jobData } = originalJob
      const { data: reposted, error } = await supabase
        .from('jobs')
        .insert({
          ...jobData,
          status: 'active',
          view_count: 0,
          application_count: 0,
          job_reference: `JOB-${Date.now().toString(36).toUpperCase()}`,
        })
        .select('id')
        .single()

      if (error) {
        console.error('Error reposting job:', error)
        alert('Failed to repost job. Please try again.')
        return
      }

      // The copy inherits the original's area, but resolve anyway: if the
      // original predates preferred-areas its area columns are empty.
      if (reposted?.id) await ensureJobArea(reposted.id)
      await refreshJobs()
      router.push('/my-jobs')
    } catch (err) {
      console.error('Error reposting job:', err)
    }
  }

  // Take a live advert off the public board.
  //
  // Goes through /api/jobs/[id]/remove rather than updating from here like its
  // neighbours do. RLS can say WHOSE row this is but not WHICH transition is
  // allowed — the policy permits any status value — so "active -> archived, and
  // only that" has to live somewhere the browser cannot edit. The reasoning is
  // in the route.
  //
  // Throws on failure rather than alert()-ing: the modal keeps itself open and
  // shows the message, so a failure cannot be mistaken for a success the way a
  // dialog that closes regardless would be.
  const handleRemoveAd = async (job: PostedJob) => {
    const res = await fetch(`/api/jobs/${job.id}/remove`, { method: 'POST' })
    let body: { ok?: boolean; status?: string; error?: string } | null = null
    try { body = await res.json() } catch { /* non-JSON body handled below */ }

    if (!res.ok) {
      const message =
        body?.error === 'not_active' ? 'This advert is not live, so there is nothing to remove. Refresh the page to see its current status.'
        : body?.error === 'forbidden' ? 'You do not have permission to remove adverts on this account.'
        : body?.error === 'unauthenticated' ? 'Your session has expired. Please sign in again.'
        : body?.error === 'not_found' ? 'That advert could not be found on your account.'
        : 'Could not remove the advert. Please try again.'
      throw new Error(message)
    }
    // Believe the ROW the route reports it wrote, not the 200. A 200 says the
    // request was handled; only the returned status says the advert moved.
    if (body?.status !== 'archived') {
      throw new Error('The advert was not removed. Please try again.')
    }

    setPostedJobs(prev => prev.map(j => j.id === job.id ? { ...j, status: 'archived' as const } : j))
    setRemoveTarget(null)
    await refreshJobs()
  }

  // Categorise each job by its highest application status
  const getJobCategory = (job: PostedJob) => {
    if (job.status === 'archived') return 'archived'
    const s = job.applicationStatuses
    if (s.includes('hired')) return 'hired'
    if (job.status === 'filled') return 'hired'
    if (s.includes('offered')) return 'offers'
    if (s.includes('interviewing')) return 'interviewing'
    return 'default'
  }

  // Compute the filtered job list and view-scoped stats
  const viewData = useMemo(() => {
    const now = new Date().toISOString().split('T')[0]

    // Build a map of jobId -> next upcoming interview info (for sorting & display)
    const nextInterviewMap: Record<string, { date: string; time: string; candidateName: string }> = {}
    rawInterviews.forEach(i => {
      if (i.status === 'completed' || i.status === 'cancelled') return
      const isUpcoming = i.interviewDate >= now
      const current = nextInterviewMap[i.jobId]
      const sortKey = i.interviewDate + (i.interviewTime || '')
      const currentSortKey = current ? current.date + current.time : ''
      if (isUpcoming && (!current || sortKey < currentSortKey)) {
        nextInterviewMap[i.jobId] = { date: i.interviewDate, time: i.interviewTime, candidateName: i.candidateName }
      }
    })

    const filtered = postedJobs
      .filter(job => {
        const cat = getJobCategory(job)
        if (activeTab === 'archived') return cat === 'archived'
        if (activeTab === 'hired') return cat === 'hired'
        if (activeTab === 'offers') return cat === 'offers'
        if (activeTab === 'interviewing') return cat === 'interviewing'
        return cat === 'default'
      })
      .sort((a, b) => {
        if (activeTab === 'interviewing') {
          // Sort by nearest upcoming interview first; no upcoming → bottom
          const aInt = nextInterviewMap[a.id]
          const bInt = nextInterviewMap[b.id]
          if (aInt && !bInt) return -1
          if (!aInt && bInt) return 1
          if (aInt && bInt) {
            const aKey = aInt.date + aInt.time
            const bKey = bInt.date + bInt.time
            return aKey.localeCompare(bKey)
          }
          return new Date(b.postedDate).getTime() - new Date(a.postedDate).getTime()
        }
        // Default sort: jobs with applications first, then by posted date descending
        if (a.applicationCount > 0 && b.applicationCount === 0) return -1
        if (a.applicationCount === 0 && b.applicationCount > 0) return 1
        return new Date(b.postedDate).getTime() - new Date(a.postedDate).getTime()
      })

    const jobIds = new Set(filtered.map(j => j.id))

    // Interviews scoped to visible jobs
    const visibleInterviews = rawInterviews.filter(i => jobIds.has(i.jobId))

    // Today's interviews
    const todayInterviews = visibleInterviews.filter(i =>
      i.interviewDate === now && i.status !== 'cancelled'
    ).length

    // This week (Mon–Sun)
    const todayDate = new Date()
    const dayOfWeek = todayDate.getDay() // 0=Sun
    const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek
    const weekStart = new Date(todayDate)
    weekStart.setDate(todayDate.getDate() + mondayOffset)
    const weekEnd = new Date(weekStart)
    weekEnd.setDate(weekStart.getDate() + 6)
    const weekStartStr = weekStart.toISOString().split('T')[0]
    const weekEndStr = weekEnd.toISOString().split('T')[0]
    const thisWeekInterviews = visibleInterviews.filter(i =>
      i.interviewDate >= weekStartStr && i.interviewDate <= weekEndStr && i.status !== 'cancelled'
    ).length

    // Pending confirmation (scheduled but not confirmed)
    const pendingConfirmation = visibleInterviews.filter(i =>
      i.status === 'scheduled' && i.interviewDate >= now
    ).length

    // Completed (status is 'completed' or date has passed and not cancelled)
    const completedInterviews = visibleInterviews.filter(i =>
      i.status === 'completed' || (i.interviewDate < now && i.status !== 'cancelled')
    ).length

    // Offers scoped to visible jobs
    const visibleOffers = rawOffers.filter(o => jobIds.has(o.jobId))
    const pendingOffers = visibleOffers.filter(o => o.status === 'pending').length
    const acceptedOffers = visibleOffers.filter(o => o.status === 'accepted').length
    const declinedOffers = visibleOffers.filter(o => o.status === 'declined').length

    // Application counts scoped to visible jobs
    const interviewingCandidates = filtered.reduce((sum, j) => sum + (appCountsByJob[j.id]?.['interviewing'] || 0), 0)
    const hiredCandidates = filtered.reduce((sum, j) => sum + (appCountsByJob[j.id]?.['hired'] || 0), 0)

    // Still hiring: jobs in the 'default' category (no interviewing/offered/hired applications)
    const stillHiring = postedJobs.filter(j => getJobCategory(j) === 'default').length

    const counts = {
      active: postedJobs.filter(j => getJobCategory(j) === 'default').length,
      interviewing: postedJobs.filter(j => getJobCategory(j) === 'interviewing').length,
      offers: postedJobs.filter(j => getJobCategory(j) === 'offers').length,
      hired: postedJobs.filter(j => getJobCategory(j) === 'hired').length,
      archived: postedJobs.filter(j => getJobCategory(j) === 'archived').length,
    }

    return {
      filtered,
      nextInterviewMap,
      todayInterviews,
      thisWeekInterviews,
      pendingConfirmation,
      completedInterviews,
      pendingOffers,
      acceptedOffers,
      declinedOffers,
      interviewingCandidates,
      hiredCandidates,
      stillHiring,
      counts,
    }
  }, [postedJobs, activeTab, rawInterviews, rawOffers, appCountsByJob])

  // Apply local search filter on top of viewData
  const displayJobs = useMemo(() => {
    let jobs = viewData.filtered
    const titleQ = myJobsSearch.trim().toLowerCase()
    const locQ = myJobsLocationSearch.trim().toLowerCase()
    if (titleQ) {
      jobs = jobs.filter(j =>
        j.title.toLowerCase().includes(titleQ) ||
        j.company.toLowerCase().includes(titleQ)
      )
    }
    if (locQ) {
      jobs = jobs.filter(j => j.location.toLowerCase().includes(locQ))
    }
    return jobs
  }, [viewData.filtered, myJobsSearch, myJobsLocationSearch])

  // Close kebab on outside click or Escape.
  // Load this employer's shifts, separately from the jobs fetch.
  //
  // Its own effect on purpose: the jobs load is the busiest path on the busiest
  // employer page, and a shift query failing must not be able to take the job
  // list down with it.
  //
  // The capability check mirrors /temp-work/manage exactly — employer role AND
  // manage_jobs. That page denies without it, so offering a link to someone who
  // would be turned away is the door-that-goes-nowhere fault again, just pointed
  // the other way.
  useEffect(() => {
    if (!isEmployer) return
    let cancelled = false
    const run = async () => {
      const caps = await getEmployerCapabilities(supabase)
      if (cancelled) return
      // Same single capability read now also gates Remove ad. Set BEFORE the
      // early return below, which exists for the shifts query and would
      // otherwise leave this stuck at its default for exactly the members it
      // is meant to describe.
      setCanManageJobs(caps.manage_jobs)
      if (!caps.manage_jobs) { setCanManageShifts(false); setShifts([]); return }
      setCanManageShifts(true)
      const ownerId = await getCurrentEmployerOwnerId(supabase)
      const { data: { session } } = await supabase.auth.getSession()
      const eid = ownerId ?? session?.user?.id
      if (!eid || cancelled) return
      const { data } = await supabase
        .from('temp_posts').select('*').eq('employer_id', eid)
        .order('created_at', { ascending: false })
      if (!cancelled) setShifts((data as TempPost[]) || [])
    }
    run()
    return () => { cancelled = true }
  }, [isEmployer])

  useEffect(() => {
    if (!openMenuJobId) return
    const onDocClick = (e: MouseEvent) => {
      const target = e.target as Element | null
      if (!target?.closest(`.${styles.kebabWrap}`)) setOpenMenuJobId(null)
    }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpenMenuJobId(null) }
    document.addEventListener('click', onDocClick)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('click', onDocClick)
      document.removeEventListener('keydown', onKey)
    }
  }, [openMenuJobId])

  // Kebab popover. Lives inside a Link/Card click target, so every handler
  // must preventDefault + stopPropagation to avoid the parent navigating.
  const renderKebab = (job: PostedJob, isBoosted: boolean) => {
    const isOpen = openMenuJobId === job.id
    const stop = (e: React.MouseEvent | React.KeyboardEvent) => {
      e.preventDefault(); e.stopPropagation()
    }
    const choose = (e: React.MouseEvent, fn: () => void) => {
      stop(e); fn(); setOpenMenuJobId(null)
    }
    return (
      <div className={styles.kebabWrap} onClick={stop}>
        <button
          type="button"
          aria-label="Job actions"
          aria-expanded={isOpen}
          className={styles.kebabBtn}
          onClick={(e) => { stop(e); setOpenMenuJobId(isOpen ? null : job.id) }}
        >
          <MoreHorizontal size={18} aria-hidden="true" />
        </button>
        {isOpen && (
          <div className={styles.kebabMenu} role="menu">
            {/* Every kebab item renders a fixed-width icon slot at the
                left so labels line up across the menu. The Boost item
                puts the ⚡ in its slot; everyone else gets an empty
                slot so their text starts at the same x. */}
            <button type="button" role="menuitem" className={styles.kebabItem}
              onClick={(e) => choose(e, () => router.push(`/post-job?edit=${job.id}`))}>
              <span className={styles.kebabItemIcon} aria-hidden="true"></span>
              <span>Manage job</span>
            </button>
            <button type="button" role="menuitem" className={styles.kebabItem}
              onClick={(e) => choose(e, () => router.push(`/job/${job.id}?from=my-jobs`))}>
              <span className={styles.kebabItemIcon} aria-hidden="true"></span>
              <span>View public job</span>
            </button>
            <button type="button" role="menuitem" className={styles.kebabItem}
              onClick={(e) => choose(e, () => router.push(`/employer/analytics/${job.id}`))}>
              <span className={styles.kebabItemIcon} aria-hidden="true"></span>
              <span>View analytics</span>
            </button>
            {/* "Find candidates" kebab item removed: feature pending
                post-launch GDPR + pricing decision on full-database search.
                /candidates route still exists, gated behind subscription. */}
            {/* Boost is a paid surface — its modal shows six prices. Hidden
                while PAID_SURFACES_ENABLED is false. The item and the modal
                are both gated: hiding only the item would leave the modal
                openable by any other route into that state. */}
            {PAID_SURFACES_ENABLED && job.status !== 'archived' && job.status !== 'filled' && (
              <button type="button" role="menuitem" className={styles.kebabItem}
                onClick={(e) => choose(e, () => { setBoostTargetJob(job); setBoostModalOpen(true) })}>
                <span className={styles.kebabItemIcon} aria-hidden="true">⚡</span>
                <span>{isBoosted ? 'Boosted (manage)' : 'Boost this job'}</span>
              </button>
            )}
            {/* ACTIVE ONLY, and deliberately so. 'filled' and 'archived' are
                already off the public board (JobsContext loads status=active),
                so offering Remove on them would be a control that appears to do
                something and does nothing — and the menu already carries
                Reactivate for exactly those two states. Gated on manage_jobs so
                a member who would be refused by the endpoint is not shown the
                door in the first place. */}
            {job.status === 'active' && canManageJobs && (
              <button type="button" role="menuitem" className={styles.kebabItem}
                onClick={(e) => choose(e, () => setRemoveTarget(job))}>
                <span className={styles.kebabItemIcon} aria-hidden="true"></span>
                <span>Remove ad</span>
              </button>
            )}
            {(job.status === 'archived' || job.status === 'filled') && (
              <button type="button" role="menuitem" className={styles.kebabItem}
                onClick={(e) => choose(e, () => handleReactivateJob(job.id))}>
                <span className={styles.kebabItemIcon} aria-hidden="true"></span>
                <span>Reactivate</span>
              </button>
            )}
            {job.status === 'archived' && (
              <button type="button" role="menuitem" className={styles.kebabItem}
                onClick={(e) => choose(e, () => handleRepostJob(job))}>
                <span className={styles.kebabItemIcon} aria-hidden="true"></span>
                <span>Repost job</span>
              </button>
            )}
          </div>
        )}
      </div>
    )
  }

  if (loading) {
    return (
      <main>
        <Header />
        <div className={styles.container}>
          <p className={styles.loading}>Loading...</p>
        </div>
      </main>
    )
  }

  // Employer View
  if (isEmployer) {
    return (
      <main>
        <Header />

        <div className={styles.container}>
          <div className={styles.header}>
            <div className={styles.headerContent}>
              <h1 className={styles.title}>
                {activeTab === 'interviewing' ? 'Interviews' :
                 activeTab === 'offers' ? 'Offers' :
                 activeTab === 'hired' ? 'Hired' :
                 activeTab === 'archived' ? 'Archived Jobs' :
                 'Manage Job Ads'}
              </h1>
              <p className={styles.subtitle}>
                {activeTab === 'interviewing' ? 'Jobs with candidates in the interview stage' :
                 activeTab === 'offers' ? 'Jobs with pending or completed offers' :
                 activeTab === 'hired' ? 'Jobs where candidates have been hired' :
                 activeTab === 'archived' ? 'Filled positions and past job listings' :
                 `All your job adverts for ${companyName}`}
              </p>
            </div>
            {activeTab !== 'interviewing' && activeTab !== 'offers' && activeTab !== 'hired' && (
              <Link href="/post-job" className={styles.postJobBtn}>
                + Post New Job
              </Link>
            )}
          </div>

          {/* SHIFTS — the route to /temp-work/manage.

              DELIBERATELY OUTSIDE the postedJobs.length === 0 ternary below.
              That ternary is an early return: an employer with no job ads sees
              the empty state and NOTHING else on this page. Putting this inside
              it would hide the door from precisely the agency that needs it —
              shifts but no full-time roles — which is Neway's exact shape, and
              the same fault as a reply button that only appeared once someone
              had already replied.

              It is a ROUTE, not a second management surface. A job leads to an
              applications pipeline; a shift leads to an available list and a
              public thread. Forced into one list, one of them gets the wrong
              controls. */}
          {canManageShifts && shifts !== null && (
            <section className={styles.shiftsSection}>
              <div className={styles.shiftsHead}>
                <h2 className={styles.shiftsTitle}>Shifts</h2>
                <Link href="/temp-work/manage" className={styles.shiftsLink}>Manage shifts →</Link>
              </div>

              {shifts.length === 0 ? (
                <p className={styles.shiftsEmpty}>
                  No shifts posted yet.{' '}
                  <Link href="/temp-work/post" className={styles.shiftsInlineLink}>Post a shift →</Link>
                </p>
              ) : (
                <>
                  <ul className={styles.shiftsList}>
                    {shifts.slice(0, 3).map(s => (
                      <li key={s.id} className={styles.shiftRow}>
                        <Link href="/temp-work/manage" className={styles.shiftRowMain}>
                          <span className={styles.shiftName}>{s.title}</span>
                          <span className={styles.shiftMeta}>{formatWhen(s)}</span>
                        </Link>
                        <span className={styles.shiftCounts}>
                          <span className={styles.shiftAvail}>{s.interest_count ?? 0} available</span>
                          {s.status !== 'open' && <span className={styles.shiftStatus}>{s.status}</span>}
                        </span>
                      </li>
                    ))}
                  </ul>
                  {shifts.length > 3 && (
                    <Link href="/temp-work/manage" className={styles.shiftsInlineLink}>
                      View all {shifts.length} shifts →
                    </Link>
                  )}
                </>
              )}
            </section>
          )}

          {postedJobs.length > 0 && (
            <div className={styles.filterTabs}>
              {([
                { key: 'all', label: 'All Jobs' },
                { key: 'active', label: 'Active' },
                { key: 'interviewing', label: 'Interviewing' },
                { key: 'offers', label: 'Offers' },
                { key: 'hired', label: 'Hired' },
                { key: 'archived', label: 'Archived' },
              ] as const).map(tab => (
                <button
                  key={tab.key}
                  className={`${styles.filterTab} ${activeTab === tab.key ? styles.filterTabActive : ''}`}
                  onClick={() => router.push(`/my-jobs?filter=${tab.key}`)}
                >
                  {tab.label}
                  {tab.key !== 'all' && viewData.counts[tab.key] > 0 && (
                    <span className={styles.filterTabCount}>{viewData.counts[tab.key]}</span>
                  )}
                  {tab.key === 'all' && (
                    <span className={styles.filterTabCount}>{postedJobs.length}</span>
                  )}
                </button>
              ))}
            </div>
          )}

          {postedJobs.length > 0 && (
            <div className={styles.searchBar}>
              <div className={styles.searchInputGroup}>
                <svg className={styles.searchIcon} width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="11" cy="11" r="8" />
                  <line x1="21" y1="21" x2="16.65" y2="16.65" />
                </svg>
                <input
                  type="text"
                  placeholder="Search by job title..."
                  className={styles.searchInput}
                  value={myJobsSearch}
                  onChange={(e) => setMyJobsSearch(e.target.value)}
                />
              </div>
              <div className={styles.searchInputGroup}>
                <svg className={styles.searchIcon} width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
                  <circle cx="12" cy="10" r="3" />
                </svg>
                <input
                  type="text"
                  placeholder="Filter by location..."
                  className={styles.searchInput}
                  value={myJobsLocationSearch}
                  onChange={(e) => setMyJobsLocationSearch(e.target.value)}
                />
              </div>
            </div>
          )}

          {postedJobs.length === 0 ? (
            <div className={styles.emptyState}>
              <span className={styles.emptyIcon}>📋</span>
              <h2 className={styles.emptyTitle}>No jobs posted yet</h2>
              <p className={styles.emptyText}>
                Start posting jobs to find the perfect candidates for your team.
              </p>
              <Link href="/post-job" className={styles.browseBtn}>
                Post Your First Job
              </Link>
            </div>
          ) : (
            <>
              {/* Stat tiles removed — filter tabs above already carry the
                  same counts. Kept the page glanceable; the rows below are
                  the real content. */}

              {/* Offers tab — show offer records instead of job cards */}
              {activeTab === 'offers' && detailedOffers.filter(o => o.status === 'pending' || o.status === 'declined').length > 0 && (
                <div className={styles.jobsList}>
                  {detailedOffers
                    .filter(o => o.status === 'pending' || o.status === 'declined')
                    .map(offer => (
                    <div key={offer.id} className={styles.jobCard} style={{ cursor: 'pointer' }} onClick={() => router.push(`/my-jobs/${offer.jobId}/applications`)}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                        <div>
                          <h3 style={{ fontSize: '1rem', fontWeight: 700, margin: '0 0 0.25rem' }}>{offer.candidateName}</h3>
                          <p style={{ fontSize: '0.85rem', color: '#64748b', margin: 0 }}>{offer.jobTitle}</p>
                        </div>
                        <span style={{
                          fontSize: '0.75rem', fontWeight: 600, padding: '0.2rem 0.6rem', borderRadius: 99,
                          background: offer.status === 'pending' ? '#fffbeb' : '#fef2f2',
                          color: offer.status === 'pending' ? '#d97706' : '#dc2626',
                          border: `1px solid ${offer.status === 'pending' ? '#fde68a' : '#fecaca'}`,
                        }}>
                          {offer.status === 'pending' ? 'Awaiting Response' : 'Declined'}
                        </span>
                      </div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem 1.5rem', marginTop: '0.75rem', fontSize: '0.85rem', color: '#334155' }}>
                        <span><strong>Salary:</strong> {offer.salary}</span>
                        <span><strong>Start:</strong> {new Date(offer.startDate).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
                        <span><strong>Type:</strong> {offer.contractType}</span>
                      </div>
                      {offer.declineReason && (
                        <p style={{ fontSize: '0.8rem', color: '#dc2626', marginTop: '0.5rem', fontStyle: 'italic' }}>Reason: {offer.declineReason}</p>
                      )}
                      <p style={{ fontSize: '0.75rem', color: '#94a3b8', marginTop: '0.5rem' }}>
                        Sent {new Date(offer.createdAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                      </p>
                    </div>
                  ))}
                </div>
              )}
              {activeTab === 'offers' && detailedOffers.filter(o => o.status === 'pending' || o.status === 'declined').length === 0 && (
                <div style={{ textAlign: 'center', padding: '3rem 1rem', color: '#94a3b8' }}>
                  <div style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>📋</div>
                  <p>No pending offers. Make an offer from the applicant view.</p>
                </div>
              )}

              {/* Hired tab — show hired records instead of job cards */}
              {activeTab === 'hired' && detailedOffers.filter(o => o.status === 'accepted').length > 0 && (
                <div className={styles.jobsList}>
                  {detailedOffers
                    .filter(o => o.status === 'accepted')
                    .map(offer => (
                    <div key={offer.id} className={styles.jobCard} style={{ cursor: 'pointer' }} onClick={() => router.push(`/my-jobs/${offer.jobId}/applications`)}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                        <div>
                          <h3 style={{ fontSize: '1rem', fontWeight: 700, margin: '0 0 0.25rem' }}>{offer.candidateName}</h3>
                          <p style={{ fontSize: '0.85rem', color: '#64748b', margin: 0 }}>{offer.jobTitle}</p>
                        </div>
                        <span style={{ fontSize: '0.75rem', fontWeight: 600, padding: '0.2rem 0.6rem', borderRadius: 99, background: '#f0fdf4', color: '#16a34a', border: '1px solid #bbf7d0' }}>
                          Hired
                        </span>
                      </div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem 1.5rem', marginTop: '0.75rem', fontSize: '0.85rem', color: '#334155' }}>
                        <span><strong>Salary:</strong> {offer.salary}</span>
                        <span><strong>Start:</strong> {new Date(offer.startDate).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
                        <span><strong>Type:</strong> {offer.contractType}</span>
                      </div>
                      {offer.signatureName && (
                        <p style={{ fontSize: '0.8rem', color: '#16a34a', marginTop: '0.5rem' }}>
                          ✓ Signed by {offer.signatureName} on {offer.signatureTimestamp ? new Date(offer.signatureTimestamp).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : ''}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              )}
              {activeTab === 'hired' && detailedOffers.filter(o => o.status === 'accepted').length === 0 && (
                <div style={{ textAlign: 'center', padding: '3rem 1rem', color: '#94a3b8' }}>
                  <div style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>🎉</div>
                  <p>No hires yet. Candidates will appear here once they accept an offer.</p>
                </div>
              )}

              {/* Job list — single dense row layout for every viewport. Whole
                  row click → applications; secondary actions live in the kebab.
                  Mobile (<768px) reflows .rowSide below the title via CSS. */}
              {activeTab !== 'offers' && activeTab !== 'hired' && (
                <div className={styles.jobRows}>
                  {displayJobs.map(job => {
                    const status = getStatusLabel(job.status)
                    const statusClass = job.status === 'active' ? styles.statusActiveGreen : status.className
                    const isBoosted = !!jobBoosts[job.id]
                    const interviewMeta = activeTab === 'interviewing' && viewData.nextInterviewMap[job.id]
                      ? viewData.nextInterviewMap[job.id] : null
                    const goToApps = () => router.push(`/my-jobs/${job.id}/applications`)
                    return (
                      <div
                        key={job.id}
                        className={styles.jobRow}
                        role="link"
                        tabIndex={0}
                        onClick={goToApps}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault()
                            goToApps()
                          }
                        }}
                      >
                        {/* Left cluster — content fields pack tightly with
                            the em-dash separators sitting between them. No
                            justify-content slack distribution at row level,
                            so an absent logo doesn't leave an empty gap. */}
                        <div className={styles.rowMain}>
                          {/* Logo column: recruiter accounts manage multiple
                              companies and need the brand glyph to scan the
                              list; single-company employers don't. It's a
                              leading avatar slot (outside the field-join), so
                              when hidden NO space is reserved. */}
                          {isRecruiter && (
                            <CompanyLogo
                              src={job.companyLogo}
                              alt={job.company}
                              className={styles.rowLogo}
                            />
                          )}
                          {/* Inline text built STRUCTURALLY from the present
                              fields — a separator only ever sits between two
                              present fields, so an absent venue/location/etc.
                              can never strand an orphan dash. */}
                          <RowInlineFields
                            sepClassName={styles.fieldSep}
                            fields={[
                              <h3 key="t" className={styles.rowTitle}>{job.title}</h3>,
                              job.venue ? <span key="v" className={styles.rowVenue}>{job.venue}</span> : null,
                              job.location ? <span key="l" className={styles.rowLocation}>{job.location}</span> : null,
                              interviewMeta ? <span key="i" className={styles.rowInterview}>📅 Interview {formatInterviewDate(interviewMeta.date, interviewMeta.time)}</span> : null,
                              job.hiredCandidate ? <span key="h" className={styles.rowHired}>✓ Hired {job.hiredCandidate.name}</span> : null,
                            ]}
                          />
                        </div>

                        {/* Right cluster — status, applications pill, kebab.
                            Fixed-width side of the row so every row's right
                            edge lines up regardless of left-side content. */}
                        <div className={styles.rowAside}>
                          <span className={`${styles.statusPill} ${statusClass}`}>{status.label}</span>
                          {/* Applications pill: emphasised clickable
                              secondary action — quiet blue accent (not
                              yellow), keeping the single solid-yellow
                              primary CTA (+ Post New Job) uncompeted-with. */}
                          <button
                            type="button"
                            className={styles.applicationsPill}
                            onClick={(e) => { e.stopPropagation(); goToApps() }}
                            aria-label={`${job.applicationCount} ${job.applicationCount === 1 ? 'application' : 'applications'}`}
                          >
                            <strong>{job.applicationCount}</strong>
                            {' '}
                            <span className={styles.appCountWord}>
                              {job.applicationCount === 1 ? 'application' : 'applications'}
                            </span>
                            <span className={styles.appCountWordShort}>apps</span>
                            <span className={styles.applicationsPillArrow} aria-hidden="true">→</span>
                          </button>
                          {renderKebab(job, isBoosted)}
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </>
          )}
        </div>

        {removeTarget && (
          <RemoveAdModal
            jobTitle={removeTarget.title}
            // Already loaded — the second pass at ~line 183 fills
            // applicationCount from job_applications, and the card beside this
            // renders the same number. No extra query on this surface.
            applicationCount={removeTarget.applicationCount}
            onCancel={() => setRemoveTarget(null)}
            onConfirm={() => handleRemoveAd(removeTarget)}
          />
        )}

        <BoostModal
          isOpen={PAID_SURFACES_ENABLED && boostModalOpen}
          onClose={() => { setBoostModalOpen(false); setBoostTargetJob(null) }}
          onSuccess={async () => {
            const { data: { session } } = await supabase.auth.getSession()
            if (session) {
              const { data } = await supabase
                .from('boosts')
                .select('*')
                .eq('user_id', session.user.id)
                .eq('boost_type', 'job')
              if (data) {
                const map: Record<string, Boost> = {}
                data.forEach((b: any) => { if (isBoostActive(b)) map[b.target_id] = b })
                setJobBoosts(map)
              }
            }
          }}
          boostType="job"
          targetId={boostTargetJob?.id || ''}
          targetLabel={boostTargetJob?.title || ''}
          tiers={JOB_BOOST_TIERS}
        />
      </main>
    )
  }

  // Job Seeker View
  return (
    <main>
      <Header />

      <div className={styles.container}>
        <div className={styles.header}>
          <div className={styles.headerContent}>
            <h1 className={styles.title}>My Applied Jobs</h1>
            <p className={styles.subtitle}>Track the status of your job applications</p>
          </div>
          <Link href="/jobs" className={styles.browseJobsBtn}>
            Browse Jobs
          </Link>
        </div>

        {appliedJobs.length === 0 ? (
          <div className={styles.emptyState}>
            <span className={styles.emptyIcon}>📋</span>
            <h2 className={styles.emptyTitle}>You haven't applied to any jobs yet</h2>
            <p className={styles.emptyText}>
              Start exploring opportunities and apply to jobs that match your skills.
            </p>
            <Link href="/jobs" className={styles.browseBtn}>
              Browse Available Jobs
            </Link>
          </div>
        ) : (
          <>
            <div className={styles.statsSmall}>
              <div className={styles.statItem}>
                <span className={styles.statNumber}>{appliedJobs.length}</span>
                <span className={styles.statLabel}>Applications Sent</span>
              </div>
            </div>

            <div className={styles.jobsList}>
              {appliedJobs.map((job, index) => {
                const status = getStatusLabel(job.status)
                return (
                  <div key={`${job.jobId}-${index}`} className={styles.jobCard}>
                    <div className={styles.cardHeader}>
                      <div className={styles.jobInfo}>
                        <h3 className={styles.jobTitle}>{job.jobTitle}</h3>
                        <p className={styles.company}>{job.company}</p>
                      </div>
                      <span className={`${styles.statusBadge} ${status.className}`}>
                        {status.label}
                      </span>
                    </div>

                    <div className={styles.cardBody}>
                      <div className={styles.appliedDate}>
                        <span className={styles.dateIcon}>📅</span>
                        Applied: {formatDate(job.appliedAt)}
                      </div>
                    </div>

                    <div className={styles.cardFooter}>
                      <button
                        className={styles.viewJobBtn}
                        onClick={() => router.push(`/jobs?id=${job.jobId}`)}
                      >
                        View Job
                      </button>
                      <button className={styles.withdrawBtn}>
                        Withdraw Application
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          </>
        )}
      </div>
    </main>
  )
}

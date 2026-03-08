'use client'

import { Suspense, useState, useEffect, useMemo } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import Header from '@/components/Header'
import { supabase } from '@/lib/supabase'
import { useJobs } from '@/lib/JobsContext' // refreshJobs only — data fetched directly from Supabase
import CompanyLogo from '@/components/CompanyLogo'
import BoostModal from '@/components/BoostModal'
import { Boost, JOB_BOOST_TIERS, getDaysRemaining, isBoostActive } from '@/lib/boostTypes'
import styles from './page.module.css'

interface PostedJob {
  id: string
  title: string
  company: string
  companyLogo: string
  location: string
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
  const [loading, setLoading] = useState(true)
  const [postedJobs, setPostedJobs] = useState<PostedJob[]>([])
  const [appliedJobs, setAppliedJobs] = useState<AppliedJob[]>([])
  const [companyName, setCompanyName] = useState('')
  const [rawInterviews, setRawInterviews] = useState<{ jobId: string; status: string; interviewDate: string; interviewTime: string; candidateName: string }[]>([])
  const [rawOffers, setRawOffers] = useState<{ jobId: string; status: string }[]>([])
  const [appCountsByJob, setAppCountsByJob] = useState<Record<string, Record<string, number>>>({})
  const [boostModalOpen, setBoostModalOpen] = useState(false)
  const [boostTargetJob, setBoostTargetJob] = useState<PostedJob | null>(null)
  const [jobBoosts, setJobBoosts] = useState<Record<string, Boost>>({})
  const [myJobsSearch, setMyJobsSearch] = useState('')
  const [myJobsLocationSearch, setMyJobsLocationSearch] = useState('')

  // Read filter from URL query param (e.g. /my-jobs?filter=interviewing)
  const filterParam = searchParams.get('filter')
  const validFilters = ['all', 'active', 'interviewing', 'offers', 'hired', 'archived'] as const
  const activeTab = validFilters.includes(filterParam as any) ? (filterParam as typeof validFilters[number]) : 'all'

  useEffect(() => {
    const checkAuth = async () => {
      const { data: { session } } = await supabase.auth.getSession()

      if (!session) {
        router.push('/login')
        return
      }

      const userRole = session.user.user_metadata?.role

      if (userRole === 'employer') {
        setIsEmployer(true)
        const company = session.user.user_metadata?.company_name || 'Your Company'
        const employerId = session.user.id
        setCompanyName(company)

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
          postedDate: row.posted_at ? new Date(row.posted_at).toISOString().split('T')[0] : new Date().toISOString().split('T')[0],
          applicationCount: 0,
          viewCount: row.view_count || 0,
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

          // Fetch offers with job_id for per-view filtering
          const { data: offerData } = await supabase
            .from('job_offers')
            .select('job_id, status')
            .eq('employer_id', employerId)

          if (offerData) {
            setRawOffers(offerData.map((r: any) => ({
              jobId: r.job_id,
              status: r.status,
            })))
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

  const getApplicationStatus = (appliedAt: string): AppliedJob['status'] => {
    const daysAgo = Math.floor((Date.now() - new Date(appliedAt).getTime()) / (1000 * 60 * 60 * 24))
    if (daysAgo < 3) return 'pending'
    if (daysAgo < 7) return 'reviewing'
    return 'reviewing'
  }

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

  const handleDeleteJob = (jobId: string) => {
    // In a real app, this would make an API call
    if (confirm('Are you sure you want to delete this job posting?')) {
      setPostedJobs(prev => prev.filter(job => job.id !== jobId))
    }
  }

  const handleToggleJobStatus = (jobId: string) => {
    setPostedJobs(prev => prev.map(job => {
      if (job.id === jobId) {
        const newStatus = job.status === 'active' ? 'paused' : 'active'
        return { ...job, status: newStatus }
      }
      return job
    }))
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
      const { error } = await supabase
        .from('jobs')
        .insert({
          ...jobData,
          status: 'active',
          view_count: 0,
          application_count: 0,
          job_reference: `JOB-${Date.now().toString(36).toUpperCase()}`,
        })

      if (error) {
        console.error('Error reposting job:', error)
        alert('Failed to repost job. Please try again.')
        return
      }

      await refreshJobs()
      router.push('/my-jobs')
    } catch (err) {
      console.error('Error reposting job:', err)
    }
  }

  const handleArchiveJob = async (jobId: string) => {
    const confirmed = confirm('Archive this job? It will be moved to the Archived Jobs section.')
    if (!confirmed) return

    try {
      const { error } = await supabase
        .from('jobs')
        .update({ status: 'archived' })
        .eq('id', jobId)

      if (error) {
        console.error('Error archiving job:', error)
        alert('Failed to archive job. Please try again.')
        return
      }

      setPostedJobs(prev => prev.map(j => j.id === jobId ? { ...j, status: 'archived' as const } : j))
      await refreshJobs()
    } catch (err) {
      console.error('Error archiving job:', err)
    }
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
                 'My Job Postings'}
              </h1>
              <p className={styles.subtitle}>
                {activeTab === 'interviewing' ? 'Jobs with candidates in the interview stage' :
                 activeTab === 'offers' ? 'Jobs with pending or completed offers' :
                 activeTab === 'hired' ? 'Jobs where candidates have been hired' :
                 activeTab === 'archived' ? 'Filled positions and past job listings' :
                 `Manage your job listings for ${companyName}`}
              </p>
            </div>
            {activeTab !== 'interviewing' && activeTab !== 'offers' && activeTab !== 'hired' && (
              <Link href="/post-job" className={styles.postJobBtn}>
                + Post New Job
              </Link>
            )}
          </div>

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
              {activeTab === 'interviewing' ? (
                <div className={styles.stats}>
                  <div className={styles.statItem}>
                    <span className={styles.statNumber}>{viewData.todayInterviews}</span>
                    <span className={styles.statLabel}>Today</span>
                  </div>
                  <div className={styles.statItem}>
                    <span className={styles.statNumber}>{viewData.thisWeekInterviews}</span>
                    <span className={styles.statLabel}>This Week</span>
                  </div>
                  <div className={styles.statItem}>
                    <span className={styles.statNumber}>{viewData.pendingConfirmation}</span>
                    <span className={styles.statLabel}>Pending Confirmation</span>
                  </div>
                  <div className={styles.statItem}>
                    <span className={styles.statNumber}>{viewData.completedInterviews}</span>
                    <span className={styles.statLabel}>Completed</span>
                  </div>
                </div>
              ) : activeTab === 'hired' ? (
                <div className={styles.stats}>
                  <div className={styles.statItem}>
                    <span className={styles.statNumber}>{viewData.hiredCandidates}</span>
                    <span className={styles.statLabel}>Candidates Hired</span>
                  </div>
                  <div className={styles.statItem}>
                    <span className={styles.statNumber}>{viewData.filtered.length}</span>
                    <span className={styles.statLabel}>Jobs Filled</span>
                  </div>
                  <div className={styles.statItem}>
                    <span className={styles.statNumber}>{viewData.acceptedOffers}</span>
                    <span className={styles.statLabel}>Offers Accepted</span>
                  </div>
                  <div className={styles.statItem}>
                    <span className={styles.statNumber}>{viewData.stillHiring}</span>
                    <span className={styles.statLabel}>Still Hiring</span>
                  </div>
                </div>
              ) : activeTab === 'archived' ? null : (
                <div className={styles.stats}>
                  <div className={styles.statItem}>
                    <span className={styles.statNumber}>{viewData.filtered.length}</span>
                    <span className={styles.statLabel}>Total Jobs</span>
                  </div>
                  <div className={styles.statItem}>
                    <span className={styles.statNumber}>
                      {viewData.filtered.filter(j => j.status === 'active').length}
                    </span>
                    <span className={styles.statLabel}>Active</span>
                  </div>
                  <div className={styles.statItem}>
                    <span className={styles.statNumber}>
                      {viewData.filtered.reduce((sum, j) => sum + j.applicationCount, 0)}
                    </span>
                    <span className={styles.statLabel}>Applications</span>
                  </div>
                  <div className={styles.statItem}>
                    <span className={styles.statNumber}>
                      {viewData.filtered.reduce((sum, j) => sum + j.viewCount, 0)}
                    </span>
                    <span className={styles.statLabel}>Views</span>
                  </div>
                </div>
              )}

              <div className={styles.jobsList}>
                {displayJobs.map(job => {
                  const status = getStatusLabel(job.status)
                  return (
                    <div key={job.id} className={styles.jobCard}>
                      <div className={styles.cardHeader}>
                        <div className={styles.cardHeaderLeft}>
                          <CompanyLogo
                            src={job.companyLogo}
                            alt={job.company}
                            className={styles.companyLogo}
                          />
                          <div className={styles.jobInfo}>
                            <h3 className={styles.jobTitle}>{job.title}</h3>
                            <div className={styles.jobKeyInfo}>
                              <span className={styles.salaryBadge}>
                                {formatSalary(job.salaryMin, job.salaryMax, job.salaryPeriod)}
                              </span>
                              <span className={styles.typeBadge}>
                                {job.employmentType.join(', ')}
                              </span>
                              <span className={styles.jobLocation}>
                                <span className={styles.locationIcon}>📍</span>
                                {job.location}
                              </span>
                            </div>
                            {job.category && (
                              <span className={styles.categoryTag}>{job.category}</span>
                            )}
                          </div>
                        </div>
                        <span className={`${styles.statusBadge} ${status.className}`}>
                          {status.label}
                        </span>
                      </div>

                      <div className={styles.cardBody}>
                        {jobBoosts[job.id] && (
                          <div className={styles.boostStatus}>
                            <span>⚡ Boosted</span>
                            <span>{getDaysRemaining(jobBoosts[job.id].expires_at)} days remaining</span>
                          </div>
                        )}
                        {activeTab === 'interviewing' && viewData.nextInterviewMap[job.id] && (
                          <div className={styles.interviewBadge}>
                            <span className={styles.interviewBadgeIcon}>📅</span>
                            <span>
                              Interview: <strong>{formatInterviewDate(viewData.nextInterviewMap[job.id].date, viewData.nextInterviewMap[job.id].time)}</strong>
                              {viewData.nextInterviewMap[job.id].candidateName && (
                                <> — {viewData.nextInterviewMap[job.id].candidateName}</>
                              )}
                            </span>
                          </div>
                        )}
                        {job.hiredCandidate && (
                          <div className={styles.hiredInfo}>
                            <span className={styles.hiredIcon}>&#10003;</span>
                            <span>
                              Hired: <strong>{job.hiredCandidate.name}</strong>
                              {job.hiredCandidate.hiredAt && (
                                <> on {formatDate(job.hiredCandidate.hiredAt)}</>
                              )}
                            </span>
                          </div>
                        )}
                        {job.description && (
                          <p className={styles.jobDescription}>
                            {truncateText(job.description, 80)}
                          </p>
                        )}
                        <div className={styles.jobMeta}>
                          <div className={styles.metaItem}>
                            <span className={styles.metaIcon}>📅</span>
                            <span>Posted: {formatDate(job.postedDate)}</span>
                          </div>
                          {job.expiresDate && (
                            <div className={styles.metaItem}>
                              <span className={styles.metaIcon}>⏰</span>
                              <span>Closes: {formatDate(job.expiresDate)}</span>
                            </div>
                          )}
                          <div className={styles.metaItem}>
                            <span className={styles.metaIcon}>👥</span>
                            <span>{job.applicationCount} applications</span>
                          </div>
                          <div className={styles.metaItem}>
                            <span className={styles.metaIcon}>👁️</span>
                            <span>{job.viewCount} views</span>
                          </div>
                          <Link
                            href={`/employer/analytics/${job.id}`}
                            className={styles.analyticsLink}
                            onClick={(e) => e.stopPropagation()}
                          >
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <polyline points="23 6 13.5 15.5 8.5 10.5 1 18" />
                              <polyline points="17 6 23 6 23 12" />
                            </svg>
                            View Analytics
                          </Link>
                        </div>
                      </div>

                      <div className={styles.cardFooter}>
                        {job.status === 'archived' ? (
                          <>
                            <button
                              className={styles.viewApplicationsBtn}
                              onClick={() => router.push(`/my-jobs/${job.id}/applications`)}
                            >
                              View Applications
                            </button>
                            <button
                              className={styles.activateBtn}
                              onClick={() => handleReactivateJob(job.id)}
                            >
                              Reactivate
                            </button>
                            <button
                              className={styles.editBtn}
                              onClick={() => handleRepostJob(job)}
                            >
                              Repost Job
                            </button>
                          </>
                        ) : job.status === 'filled' ? (
                          <>
                            <button
                              className={styles.viewApplicationsBtn}
                              onClick={() => router.push(`/my-jobs/${job.id}/applications`)}
                            >
                              View Applications
                            </button>
                            <button
                              className={styles.activateBtn}
                              onClick={() => handleReactivateJob(job.id)}
                            >
                              Reactivate
                            </button>
                            <button
                              className={styles.editBtn}
                              onClick={() => handleRepostJob(job)}
                            >
                              Repost Job
                            </button>
                            <button
                              className={styles.archiveBtn}
                              onClick={() => handleArchiveJob(job.id)}
                            >
                              Archive
                            </button>
                          </>
                        ) : (
                          <>
                            <button
                              className={styles.viewApplicationsBtn}
                              onClick={() => router.push(`/my-jobs/${job.id}/applications`)}
                            >
                              View Applications
                            </button>
                            <button
                              className={`${styles.boostBtn} ${jobBoosts[job.id] ? styles.boostBtnActive : ''}`}
                              onClick={() => {
                                setBoostTargetJob(job)
                                setBoostModalOpen(true)
                              }}
                            >
                              {jobBoosts[job.id] ? '⚡ Boosted' : '⚡ Boost'}
                            </button>
                            <button
                              className={styles.editBtn}
                              onClick={() => router.push(`/post-job?edit=${job.id}`)}
                            >
                              Edit
                            </button>
                            <button
                              className={job.status === 'active' ? styles.pauseBtn : styles.activateBtn}
                              onClick={() => handleToggleJobStatus(job.id)}
                            >
                              {job.status === 'active' ? 'Pause' : 'Activate'}
                            </button>
                            <button
                              className={styles.deleteBtn}
                              onClick={() => handleDeleteJob(job.id)}
                            >
                              Delete
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            </>
          )}
        </div>

        <BoostModal
          isOpen={boostModalOpen}
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

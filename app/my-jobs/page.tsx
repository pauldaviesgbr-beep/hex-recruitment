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
import BoostModal from '@/components/BoostModal'
import ManageCard from '@/components/ManageCard'
import { jobPay, jobPayText, primaryEmploymentType } from '@/lib/jobCard'
import { tabOf } from '@/lib/jobAdTabs.mjs'
import RemoveAdModal from '@/components/RemoveAdModal'
import { isListed, stageOf } from '@/lib/applicantStages'
import QuickEditJobModal, { type QuickEditValues } from '@/components/QuickEditJobModal'
import { PAID_SURFACES_ENABLED } from '@/lib/paidSurfaces'
import { Boost, JOB_BOOST_TIERS, isBoostActive } from '@/lib/boostTypes'
import styles from './page.module.css'
import { Ico } from '@/components/icons'

interface PostedJob {
  id: string
  title: string
  company: string
  companyLogo: string
  /** The employer's uploaded banner — the big image on the card. Carried here
   *  because the card is now the board's own FeedCard, which renders it. It was
   *  missing from this interface, so the employer's view of their own advert
   *  showed the branded fallback while the board showed the real photograph. */
  companyBanner?: string
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
  /** The advert body, for the no-photograph panel to lift its sentence from.
   *  Empty on a row that predates the column; the panel falls to tags. */
  fullDescription?: string
  /** The employer's own tag selections, the panel's middle fallback. */
  tags?: string[]
  /** Stored hex from their logo. Null = navy. */
  brandColour?: string | null
  expiresDate?: string
  applicationStatuses: string[]
  /** The 60-day expiry cron skips recruiter postings, so their card claims no
   *  countdown ("N days left" would be false to the person who owns it). */
  isRecruiterPosting?: boolean
}

/** Design 26, C: the three tabs, from lib/jobAdTabs (one rule, page and drive). */
type JobAdTab = 'live' | 'filled' | 'archived'

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
  const [editTarget, setEditTarget] = useState<PostedJob | null>(null)
  const [loading, setLoading] = useState(true)
  const [postedJobs, setPostedJobs] = useState<PostedJob[]>([])
  const [appliedJobs, setAppliedJobs] = useState<AppliedJob[]>([])
  // Interviews, offers and hires USED TO BE LOADED HERE for the Interviewing /
  // Offers / Hired tabs. Design 26 (C) drops those tabs — they are applicant
  // stages, and they live on Applicants — so the three queries went with them.
  const [appCountsByJob, setAppCountsByJob] = useState<Record<string, Record<string, number>>>({})
  const [boostModalOpen, setBoostModalOpen] = useState(false)
  const [boostTargetJob, setBoostTargetJob] = useState<PostedJob | null>(null)
  const [jobBoosts, setJobBoosts] = useState<Record<string, Boost>>({})
  // One search, behind an icon at the right of the tabs (design 26, C); it
  // matches the title or the place.
  const [myJobsSearch, setMyJobsSearch] = useState('')
  const [searchOpen, setSearchOpen] = useState(false)
  // "Add the pay" opens the quick editor on the pay field.
  const [editFocus, setEditFocus] = useState<'pay' | undefined>(undefined)
  // THE RECRUITER FLAG IS GONE FROM THIS PAGE, and deliberately.
  //
  // It existed to decide whether the dense row showed a company logo: a
  // multi-client recruiter needs the brand glyph to tell whose advert is
  // whose; a single-company employer does not, and the row reserved no space
  // when it was hidden.
  //
  // The card shows the logo unconditionally, because THE BOARD DOES. The whole
  // point of this layout is that an employer sees the advert as a candidate
  // sees it, and a card that hides the logo for some accounts would be a
  // different object again — the exact problem the row had.

  // ?filter= is one of the three tabs. THE OLD VALUES STILL LAND SOMEWHERE
  // SENSIBLE, because dashboards, emails and bookmarks link here with them:
  // all/active → Live, hired → Filled, archived → Archived, and the applicant
  // stages (interviewing, offers) → Live.
  const filterParam = searchParams.get('filter')
  const activeTab: JobAdTab = filterParam === 'filled' || filterParam === 'hired' ? 'filled'
    : filterParam === 'archived' ? 'archived'
    : 'live'

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
        // Multi-user: jobs/apps are keyed employer_id = owner user_id.
        const employerId = (await getCurrentEmployerOwnerId(supabase)) ?? session.user.id

        // The is_recruiter read that used to live here went with the flag —
        // see the note where the state was removed. A query kept alive to feed
        // nothing is a query someone later has to work out the purpose of.

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
          companyBanner: row.company_banner_url || undefined,
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
          fullDescription: row.full_description || row.description || '',
          tags: row.tags || [],
          brandColour: row.brand_colour ?? null,
          expiresDate: row.expires_at || undefined,
          applicationStatuses: [],
          isRecruiterPosting: !!row.is_recruiter_posting,
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

  // Put a filled or archived ad back on the board. Returns whether it went.
  const makeLive = async (jobId: string): Promise<boolean> => {
    try {
      const { error } = await supabase
        .from('jobs')
        .update({ status: 'active' })
        .eq('id', jobId)

      if (error) {
        console.error('Error making job live again:', error)
        return false
      }

      await ensureJobArea(jobId)
      await refreshJobs()
      return true
    } catch (err) {
      console.error('Error making job live again:', err)
      return false
    }
  }

  // MAKE LIVE AGAIN. Every advert on Thrive shows its pay, so an ad with none
  // does not go back on the board as it is: the quick editor opens on the pay
  // field — the same path as "Add the pay" — and the ad goes live only once
  // the pay is saved (handleQuickEditSave). Cancelling leaves it where it was.
  // "No pay" is the card's own test (jobPay), so the two cannot disagree.
  const [liveAfterPay, setLiveAfterPay] = useState<string | null>(null)
  const handleMakeLiveAgain = async (job: PostedJob) => {
    if (!jobPay(job)) {
      setLiveAfterPay(job.id)
      setEditFocus('pay')
      setEditTarget(job)
      return
    }
    if (!confirm('Make this job ad live again? It will appear in search results again.')) return
    if (!(await makeLive(job.id))) alert('Could not make the job ad live again. Please try again.')
  }

  // POST AGAIN (design 26, C): start a COPY in the post-job form, filled in
  // from this advert. It used to insert the copy straight onto the live board
  // after a browser confirm box — which skipped the form, and so skipped the
  // rule that every advert shows its pay. The form checks pay before anything
  // is published; the employer reviews the copy and posts it.
  const handlePostAgain = (job: PostedJob) => router.push(`/post-job?copy=${job.id}`)

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
  // SAVE AN INLINE EDIT, AND MEASURE THAT IT LANDED.
  //
  // Both filters are load-bearing. `id` is the advert; `employer_id` is the
  // caller's own owner id, resolved the same way the list itself resolves it —
  // with that pinned, another employer's id is not merely unlikely to match,
  // it is unmatched. RLS says the same thing underneath, and this is the belt
  // to its braces.
  //
  // .select() makes the row count a MEASUREMENT rather than a hope. Supabase
  // returns success with zero rows when a policy refuses the UPDATE while
  // allowing the SELECT — which is exactly a team member without manage_jobs —
  // and without this the dialog would close on a write that never happened.
  const handleQuickEditSave = async (jobId: string, values: QuickEditValues) => {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) throw new Error('Your session has expired. Please sign in again.')
    const ownerId = (await getCurrentEmployerOwnerId(supabase)) ?? session.user.id

    const { data, error } = await supabase
      .from('jobs')
      .update({
        title: values.title,
        location: values.location,
        salary_min: values.salaryMin,
        salary_max: values.salaryMax,
        salary_type: values.salaryPeriod === 'hour' ? 'hourly' : 'annual',
        description: values.description,
      })
      .eq('id', jobId)
      .eq('employer_id', ownerId)
      .select('id')

    if (error) throw new Error(error.message)
    if (!data || data.length === 0) {
      throw new Error('That did not save — you may not have permission to edit adverts on this account.')
    }

    // A CHANGED LOCATION MUST RE-RESOLVE THE AREA, or the advert keeps being
    // matched against the county it used to be in. `area_county` is an ID that
    // preferred-areas matching keys on, and `area` is printed verbatim beside
    // the town — move a role from Bath to London and, without this, it stays
    // filed under Somerset and still says so on the card.
    //
    // THE FULL EDITOR DOES NOT DO THIS: /post-job only calls resolve-area
    // inside its `!isEditMode` branch, so editing a location there has always
    // left both fields stale. Reported separately — not fixed here, because
    // that is a change to the posting flow and this is the list. Doing it on
    // the path being added is not optional though: making location easy to
    // change is what turns a latent fault into a frequent one.
    //
    // Non-blocking and best-effort, exactly as the post path treats it: a null
    // area never hides a job, so a failure here must not fail the save the
    // employer just watched succeed.
    if (values.location !== editTarget?.location) {
      fetch('/api/jobs/resolve-area', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ jobId }),
      }).catch(err => console.error('[my-jobs] area resolve failed (non-blocking):', err))
    }

    // Update the row in place rather than refetching. The list is the thing the
    // employer is looking at; a full reload would scroll and re-sort under them.
    setPostedJobs(prev => prev.map(j => j.id === jobId ? {
      ...j,
      title: values.title,
      location: values.location,
      salaryMin: values.salaryMin,
      salaryMax: values.salaryMax,
      salaryPeriod: values.salaryPeriod,
      description: values.description,
    } : j))

    // MAKE LIVE AGAIN, waiting on its pay: the pay is now saved (the editor
    // refuses to save without it), so the ad goes live. If that step fails the
    // editor stays open and says so — the pay itself did save.
    if (liveAfterPay === jobId && values.salaryMin > 0) {
      if (!(await makeLive(jobId))) throw new Error('The pay is saved, but the ad did not go live. Close this and choose Make live again.')
      setLiveAfterPay(null)
    }
    setEditTarget(null)
  }

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
    // People still waiting: the dialog stays open on its "Advert removed" card
    // and closes itself (onDone). Nobody waiting: close now, as before.
    if (waitingFor(job.id) === 0) setRemoveTarget(null)
    await refreshJobs()
  }

  // "Still waiting" is the Applicants list's own rule (New to Offer), read from
  // lib/applicantStages over the per-status counts this page already loads.
  const waitingFor = (jobId: string) =>
    Object.entries(appCountsByJob[jobId] || {}).reduce((n, [status, c]) => n + (isListed(stageOf(status)) ? c : 0), 0)

  const sendWaitingUpdates = async (jobId: string): Promise<number> => {
    const res = await fetch(`/api/jobs/${jobId}/notify-waiting`, { method: 'POST' })
    const body = await res.json().catch(() => null)
    if (!res.ok || !body?.ok) throw new Error('notify_failed')
    await refreshJobs()
    return Number(body.sent) || 0
  }

  // ── DESIGN 26, C: THREE TABS THAT PARTITION THE ADVERTS ──────────────────
  // Live · Filled · Archived, by lib/jobAdTabs' one rule (paused is live;
  // closed — and the cron's expired — is archived). The counts come from the
  // SAME list each tab shows, so a badge can never disagree with the cards
  // under it — the fault this page once had as "All Jobs 4" above nothing.
  const tabCounts = useMemo(() => {
    const c: Record<JobAdTab, number> = { live: 0, filled: 0, archived: 0 }
    for (const j of postedJobs) c[tabOf(j.status) as JobAdTab]++
    return c
  }, [postedJobs])

  const displayJobs = useMemo(() => {
    const q = myJobsSearch.trim().toLowerCase()
    return postedJobs
      .filter(j => tabOf(j.status) === activeTab)
      .filter(j => !q || j.title.toLowerCase().includes(q) || j.location.toLowerCase().includes(q) || (j.venue || '').toLowerCase().includes(q))
  }, [postedJobs, activeTab, myJobsSearch])

  // "New" is the Applicants list's own stage (lib/applicantStages), read from
  // the per-status counts this page already loads — no second definition.
  const newFor = (jobId: string) =>
    Object.entries(appCountsByJob[jobId] || {}).reduce((n, [status, c]) => n + (stageOf(status) === 'new' ? c : 0), 0)

  // A COUNTDOWN IS A CLAIM. Adverts expire 60 days after posted_at (the daily
  // job-expiry cron) — except recruiter postings, which the cron excludes; on
  // those, "N days left" would be a false statement to the person who owns it.
  const daysLeft = (job: PostedJob): number | null => {
    if (job.isRecruiterPosting) return null
    const t = Date.parse(job.postedDate)
    if (Number.isNaN(t)) return null
    const left = 60 - Math.floor((Date.now() - t) / 86_400_000)
    return left > 0 ? left : null
  }

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

  // Employer View — DESIGN 26, C: the September job-ads card on the shared
  // ManageCard (the same card /temp-work/manage uses, so shifts and job ads are
  // managed the same way). No images or logos; titles in Inter; the pay in the
  // cards' short form, and never "Competitive salary".
  if (isEmployer) {
    const TAB_LABEL: Record<JobAdTab, string> = { live: 'Live', filled: 'Filled', archived: 'Archived' }
    return (
      <main>
        <Header />

        <div className={styles.adsWrap}>
          <div className={styles.adsHead}>
            {/* "Job ads": the More row's name, the page's name. */}
            <h1 className={styles.adsTitle}>Job ads</h1>
            <Link href="/post-job" className={styles.adsPost}>+ Post a job</Link>
          </div>

          {/* SHIFTS — the route to /temp-work/manage, kept as built (design 26:
              "The Shifts box stays above the tabs").

              DELIBERATELY OUTSIDE the postedJobs.length === 0 branch below: an
              employer with shifts but no job ads must still find the door —
              Neway's exact shape. It is a ROUTE, not a second management
              surface. */}
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

          {postedJobs.length === 0 ? (
            <div className={styles.emptyState}>
              <span className={styles.emptyIcon}><Ico name="file-text" size={20} /></span>
              <h2 className={styles.emptyTitle}>No job ads yet</h2>
              <p className={styles.emptyText}>
                Post a job ad to start finding the right people for your team.
              </p>
              <Link href="/post-job" className={styles.adsPost}>+ Post a job</Link>
            </div>
          ) : (
            <>
              {/* THE TABS, AND SEARCH AS ONE ICON AT THEIR RIGHT. */}
              <div className={styles.adsTabsRow}>
                <div className={styles.adsTabs} role="tablist" aria-label="Job ads">
                  {(['live', 'filled', 'archived'] as const).map(t => (
                    <button
                      key={t}
                      type="button"
                      role="tab"
                      aria-selected={activeTab === t}
                      className={`${styles.adsTab} ${activeTab === t ? styles.adsTabOn : ''}`}
                      onClick={() => router.push(`/my-jobs?filter=${t}`)}
                    >
                      {TAB_LABEL[t]}
                      {tabCounts[t] > 0 && <span className={styles.adsTabCount}>{tabCounts[t]}</span>}
                    </button>
                  ))}
                </div>
                <button
                  type="button"
                  className={styles.adsSearchBtn}
                  aria-label={searchOpen ? 'Close search' : 'Search job ads'}
                  aria-expanded={searchOpen}
                  onClick={() => { if (searchOpen) setMyJobsSearch(''); setSearchOpen(o => !o) }}
                >
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <circle cx="11" cy="11" r="7" /><line x1="20" y1="20" x2="16.2" y2="16.2" />
                  </svg>
                </button>
              </div>
              {searchOpen && (
                <input
                  className={styles.adsSearch}
                  type="search"
                  autoFocus
                  placeholder="Search by title or place"
                  aria-label="Search job ads"
                  value={myJobsSearch}
                  onChange={e => setMyJobsSearch(e.target.value)}
                />
              )}

              <div className={styles.adsList}>
                {/* A TAB WITH NOTHING IN IT SAYS SO — and a search that matched
                    nothing is told apart from an empty tab: one is the
                    employer's own filter, the other is not. */}
                {displayJobs.length === 0 && (
                  myJobsSearch.trim() ? (
                    <p className={styles.adsEmptyNote}>No job ads match your search on this tab.</p>
                  ) : (
                    <div className={styles.adsEmptyBox}>
                      <p className={styles.adsEmptyTitle}>
                        {activeTab === 'live' ? 'No live job ads' : activeTab === 'filled' ? 'No filled job ads' : 'No archived job ads'}
                      </p>
                      {activeTab === 'live' && <Link href="/post-job" className={styles.adsPost}>+ Post a job</Link>}
                    </div>
                  )
                )}

                {displayJobs.map(job => {
                  const isLiveTab = tabOf(job.status) === 'live'
                  const pay = jobPay(job)
                  const type = primaryEmploymentType(job.employmentType)
                  const place = job.venue ? `${job.venue}, ${job.location}` : job.location
                  const fresh = newFor(job.id)
                  const left = job.status === 'active' ? daysLeft(job) : null
                  const isBoosted = !!jobBoosts[job.id]
                  const openApplicants = (stage?: 'new') => router.push(`/applied?job=${job.id}${stage ? `&stage=${stage}` : ''}`)
                  return (
                    <ManageCard
                      key={job.id}
                      live={job.status === 'active'}
                      statusWord={job.status === 'active' ? 'Live' : job.status}
                      statusDetail={left !== null ? `${left} day${left === 1 ? '' : 's'} left` : undefined}
                      title={job.title}
                      lines={[
                        // The 1b pay rules: "£42k–£48k a year · Bath · Full-time".
                        // NO PAY: candidates see no pay line. On a LIVE ad the
                        // employer sees "Add the pay", which opens the editor on
                        // the pay field. On a filled or archived ad the pay is
                        // simply left out: Post again goes through the form,
                        // which asks for the pay before anything is published.
                        <>
                          {pay && <><span className={styles.adsPay}>{jobPayText(pay)}</span>{' · '}</>}
                          {[place, type].filter(Boolean).join(' · ')}
                          {!pay && isLiveTab && <>{' · '}<button type="button" className={styles.adsAddPay} onClick={() => { setEditFocus('pay'); setEditTarget(job) }}>Add the pay</button></>}
                        </>,
                        <>
                          {job.applicationCount === 0 ? 'No applicants yet' : `${job.applicationCount} applicant${job.applicationCount === 1 ? '' : 's'}`}
                          {' · '}{job.viewCount} view{job.viewCount === 1 ? '' : 's'}
                        </>,
                      ]}
                      // THE ONE ATTENTION SURFACE: only while someone new is waiting.
                      attention={isLiveTab && fresh > 0 ? `${fresh} new applicant${fresh === 1 ? '' : 's'}` : undefined}
                      onAttention={() => openApplicants('new')}
                      // The title opens this advert's applicants (the September card).
                      open={false}
                      onToggleOpen={() => openApplicants()}
                      // Live: Edit ad / View. Filled or archived: Post again —
                      // the same word the shift card uses for the same act.
                      actions={job.status === 'active' || job.status === 'paused'
                        ? [
                            { label: 'Edit ad', onClick: () => { setEditFocus(undefined); setEditTarget(job) } },
                            { label: 'View', onClick: () => router.push(`/job/${job.id}?from=my-jobs`) },
                          ]
                        : [{ label: 'Post again', onClick: () => handlePostAgain(job) }]}
                      menu={[
                        { label: 'View analytics', onClick: () => router.push(`/employer/analytics/${job.id}`) },
                        // Boost is a paid surface: hidden while PAID_SURFACES_ENABLED is false.
                        ...(PAID_SURFACES_ENABLED && job.status === 'active'
                          ? [{ label: isBoosted ? 'Boosted (manage)' : 'Boost this job', onClick: () => { setBoostTargetJob(job); setBoostModalOpen(true) } }] : []),
                        // "Make live again" revives THIS ad; "Post again" starts a
                        // copy. Two different acts, so two different words.
                        ...(job.status === 'archived' || job.status === 'filled' ? [{ label: 'Make live again', onClick: () => handleMakeLiveAgain(job) }] : []),
                        // ACTIVE ONLY, and only with manage_jobs: the endpoint
                        // refuses everyone else, so they are not shown the door.
                        // A danger item: ManageCard puts it last, red, below a divider.
                        ...(job.status === 'active' && canManageJobs ? [{ label: 'Remove ad', onClick: () => setRemoveTarget(job), danger: true }] : []),
                      ]}
                      menuLabel={`More actions for ${job.title}`}
                    />
                  )
                })}
              </div>
            </>
          )}
        </div>

        {removeTarget && (
          <RemoveAdModal
            jobTitle={removeTarget.title}
            applicationCount={removeTarget.applicationCount}
            onCancel={() => setRemoveTarget(null)}
            onConfirm={() => handleRemoveAd(removeTarget)}
            waitingCount={waitingFor(removeTarget.id)}
            onSendUpdates={() => sendWaitingUpdates(removeTarget.id)}
            onDone={() => setRemoveTarget(null)}
          />
        )}

        {editTarget && (
          <QuickEditJobModal
            job={{
              id: editTarget.id,
              title: editTarget.title,
              location: editTarget.location,
              salaryMin: editTarget.salaryMin,
              salaryMax: editTarget.salaryMax,
              salaryPeriod: editTarget.salaryPeriod,
              description: editTarget.description,
            }}
            focusField={editFocus}
            onSave={handleQuickEditSave}
            // Cancelling a Make-live-again edit leaves the ad where it was.
            onCancel={() => { setEditTarget(null); setLiveAfterPay(null) }}
            fullEditHref={`/post-job?edit=${editTarget.id}`}
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
            <span className={styles.emptyIcon}><Ico name="file-text" size={20} /></span>
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
                        <span className={styles.dateIcon}><Ico name="calendar" size={20} /></span>
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

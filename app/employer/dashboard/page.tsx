'use client'

import React, { useState, useEffect, useMemo, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'
import { getCurrentEmployerOwnerId } from '@/lib/employer'
import { DEV_MODE, getMockUser, getMockUserType } from '@/lib/mockAuth'
import { useMessages } from '@/lib/MessagesContext'
import Header from '@/components/Header'
import { supabaseJobToJob } from '@/lib/types'
import { STAGE_LABELS, stageForStatus } from '@/lib/constants/pipelineStages'
// nothingLiveShort is the panel register of the sentence the answer line's row
// 5b says in full at the top of this page. One root string, two lengths.
import { employerAnswerLine, justPostedAnswerLine, nothingLiveShort } from '@/lib/answerLine'
import { readJustPosted, type JustPosted } from '@/lib/justPosted'
// The same function StageDurationBadge uses, so "waiting 4d" on a phone and
// "4 days in Shortlisted" on desktop can never disagree.
import { daysInStage } from '@/lib/stageDuration'
import StageDurationBadge from '@/components/StageDurationBadge'
import type { Candidate } from '@/lib/mockCandidates'
import styles from './page.module.css'
import { Ico } from '@/components/icons'
import { nameFromAuth, greetingName } from '@/lib/displayName'

// ── Helpers ─────────────────────────────────────────────

function getGreeting(): string {
  const h = new Date().getHours()
  if (h < 12) return 'Good morning'
  if (h < 18) return 'Good afternoon'
  return 'Good evening'
}

function formatRelativeTime(dateString: string): string {
  const diff = Date.now() - new Date(dateString).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'Just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(diff / 3600000)
  if (hrs < 24) return `${hrs}h ago`
  const days = Math.floor(diff / 86400000)
  if (days === 1) return 'Yesterday'
  if (days < 7) return `${days}d ago`
  return new Date(dateString).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
}

const STATUS_LABELS: Record<string, string> = {
  pending: 'Applied',
  reviewing: 'Reviewing',
  shortlisted: 'Shortlisted',
  interview: 'Interview',
  offered: 'Offered',
  hired: 'Hired',
  rejected: 'Rejected',
}

const PIPELINE_STAGES = ['pending', 'reviewing', 'shortlisted', 'interview', 'offered', 'hired', 'rejected'] as const

// ── Skeleton placeholder ────────────────────────────────
// ═════════════════════════════════════════════════════════
// ── Pipeline touch slider (non-passive touch listeners) ──
// ── Active Jobs — the employer's own posts. A VERTICAL LIST on a phone, a
// 3-up grid on desktop; nothing scrolls sideways at either. Each tile taps to
// that post's management (its applicants view), NOT the candidate apply page.
//
// THE ‹ › ARROWS ARE GONE, not hidden. They existed to nudge a horizontal
// scroller that no longer exists at any width — CSS already hid them above 961
// and below 768, so they were live in a 192px band and dead everywhere else.
// Two aria-labelled buttons that scroll nothing are worse than no buttons: a
// screen reader still announces "Scroll jobs left".
// ApplicantScroller lived here — the horizontal row of CandidateCards used by
// the Recent Applicants panel. DELETED WITH ITS ONLY TWO CALL SITES rather than
// left orphaned: an unused component that still compiles is the thing someone
// re-mounts in six months without knowing it was removed on purpose. The people
// it showed are in the pipeline's own columns on desktop and one tap away on
// phone. Recoverable from git if the panel ever comes back.

// ── Candidate profile card slider (swipe one at a time) ──
// ── Job swipe cards slider (non-passive touch) ──
// ── Messages slider ──
// MAIN COMPONENT
// ═════════════════════════════════════════════════════════

export default function EmployerDashboardPage() {
  const router = useRouter()
  const { conversations, totalUnreadCount } = useMessages()

  const [isMobile, setIsMobile] = React.useState(false)
  React.useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 960)
    check()
    window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [])

  const [user, setUser] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [companyName, setCompanyName] = useState('')
  const [companyLogo, setCompanyLogo] = useState<string | null>(null)
  const [companyDescription, setCompanyDescription] = useState('')
  const [hasAvailability, setHasAvailability] = useState(false)
  const [subscriptionTier, setSubscriptionTier] = useState<string | null>(null)
  const [freeUntil, setFreeUntil] = useState<string | null>(null)
  const [dismissChecklist, setDismissChecklist] = useState(false)
  // Onboarding example showcase is shown ONLY while the tour is running, so the
  // dashboard stays clean before and after (EmployerTour dispatches show/hide).
  const [showTourExamples, setShowTourExamples] = useState(false)

  // Stats
  const [totalJobs, setTotalJobs] = useState(0)
  const [activeJobs, setActiveJobs] = useState(0)
  const [totalApplications, setTotalApplications] = useState(0)
  const [totalViews, setTotalViews] = useState(0)
  const [newJobsThisWeek, setNewJobsThisWeek] = useState(0)
  // Count of applications the employer hasn't yet opened (viewed_at IS NULL).
  // Drops automatically as they review applications, since the per-job
  // applications page auto-stamps viewed_at on open.
  const [unviewedAppsCount, setUnviewedAppsCount] = useState(0)

  /**
   * THE ONE THING THAT NEEDS THE EMPLOYER TODAY, or null.
   *
   * COMPUTED FROM THE FULL APPLICATION SET, NOT FROM `applications`. That state
   * holds the most recent FIFTY for the pipeline display — using it here would
   * undercount the moment an employer has more, and it would undercount
   * silently, which is the whole family of fault this project keeps recording.
   * It comes off the same query, so there is no second round trip.
   *
   * "Waiting" means NEVER OPENED — `viewed_at is null` — which is the same
   * definition the applicants badge already uses, and the honest one: an
   * employer who opened an application and closed it again has been given the
   * chance to act. Anything looser puts the yellow card up permanently, and a
   * card that is always there is furniture rather than an alert.
   */
  const [waiting, setWaiting] = useState<{ jobId: string; jobTitle: string; count: number; newest: string } | null>(null)

  // Shifts this week, for the third tile. Its OWN state and its own effect —
  // the same reasoning /my-jobs uses: a shift query failing must not be able to
  // take the dashboard down with it.
  const [shiftsThisWeek, setShiftsThisWeek] = useState<number | null>(null)

  // Data
  const [applications, setApplications] = useState<any[]>([])

  // THE "NEW SINCE LAST VISIT" ANCHOR.
  //
  // Read once on load and then immediately overwritten with now(), so the
  // comparison is against the PREVIOUS visit rather than this one. Held in
  // state because the write has to happen before the page can render — read it
  // late and every application looks old the moment you arrive.
  //
  // Lives in employer_profiles.ui_state, a jsonb blob added for exactly this
  // and for the setup strip's dismissal. Not notification_preferences, which is
  // about what we send.
  const [lastSeenAt, setLastSeenAt] = useState<string | null>(null)

  // Setup-strip dismissal. PER ACCOUNT, not per browser — the strip is about
  // what this employer has finished setting up, which does not change because
  // they opened a different laptop. Same ui_state blob as the visit anchor,
  // which is why that column was worth taking rather than localStorage.
  const [setupDismissed, setSetupDismissed] = useState(false)
  const dismissSetup = useCallback(() => {
    setSetupDismissed(true)   // optimistic: the strip goes now, not after a round trip
    if (!user?.id) return
    supabase.from('employer_profiles').select('ui_state').eq('user_id', user.id).maybeSingle()
      .then(({ data }) => supabase.from('employer_profiles')
        .update({ ui_state: { ...((data?.ui_state as object) || {}), setupDismissedAt: new Date().toISOString() } })
        .eq('user_id', user.id))
      .then(undefined, () => { /* a failed dismissal must never break the page */ })
  }, [user?.id])
  const [jobsData, setJobsData] = useState<any[]>([])

  // Show the onboarding example showcase only while the tour is running.
  useEffect(() => {
    const show = () => setShowTourExamples(true)
    const hide = () => setShowTourExamples(false)
    window.addEventListener('thrive-tour:show', show)
    window.addEventListener('thrive-tour:hide', hide)
    return () => {
      window.removeEventListener('thrive-tour:show', show)
      window.removeEventListener('thrive-tour:hide', hide)
    }
  }, [])

  // ── Load data ───────────────────────────────────────────
  useEffect(() => {
    let unsubscribe: (() => void) | null = null
    let safetyTimer: ReturnType<typeof setTimeout> | null = null
    let cancelled = false

    const loadDashboardData = async (session: Session) => {
      if (cancelled) return
      if (session.user.user_metadata?.role !== 'employer') {
        router.replace('/dashboard')
        return
      }

      setUser(session.user)
      // Multi-user: dashboard data (jobs, availability, subscription, profile)
      // is keyed employer_id / user_id = OWNER user_id. Resolve the owner of the
      // employer this user is active in — owner → own id (unchanged).
      const userId = (await getCurrentEmployerOwnerId(supabase)) ?? session.user.id
      // Provisional name from the session; overridden by the resolved employer's
      // profile below so a team member sees the EMPLOYER'S name, not their own
      // (a member has no company_name in their metadata → would show "Your Company").
      setCompanyName(session.user.user_metadata?.company_name || 'Your Company')

      // Fetch company name/logo from the RESOLVED employer's profile (owner's row).
      try {
        const { data: empProfile } = await supabase
          .from('employer_profiles')
          .select('company_name, logo_url, description, ui_state')
          .eq('user_id', userId)
          .maybeSingle()

        // Read the previous visit, then stamp this one. Order matters: the
        // answer line compares against the value read here, so writing first
        // would make every application look old the instant you arrived.
        const ui = (empProfile?.ui_state as Record<string, string> | null) || {}
        setLastSeenAt(ui.dashboardSeenAt || null)
        // Without this the strip reappears on every load, which is worse than
        // never having gone: dismissing it would look broken rather than
        // temporary.
        setSetupDismissed(!!ui.setupDismissedAt)
        supabase.from('employer_profiles')
          .update({ ui_state: { ...((empProfile?.ui_state as object) || {}), dashboardSeenAt: new Date().toISOString() } })
          .eq('user_id', userId)
          .then(undefined, () => { /* a failed stamp must never break the page */ })
        if (empProfile?.company_name) {
          setCompanyName(empProfile.company_name)
        }
        if (empProfile?.logo_url) {
          setCompanyLogo(empProfile.logo_url)
        } else if (session.user.user_metadata?.logo_url) {
          setCompanyLogo(session.user.user_metadata.logo_url)
        }
        if (empProfile?.description) {
          setCompanyDescription(empProfile.description)
        }
      } catch { /* employer_profiles may not exist */ }

      // Fetch availability — any active rows mean the employer is set up
      try {
        const { count } = await supabase
          .from('employer_availability')
          .select('id', { count: 'exact', head: true })
          .eq('employer_id', userId)
          .eq('is_active', true)
        setHasAvailability((count || 0) > 0)
      } catch { /* table may not exist */ }

      // Fetch subscription tier
      try {
        const { data: subData } = await supabase
          .from('employer_subscriptions')
          .select('subscription_tier, trial_ends_at')
          .eq('user_id', userId)
          .maybeSingle()
        if (subData) {
          setSubscriptionTier(subData.subscription_tier || null)
          if (subData.subscription_tier === 'free') {
            setFreeUntil(subData.trial_ends_at || null)
          }
        }
      } catch { /* subscription table may not exist */ }

      // Fetch employer's jobs
      try {
        const { data: jobs } = await supabase
          .from('jobs')
          .select('id, title, status, views, posted_at, company, company_logo_url, company_banner_url, salary_min, salary_max, salary_type, location, area, category, is_recruiter_posting')
          .eq('employer_id', userId)
          .order('posted_at', { ascending: false })

        if (jobs) {
          setTotalJobs(jobs.length)
          setActiveJobs(jobs.filter(j => j.status === 'active').length)

          const views = jobs.reduce((sum: number, j: any) => sum + (j.views || 0), 0)
          setTotalViews(views)

          // Compute "new jobs this week" badge
          const now = new Date()
          const dayOfWeek = now.getDay() // 0=Sun
          const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek
          const weekStart = new Date(now)
          weekStart.setHours(0, 0, 0, 0)
          weekStart.setDate(now.getDate() + mondayOffset)
          const jobsThisWeek = jobs.filter(j => j.posted_at && new Date(j.posted_at) >= weekStart).length
          setNewJobsThisWeek(jobsThisWeek)

          // Fetch ALL applications for these jobs (no limit — need accurate total count)
          const jobIds = jobs.map(j => j.id)
          if (jobIds.length > 0) {
            try {
              const { data: appData } = await supabase
                .from('job_applications')
                .select('id, job_id, job_title, company, status, created_at, candidate_id, viewed_at, stage_entered_at')
                .in('job_id', jobIds)
                .order('created_at', { ascending: false })

              if (appData) {
                setTotalApplications(appData.length)

                // Badge = applications still awaiting first review.
                // The per-job applications page auto-stamps viewed_at when
                // the employer opens it, so this count decreases naturally
                // each time they review an application.
                const unviewed = appData.filter(a => !a.viewed_at).length
                setUnviewedAppsCount(unviewed)

                // THE ACTION CARD'S SUBJECT. The advert with the most people
                // waiting; ties broken by the most recent application, so the
                // card does not flip between two equal adverts on reload.
                const byJob = new Map<string, { jobId: string; jobTitle: string; count: number; newest: string }>()
                for (const a of appData as any[]) {
                  if (a.viewed_at) continue
                  const cur = byJob.get(a.job_id)
                  if (cur) {
                    cur.count++
                    if (a.created_at > cur.newest) cur.newest = a.created_at
                  } else {
                    byJob.set(a.job_id, {
                      jobId: a.job_id,
                      // job_title is denormalised onto the application row, so
                      // this needs no join and cannot go stale against a title
                      // the employer has since edited — it is what they applied to.
                      jobTitle: a.job_title || 'your advert',
                      count: 1,
                      newest: a.created_at,
                    })
                  }
                }
                // `Array.from`, NOT a spread. This project's tsconfig targets below
                // ES2015 with no `downlevelIteration`, so spreading a Map iterator is
                // a compile error (TS2802) — caught by tsc the moment it was written,
                // which is the one class of fault the compiler is reliably good at.
                const top = Array.from(byJob.values()).sort((x, y) =>
                  y.count - x.count || (y.newest > x.newest ? 1 : -1))[0]
                setWaiting(top ? { jobId: top.jobId, jobTitle: top.jobTitle, count: top.count, newest: top.newest } : null)

                // Build per-job application count map for enriching jobsData
                const appCountByJob: Record<string, number> = {}
                appData.forEach((a: any) => {
                  appCountByJob[a.job_id] = (appCountByJob[a.job_id] || 0) + 1
                })

                // Enrich jobs with real application counts. Map through
                // supabaseJobToJob so the Active Jobs cards can render the real
                // image-led job card; keep views + application_count for the overlay.
                const enrichedJobs = jobs.map(j => ({
                  ...supabaseJobToJob(j),
                  views: j.views || 0,
                  application_count: appCountByJob[j.id] || 0,
                  // THE UNMAPPED DATE, carried alongside the mapped one on
                  // purpose. `supabaseJobToJob` defaults postedDate to TODAY
                  // when the column is null, so the mapped field cannot say
                  // "no date" — it says "today", which the row would render as
                  // "live 0 days" about an advert nobody stamped.
                  postedAtRaw: j.posted_at ?? null,
                }))
                setJobsData(enrichedJobs)

                // Keep only the most recent 50 for the pipeline/recent apps display
                const recentApps = appData.slice(0, 50)
                setApplications(recentApps)

                // Enrich with candidate names
                const candidateIds = Array.from(new Set(recentApps.map((a: any) => a.candidate_id).filter(Boolean)))
                if (candidateIds.length > 0) {
                  try {
                    const { data: profiles } = await supabase
                      .from('candidate_profiles')
                      // personal_bio WAS MISSING AND LINE ~796 READS IT.
                      // `p.personal_bio || p.bio` could only ever take the
                      // second branch, because the first was never selected —
                      // so the legacy `bio` column won every time, and nothing
                      // errored because PostgREST does not return the field and
                      // JS reads undefined. personal_bio is the column the one
                      // visible "About Me" box actually writes.
                      .select('user_id, full_name, profile_picture_url, city, availability, years_experience, job_title, job_sector, skills, personal_bio, bio, cv_url')
                      .in('user_id', candidateIds)

                    if (profiles) {
                      const nameMap: Record<string, string> = {}
                      const profileExtras: Record<string, any> = {}
                      profiles.forEach((p: any) => {
                        nameMap[p.user_id] = p.full_name
                        profileExtras[p.user_id] = {
                          photo: p.profile_picture_url || null,
                          city: p.city || null,
                          availability: p.availability || null,
                          yearsExp: p.years_experience || null,
                          jobTitle: p.job_title || null,
                          sector: p.job_sector || null,
                          skills: p.skills || [],
                          bio: p.personal_bio || p.bio || null,
                          cvUrl: p.cv_url || null,
                        }
                      })
                      setApplications(prev => prev.map(a => ({
                        ...a,
                        candidate_name: nameMap[a.candidate_id] || 'Candidate',
                        candidate_photo: profileExtras[a.candidate_id]?.photo || null,
                        candidate_city: profileExtras[a.candidate_id]?.city || null,
                        candidate_availability: profileExtras[a.candidate_id]?.availability || null,
                        candidate_years_exp: profileExtras[a.candidate_id]?.yearsExp || null,
                        candidate_job_title: profileExtras[a.candidate_id]?.jobTitle || null,
                        candidate_sector: profileExtras[a.candidate_id]?.sector || null,
                        candidate_skills: profileExtras[a.candidate_id]?.skills || [],
                        candidate_bio: profileExtras[a.candidate_id]?.bio || null,
                        candidate_cv_url: profileExtras[a.candidate_id]?.cvUrl || null,
                      })))
                    }
                  } catch { /* candidate_profiles may not exist */ }
                }
              } else {
                // No applications — still set jobsData with zero counts
                setJobsData(jobs.map(j => ({ ...supabaseJobToJob(j), views: j.views || 0, application_count: 0 })))
              }
            } catch {
              // job_applications table may not exist — set jobsData with zero counts
              setJobsData(jobs.map(j => ({ ...j, application_count: 0 })))
            }
          } else {
            setJobsData([])
          }
        }
      } catch { /* jobs table query failed */ }

      setLoading(false)
    }

    const init = async () => {
      // DEV MODE
      if (DEV_MODE) {
        const mockUser = getMockUser()
        const userType = getMockUserType()

        if (userType !== 'employer') {
          router.replace('/dashboard')
          return
        }

        setUser(mockUser)
        setCompanyName(mockUser?.user_metadata?.company_name || 'Your Company')

        // Load company logo from localStorage profile
        const savedProfile = localStorage.getItem('employerProfile')
        if (savedProfile) {
          const profile = JSON.parse(savedProfile)
          if (profile.logoUrl) setCompanyLogo(profile.logoUrl)
        }

        setTotalJobs(8)
        setActiveJobs(5)
        setTotalApplications(34)
        setTotalViews(287)
        setApplications([
          { id: '1', candidate_name: 'Sarah Johnson', job_title: 'Head Chef', status: 'pending', created_at: new Date(Date.now() - 3600000).toISOString() },
          { id: '2', candidate_name: 'Michael Brown', job_title: 'Sous Chef', status: 'shortlisted', created_at: new Date(Date.now() - 2 * 86400000).toISOString() },
          { id: '3', candidate_name: 'Emma Wilson', job_title: 'Pastry Chef', status: 'interview', created_at: new Date(Date.now() - 4 * 86400000).toISOString() },
          { id: '4', candidate_name: 'James Taylor', job_title: 'Kitchen Porter', status: 'hired', created_at: new Date(Date.now() - 6 * 86400000).toISOString() },
          { id: '5', candidate_name: 'Olivia Davis', job_title: 'Waitress', status: 'rejected', created_at: new Date(Date.now() - 8 * 86400000).toISOString() },
        ])
        setJobsData([
          { id: 'j1', title: 'Head Chef', status: 'active', views: 84, application_count: 12 },
          { id: 'j2', title: 'Sous Chef', status: 'active', views: 67, application_count: 9 },
          { id: 'j3', title: 'Pastry Chef', status: 'active', views: 52, application_count: 7 },
        ])
        setLoading(false)
        return
      }

      // PRODUCTION MODE
      // Client and server share one cookie-backed session store, so
      // getSession() reads what the server wrote.
      let { data: { session } } = await supabase.auth.getSession()
      if (!session) {
        // The server layout just rendered this page, so a valid session DOES
        // exist server-side. Right after an OAuth redirect the cookie can be
        // momentarily unreadable for a tick — retry once before bouncing.
        await new Promise((r) => setTimeout(r, 400))
        session = (await supabase.auth.getSession()).data.session
      }
      if (session) {
        await loadDashboardData(session)
        return
      }

      // No cookies either — check if we're still inside an OAuth flow (the
      // oauth_intended_role cookie is set by the sign-in button and cleared
      // when the callback completes).
      const oauthCookie = typeof window !== 'undefined'
        ? document.cookie.includes('oauth_intended_role')
        : false

      if (!oauthCookie) {
        router.push('/login/employer')
        return
      }

      // Still mid-OAuth — fall back to auth-state subscription as a last resort
      const { data: { subscription } } = supabase.auth.onAuthStateChange(
        async (event, authSession) => {
          if ((event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') && authSession) {
            subscription.unsubscribe()
            if (safetyTimer) { clearTimeout(safetyTimer); safetyTimer = null }
            await loadDashboardData(authSession)
          }
        }
      )
      unsubscribe = () => subscription.unsubscribe()

      // Safety timeout — if no session after 15s, redirect
      safetyTimer = setTimeout(() => {
        subscription.unsubscribe()
        if (!cancelled) router.push('/login/employer')
      }, 15000)
    }

    init()
    return () => {
      cancelled = true
      if (unsubscribe) unsubscribe()
      if (safetyTimer) clearTimeout(safetyTimer)
    }
  }, [router])

  // ── Simulator tick ──────────────────────────────────────
  // Fires once the employer dashboard has a real user. The simulator endpoint
  // is throttled server-side (60s) so navigating in and out repeatedly is a
  // no-op. Hobby plan can't run sub-daily crons, so this stands in for one.
  useEffect(() => {
    if (DEV_MODE) return
    if (!user) return
    fetch('/api/simulate/run', { method: 'POST' }).catch(() => {})
  }, [user])

  // ── Derived data ────────────────────────────────────────

  // BUCKETED THROUGH THE DECLARED MAPPER, not the raw string.
  //
  // Both of these used to key straight off application.status and send anything
  // unrecognised to 'pending' — silently. So a status this widget hasn't heard
  // of doesn't go missing, which would at least be visible; it appears in
  // Applied, which looks correct and is wrong.
  //
  // stageForStatus is the same mapper /pipeline and the applications header use,
  // so all three now agree by construction rather than by three copies of a
  // switch happening to match. 'pending' is deliberately not one of its stages —
  // it returns null — so the fallback stays explicit here rather than implied.
  const bucketOf = (status: string | null | undefined): string => {
    const s = (status || '').toLowerCase()
    if (s === 'pending' || s === 'applied' || !s) return 'pending'
    return stageForStatus(s) ?? 'pending'
  }

  // THE ANSWER LINE'S STATE. Everything here comes from data the page already
  // loads — the applications query already selects status, created_at and
  // stage_entered_at, and candidate names are already resolved for the Recent
  // Applicants cards. Rows 1, 2, 5 and 6 therefore cost no new queries.
  //
  // Rows 3 and 4 (interview today/tomorrow, unread messages) are not wired:
  // this page queries neither interviews nor conversations, so each would add
  // one. Four rows working beats six half-wired.
  // Consumed once, on mount, by the tab that just published. Null on every
  // ordinary visit, which is why the answer line below is unchanged for
  // everyone who did not arrive here straight from posting.
  const [justPosted, setJustPosted] = useState<JustPosted | null>(null)
  useEffect(() => { setJustPosted(readJustPosted()) }, [])

  const answerLineModel = useMemo(() => {
    // THE ONE EVENT THAT OUTRANKS THE STATE. An employer who has just pressed
    // publish is owed confirmation before they are told what is quiet — and
    // for exactly one view, because readJustPosted has already consumed the
    // flag by the time this runs.
    if (justPosted) return justPostedAnswerLine(justPosted.title)

    // Longest-stalled shortlisted candidate. Longest rather than first, because
    // the one that has waited most is the one not deciding has hurt most.
    let stalled: { name: string; days: number } | null = null
    for (const a of applications) {
      if ((a.status || '').toLowerCase() !== 'shortlisted') continue
      const entered = a.stage_entered_at || a.status_updated_at || a.created_at
      if (!entered) continue
      // Date-only difference, so a card moved late yesterday reads as 1 day
      // rather than 0 — matching StageDurationBadge's semantics on the same page.
      const d = Math.floor((Date.now() - new Date(entered).getTime()) / 86_400_000)
      if (!stalled || d > stalled.days) stalled = { name: a.candidate_name, days: d }
    }

    const newApplications = lastSeenAt
      ? applications.filter(a => a.created_at && new Date(a.created_at) > new Date(lastSeenAt)).length
      : 0

    return employerAnswerLine({
      stalled,
      newApplications,
      totalJobs,
      activeJobs,
      // Held back until 11 August — see VIEWS_COMPARABLE_FROM. Passed anyway so
      // the clause turns itself on rather than needing a code change.
      viewsThisWeek: null,
    })
  }, [applications, lastSeenAt, totalJobs, activeJobs, justPosted])

  const statusCounts = useMemo(() => {
    const counts: Record<string, number> = {}
    PIPELINE_STAGES.forEach(s => { counts[s] = 0 })
    applications.forEach(a => { counts[bucketOf(a.status)]++ })
    return counts
  }, [applications])

  const candidatesByStage = useMemo(() => {
    const map: Record<string, typeof applications> = {}
    PIPELINE_STAGES.forEach(s => { map[s] = [] })
    applications.forEach(app => { map[bucketOf(app.status)].push(app) })
    return map
  }, [applications])

  // ── The phone pipeline's six rows ────────────────────────────────
  //
  // Same counts as the desktop columns, from the same statusCounts — this does
  // not recompute the pipeline, it re-renders it.
  //
  // THE NOTE IS PLAIN LANGUAGE, NOT A SECOND COUNT. "2 new" and "waiting 4d"
  // tell an employer something the number on the left does not; "3 candidates"
  // would just be the number again in words.
  //
  // Rendered only where it is TRUE and USEFUL, in that order of preference:
  //   "N new"      applications that arrived since they last opened this page
  //   "waiting Nd" otherwise, the LONGEST anyone has sat in this stage — the
  //                one that has been waiting longest is the one that matters,
  //                not the average
  // and nothing at all for an empty stage, or for a stage where everyone
  // arrived today. An empty note reads better than a padded one.
  const pipelineRows = useMemo(() => {
    const since = lastSeenAt ? new Date(lastSeenAt).getTime() : null
    return PIPELINE_STAGES.filter(s => s !== 'rejected').map(s => {
      const label = s === 'pending' ? 'Applied' : (STAGE_LABELS[s as keyof typeof STAGE_LABELS] || STATUS_LABELS[s] || s)
      const inStage = candidatesByStage[s] || []
      const count = statusCounts[s] || 0

      let note: string | null = null
      if (count > 0) {
        const fresh = since === null ? 0 : inStage.filter(a => {
          const t = new Date(a.created_at || a.appliedAt || '').getTime()
          return Number.isFinite(t) && t > since
        }).length
        if (fresh > 0) {
          note = `${fresh} new`
        } else {
          // daysInStage is the same function StageDurationBadge uses, so this
          // cannot disagree with the "N days in Shortlisted" pill on desktop.
          const longest = inStage.reduce((max, a) =>
            a.stage_entered_at ? Math.max(max, daysInStage(a.stage_entered_at)) : max, 0)
          if (longest > 0) note = `waiting ${longest}d`
        }
      }

      return {
        key: s,
        label,
        count,
        note,
        // Lands on the pipeline board with that column scrolled into view.
        // Zero-count stages route too — an empty stage list is a real answer.
        href: `/pipeline#stage-${s}`,
      }
    })
  }, [candidatesByStage, statusCounts, lastSeenAt])

  // SHIFTS THIS WEEK — its own effect, deliberately.
  //
  // Monday to Sunday in the VIEWER'S clock, which is right here and wrong on
  // the admin activity chart: this number answers "what is my week", so it is a
  // question about the employer's diary. The same figure bucketed in somebody
  // else's zone would be a chart they cannot act on.
  //
  // Failure is silent and the tile shows a dash rather than a zero: an employer
  // with shifts must never be told they have none because a query blipped, and
  // "—" reads as "not known" where "0" reads as an answer.
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession()
        if (!session || cancelled) return
        const ownerId = (await getCurrentEmployerOwnerId(supabase)) ?? session.user.id

        const now = new Date()
        const day = now.getDay()                       // 0 = Sunday
        const monday = new Date(now)
        monday.setDate(now.getDate() + (day === 0 ? -6 : 1 - day))
        monday.setHours(0, 0, 0, 0)
        const sunday = new Date(monday)
        sunday.setDate(monday.getDate() + 7)
        // THE COLUMN IS `date_from` AND IT IS A DATE, NOT A TIMESTAMP. My first
        // version asked for `starts_at`, which does not exist on this table —
        // PostgREST rejects the WHOLE request on an unknown column, so the tile
        // would have shown a dash for ever and looked like a quiet week. Read
        // from information_schema before the query was written, not after.
        // (`start_time` is a bare time-of-day; `date_to` and `is_ongoing` carry
        // multi-day shifts, which this count deliberately does not expand.)
        const ymd = (d: Date) => d.toISOString().slice(0, 10)

        // STATUS WAS NOT FILTERED, so a closed or filled shift counted toward
        // "Shifts this week" exactly as an open one did. Found by reading the
        // table rather than by a failing check: there is exactly ONE temp_post
        // in the database and its status is `closed`, so the only row that
        // exists is one this tile should never count.
        //
        // AND THE ONLY ROW THAT EXISTS WOULD ALSO HAVE BEEN MISSED FOR A
        // SECOND, OPPOSITE REASON: it is `is_ongoing` with a NULL date_from.
        // A `.gte('date_from', …)` filter drops NULLs silently, so an ongoing
        // shift — which is by definition on this week — could never be counted.
        // Two faults pointing in opposite directions on one row, and the tile
        // would have read 0 either way, which is why neither announced itself.
        //
        // STATUS IS `open` OR `filled`, READ FROM THE CHECK CONSTRAINT RATHER
        // THAN GUESSED — the column allows open/filled/closed/expired. A FILLED
        // shift is still a shift happening this week that the employer has
        // staffed, so it counts; closed and expired are over. Filtering to
        // `open` alone, which is what I first wrote, would have under-reported
        // the week the moment anybody filled anything.
        //
        // Ongoing shifts are counted whatever their date; dated shifts are
        // counted when they fall in this week.
        const { data, error } = await supabase
          .from('temp_posts')
          .select('id, date_from, is_ongoing')
          .eq('employer_id', ownerId)
          .in('status', ['open', 'filled'])
          .or(`is_ongoing.eq.true,and(date_from.gte.${ymd(monday)},date_from.lt.${ymd(sunday)})`)

        if (cancelled) return
        setShiftsThisWeek(error ? null : (data?.length ?? 0))
      } catch { /* the tile shows a dash */ }
    })()
    return () => { cancelled = true }
  }, [])

  const activeJobsList = useMemo(() =>
    jobsData.filter(j => j.status === 'active').slice(0, 10)
  , [jobsData])

  const recentConversations = useMemo(() =>
    [...conversations]
      .sort((a, b) => new Date(b.lastMessageAt).getTime() - new Date(a.lastMessageAt).getTime())
      .slice(0, 3)
  , [conversations])

  const staleApplications = useMemo(() => {
    const cutoff = Date.now() - 14 * 24 * 60 * 60 * 1000
    return applications.filter(a =>
      a.status === 'pending' && new Date(a.created_at || a.appliedAt || '').getTime() < cutoff
    ).length
  }, [applications])

  // ── BLOCK 3's SENTENCE, and it is prose rather than a badge ──────────────
  // `formatRelativeTime` returns "Yesterday" / "2d ago" / "12 Sep", which reads
  // as a label rather than as the middle of a sentence — and lowercasing it
  // blindly would turn "12 Sep" into "12 sep". So the phrase is built here.
  const appliedPhrase = (count: number, iso: string) => {
    const d = new Date(iso)
    const days = Math.floor((Date.now() - d.getTime()) / 86400000)
    const when = days <= 0 ? 'today'
      : days === 1 ? 'yesterday'
      : days < 7 ? `${days} days ago`
      : `on ${d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}`
    return count === 1
      ? `Applied ${when}. Not opened yet.`
      : `Most recent ${when}. None opened yet.`
  }

  // ── BLOCK 5's ROWS ──────────────────────────────────────────────────────
  // Live first, then everything else — the handoff's "ordered live → filled →
  // archived". Three rows: the panel is a glance with "All N" beside it, not a
  // second copy of /my-jobs.
  const AD_RANK: Record<string, number> = { active: 0, filled: 1 }
  const adRows = jobsData
    .slice()
    .sort((a: any, b: any) => (AD_RANK[a.status] ?? 2) - (AD_RANK[b.status] ?? 2))
    .slice(0, 3)

  // ── BLOCK 6's COUNT ─────────────────────────────────────────────────────
  // The same four items the setup strip carried. The handoff's mock says "2 of
  // 5 steps"; there are FOUR steps in this product and the number is read from
  // them rather than copied off a picture.
  const setupSteps = [
    { label: 'Add your company logo', href: '/settings', done: !!companyLogo },
    { label: 'Post your first job', href: '/post-job', done: totalJobs > 0 },
    { label: 'Complete your company profile', href: '/settings', done: companyDescription.length > 50 },
    { label: 'Set up interview availability', href: '/settings/availability', done: hasAvailability },
  ]
  const stepsDone = setupSteps.filter(s => s.done).length
  // Points at the FIRST thing they have not done, not at a generic settings page.
  const nextStep = setupSteps.find(s => !s.done)

  // ── Loading state ───────────────────────────────────────
  // The six blocks' geometry, so the page does not reflow when the data lands.
  if (loading) {
    return (
      <main className={styles.pageBackground}>
        <Header />
        <div className={styles.ndWrap}>
          <div className={`${styles.skeleton} ${styles.ndSkelEyebrow}`} />
          <div className={`${styles.skeleton} ${styles.ndSkelGreet}`} />
          <div className={`${styles.skeleton} ${styles.ndSkelAction}`} />
          <div className={styles.ndTiles}>
            <div className={`${styles.skeleton} ${styles.ndSkelTile}`} />
            <div className={`${styles.skeleton} ${styles.ndSkelTile}`} />
            <div className={`${styles.skeleton} ${styles.ndSkelTile}`} />
          </div>
          <div className={`${styles.skeleton} ${styles.ndSkelPanel}`} />
        </div>
      </main>
    )
  }

  // See lib/displayName.ts — no name is better than a slice of an address.
  const displayName = greetingName(nameFromAuth(user))

  return (
    <main className={styles.pageBackground}>
      {/* ── BLOCK 1 — THE NAVY HEADER ──────────────────────────────────────
          The shared product header, KEPT rather than re-cut for this route.
          It is already what the handoff draws: navy ground, the mark plus the
          Bricolage wordmark, search and the avatar on the right.

          Building a second navy bar here would give one screen its own header
          and strand what lives inside this one — the sidebar toggle, the
          account menu, and with them the product's routes to /interviews,
          /offers and /pipeline, which this page no longer links to directly.

          It is block 1 of six and it is counted as one. What it is NOT is
          pixel-identical: --nav-height is 70 against the handoff's ~56, and the
          ground is --dark-gray rather than --rs-brand-navy. Both are measured
          and reported rather than quietly changed here — the height has
          fourteen consumers across the product and is not this branch's to
          move. ── */}
      <Header />

      <div className={styles.ndWrap}>

        {/* ── BLOCK 2 — GREETING ──────────────────────────────────────────
            Company above, greeting below. `greetingName` returns empty rather
            than a slice of an email address, so the comma is conditional: a
            bare "Good morning" is better than "Good morning, pauldavies.gbr".
            Same reasoning as every invented name removed from this codebase. ── */}
        <header className={styles.ndGreet}>
          {companyName && <p className={styles.ndGreetCompany}>{companyName}</p>}
          <h1 className={styles.ndGreetTitle}>
            {getGreeting()}{displayName ? `, ${displayName}` : ''}
          </h1>
        </header>

        {/* ── BLOCK 3 — THE ACTION CARD ───────────────────────────────────
            THE ONLY YELLOW SURFACE ON THIS SCREEN. If a second appears, one of
            the two is wrong.

            Two states, one geometry. The screen must not go actionless and it
            must not manufacture urgency, so when nothing is waiting the same
            box turns white and offers the one thing worth doing instead. ── */}
        {waiting ? (
          <section className={styles.ndAction} data-state="waiting">
            <p className={styles.ndActionEyebrow}>Needs you today</p>
            {/* The FULL advert title, never truncated. Cutting at the en dash
                is right in admin and wrong here: an employer can hold two
                "Chef de Partie – …" adverts and this card names exactly one. */}
            <h2 className={styles.ndActionHeadline}>
              {waiting.count} {waiting.count === 1 ? 'person applied' : 'people applied'} to {waiting.jobTitle}
            </h2>
            <p className={styles.ndActionSub}>{appliedPhrase(waiting.count, waiting.newest)}</p>
            <Link href={`/my-jobs/${waiting.jobId}/applications`} className={styles.ndActionBtn}>
              Review applicants
              <span aria-hidden="true" className={styles.ndChev}>›</span>
            </Link>
          </section>
        ) : (
          <section className={styles.ndAction} data-state="clear">
            <p className={styles.ndActionEyebrow}>Nothing waiting</p>
            <h2 className={styles.ndActionHeadline}>
              {activeJobs > 0
                ? `All ${activeJobs} live ad${activeJobs === 1 ? '' : 's'} ${activeJobs === 1 ? 'is' : 'are'} collecting applicants.`
                : 'No live job ads yet.'}
            </h2>
            <Link href="/post-job" className={styles.ndActionBtnGhost}>
              Write a job ad
              <span aria-hidden="true" className={styles.ndChev}>›</span>
            </Link>
          </section>
        )}

        {/* ── BLOCK 4 — THREE TILES ───────────────────────────────────────
            Destinations are Claude Design's, named in the handoff, not filled
            in by judgement here: /my-jobs, /applied, /temp-work.

            "Live job ads" counts status === 'active'. With four FILLED adverts
            the right answer is 0, and it says 0.

            Shifts shows an em dash rather than 0 when the query could not run.
            An employer with shifts must never be told they have none because a
            request blipped — "—" reads as not known, "0" reads as an answer. ── */}
        <div className={styles.ndTiles}>
          <Link href="/my-jobs" className={styles.ndTile}>
            <span className={`${styles.ndTileNum} ds-display`}>{activeJobs}</span>
            <span className={styles.ndTileLabel}>Live job ads</span>
          </Link>
          <Link href="/applied" className={styles.ndTile}>
            <span className={`${styles.ndTileNum} ds-display`}>{unviewedAppsCount}</span>
            <span className={styles.ndTileLabel}>New applicants</span>
          </Link>
          {/* /temp-work/manage, NOT /temp-work — AND THIS OVERRIDES THE
              DESTINATION THE HANDOFF NAMES, which is the kind of thing that
              has to be said out loud rather than discovered in a diff.
              `/temp-work` is the CANDIDATE shift feed; the employer's own
              shifts are at /temp-work/manage, headed "Your temp work". A tile
              reading "Shifts this week" on the employer's dashboard that opens
              a worker's job board is the same fault the sidebar had. One line
              to revert if the handoff meant it. */}
          <Link href="/temp-work/manage" className={styles.ndTile}>
            <span className={`${styles.ndTileNum} ds-display`}>
              {shiftsThisWeek === null ? '—' : shiftsThisWeek}
            </span>
            <span className={styles.ndTileLabel}>Shifts this week</span>
          </Link>
        </div>

        {/* ── BLOCK 5 — YOUR JOB ADS ──────────────────────────────────────
            A list ROW, not a card — so this is the one place the title
            truncates, which is what the handoff says and why the card itself
            never does. ── */}
        <section className={styles.ndAds}>
          <div className={styles.ndAdsHead}>
            <h2 className={styles.ndAdsTitle}>Your job ads</h2>
            <Link href="/my-jobs" className={styles.ndAdsAll}>
              All {totalJobs}<span aria-hidden="true" className={styles.ndChev}>›</span>
            </Link>
          </div>

          {adRows.length === 0 ? (
            // An empty list with no message reads as a page that failed to
            // load rather than a list that is empty.
            <p className={styles.ndAdsEmpty}>
              No job ads yet. <Link href="/post-job">Write your first one</Link>.
            </p>
          ) : adRows.map((j: any) => {
            const live = j.status === 'active'
            const apps = j.application_count || 0
            // The AGE clause only exists when the row genuinely carries a date
            // and the advert is genuinely live. `postedAtRaw` is the unmapped
            // column precisely so this can be false — the mapped `postedDate`
            // defaults to today and would print "live 0 days" about an advert
            // nobody ever stamped.
            const days = live && j.postedAtRaw
              ? Math.max(0, Math.floor((Date.now() - new Date(j.postedAtRaw).getTime()) / 86400000))
              : null
            const meta = [
              apps === 0 ? 'No applicants yet' : `${apps} applicant${apps === 1 ? '' : 's'}`,
              days === null ? null : `live ${days} day${days === 1 ? '' : 's'}`,
            ].filter(Boolean).join(' · ')
            return (
              <Link key={j.id} href={`/my-jobs/${j.id}/applications`} className={styles.ndAdRow}>
                <span className={styles.ndAdRowMain}>
                  <span className={styles.ndAdRowTitle}>{j.title}</span>
                  <span className={styles.ndAdRowMeta}>{meta}</span>
                </span>
                {/* A 6px dot and caps, never a filled pill: a finished advert
                    should be the quietest thing on the page. */}
                <span className={styles.ndAdStatus} data-live={live ? 'yes' : 'no'}>
                  <span className={styles.ndAdDot} aria-hidden="true" />
                  {live ? 'Live' : (STATUS_LABELS[j.status] || j.status)}
                </span>
              </Link>
            )
          })}
        </section>

        {/* ── BLOCK 6 — THE NUDGE ─────────────────────────────────────────
            Bottom, not top, and it states the cost in minutes — a checklist
            that will not say how long it takes is why it gets ignored.

            It removes itself at four of four rather than showing four ticks,
            and it still honours the old dismissal, so anybody who has already
            closed the setup strip does not get it handed back to them. ── */}
        {nextStep && !setupDismissed && (
          <Link href={nextStep.href} className={styles.ndNudge}>
            <span className={styles.ndNudgeTick} aria-hidden="true"><Ico name="check" size={16} /></span>
            <span className={styles.ndNudgeText}>
              <span className={styles.ndNudgeTitle}>Finish your company profile</span>
              <span className={styles.ndNudgeMeta}>
                {stepsDone} of {setupSteps.length} steps · takes about 3 minutes
              </span>
            </span>
            <span aria-hidden="true" className={styles.ndChev}>›</span>
          </Link>
        )}

      </div>
    </main>
  )
}

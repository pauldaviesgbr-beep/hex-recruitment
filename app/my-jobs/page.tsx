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
// FeedCard and cardModelFromPostedJob have gone from this page. The employer
// no longer sees the board's photographic card here -- the reasoning is in
// components/JobAdCard.tsx. The public view is one tap away on the View action.
import JobAdCard, { type JobAdCardModel } from '@/components/JobAdCard'
import EmptyState from '@/components/EmptyState'
import { Briefcase, FileText, Search, Archive } from 'lucide-react'
import RemoveAdModal from '@/components/RemoveAdModal'
import QuickEditJobModal, { type QuickEditValues } from '@/components/QuickEditJobModal'
import { PAID_SURFACES_ENABLED } from '@/lib/paidSurfaces'
import { RowInlineFields } from '@/components/RowInlineFields'
import { Boost, JOB_BOOST_TIERS, getDaysRemaining, isBoostActive } from '@/lib/boostTypes'
import styles from './page.module.css'
import { Ico } from '@/components/icons'
// ONE DEFINITION OF WHICH TAB AN ADVERT IS ON, imported by this page AND by
// the drive that asserts the tabs partition the adverts. The drive cannot
// import a .tsx module, so the rule lives in a .mjs both can load — see the
// note in that file for why a second copy is the thing being prevented.
import { tabOf, JOB_AD_TABS } from '@/lib/jobAdTabs.mjs'

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
  /** Applications this employer has never opened -- `viewed_at is null`. */
  newApplicants: number
  /**
   * Whether the 60-day expiry cron will ever touch this advert.
   *
   * IT EXCLUDES RECRUITER POSTINGS, so a countdown on one of those would be a
   * claim nothing enforces. All three companies on the live board are
   * agencies, which makes this the common case rather than the edge.
   */
  isRecruiterPosting: boolean
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
  const [editTarget, setEditTarget] = useState<PostedJob | null>(null)
  const [loading, setLoading] = useState(true)
  const [postedJobs, setPostedJobs] = useState<PostedJob[]>([])
  const [appliedJobs, setAppliedJobs] = useState<AppliedJob[]>([])
  const [companyName, setCompanyName] = useState('')
  // rawInterviews, rawOffers, detailedOffers and appCountsByJob were four
  // pieces of state feeding three tabs that have moved to their own pages.
  // Removed with their queries rather than left holding empty arrays, so
  // nobody later wires a new surface to state nothing fills.
  //
  // ONE SEARCH FIELD, NOT TWO. Both were empty on arrival, and two empty
  // filters above a list the employer has not seen yet is furniture. The
  // location field went with the second; title-or-company is what people
  // actually type. It is revealed by an icon button and is the only search.
  const [searchOpen, setSearchOpen] = useState(false)
  const [boostModalOpen, setBoostModalOpen] = useState(false)
  const [boostTargetJob, setBoostTargetJob] = useState<PostedJob | null>(null)
  const [jobBoosts, setJobBoosts] = useState<Record<string, Boost>>({})
  const [myJobsSearch, setMyJobsSearch] = useState('')
  const [openMenuJobId, setOpenMenuJobId] = useState<string | null>(null)
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

  // THREE TABS, MUTUALLY EXCLUSIVE AND EXHAUSTIVE -- `?filter=live|filled|archived`.
  //
  // Six tabs went because they answered two different questions at once. All
  // Jobs / Active / Archived filtered by the ADVERT'S status; Interviewing /
  // Offers / Hired were pipeline stages about CANDIDATES, so "Hired 3"
  // rendered "No hires yet" and no job cards at all. One strip, two meanings,
  // and a gate check once went looking for a filled advert under Hired and
  // reported a fault that was really a category error.
  //
  // The three candidate-stage tabs now point at the pages that were already
  // doing that job properly -- /interviews, /offers, /pipeline. Nothing is
  // lost; it stops being in the wrong place.
  //
  // THE NEW SET IS A PARTITION, WHICH IS A STRONGER PROPERTY THAN THE OLD ONE
  // COULD HAVE HAD. Every advert lands on exactly one tab, so Live + Filled +
  // Archived sums to the total and no advert can appear twice or vanish --
  // which is exactly the fault that produced "All Jobs 4" over an empty list.
  // drive-my-jobs-controls asserts the sum, not just each badge.
  //
  // AN UNKNOWN FILTER FALLS TO 'live' RATHER THAN 404ing. Old links exist --
  // bookmarks, the Header's archived item, and three chatbot answers that are
  // repointed in this same commit -- and landing an employer on their working
  // set is the right answer for a URL we no longer recognise.
  const filterParam = searchParams.get('filter')
  const validFilters = JOB_AD_TABS as readonly ('live' | 'filled' | 'archived')[]
  const activeTab = validFilters.includes(filterParam as any) ? (filterParam as 'live' | 'filled' | 'archived') : 'live'

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
          newApplicants: 0,
          // Already in the row: the select above is `*`, so this costs no
          // widening and none of the risk that comes with one.
          isRecruiterPosting: !!row.is_recruiter_posting,
        }))

        // Fetch real application counts and statuses from job_applications table
        const jobIds = employerJobs.map(j => j.id)

        if (jobIds.length > 0) {
          // A WIDENED SELECT IS A CHANGE TO A QUERY AND A QUERY IS NOT TYPE
          // CHECKED. `viewed_at` was read from information_schema.columns
          // before this line was written -- timestamptz, nullable, present --
          // because PostgREST rejects the WHOLE request on an unknown column
          // and the page would then show every advert with no applicants at
          // all, which looks like a quiet week rather than a broken query.
          const { data: appData } = await supabase
            .from('job_applications')
            .select('job_id, status, viewed_at')
            .in('job_id', jobIds)

          if (appData) {
            const counts: Record<string, number> = {}
            const unopened: Record<string, number> = {}
            const statusSets: Record<string, Set<string>> = {}
            appData.forEach((row: any) => {
              counts[row.job_id] = (counts[row.job_id] || 0) + 1
              // NEW MEANS NEVER OPENED, and that is the honest reading of the
              // column. It is not "applied recently" and not "unactioned" --
              // 9 of 119 applications have ever been opened, so anything
              // looser would put an attention strip on almost every card and
              // the one attention surface would become wallpaper.
              if (!row.viewed_at) unopened[row.job_id] = (unopened[row.job_id] || 0) + 1
              if (!statusSets[row.job_id]) statusSets[row.job_id] = new Set()
              statusSets[row.job_id].add(row.status)
            })
            employerJobs.forEach(j => {
              j.applicationCount = counts[j.id] || 0
              j.newApplicants = unopened[j.id] || 0
              j.applicationStatuses = statusSets[j.id] ? Array.from(statusSets[j.id]) : []
            })
          }

          // THREE QUERIES USED TO SIT HERE AND ALL THREE FED SURFACES THAT
          // ARE GONE: hired candidate names, interviews, and job offers.
          //
          // They were not merely unused -- two of them were computed into
          // viewData and returned from it, so they READ as live. Nothing in
          // the JSX had consumed todayInterviews, pendingOffers or their six
          // siblings for some time; the Interviewing, Offers and Hired tabs
          // rendered from detailedOffers alone, and those three tabs are now
          // /interviews, /offers and /pipeline.
          //
          // THE HIRED-NAME QUERY ALSO CARRIED AN INVENTED NAME -- a hired
          // candidate with no profile row became the string "Unknown", which
          // nothing downstream could tell apart from somebody genuinely
          // called that. The card now says "Hired from 6 applicants", read
          // from applicationStatuses, and needs no name at all -- so the
          // fallback leaves with the query rather than waiting to be found.
          //
          // Four round trips saved on the busiest employer page.
          //
          // AND THE INTERVIEW QUERY HAS A RETURN ADDRESS, WHICH IS THE POINT
          // OF WRITING THIS DOWN RATHER THAN JUST DELETING IT.
          //
          // It fed nextInterviewMap, which annotated a job card with "someone
          // is coming in Thursday" behind the Interviewing tab. That is a
          // REAL QUESTION -- which of my roles has somebody coming in? -- and
          // it did not deserve a tab: there is essentially ONE interview in
          // this product's history (119 applications, 4 ever progressed), so
          // it was a view over data that barely exists.
          //
          // WHEN INTERVIEWS ACTUALLY START HAPPENING IT BELONGS IN THE
          // ATTENTION STRIP on the advert card, beside "2 new applicants":
          // same pattern, same place, same weight. See the strip in
          // components/JobAdCard.tsx -- the model already carries
          // newApplicants, and this would be the second thing that can fill
          // it rather than a new surface.
          //
          // It is recorded as a CANDIDATE, not as a loss. A line saying where
          // something goes back is worth more than a line saying it was
          // removed -- the second one gets read as a decision nobody can
          // reopen.
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

  /**
   * PAY FOR THE CARD'S META LINE.
   *
   * This replaces a formatSalary that was defined, never called, and wrong in
   * a way that would have shown: it always rendered a RANGE. 81 of the 92 live
   * Goldenkeys rows carry salary_min === salary_max because the importer folds
   * a total into both columns, so every one of them would have read
   * "£37k-£37k/year" -- a range with no range in it.
   *
   * A ZERO IS NOT A SALARY EITHER. Two live rows carry a literal 0 in both
   * columns, which is why the test is `> 0` rather than a null check: the home
   * hero's "salary on every one" claim was false for exactly that reason, and
   * "not null" passed it happily. No pay means no pay segment, not "£0".
   */
  const formatPay = (min: number, max: number, period: 'hour' | 'year') => {
    const k = (n: number) => period === 'year' && n >= 1000 ? `£${Math.round(n / 1000)}k` : `£${n}`
    const per = period === 'year' ? '/year' : '/hr'
    if (!(min > 0) && !(max > 0)) return undefined
    if (!(max > 0) || min === max) return `${k(min)}${per}`
    if (!(min > 0)) return `${k(max)}${per}`
    return `${k(min)}–${k(max)}${per}`
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
    setRemoveTarget(null)
    await refreshJobs()
  }

  /**
   * THE LIST, THE COUNTS, AND THE ONE PROPERTY THAT MAKES THEM TRUSTWORTHY.
   *
   * The counts come from the SAME expression the list filters on. That is not
   * tidiness -- it is the whole fix for "All Jobs 4" sitting above an empty
   * area, where a badge counted postedJobs.length and the rows came from a
   * different predicate. Two populations, one heading.
   *
   * AND THE PARTITION IS NOW ASSERTABLE. tabOf() is total over status, so
   * live + filled + archived === postedJobs.length by construction. The drive
   * checks that sum on a real page; the identity is the thing the six
   * overlapping tabs could never have offered.
   */
  const viewData = useMemo(() => {
    const counts = { live: 0, filled: 0, archived: 0 }
    for (const j of postedJobs) counts[tabOf(j.status)]++

    const filtered = postedJobs
      .filter(job => tabOf(job.status) === activeTab)
      // ANYONE WAITING COMES FIRST, then the busiest, then the newest. The
      // sort answers the question the page is for -- what needs me today --
      // rather than sorting by a field that happens to be handy.
      .sort((a, b) => {
        if (a.newApplicants !== b.newApplicants) return b.newApplicants - a.newApplicants
        if (a.applicationCount !== b.applicationCount) return b.applicationCount - a.applicationCount
        return new Date(b.postedDate).getTime() - new Date(a.postedDate).getTime()
      })

    return { filtered, counts }
  }, [postedJobs, activeTab])

  // Apply local search filter on top of viewData
  const displayJobs = useMemo(() => {
    const q = myJobsSearch.trim().toLowerCase()
    if (!q) return viewData.filtered
    // Title, company AND location in one field. The second box was removed,
    // not the ability to search by place -- an employer typing "Bath" still
    // gets Bath, they just do not have to know which box it goes in.
    return viewData.filtered.filter(j =>
      j.title.toLowerCase().includes(q) ||
      j.company.toLowerCase().includes(q) ||
      j.location.toLowerCase().includes(q)
    )
  }, [viewData.filtered, myJobsSearch])

  /**
   * THE CARD MODELS, BUILT HERE SO THE CARD PRINTS AND NEVER DECIDES.
   *
   * Two of these are claims and are treated as such:
   *
   * THE COUNTDOWN. Adverts expire at 60 days from posted_at via the daily
   * job-expiry cron -- which EXCLUDES is_recruiter_posting, and every company
   * on the live board is an agency. `jobs.expires_at` is null on every row
   * and nothing writes it, so reading that column would print nothing at all
   * and look like a styling bug. The date is computed from posted_at, and
   * only when the cron would really act.
   *
   * THE FILLED DATE. The handoff draws "FILLED · 12 MAR" and there is no
   * filled_at column to read. updated_at moves on any edit, so it would
   * answer a different question while looking like the right one -- the same
   * shape as area vs area_county. The word goes out without a date rather
   * than with a wrong one.
   */
  const cardModels = useMemo(() => displayJobs.map(job => {
    const state = tabOf(job.status)
    const expiring = job.status === 'active' && !job.isRecruiterPosting
      ? Math.ceil((new Date(job.postedDate).getTime() + 60 * 864e5 - Date.now()) / 864e5)
      : null

    const hired = job.applicationStatuses.includes('hired')
    const n = job.applicationCount
    const applicantLine =
      hired && n > 0 ? `Hired from ${n} applicant${n === 1 ? '' : 's'}`
      : n === 0 ? 'No applicants yet'
      : `${n} applicant${n === 1 ? '' : 's'}`

    return {
      job,
      model: {
        id: job.id,
        title: job.title,
        state,
        statusWord: getStatusLabel(job.status).label.toUpperCase(),
        statusDetail: expiring !== null && expiring >= 0
          ? `${expiring} day${expiring === 1 ? '' : 's'} left`.toUpperCase()
          : undefined,
        site: job.venue || job.location || undefined,
        pay: formatPay(job.salaryMin, job.salaryMax, job.salaryPeriod),
        contract: job.employmentType?.[0],
        applicantLine,
        // ONLY ON LIVE ADVERTS. Nobody is waiting on a filled role -- the
        // strip would be asking for attention that cannot be acted on.
        newApplicants: state === 'live' ? job.newApplicants : 0,
      } satisfies JobAdCardModel,
    }
  }), [displayJobs])

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

  /**
   * PAUSE / RESUME -- written against the four states deliberately, which is
   * what the note where the old toggle was deleted asked for.
   *
   * The one that was removed read `job.status === 'active' ? 'paused' :
   * 'active'` -- a binary over a four-state field, so filled and archived
   * both fell through to 'active' and a button labelled Pause would have
   * REPUBLISHED a filled role onto the public board. It had no call site, so
   * the fault never shipped; this one does have a call site, so it refuses
   * the two states it has nothing sensible to say about rather than
   * inheriting an answer from a ternary that thinks there are two.
   */
  const handlePauseJob = async (job: PostedJob) => {
    if (job.status !== 'active' && job.status !== 'paused') return
    const next = job.status === 'active' ? 'paused' : 'active'
    const { error } = await supabase.from('jobs')
      .update({ status: next })
      .eq('id', job.id)
      // BOTH HALVES OF THE CONDITION, so a row that changed underneath us
      // is not overwritten from a stale screen.
      .eq('status', job.status)
    if (error) {
      console.error('[my-jobs] pause failed:', error)
      alert('Could not change that advert just now. Please try again.')
      return
    }
    setPostedJobs(prev => prev.map(j => j.id === job.id ? { ...j, status: next } : j))
    if (next === 'active') await ensureJobArea(job.id)
    await refreshJobs()
  }

  // Kebab popover. Layered over the card by JobAdCard rather than rendered
  // inside its body, because the card is `overflow: hidden` so the action
  // bar meets its corners -- and a dropdown opened inside that is clipped.
  //
  // EDIT AND VIEW HAVE LEFT THIS MENU FOR THE ACTION BAR. That is the whole
  // finding: employers believed they could not change a posted advert,
  // because the only route to it was a control labelled with three dots. The
  // menu keeps what is genuinely occasional.
  //
  // TWO DEPARTURES FROM THE HANDOFF, BOTH DELIBERATE AND BOTH FLAGGED:
  //
  //   DELETE IS NOT BUILT. There is no delete path for an advert anywhere in
  //   this product, and building one here would be an irreversible write
  //   that destroys the candidate applications underneath it. Archive is the
  //   reversible version and already exists. A destructive control invented
  //   to satisfy a menu is the wrong way round.
  //
  //   VIEW ANALYTICS STAYS. /employer/analytics/[id] is linked from exactly
  //   one place in the entire codebase and this is it -- dropping the item
  //   would make a whole page unreachable from the UI. Removing a control
  //   without asking what was leaning on it is a fault this repo has already
  //   paid for once.
  //
  // Reactivate survives for the same reason: nothing else brings a filled or
  // archived advert back, and Duplicate makes a NEW row rather than
  // restoring the one you are looking at.
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
          <Ico name="more-horizontal" size={20} />
        </button>
        {isOpen && (
          <div className={styles.kebabMenu} role="menu">
            <button type="button" role="menuitem" className={styles.kebabItem}
              onClick={(e) => choose(e, () => handleRepostJob(job))}>
              <span className={styles.kebabItemIcon} aria-hidden="true"><Ico name="copy" size={16} /></span>
              <span>Duplicate</span>
            </button>
            {(job.status === 'active' || job.status === 'paused') && canManageJobs && (
              <button type="button" role="menuitem" className={styles.kebabItem}
                onClick={(e) => choose(e, () => handlePauseJob(job))}>
                <span className={styles.kebabItemIcon} aria-hidden="true"><Ico name="pause" size={16} /></span>
                <span>{job.status === 'active' ? 'Pause' : 'Resume'}</span>
              </button>
            )}
            <button type="button" role="menuitem" className={styles.kebabItem}
              onClick={(e) => choose(e, () => router.push(`/employer/analytics/${job.id}`))}>
              <span className={styles.kebabItemIcon} aria-hidden="true"><Ico name="bar-chart-3" size={16} /></span>
              <span>View analytics</span>
            </button>
            {/* Boost is a paid surface -- its modal shows six prices. Hidden
                while PAID_SURFACES_ENABLED is false, and the item AND the
                modal are both gated: hiding only the item would leave the
                modal openable by any other route into that state. */}
            {PAID_SURFACES_ENABLED && job.status !== 'archived' && job.status !== 'filled' && (
              <button type="button" role="menuitem" className={styles.kebabItem}
                onClick={(e) => choose(e, () => { setBoostTargetJob(job); setBoostModalOpen(true) })}>
                <span className={styles.kebabItemIcon} aria-hidden="true"><Ico name="zap" size={16} /></span>
                <span>{isBoosted ? 'Boosted (manage)' : 'Boost this job'}</span>
              </button>
            )}
            {/* ARCHIVE, and only from a live advert. filled and archived are
                already off the public board, so offering it there would be a
                control that appears to do something and does nothing. Gated
                on manage_jobs so a member the endpoint would refuse is not
                shown the door in the first place. */}
            {(job.status === 'active' || job.status === 'paused') && canManageJobs && (
              <button type="button" role="menuitem" className={styles.kebabItem}
                onClick={(e) => choose(e, () => setRemoveTarget(job))}>
                <span className={styles.kebabItemIcon} aria-hidden="true"><Ico name="archive" size={16} /></span>
                <span>Archive</span>
              </button>
            )}
            {(job.status === 'archived' || job.status === 'filled') && (
              <button type="button" role="menuitem" className={styles.kebabItem}
                onClick={(e) => choose(e, () => handleReactivateJob(job.id))}>
                <span className={styles.kebabItemIcon} aria-hidden="true"><Ico name="refresh-cw" size={16} /></span>
                <span>Reactivate</span>
              </button>
            )}
          </div>
        )}
      </div>
    )
  }

  // THE LOADING SCREEN GETS A SHAPE.
  //
  // It used to be the word "Loading..." centred in white. A blank white
  // screen is indistinguishable from a page that failed, which is half of
  // why the empty tab went unreported for weeks -- people read it as broken
  // rather than as empty.
  //
  // NOTHING CENTRED, NO SPINNER. Three cards at opacity 1 / .72 / .4: the
  // fade says "the list continues" without claiming a length we do not know
  // yet. The first skeleton carries its ACTION-BAR ZONE at full height, so
  // nothing reflows when the data lands.
  //
  // THE TAB STRIP IS NOT DRAWN HERE, AND THAT IS A SHORTFALL I AM NAMING
  // RATHER THAN HIDING. The handoff wants header, tabs and bottom bar as
  // static markup that paints instantly. The tabs cannot: this route decides
  // employer-versus-candidate from the session, asynchronously, so on a cold
  // load we do not yet know whose chrome to draw -- and drawing an employer
  // tab strip at a candidate would be worse than a skeleton. Moving the role
  // resolution onto the server is what fixes it, and that is a bigger change
  // than this branch.
  if (loading) {
    return (
      <main>
        <Header />
        <div className={styles.container}>
          <div className={styles.skeletonList} aria-hidden="true">
            {[1, 0.72, 0.4].map((opacity, i) => (
              <div key={i} className={styles.skeletonCard} style={{ opacity }}>
                <div className={styles.skeletonBody}>
                  <span className={styles.skBarStatus} />
                  <span className={styles.skBarTitle} />
                  <span className={styles.skBarMeta} />
                </div>
                {i === 0 && (
                  <div className={styles.skeletonActions}>
                    <span /><span />
                  </div>
                )}
              </div>
            ))}
          </div>
          <p className={styles.srOnly} role="status">Loading your job ads…</p>
        </div>
      </main>
    )
  }

  // Employer View
  if (isEmployer) {
    const searching = myJobsSearch.trim().length > 0
    const noAdvertsAtAll = postedJobs.length === 0

    return (
      <main>
        <Header />

        <div className={styles.container}>
          {/* ── the list header ────────────────────────────────
              TWO EMPTY SEARCH FIELDS BECAME ONE ICON. Nobody needs a filter
              before they have seen a list, and the pair of them pushed the
              first advert down the page on the one screen that exists to
              show adverts. The field is revealed, not removed. */}
          <div className={styles.listHead}>
            <h1 className={styles.listTitle}>Job ads</h1>
            <div className={styles.listHeadActions}>
              <button
                type="button"
                className={styles.searchToggle}
                aria-label={searchOpen ? 'Hide search' : 'Search job ads'}
                aria-expanded={searchOpen}
                onClick={() => {
                  const next = !searchOpen
                  setSearchOpen(next)
                  // Closing it CLEARS the query. A hidden field still
                  // filtering the list is the /candidates fault in a new
                  // coat: results missing, with no visible control to undo
                  // it and nothing on screen explaining why.
                  if (!next) setMyJobsSearch('')
                }}
              >
                <Ico name="search" size={20} />
              </button>
              <Link href="/post-job" className={styles.newBtn}>
                <Ico name="plus" size={16} /> New
              </Link>
            </div>
          </div>

          {searchOpen && (
            <div className={styles.searchRow}>
              <input
                type="text"
                autoFocus
                className={styles.searchField}
                placeholder="Search by title, company or place"
                aria-label="Search job ads"
                value={myJobsSearch}
                onChange={(e) => setMyJobsSearch(e.target.value)}
              />
            </div>
          )}

          {/* ── the tabs ─────────────────────────────────────
              THREE, AND THEY PARTITION THE ADVERTS. Every advert is on
              exactly one, so the three counts sum to the total.

              NO overflow-x, deliberately, and this is a departure from the
              handoff. A sideways-scrolling control row hides whole controls
              behind an edge with no affordance, and this repo has fixed that
              exact fault on four separate rows. The scroll was specified to
              stop "Archived" being orphaned on a second line -- with three
              short tabs there is no second line to be orphaned on at any
              width this product supports, so the problem does not arise and
              the cure is worse than it. The drive asserts they fit on one
              row at 320, which is the narrowest phone anybody still uses. */}
          <div className={styles.tabStrip}>
            {([
              { key: 'live', label: 'Live' },
              { key: 'filled', label: 'Filled' },
              { key: 'archived', label: 'Archived' },
            ] as const).map(tab => (
              <button
                key={tab.key}
                type="button"
                className={tab.key === activeTab ? styles.tab + ' ' + styles.tabActive : styles.tab}
                aria-current={activeTab === tab.key ? 'page' : undefined}
                onClick={() => router.push(`/my-jobs?filter=${tab.key}`)}
              >
                {tab.label}
                <span className={styles.tabCount}>{viewData.counts[tab.key]}</span>
              </button>
            ))}
          </div>

          {/* ── the list ─────────────────────────────────────
              EVERY EMPTY STATE NAMES THE OBJECT, says what would put
              something here, and offers exactly one way forward. They are
              told apart deliberately: a search that matched nothing is the
              employer's own filter and is fixed by clearing it; an empty tab
              is not, and telling somebody to clear a search they never ran
              is worse than saying nothing at all. */}
          {noAdvertsAtAll ? (
            <EmptyState
              icon={FileText}
              variant="primary"
              title="No job ads yet"
              description="Write one advert and it stays yours — edit it, pause it, or reuse it next time the role opens."
              action={{ label: 'Write a job ad', href: '/post-job' }}
              cost="Takes about four minutes"
            />
          ) : (
            <div className={styles.cardList}>
              {cardModels.length === 0 && (
                searching ? (
                  <EmptyState
                    icon={Search}
                    title={'No ads match “' + myJobsSearch.trim() + '”'}
                    description={'Try a shorter word, or clear the search to see all ' + postedJobs.length + '.'}
                    action={{ label: 'Clear search', onClick: () => setMyJobsSearch('') }}
                  />
                ) : activeTab === 'live' ? (
                  <EmptyState
                    icon={Briefcase}
                    title="Nothing live right now"
                    description={
                      viewData.counts.filled + viewData.counts.archived > 0
                        ? 'Your other ads are filled or archived. Reuse one, or write a new advert.'
                        : 'Write an advert and it will appear here as soon as it is published.'
                    }
                    action={{ label: 'Write a job ad', href: '/post-job' }}
                  />
                ) : activeTab === 'filled' ? (
                  <EmptyState
                    icon={Briefcase}
                    title="Nothing filled yet"
                    description="When you mark an ad as filled it moves here, ready to reuse."
                  />
                ) : (
                  <EmptyState
                    icon={Archive}
                    title="Nothing archived"
                    description="Ads you archive are kept here, along with any that have run their 60 days. Nothing is deleted, and you can reuse any of them."
                  />
                )
              )}

              {cardModels.map(({ job, model }) => (
                <JobAdCard
                  key={job.id}
                  model={model}
                  onOpen={() => router.push(`/my-jobs/${job.id}/applications`)}
                  onEdit={() => setEditTarget(job)}
                  onReuse={() => handleRepostJob(job)}
                  kebab={renderKebab(job, !!jobBoosts[job.id])}
                />
              ))}
            </div>
          )}

          {/* ── shifts, at the foot ────────────────────────────
              MOVED BELOW THE LIST and otherwise untouched. It is a ROUTE to
              /temp-work/manage, not a second management surface: a job leads
              to an applications pipeline, a shift leads to an available list
              and a public thread, and forced into one list one of them gets
              the wrong controls.

              STILL OUTSIDE THE EMPTY-STATE BRANCH ABOVE. An employer with no
              job ads must still see this door -- an agency running shifts and
              no full-time roles is a real shape, and hiding the door from
              exactly them is the reply-button fault again. */}
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
                    {shifts.slice(0, 3).map(sh => (
                      <li key={sh.id} className={styles.shiftRow}>
                        <Link href="/temp-work/manage" className={styles.shiftRowMain}>
                          <span className={styles.shiftName}>{sh.title}</span>
                          <span className={styles.shiftMeta}>{formatWhen(sh)}</span>
                        </Link>
                        <span className={styles.shiftCounts}>
                          <span className={styles.shiftAvail}>{sh.interest_count ?? 0} available</span>
                          {sh.status !== 'open' && <span className={styles.shiftStatus}>{sh.status}</span>}
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
            onSave={handleQuickEditSave}
            onCancel={() => setEditTarget(null)}
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

'use client'

import { useState, useEffect, useMemo, useCallback, useRef, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import Header from '@/components/Header'
import SignedImage from '@/components/SignedImage'
import SignedLink from '@/components/SignedLink'
import { fallbackVariant } from '@/lib/jobBanner'
import CandidateCard from '@/components/CandidateCard'
import CandidateDetail from '@/components/CandidateDetail'
import { DEFAULT_VISIBILITY, resolveVisibility, type VisibilitySettings } from '@/lib/profileVisibility'
import { supabase } from '@/lib/supabase'
import { getSessionWithRetry } from '@/lib/getSessionWithRetry'
import { Candidate, devMockCandidates } from '@/lib/mockCandidates'
import { DEV_MODE } from '@/lib/mockAuth'
import { WORK_TYPES } from '@/lib/workTypes'
import { supabaseProfileToCandidate } from '@/lib/types'
import {
  MapPin, Clock, Briefcase, GraduationCap, User, Wrench,
  Award, Heart, Globe, MessageSquare, FileDown, Sliders
} from 'lucide-react'
import { Boost } from '@/lib/boostTypes'
import { isEmployerEntitled } from '@/lib/foundingEntitlement'
import { scoreAllCandidates } from '@/lib/recommendations'
import { supabaseJobToJob } from '@/lib/types'
import { Job } from '@/lib/mockJobs'
import AnswerLine from '@/components/AnswerLine'
import { candidatesAnswerLine } from '@/lib/answerLine'
import styles from './page.module.css'

type Filters = {
  availability: Set<string>
  experienceLevel: Set<string>
  workPreference: Set<string>
  skills: Set<string>
}

const emptyFilters = (): Filters => ({
  availability: new Set(),
  experienceLevel: new Set(),
  workPreference: new Set(),
  skills: new Set(),
})

const candidateFilterSections = [
  { key: 'availability' as const, title: 'Availability', options: ['Available immediately', '2 weeks notice', '1 month notice', 'Flexible'] },
  { key: 'experienceLevel' as const, title: 'Experience Level', options: ['No experience', 'Entry level (0-2 years)', 'Mid level (3-5 years)', 'Senior (6-10 years)', 'Executive (10+ years)'] },
  // Filters CANDIDATES on their stated preferredJobTypes, so it has to speak the
  // same language the profile form offers — otherwise an employer filters on
  // Contract and Freelance, which no candidate can pick any more.
  { key: 'workPreference' as const, title: 'Work Preference', options: [...WORK_TYPES] },
  { key: 'skills' as const, title: 'Key Skills', options: ['Right to Work', 'NI Number', 'Food Hygiene', 'First Aid', 'DBS Checked', 'Driving Licence', 'Language Skills', 'Management Experience'] },
]

import { categories as sharedCategories, getCategoryLabel } from '@/lib/categories'
import { Ico } from '@/components/icons'
const categories = [{ id: 'all', label: 'All Candidates' }, ...sharedCategories]

const JOB_SECTOR_LABELS: Record<string, string> = new Proxy({} as Record<string, string>, {
  get: (_target, key: string) => getCategoryLabel(key),
})

// Map candidate job title to sector categories
const getCandidateSector = (candidate: { jobTitle: string }): string => {
  const titleLower = candidate.jobTitle.toLowerCase()

  // Hospitality Tourism & Sport (check first — most specific)
  if (['chef', 'cook', 'waiter', 'waitress', 'bartender', 'bar ', 'barista', 'kitchen porter', 'porter', 'housekeeper', 'concierge', 'hotel', 'event', 'banquet', 'catering', 'sushi', 'server', 'host', 'coffee', 'restaurant', 'sommelier'].some(k => titleLower.includes(k)))
    return 'hospitality'

  // Healthcare
  if (['nurse', 'doctor', 'care', 'health', 'medical', 'pharmacy', 'dental'].some(k => titleLower.includes(k)))
    return 'healthcare'

  // Retail & Sales
  if (['sales', 'retail', 'shop', 'store', 'cashier', 'merchandis'].some(k => titleLower.includes(k)))
    return 'retail'

  // Teaching & Education
  if (['teacher', 'teaching', 'tutor', 'lecturer', 'education', 'training', 'early years'].some(k => titleLower.includes(k)))
    return 'teaching'

  // Transport & Logistics
  if (['driver', 'delivery', 'logistics', 'warehouse', 'transport'].some(k => titleLower.includes(k)))
    return 'transport'

  // Property & Construction
  if (['builder', 'plumber', 'electrician', 'construction', 'property', 'estate agent'].some(k => titleLower.includes(k)))
    return 'property'

  // Accountancy Banking & Finance
  if (['accountant', 'finance', 'banking', 'audit', 'tax', 'bookkeep'].some(k => titleLower.includes(k)))
    return 'accountancy'

  // Engineering & Manufacturing
  if (['mechanical', 'manufacturing', 'production', 'factory', 'cnc'].some(k => titleLower.includes(k)))
    return 'engineering'

  // Charity & Voluntary
  if (['charity', 'fundrais', 'volunteer', 'nonprofit', 'ngo'].some(k => titleLower.includes(k)))
    return 'charity'

  // Creative Arts & Design
  if (['designer', 'artist', 'creative', 'photographer', 'illustrat', 'animator'].some(k => titleLower.includes(k)))
    return 'creative'

  // Energy & Utilities
  if (['energy', 'solar', 'wind', 'oil', 'gas', 'renewable', 'utilities'].some(k => titleLower.includes(k)))
    return 'energy'

  // Environment & Agriculture
  if (['environment', 'sustainab', 'ecology', 'conservation', 'agricult', 'farm'].some(k => titleLower.includes(k)))
    return 'environment'

  // Law & Legal
  if (['lawyer', 'solicitor', 'legal', 'barrister', 'paralegal'].some(k => titleLower.includes(k)))
    return 'law'

  // Marketing
  if (['marketing', 'advertising', 'pr ', 'social media', 'content', 'brand'].some(k => titleLower.includes(k)))
    return 'marketing'

  // Media & Publishing
  if (['journalist', 'editor', 'broadcast', 'media', 'publish', 'reporter'].some(k => titleLower.includes(k)))
    return 'media'

  // Public Sector & Government
  if (['civil servant', 'council', 'government', 'public sector', 'policy'].some(k => titleLower.includes(k)))
    return 'public'

  // Recruitment & HR
  if (['recruit', 'talent acquisition', 'hiring', 'staffing', 'human resources', 'hr '].some(k => titleLower.includes(k)))
    return 'recruitment'

  // Science & Research
  if (['scientist', 'research', 'laboratory', 'lab tech', 'biolog', 'chemist', 'physicist'].some(k => titleLower.includes(k)))
    return 'science'

  // Digital & IT
  if (['developer', 'software', 'engineer', 'data', 'analyst', 'devops', 'cloud', 'cyber', 'tech'].some(k => titleLower.includes(k)))
    return 'digital'

  // Business Consulting & Management (catch-all for generic management titles)
  if (['manager', 'head', 'supervisor', 'director', 'consultant'].some(k => titleLower.includes(k)))
    return 'business'

  return 'business'
}

function getAvailabilityColor(availability: string): string {
  const lower = availability.toLowerCase()
  if (lower.includes('immediately') || lower.includes('available') || lower.includes('now')) return 'green'
  if (lower.includes('open') || lower.includes('considering') || lower.includes('notice')) return 'yellow'
  return 'grey'
}

function CandidatesContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [searchQuery, setSearchQuery] = useState(searchParams.get('search') || '')
  const [locationQuery, setLocationQuery] = useState(searchParams.get('city') || '')
  const [activeCategories, setActiveCategories] = useState<string[]>([])
  const [filters, setFilters] = useState<Filters>(emptyFilters())
  // Excludes rather than includes, so it draws dashed when unselected — and it
  // is where the answer line's action goes, which is what stops that action
  // being another control with nothing behind it.
  const [hasCvOnly, setHasCvOnly] = useState(false)
  const [sectorsExpanded, setSectorsExpanded] = useState(false)
  const [filtersExpanded, setFiltersExpanded] = useState(false)
  const [checkingAuth, setCheckingAuth] = useState(true)
  const [isEmployer, setIsEmployer] = useState(false)
  const [hasSubscription, setHasSubscription] = useState(false)
  const [allCandidates, setAllCandidates] = useState<Candidate[]>([])
  const [visibilityMap, setVisibilityMap] = useState<Map<string, VisibilitySettings>>(new Map())
  const [selectedCandidate, setSelectedCandidate] = useState<Candidate | null>(null)
  const [isMobile, setIsMobile] = useState(false)
  const [boostedProfileIds, setBoostedProfileIds] = useState<Set<string>>(new Set())
  const [matchedJob, setMatchedJob] = useState<Job | null>(null)
  const [matchScores, setMatchScores] = useState<Record<string, number>>({})
  const listRef = useRef<HTMLDivElement>(null)

  // Fetch active profile boosts for sorting (non-blocking — table may not exist yet)
  useEffect(() => {
    const fetchBoosts = async () => {
      try {
        const { data } = await supabase
          .from('boosts')
          .select('target_id')
          .eq('boost_type', 'profile')
          .eq('is_active', true)
          .gt('expires_at', new Date().toISOString())
        if (data) {
          setBoostedProfileIds(new Set(data.map((b: any) => b.target_id)))
        }
      } catch {
        // Boosts table may not exist yet — silently ignore
      }
    }
    fetchBoosts()
  }, [])

  // Sync search/location from URL params (e.g. when navbar search navigates here)
  useEffect(() => {
    setSearchQuery(searchParams.get('search') || '')
    setLocationQuery(searchParams.get('city') || '')
  }, [searchParams])

  // Detect mobile for layout switch
  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768)
    check()
    window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [])

  const toggleFilter = (category: keyof Filters, value: string) => {
    setFilters(prev => {
      const newSet = new Set(prev[category])
      if (newSet.has(value)) newSet.delete(value)
      else newSet.add(value)
      return { ...prev, [category]: newSet }
    })
  }

  const toggleCategory = (categoryId: string) => {
    if (categoryId === 'all') {
      setActiveCategories([])
      return
    }
    setActiveCategories(prev =>
      prev.includes(categoryId) ? prev.filter(c => c !== categoryId) : [...prev, categoryId]
    )
  }

  const activeFilterCount = useMemo(() =>
    Object.values(filters).reduce((sum, set) => sum + set.size, 0)
  , [filters])

  const clearAllFilters = () => setFilters(emptyFilters())

  useEffect(() => {
    const checkAuth = async () => {
      // DEV MODE — bypass auth + subscription, render with mock candidates
      if (DEV_MODE) {
        setIsEmployer(true)
        setHasSubscription(true)
        setAllCandidates(devMockCandidates)
        setCheckingAuth(false)
        return
      }

      const session = await getSessionWithRetry()

      if (!session) {
        router.push('/login/employer')
        return
      }

      const userRole = session.user.user_metadata?.role
      if (userRole !== 'employer') {
        setIsEmployer(false)
        setCheckingAuth(false)
        return
      }

      setIsEmployer(true)

      // Entitlement is paying-sub OR in-window founding cohort
      // (lib/foundingEntitlement). approval_status MUST be fetched
      // alongside the subscription fields so isEmployerEntitled can see
      // it; without it the helper fails closed (was previously a
      // silent-pass back-compat hole — pending freemail users wrongly
      // reached this page).
      const [subRes, profileRes] = await Promise.all([
        supabase
          .from('employer_subscriptions')
          .select('subscription_status, subscription_tier, founding_period_ends_at')
          .eq('user_id', session.user.id)
          .maybeSingle(),
        supabase
          .from('employer_profiles')
          .select('approval_status')
          .eq('user_id', session.user.id)
          .maybeSingle(),
      ])
      const approvalStatus: string | null | undefined = (profileRes.data as { approval_status?: string | null } | null)?.approval_status ?? null
      if (approvalStatus === 'pending' || approvalStatus === 'rejected' || approvalStatus === 'waitlisted') {
        router.push('/account-under-review')
        return
      }
      const subWithApproval = subRes.data ? { ...subRes.data, approval_status: approvalStatus } : null

      if (isEmployerEntitled(subWithApproval)) {
        setHasSubscription(true)
      } else {
        setHasSubscription(false)
        setCheckingAuth(false)
        return
      }

      // Fetch candidates only after auth + subscription confirmed. is_discoverable
      // gates this proactive browse — candidates who haven't opted in are hidden.
      const { data, error } = await supabase
        .from('candidate_profiles')
        .select('*')
        .eq('is_discoverable', true)
        .limit(200)
      if (!error && data) {
        const candidates = data.map(supabaseProfileToCandidate)
        setAllCandidates(candidates)
        setVisibilityMap(new Map(data.map((r: any) => [r.user_id || r.id, resolveVisibility(r.visibility_settings)])))

        // If jobId param is present, fetch job and compute match scores
        const jobIdParam = searchParams.get('jobId')
        if (jobIdParam) {
          const { data: jobData } = await supabase.from('jobs').select('*').eq('id', jobIdParam).maybeSingle()
          if (jobData) {
            const job = supabaseJobToJob(jobData)
            setMatchedJob(job)
            setMatchScores(scoreAllCandidates(job, candidates))
          }
        }
      }

      setCheckingAuth(false)
    }
    checkAuth()
  }, [router])

  // ONE PREDICATE, CALLABLE WITH A DIMENSION SKIPPED.
  //
  // The answer line's row 3 needs to know which single filter, removed, would
  // yield the most candidates — so the same rules have to run once per active
  // filter. Extracting it is what makes that honest rather than a second
  // almost-identical copy that drifts.
  //
  // It costs nothing: the page already loads every candidate once and filters
  // in memory, so this is array work rather than a query per filter. The
  // ceiling on this page is not the recompute, it is the number of rows shipped
  // to the browser in the first place.
  const matchesFilters = useCallback((candidate: Candidate, skip?: string) => {
      // Match score filter — when viewing matched candidates for a job
      if (matchedJob && Object.keys(matchScores).length > 0) {
        if ((matchScores[candidate.id] || 0) < 25) return false
      }

      // CV filter. Excludes rather than includes, which is why it draws dashed
      // when unselected — and it is the destination for the answer line's
      // action, so that action operates on something real.
      if (hasCvOnly && skip !== 'hasCv') {
        if (!candidate.cvUrl) return false
      }

      // Search filter
      if (searchQuery && skip !== 'search') {
        const query = searchQuery.toLowerCase()
        const matchesSearch =
          (candidate.fullName || '').toLowerCase().includes(query) ||
          candidate.jobTitle.toLowerCase().includes(query) ||
          candidate.skills.some(skill => skill.toLowerCase().includes(query)) ||
          candidate.bio.toLowerCase().includes(query)
        if (!matchesSearch) return false
      }

      // City filter
      if (locationQuery && skip !== 'location') {
        const city = locationQuery.toLowerCase()
        if (!candidate.location.toLowerCase().includes(city)) return false
      }

      // Sector filter (OR logic — candidate must match at least one selected sector)
      if (activeCategories.length > 0 && skip !== 'sector') {
        const sector = getCandidateSector(candidate)
        if (!activeCategories.includes(sector)) return false
      }

      // Availability filter
      if (filters.availability.size > 0 && skip !== 'availability') {
        const avail = candidate.availability.toLowerCase()
        let matches = false
        for (const f of Array.from(filters.availability)) {
          if (f === 'Available immediately' && (avail.includes('immediate') || avail.includes('available now'))) matches = true
          if (f === '2 weeks notice' && avail.includes('2 week')) matches = true
          if (f === '1 month notice' && (avail.includes('1 month') || avail.includes('4 week') || avail.includes('3 week'))) matches = true
          if (f === 'Flexible' && avail.includes('flexib')) matches = true
        }
        if (!matches) return false
      }

      // Experience Level filter
      if (filters.experienceLevel.size > 0 && skip !== 'experienceLevel') {
        const yrs = candidate.yearsExperience
        let matches = false
        for (const level of Array.from(filters.experienceLevel)) {
          if (level === 'No experience' && yrs === 0) matches = true
          if (level === 'Entry level (0-2 years)' && yrs >= 0 && yrs <= 2) matches = true
          if (level === 'Mid level (3-5 years)' && yrs >= 3 && yrs <= 5) matches = true
          if (level === 'Senior (6-10 years)' && yrs >= 6 && yrs <= 10) matches = true
          if (level === 'Executive (10+ years)' && yrs > 10) matches = true
        }
        if (!matches) return false
      }

      // Skills filter
      if (filters.skills.size > 0 && skip !== 'skills') {
        const candidateSkills = candidate.skills.map(s => s.toLowerCase())
        const candidateBio = candidate.bio.toLowerCase()
        let matches = false
        for (const skill of Array.from(filters.skills)) {
          const skillLower = skill.toLowerCase()
          if (candidateSkills.some(s => s.includes(skillLower)) || candidateBio.includes(skillLower)) matches = true
          if (skill === 'Right to Work' && candidate.hasRightToWork) matches = true
          if (skill === 'NI Number' && candidate.hasNiNumber) matches = true
        }
        if (!matches) return false
      }

      // Work Preference filter
      if (filters.workPreference.size > 0 && skip !== 'workPreference') {
        const candidateJobTypes = (candidate.preferredJobTypes || []).map(s => s.toLowerCase())
        let matches = false
        for (const pref of Array.from(filters.workPreference)) {
          if (candidateJobTypes.some(t => t.includes(pref.toLowerCase()))) matches = true
        }
        if (!matches) return false
      }

      return true
  }, [searchQuery, locationQuery, activeCategories, filters, matchedJob, matchScores, hasCvOnly])

  const filteredCandidates = useMemo(() => {
    return allCandidates.filter(c => matchesFilters(c)).sort((a, b) => {
      // Sort by match score when viewing matched candidates
      if (matchedJob && Object.keys(matchScores).length > 0) {
        return (matchScores[b.id] || 0) - (matchScores[a.id] || 0)
      }
      const aBoost = boostedProfileIds.has(a.id) ? 1 : 0
      const bBoost = boostedProfileIds.has(b.id) ? 1 : 0
      if (aBoost !== bBoost) return bBoost - aBoost
      // RECENTLY JOINED, NOT "RECENTLY ACTIVE".
      //
      // updated_at exists and is not maintained: no triggers on the table, 36
      // of 44 rows sit within five seconds of created_at, and writes made to
      // nine rows this morning never moved it. Sorting by it under a label
      // saying "active" would be a control asserting something only the data
      // could support. created_at is true, and with most profiles blank
      // recency is still the only signal that separates them.
      return Date.parse(b.createdAt || '') - Date.parse(a.createdAt || '')
    })
  }, [allCandidates, matchesFilters, boostedProfileIds, matchedJob, matchScores])

  // ── The answer line's inputs ──────────────────────────────────────
  //
  // activeFilters carries a label AND the key needed to drop it, so row 3's
  // action can act rather than just describe.
  const activeFilterList = useMemo(() => {
    const out: { key: string; label: string }[] = []
    if (searchQuery) out.push({ key: 'search', label: searchQuery })
    if (locationQuery) out.push({ key: 'location', label: locationQuery })
    if (activeCategories.length) out.push({ key: 'sector', label: activeCategories.map(getCategoryLabel).join(', ') })
    if (hasCvOnly) out.push({ key: 'hasCv', label: 'Has a CV' })
    for (const s of candidateFilterSections) {
      const set = filters[s.key]
      if (set.size) out.push({ key: s.key, label: Array.from(set).join(', ') })
    }
    return out
  }, [searchQuery, locationQuery, activeCategories, hasCvOnly, filters])

  const bestFilterToDrop = useMemo(() => {
    if (filteredCandidates.length > 0 || activeFilterList.length === 0) return null
    let best: { key: string; label: string; resultCount: number } | null = null
    // Last added wins a tie, so walking in reverse and using a strict > keeps
    // the most recent one — the filter they are most likely still holding in
    // mind, and the one the design asks for.
    for (const f of [...activeFilterList].reverse()) {
      const resultCount = allCandidates.filter(c => matchesFilters(c, f.key)).length
      if (resultCount > 0 && (!best || resultCount > best.resultCount)) best = { ...f, resultCount }
    }
    return best
  }, [filteredCandidates.length, activeFilterList, allCandidates, matchesFilters])

  const dropFilter = (key: string) => {
    if (key === 'search') return setSearchQuery('')
    if (key === 'location') return setLocationQuery('')
    if (key === 'sector') return setActiveCategories([])
    if (key === 'hasCv') return setHasCvOnly(false)
    setFilters(prev => ({ ...prev, [key]: new Set() }))
  }

  const answerLineModel = useMemo(() => candidatesAnswerLine({
    totalMatching: filteredCandidates.length,
    withCvCount: filteredCandidates.filter(c => !!c.cvUrl).length,
    activeFilters: activeFilterList.map(f => f.label),
    bestFilterToDrop,
    // The pool being empty is about the board, not the filters — so it reads
    // allCandidates, and a filtered-to-nothing page never claims there is
    // nobody on Thrive.
    poolIsEmpty: allCandidates.length === 0,
    sector: activeCategories.length === 1 ? getCategoryLabel(activeCategories[0]) : null,
  }), [filteredCandidates, activeFilterList, bestFilterToDrop, allCandidates.length, activeCategories])

  const answerLineWithAction = useMemo(() => {
    if (!answerLineModel.action || answerLineModel.action.href) return answerLineModel
    const onClick = bestFilterToDrop && answerLineModel.action.label.startsWith('Drop')
      ? () => dropFilter(bestFilterToDrop.key)
      : () => setHasCvOnly(true)
    return { ...answerLineModel, action: { ...answerLineModel.action, onClick } }
  }, [answerLineModel, bestFilterToDrop])

  // Clear the open candidate if it drops out of the filtered set (mirrors
  // /jobs). The detail is now a click-opened slide-in modal, so we must NOT
  // auto-select / auto-open a candidate on load or on filter change.
  useEffect(() => {
    if (selectedCandidate && filteredCandidates.length > 0 && !filteredCandidates.some(c => c.id === selectedCandidate.id)) {
      setSelectedCandidate(null)
    }
  }, [filteredCandidates])

  const selectCandidate = (candidate: Candidate) => {
    if (isMobile) {
      router.push(`/candidates/${candidate.id}`)
    } else {
      setSelectedCandidate(candidate)
    }
  }

  const clearFilters = () => {
    setSearchQuery('')
    setLocationQuery('')
    setActiveCategories([])
    setHasCvOnly(false)
    clearAllFilters()
  }

  // Filter-strip helpers (mirror /jobs). These re-present the SAME existing
  // filter Sets — no new filter dimensions are introduced.
  const closeOverlays = () => { setSectorsExpanded(false); setFiltersExpanded(false) }
  const availabilityOptions = candidateFilterSections.find(s => s.key === 'availability')!.options
  const experienceOptions = candidateFilterSections.find(s => s.key === 'experienceLevel')!.options
  const selectedExperience = filters.experienceLevel.size === 1 ? Array.from(filters.experienceLevel)[0] : ''
  const setExperience = (val: string) =>
    setFilters(prev => ({ ...prev, experienceLevel: new Set(val ? [val] : []) }))
  const hasActiveFilters =
    activeFilterCount > 0 || !!searchQuery || !!locationQuery || activeCategories.length > 0 || hasCvOnly

  // Slide-in detail modal nav (mirrors /jobs prev/next)
  const navigateToCandidate = (direction: 'prev' | 'next') => {
    if (!selectedCandidate) return
    const i = filteredCandidates.findIndex(c => c.id === selectedCandidate.id)
    const ni = direction === 'prev' ? i - 1 : i + 1
    if (ni >= 0 && ni < filteredCandidates.length) setSelectedCandidate(filteredCandidates[ni])
  }
  const currentCandidateIndex = () =>
    selectedCandidate ? filteredCandidates.findIndex(c => c.id === selectedCandidate.id) : -1

  if (checkingAuth) {
    return (
      <main>
        <Header />
        <div className={styles.container}>
          <p>Loading...</p>
        </div>
      </main>
    )
  }

  if (!isEmployer) {
    return (
      <main>
        <Header />
        <div className={styles.container}>
          <div className={styles.accessDenied}>
            <div className={styles.accessIcon}><Ico name="lock" size={20} /></div>
            {/* THIS GATE IS ONLY EVER SEEN BY SOMEONE ALREADY SIGNED IN.
                A visitor with no session is redirected to /login/employer
                above, so everyone who reaches here has an account — and is
                not an employer, which in practice means a job seeker.

                It used to offer "Sign up for free". That is the exact trap
                Ricci Courtney fell into: he had a job-seeker account on his
                work address, was invited to sign up as an employer, used the
                same address, and was bounced back to the job-seeker login with
                no explanation. He then tried two personal addresses and gave
                up. One email can only be one side, and nothing anywhere said
                so — so the page that causes the problem is the right place to
                say it. */}
            <h2>This is the employer side</h2>
            <p>
              You&rsquo;re signed in as a job seeker, so browsing candidate
              profiles isn&rsquo;t available on this account. Employer accounts
              are separate &mdash; one email address can only be one or the
              other.
            </p>
            <p className={styles.accessNote}>
              If you hire as well as job-hunt, create an employer account with a
              different email address, or email{' '}
              <a href="mailto:support@thrivecareer.co.uk">support@thrivecareer.co.uk</a>{' '}
              and we&rsquo;ll switch this one over for you.
            </p>
            <Link href="/jobs" className="btn btn-primary">
              Back to jobs
            </Link>
          </div>
        </div>
      </main>
    )
  }

  if (!hasSubscription) {
    router.push('/dashboard/subscription')
    return (
      <main>
        <Header />
        <div className={styles.container}>
          <div className={styles.accessDenied}>
            <div className={styles.accessIcon}><Ico name="file-text" size={20} /></div>
            <h2>Subscription Required</h2>
            <p>Redirecting to subscription page...</p>
          </div>
        </div>
      </main>
    )
  }

  return (
    <main className="no-pad">
      <Header />

      {/* Search Section (dark) — mirrors /jobs */}
      <div className={styles.searchSection}>
        <div className={styles.searchInner}>
          <h1 className={styles.searchSectionTitle}>Candidates</h1>
          <p className={styles.searchSectionSub}>Everyone on Thrive who’s open to work, whether or not they’ve applied to you.</p>
          <div className={styles.searchControls}>
            <div className={styles.searchInputWrap}>
              <input
                type="text"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="Name, role or skill"
                className={styles.searchBox}
              />
              {searchQuery && (
                <button className={styles.searchClear} onClick={() => setSearchQuery('')} aria-label="Clear search">✕</button>
              )}
            </div>
            <div className={styles.searchInputWrap}>
              <input
                type="text"
                value={locationQuery}
                onChange={e => setLocationQuery(e.target.value)}
                placeholder="City or town"
                className={styles.searchBox}
              />
              {locationQuery && (
                <button className={styles.searchClear} onClick={() => setLocationQuery('')} aria-label="Clear location">✕</button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Filter Strip — sticky, mirrors /jobs */}
      <div className={styles.filterStrip}>
        <div className={styles.filterStripInner}>
          <div className={styles.filterStripLeft}>
            {availabilityOptions.map(opt => (
              <button
                key={opt}
                className={`${styles.filterPill} ${filters.availability.has(opt) ? styles.filterPillActive : ''}`}
                onClick={() => toggleFilter('availability', opt)}
              >
                {opt}
              </button>
            ))}
            <select
              value={selectedExperience}
              onChange={e => setExperience(e.target.value)}
              className={`${styles.filterSelect} ${selectedExperience ? styles.filterSelectActive : ''}`}
            >
              <option value="">Experience level</option>
              {experienceOptions.map(opt => <option key={opt} value={opt}>{opt}</option>)}
            </select>
            {/* Excludes rather than includes, so it draws dashed when off — the
                same convention as the card's "No CV" chip. */}
            <button
              className={`${styles.filterPill} ${styles.filterPillExcluding} ${hasCvOnly ? styles.filterPillActive : ''}`}
              onClick={() => setHasCvOnly(v => !v)}
              aria-pressed={hasCvOnly}
            >
              Has a CV
            </button>
            <button
              className={`${styles.filterPill} ${sectorsExpanded ? styles.filterPillActive : ''}`}
              onClick={() => { setFiltersExpanded(false); setSectorsExpanded(!sectorsExpanded) }}
            >
              Sectors{activeCategories.length === 1 ? ` · ${categories.find(c => c.id === activeCategories[0])?.label}` : activeCategories.length > 1 ? ` · ${activeCategories.length}` : ''} ▾
            </button>
            <button
              className={`${styles.filterPill} ${filtersExpanded ? styles.filterPillActive : ''}`}
              onClick={() => { setSectorsExpanded(false); setFiltersExpanded(!filtersExpanded) }}
            >
              More filters{activeFilterCount > 0 ? ` (${activeFilterCount})` : ''} ▾
            </button>
          </div>
          <div className={styles.filterStripRight}>
            <span className={styles.resultCount}>{filteredCandidates.length} candidates</span>
            {hasActiveFilters && (
              <button className={styles.clearFiltersBtn} onClick={clearFilters}>Clear filters</button>
            )}
          </div>
        </div>

        {/* Active filter chips — removable */}
        {(activeCategories.length > 0 || activeFilterCount > 0) && (
          <div className={styles.activeChips}>
            {activeCategories.map(catId => (
              <button key={catId} className={styles.activeChip} onClick={() => toggleCategory(catId)}>
                {categories.find(c => c.id === catId)?.label}<span aria-hidden="true">✕</span>
              </button>
            ))}
            {candidateFilterSections.map(section => Array.from(filters[section.key]).map(option => (
              <button key={`${section.key}-${option}`} className={styles.activeChip} onClick={() => toggleFilter(section.key, option)}>
                {option}<span aria-hidden="true">✕</span>
              </button>
            )))}
          </div>
        )}
      </div>

      {/* Filter overlays — popover on desktop, bottom sheet on mobile */}
      {(sectorsExpanded || filtersExpanded) && (
        <div className={styles.filterBackdrop} onClick={closeOverlays} />
      )}
      {sectorsExpanded && (
        <div className={styles.filterOverlay} role="dialog" aria-label="Job Sectors" aria-modal="true">
          <div className={styles.filterOverlayHead}>
            <span>Job Sectors</span>
            <button className={styles.filterOverlayClose} onClick={() => setSectorsExpanded(false)} aria-label="Close">✕</button>
          </div>
          <div className={styles.filterOverlayBody}>
            <div className={styles.filterGroupOptions}>
              {categories.map(category => (
                <button
                  key={category.id}
                  className={`${styles.filterPill} ${
                    category.id === 'all'
                      ? (activeCategories.length === 0 ? styles.filterPillActive : '')
                      : (activeCategories.includes(category.id) ? styles.filterPillActive : '')
                  }`}
                  onClick={() => toggleCategory(category.id)}
                >
                  {category.label}
                </button>
              ))}
            </div>
          </div>
          <div className={styles.filterOverlayFoot}>
            <button className={styles.filterOverlayClear} onClick={() => setActiveCategories([])}>Clear</button>
            <button className={styles.filterOverlayApply} onClick={() => setSectorsExpanded(false)}>Show {filteredCandidates.length} candidates</button>
          </div>
        </div>
      )}
      {filtersExpanded && (
        <div className={styles.filterOverlay} role="dialog" aria-label="Filters" aria-modal="true">
          <div className={styles.filterOverlayHead}>
            <span>Filters{activeFilterCount > 0 ? ` (${activeFilterCount})` : ''}</span>
            <button className={styles.filterOverlayClose} onClick={() => setFiltersExpanded(false)} aria-label="Close">✕</button>
          </div>
          <div className={styles.filterOverlayBody}>
            {candidateFilterSections.map(section => (
              <div key={section.key} className={styles.filterGroup}>
                <h4 className={styles.filterGroupTitle}>{section.title}</h4>
                <div className={styles.filterGroupOptions}>
                  {section.options.map(option => (
                    <button
                      key={option}
                      className={`${styles.filterPill} ${filters[section.key].has(option) ? styles.filterPillActive : ''}`}
                      onClick={() => toggleFilter(section.key, option)}
                    >
                      {option}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
          <div className={styles.filterOverlayFoot}>
            <button className={styles.filterOverlayClear} onClick={clearAllFilters}>Clear all</button>
            <button className={styles.filterOverlayApply} onClick={() => setFiltersExpanded(false)}>Show {filteredCandidates.length} candidates</button>
          </div>
        </div>
      )}

      {/* Matched-job banner (preserved) */}
      {matchedJob && (
        <div className={styles.matchBanner}>
          <span>Showing candidates matched to: <strong>{matchedJob.title}</strong></span>
          <button className={styles.matchBannerClear} onClick={() => { setMatchedJob(null); setMatchScores({}) }}>
            Clear filter ✕
          </button>
        </div>
      )}

      {/* THE ANSWER LINE. Same component as both dashboards, third sentence
          table. It counts what is USABLE, not what exists — stating the
          shortfall in the same breath as the total is what stops a grid of
          sparse cards reading as a page that failed to load. */}
      <div className={styles.answerLineWrap}>
        <AnswerLine model={answerLineWithAction} />
      </div>

      {/* Candidate Card Grid — image-led, mirrors /jobs */}
      <div className={styles.cardsContainer}>
        {filteredCandidates.length > 0 ? (
          <div className={styles.cardsGrid} ref={listRef}>
            {filteredCandidates.map(candidate => {
              return (
                <CandidateCard
                  key={candidate.id}
                  candidate={candidate}
                  mode="directory"
                  matchScore={matchScores[candidate.id] || undefined}
                  featured={boostedProfileIds.has(candidate.id)}
                  onOpen={() => selectCandidate(candidate)}
                  onMessage={() => router.push(`/messages?candidate=${candidate.id}`)}
                />
              )
            })}
          </div>
        ) : (
          // LEFT-ALIGNED, NO ICON, NO GREY PANEL — the /talent-pool standard.
          // It names the cause and offers the next move.
          //
          // AND IT NO LONGER PROMISES A SAVED SEARCH. The handoff copy ended
          // "…or save the search and we'll email you when someone new fits."
          // There is no saved-search table, no route and no client code, so
          // omitting the two buttons while keeping that sentence would have
          // left the promise standing in prose, with an email commitment
          // attached. The controls and the copy had to go together.
          <div className={styles.emptyState}>
            <h2 className={styles.emptyTitle}>
              {allCandidates.length === 0 ? 'No candidates yet' : 'No candidates match all of these'}
            </h2>
            <p className={styles.emptyText}>
              {allCandidates.length === 0
                ? 'Post a role and we’ll show applicants here as they arrive.'
                : 'Availability and location are the two that narrow it fastest. Loosen either and you’ll see more.'}
            </p>
            {allCandidates.length === 0 ? (
              <Link href="/post-job" className={styles.browseBtn}>Post a job</Link>
            ) : (
              <button className={styles.browseBtn} onClick={clearFilters}>
                Clear all filters
              </button>
            )}
          </div>
        )}
      </div>

      {/* Candidate Detail — slide-in modal (desktop); mobile routes to /candidates/[id] */}
      {!isMobile && selectedCandidate && (
        <>
          <div className={styles.modalOverlay} onClick={() => setSelectedCandidate(null)} />
          <div className={styles.modalPanel}>
            <div className={styles.modalHeader}>
              <div className={styles.modalNav}>
                <button className={styles.modalNavBtn} onClick={() => navigateToCandidate('prev')} disabled={currentCandidateIndex() <= 0} aria-label="Previous candidate">←</button>
                <button className={styles.modalNavBtn} onClick={() => navigateToCandidate('next')} disabled={currentCandidateIndex() >= filteredCandidates.length - 1} aria-label="Next candidate">→</button>
              </div>
              <button className={styles.modalClose} onClick={() => setSelectedCandidate(null)} aria-label="Close">✕</button>
            </div>
            <div className={styles.modalBody}>
              <CandidateDetail candidate={selectedCandidate} visibility={visibilityMap.get(selectedCandidate.id) ?? DEFAULT_VISIBILITY} />
              </div>
            </div>
          </>
        )}
    </main>
  )
}

export default function CandidatesPage() {
  return (
    <Suspense fallback={
      <main>
        <Header />
        <div className={styles.container}><p>Loading...</p></div>
      </main>
    }>
      <CandidatesContent />
    </Suspense>
  )
}

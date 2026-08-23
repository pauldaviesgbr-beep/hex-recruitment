'use client'

import { useState, useMemo, useEffect, useRef, Suspense } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import Header from '@/components/Header'
import JobDetailModal from '@/components/JobDetailModal'
import { Job } from '@/lib/mockJobs'
import { useJobs } from '@/lib/JobsContext'
import { useMessages } from '@/lib/MessagesContext'
import type { Conversation } from '@/lib/mockMessages'
import { supabase } from '@/lib/supabase'
import { notify } from '@/lib/notify'
import { useSavedJobs } from '@/lib/useSavedJobs'
import { getTagCategory } from '@/lib/jobTags'
import { Boost } from '@/lib/boostTypes'
import CompanyReviewsSummary from '@/components/CompanyReviewsSummary'
import CompanyLogo from '@/components/CompanyLogo'
import JobCard from '@/components/JobCard'
import { WORK_TYPES } from '@/lib/workTypes'
import { annualisedOrNull } from '@/lib/salaryInput'
import { resolveJobBanner } from '@/lib/jobBanner'
import BrandedJobFallback from '@/components/BrandedJobFallback'
import JobPostingSchema from '@/components/JobPostingSchema'
import { selectQuote } from '@/lib/jobQuote'
import { useAnalyticsTracking } from '@/hooks/useAnalyticsTracking'
import styles from './page.module.css'

type Filters = {
  employmentType: Set<string>
  experienceLevel: Set<string>
  salaryRange: Set<string>
  postedDate: Set<string>
  workArrangement: Set<string>
  tags: Set<string>
}

const emptyFilters = (): Filters => ({
  employmentType: new Set(),
  experienceLevel: new Set(),
  salaryRange: new Set(),
  postedDate: new Set(),
  workArrangement: new Set(),
  tags: new Set(),
})

const filterSections = [
  // Was a seventh copy of the vocabulary, and the only place 'Apprenticeship'
  // ever appeared. Offering a filter for a word no job carries is the same
  // fault as the job-alert tags, where all 34 options matched zero rows.
  { key: 'employmentType' as const, title: 'Employment Type', options: [...WORK_TYPES] },
  { key: 'experienceLevel' as const, title: 'Experience Level', options: ['No experience required', 'Entry level (0-2 years)', 'Mid level (3-5 years)', 'Senior (6-10 years)', 'Executive (10+ years)'] },
  { key: 'salaryRange' as const, title: 'Salary Range', options: ['Under £20k', '£20k-£30k', '£30k-£40k', '£40k-£50k', '£50k-£75k', '£75k-£100k', '£100k+'] },
  { key: 'postedDate' as const, title: 'Posted Date', options: ['Last 24 hours', 'Last 3 days', 'Last 7 days', 'Last 14 days', 'Last 30 days'] },
  { key: 'workArrangement' as const, title: 'Work Arrangement', options: [...WORK_LOCATIONS] },
  { key: 'tags' as const, title: 'Job Tags', options: ['Immediate start', 'Urgent hire', 'Interviews this week', 'No experience required', 'Entry level', 'Mid level', 'Senior level', 'Management', 'Remote', 'Hybrid', 'On-site', 'Training provided', 'Career progression', 'CV required'] },
]

const UK_POSTCODE_RE = /^[A-Z]{1,2}[0-9][0-9A-Z]?\s*[0-9][A-Z]{2}$/i

function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371
  const dLat = (lat2 - lat1) * Math.PI / 180
  const dLon = (lon2 - lon1) * Math.PI / 180
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

const getPostedDaysAgo = (postedAt: string): number => {
  const lower = postedAt.toLowerCase()
  if (lower.includes('today') || lower.includes('just')) return 0
  if (lower.includes('yesterday')) return 1
  const match = lower.match(/(\d+)/)
  if (!match) return 999
  const num = parseInt(match[1])
  if (lower.includes('hour')) return 0
  if (lower.includes('day')) return num
  if (lower.includes('week')) return num * 7
  if (lower.includes('month')) return num * 30
  return 999
}

import { categories as sharedCategories } from '@/lib/categories'
import { WORK_LOCATIONS, jobMatchesWorkLocation, normaliseWorkLocation } from '@/lib/workLocation'
import { getJobSector } from '@/lib/jobSector'
import {
  resolvePrefFilters,
  workStylePref,
  sectorPref,
  type PrefFilter,
} from '@/lib/candidatePrefs'
import { Ico } from '@/components/icons'
const categories = [{ id: 'all', label: 'All Jobs' }, ...sharedCategories]

// getJobSector now lives in lib/jobSector.ts — the preference resolver needs it too.

function JobsPageContent() {
  const { jobs, loading } = useJobs()
  const { addConversation, refreshConversations } = useMessages()
  const { isSaved, toggleSave } = useSavedJobs()
  const { trackJobView, trackClickEvent, trackImpression } = useAnalyticsTracking()
  const router = useRouter()
  const searchParams = useSearchParams()
  const [searchQuery, setSearchQuery] = useState(searchParams.get('search') || '')
  const [locationQuery, setLocationQuery] = useState(searchParams.get('city') || '')
  const [debouncedLocationQuery, setDebouncedLocationQuery] = useState(searchParams.get('city') || '')
  const [locationRadius, setLocationRadius] = useState<number | null>(null)
  const [locationCoords, setLocationCoords] = useState<{ lat: number; lon: number } | null>(null)
  const [jobCoords, setJobCoords] = useState<Map<string, { lat: number; lon: number }>>(new Map())
  const [geocodingLocation, setGeocodingLocation] = useState(false)
  const fetchedPostcodesRef = useRef<Set<string>>(new Set())
  const [activeCategory, setActiveCategory] = useState('all')
  const [filters, setFilters] = useState<Filters>(emptyFilters())
  const [sectorsExpanded, setSectorsExpanded] = useState(false)
  const [filtersExpanded, setFiltersExpanded] = useState(false)
  const [selectedJob, setSelectedJob] = useState<Job | null>(null)
  const [isLoggedIn, setIsLoggedIn] = useState<boolean | null>(null)
  const [isMobile, setIsMobile] = useState(false)
  const listRef = useRef<HTMLDivElement>(null)

  // Apply flow state
  const [showApplyModal, setShowApplyModal] = useState(false)
  const [coverLetter, setCoverLetter] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [applicationSubmitted, setApplicationSubmitted] = useState(false)
  const [screeningAnswers, setScreeningAnswers] = useState<Record<string, string>>({})
  const [hasApplied, setHasApplied] = useState(false)
  const [checkingApplied, setCheckingApplied] = useState(false)
  const [currentUserRole, setCurrentUserRole] = useState<string | null>(null)
  const [applicationStatus, setApplicationStatus] = useState<string | null>(null)
  const [shortlistedJobIds, setShortlistedJobIds] = useState<Set<string>>(new Set())
  const [appliedJobIds, setAppliedJobIds] = useState<Set<string>>(new Set())
  const [boostedJobIds, setBoostedJobIds] = useState<Set<string>>(new Set())
  const [quickWorkStyle, setQuickWorkStyle] = useState<string | null>(null)
  const [quickExperienceLevel, setQuickExperienceLevel] = useState<string>('')

  // Fetch active job boosts for sorting (non-blocking — table may not exist yet)
  useEffect(() => {
    const fetchBoosts = async () => {
      try {
        const { data } = await supabase
          .from('boosts')
          .select('target_id')
          .eq('boost_type', 'job')
          .eq('is_active', true)
          .gt('expires_at', new Date().toISOString())
        if (data) {
          setBoostedJobIds(new Set(data.map((b: any) => b.target_id)))
        }
      } catch {
        // Boosts table may not exist yet — silently ignore
      }
    }
    fetchBoosts()
  }, [])

  // Check authentication status and load shortlisted jobs
  useEffect(() => {
    const checkAuth = async () => {
      const { data: { session } } = await supabase.auth.getSession()
      setIsLoggedIn(!!session)
      if (session) {
        setCurrentUserRole(session.user.user_metadata?.role || 'employee')
        // Load shortlisted job IDs for the candidate
        const { data: shortlisted } = await supabase
          .from('job_applications')
          .select('job_id')
          .eq('candidate_id', session.user.id)
          .eq('status', 'shortlisted')
        if (shortlisted) {
          setShortlistedJobIds(new Set(shortlisted.map((r: any) => r.job_id)))
        }
        // Load all applied job IDs for the candidate (for "Applied ✓" badge on cards)
        if (session.user.user_metadata?.role !== 'employer') {
          const { data: applied } = await supabase
            .from('job_applications')
            .select('job_id')
            .eq('candidate_id', session.user.id)
          if (applied) {
            setAppliedJobIds(new Set(applied.map((r: any) => r.job_id)))
          }
        }
      }
    }
    checkAuth()
  }, [])

  // Check if user has already applied to the selected job
  useEffect(() => {
    if (!selectedJob) return
    // Reset apply state when job changes
    setHasApplied(false)
    setApplicationStatus(null)
    setShowApplyModal(false)
    setApplicationSubmitted(false)
    setCoverLetter('')

    const checkExistingApplication = async () => {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) {
        setCheckingApplied(false)
        return
      }
      setCheckingApplied(true)
      try {
        const { data } = await supabase
          .from('job_applications')
          .select('id, status')
          .eq('job_id', selectedJob.id)
          .eq('candidate_id', session.user.id)
          .maybeSingle()
        if (data) {
          setHasApplied(true)
          setApplicationStatus(data.status)
        }
      } catch {
        // Supabase query failed — assume not applied
      }
      setCheckingApplied(false)
    }
    checkExistingApplication()
  }, [selectedJob?.id])

  // Detect mobile for layout switch
  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768)
    check()
    window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [])

  // Sync search/location from URL params (e.g. when navbar search navigates here)
  useEffect(() => {
    const s = searchParams.get('search') || ''
    const c = searchParams.get('city') || ''
    if (s !== searchQuery) setSearchQuery(s)
    if (c !== locationQuery) setLocationQuery(c)
  }, [searchParams])

  // Debounce location query for filtering (500ms)
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedLocationQuery(locationQuery), 500)
    return () => clearTimeout(timer)
  }, [locationQuery])

  // Geocode search term — postcode or city/town name (debounced 500ms)
  useEffect(() => {
    const trimmed = locationQuery.trim()
    if (!trimmed) {
      setLocationCoords(null)
      return
    }
    const timer = setTimeout(() => {
      setGeocodingLocation(true)

      if (UK_POSTCODE_RE.test(trimmed)) {
        // Postcode → use postcodes.io postcode lookup
        const postcode = trimmed.replace(/\s+/g, '').toUpperCase()
        fetch(`https://api.postcodes.io/postcodes/${postcode}`)
          .then(r => r.json())
          .then(d => {
            if (d.status === 200 && d.result) {
              setLocationCoords({ lat: d.result.latitude, lon: d.result.longitude })
            } else {
              setLocationCoords(null)
            }
          })
          .catch(() => setLocationCoords(null))
          .finally(() => setGeocodingLocation(false))
      } else if (trimmed.length >= 3) {
        // City/town name → use postcodes.io places API
        fetch(`https://api.postcodes.io/places?q=${encodeURIComponent(trimmed)}&limit=1`)
          .then(r => r.json())
          .then(d => {
            if (d.status === 200 && d.result && d.result.length > 0) {
              setLocationCoords({ lat: d.result[0].latitude, lon: d.result[0].longitude })
              // Auto-select 25 mile radius for city/town searches
              setLocationRadius(prev => prev === null ? 25 : prev)
            } else {
              setLocationCoords(null)
            }
          })
          .catch(() => setLocationCoords(null))
          .finally(() => setGeocodingLocation(false))
      } else {
        setLocationCoords(null)
        setGeocodingLocation(false)
      }
    }, 500)
    return () => clearTimeout(timer)
  }, [locationQuery])

  // Batch-geocode job postcodes when radius filter is active
  useEffect(() => {
    if (!locationCoords || locationRadius === null) return
    const uncached = jobs
      .filter(j => j.fullLocation?.postcode)
      .map(j => j.fullLocation!.postcode!.replace(/\s+/g, '').toUpperCase())
      .filter((p, i, arr) => arr.indexOf(p) === i && !fetchedPostcodesRef.current.has(p))
    if (uncached.length === 0) return
    uncached.forEach(p => fetchedPostcodesRef.current.add(p))
    fetch('https://api.postcodes.io/postcodes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ postcodes: uncached.slice(0, 100) }),
    })
      .then(r => r.json())
      .then(d => {
        if (d.status === 200 && d.result) {
          setJobCoords(prev => {
            const next = new Map(prev)
            d.result.forEach((item: any) => {
              if (item.result) {
                next.set(item.query.replace(/\s+/g, '').toUpperCase(), {
                  lat: item.result.latitude,
                  lon: item.result.longitude,
                })
              }
            })
            return next
          })
        }
      })
      .catch(() => {})
  }, [locationCoords, locationRadius, jobs])

  // Handle URL-based job selection (wait for auth check before deciding)
  useEffect(() => {
    if (isLoggedIn === null) return // Auth check still in progress
    const jobId = searchParams.get('id')
    if (jobId) {
      // Viewing a job is public — logged-out visitors open the detail too (the
      // gate is at Apply, not at viewing). Previously this redirected anonymous
      // visitors to /login, which made a shared /jobs?id= link a dead end.
      const job = jobs.find(j => j.id === jobId)
      if (job) {
        setSelectedJob(job)
        // ONE PATH FOR VIEWS: trackJobView, always. This used to call
        // increment_job_views directly as well — and trackJobView calls that
        // RPC itself, so a single click added TWO to jobs.views while adding
        // one row to job_views. That is why the two never reconciled.
        //
        // It also carried its own deduplication — a single ref holding only the
        // LAST job id, so A -> B -> A counted A twice — competing with the
        // hook's 30-second per-job debounce. Two rules, neither authoritative.
        // The hook's is the one that survives.
        trackJobView(job.id, 'direct')
      }
    } else if (!isMobile && !selectedJob) {
      // Don't clear selection on desktop - keep current or auto-select will handle
    } else if (isMobile) {
      setSelectedJob(null)
    }
  }, [searchParams, jobs, isLoggedIn, router, isMobile, currentUserRole])

  const toggleFilter = (category: keyof Filters, value: string) => {
    setFilters(prev => {
      const newSet = new Set(prev[category])
      if (newSet.has(value)) newSet.delete(value)
      else newSet.add(value)
      return { ...prev, [category]: newSet }
    })
  }

  const activeFilterCount = useMemo(() =>
    Object.values(filters).reduce((sum, set) => sum + set.size, 0)
  , [filters])

  const filteredJobs = useMemo(() => {
    return jobs.filter(job => {
      // Search filter
      if (searchQuery) {
        const query = searchQuery.toLowerCase()
        const matchesSearch =
          job.title.toLowerCase().includes(query) ||
          job.company.toLowerCase().includes(query) ||
          job.description.toLowerCase().includes(query)
        if (!matchesSearch) return false
      }

      // Location filter (uses debounced value)
      if (debouncedLocationQuery) {
        if (locationCoords && locationRadius !== null) {
          // Postcode radius filter
          const jobPostcode = job.fullLocation?.postcode?.replace(/\s+/g, '').toUpperCase()
          if (jobPostcode && jobCoords.has(jobPostcode)) {
            const jc = jobCoords.get(jobPostcode)!
            const distMiles = haversineKm(locationCoords.lat, locationCoords.lon, jc.lat, jc.lon) * 0.621371
            if (distMiles > locationRadius) return false
          } else {
            // Fallback to text match while coordinates are still loading
            const locQuery = debouncedLocationQuery.toLowerCase()
            if (!job.location.toLowerCase().includes(locQuery) && !job.area.toLowerCase().includes(locQuery)) return false
          }
        } else {
          // Text match (city/town name)
          const locQuery = debouncedLocationQuery.toLowerCase()
          const matchesLocation =
            job.location.toLowerCase().includes(locQuery) ||
            job.area.toLowerCase().includes(locQuery)
          if (!matchesLocation) return false
        }
      }

      // Category filter
      if (activeCategory !== 'all') {
        const jobSector = getJobSector(job)
        if (jobSector !== activeCategory) return false
      }

      // Employment Type filter
      if (filters.employmentType.size > 0) {
        const empTypes = Array.isArray(job.employmentType) ? job.employmentType : [job.employmentType]
        if (!Array.from(filters.employmentType).some(f => empTypes.includes(f as any))) return false
      }

      // Experience Level filter
      if (filters.experienceLevel.size > 0) {
        const onlyNoExp = filters.experienceLevel.size === 1 && filters.experienceLevel.has('No experience required')
        if (onlyNoExp && !job.noExperience) return false
      }

      // Salary Range filter
      //
      // AN UNPRICED JOB MATCHES NO BRACKET. Not every bracket — that was the
      // first version, following the area rule, and the area rule is right for
      // AREA precisely because an unplaceable job is common and hiding it would
      // empty the list.
      //
      // Salary differs in one way that decides it: "pay on application" is a
      // legitimate answer on the form, so unpriced roles become ordinary rather
      // than staying the single anomaly they are today. At forty of them, a chef
      // asking for £75k-£100k and being shown jobs with no salary is not being
      // answered. An employer who won't state pay loses reach instead — an
      // honest incentive, and the one we would give them anyway.
      //
      // This is also how a null salary has always behaved here. What changes is
      // which rows count as unpriced: a figure that cannot mean what it says now
      // joins them, rather than being answered confidently as "£0" and filed
      // under Under £20k — which is where the one live 0/0 row has been sitting.
      if (filters.salaryRange.size > 0) {
        const yearSalary = annualisedOrNull(job.salaryMax, job.salaryPeriod)
          ?? annualisedOrNull(job.salaryMin, job.salaryPeriod)
        if (yearSalary === null) return false
        let matches = false
        for (const range of Array.from(filters.salaryRange)) {
          if (range === 'Under £20k' && yearSalary < 20000) matches = true
          if (range === '£20k-£30k' && yearSalary >= 20000 && yearSalary <= 30000) matches = true
          if (range === '£30k-£40k' && yearSalary >= 30000 && yearSalary <= 40000) matches = true
          if (range === '£40k-£50k' && yearSalary >= 40000 && yearSalary <= 50000) matches = true
          if (range === '£50k-£75k' && yearSalary >= 50000 && yearSalary <= 75000) matches = true
          if (range === '£75k-£100k' && yearSalary >= 75000 && yearSalary <= 100000) matches = true
          if (range === '£100k+' && yearSalary >= 100000) matches = true
        }
        if (!matches) return false
      }

      // Posted Date filter
      if (filters.postedDate.size > 0) {
        const daysAgo = getPostedDaysAgo(job.postedAt)
        let matches = false
        for (const period of Array.from(filters.postedDate)) {
          if (period === 'Last 24 hours' && daysAgo <= 1) matches = true
          if (period === 'Last 3 days' && daysAgo <= 3) matches = true
          if (period === 'Last 7 days' && daysAgo <= 7) matches = true
          if (period === 'Last 14 days' && daysAgo <= 14) matches = true
          if (period === 'Last 30 days' && daysAgo <= 30) matches = true
        }
        if (!matches) return false
      }

      // Tags filter
      if (filters.tags.size > 0) {
        const jobTags = job.tags || []
        if (!Array.from(filters.tags).some(ft => jobTags.includes(ft))) return false
      }

      // Quick work style pill filter.
      // READS work_location (via workLocationType), NOT tags. Filtering on
      // tags matched ONE advert out of 251 and is the fault this fixes.
      if (quickWorkStyle) {
        if (!jobMatchesWorkLocation(job, quickWorkStyle)) return false
      }

      // Work Arrangement — the SAME question as the pill above, and until
      // 23 Aug 2026 it was declared, offered in the UI, counted in the
      // active-filter badge, and applied NOWHERE. A filter that says it is on
      // and changes nothing is worse than one that returns nothing.
      if (filters.workArrangement.size > 0) {
        if (!Array.from(filters.workArrangement).some(w => jobMatchesWorkLocation(job, w))) return false
      }

      // Quick experience level dropdown filter
      if (quickExperienceLevel) {
        const jobTags = job.tags || []
        if (!jobTags.includes(quickExperienceLevel)) return false
      }

      return true
    }).sort((a, b) => {
      const aBoost = boostedJobIds.has(a.id) ? 1 : 0
      const bBoost = boostedJobIds.has(b.id) ? 1 : 0
      return bBoost - aBoost
    })
  }, [jobs, searchQuery, debouncedLocationQuery, locationCoords, locationRadius, jobCoords, activeCategory, filters, boostedJobIds, quickWorkStyle, quickExperienceLevel])

  // Clear selection if selected job is no longer in filtered results
  useEffect(() => {
    if (selectedJob && filteredJobs.length > 0 && !filteredJobs.some(j => j.id === selectedJob.id)) {
      setSelectedJob(null)
    }
  }, [filteredJobs])

  // Track impressions when search results change (once per result set)
  const lastTrackedQuery = useRef<string>('')
  useEffect(() => {
    const query = searchQuery.trim()
    const key = `${query}|${filteredJobs.map(j => j.id).slice(0, 20).join(',')}`
    if (key === lastTrackedQuery.current) return
    if (filteredJobs.length === 0) return
    lastTrackedQuery.current = key
    filteredJobs.slice(0, 20).forEach((job, index) => {
      trackImpression(job.id, query, index + 1)
    })
  }, [filteredJobs, searchQuery, trackImpression])

  // Job selection handlers
  const selectJob = async (job: Job) => {
    // trackJobView increments jobs.views itself. The direct RPC that used to
    // sit here doubled every click. See the note in the ?id= effect above.
    trackJobView(job.id, 'search')
    setSelectedJob(job)
    router.push(`/jobs?id=${job.id}`, { scroll: false })
  }

  const closeJobModal = () => {
    setSelectedJob(null)
    const fromParam = searchParams.get('from')
    router.push(fromParam === 'my-jobs' ? '/my-jobs' : '/jobs', { scroll: false })
  }

  const navigateToJob = (direction: 'prev' | 'next') => {
    if (!selectedJob) return
    const currentIndex = filteredJobs.findIndex(j => j.id === selectedJob.id)
    const newIndex = direction === 'prev' ? currentIndex - 1 : currentIndex + 1
    if (newIndex >= 0 && newIndex < filteredJobs.length) {
      setSelectedJob(filteredJobs[newIndex])
    }
  }

  const getCurrentJobIndex = () => {
    if (!selectedJob) return -1
    return filteredJobs.findIndex(j => j.id === selectedJob.id)
  }

  const getGoogleMapsUrl = (job: Job) => {
    let locationString: string
    if (job.fullLocation?.addressLine1) {
      const parts = [job.fullLocation.addressLine1, job.fullLocation.addressLine2, job.fullLocation.city, job.fullLocation.postcode].filter(Boolean)
      locationString = parts.join(', ')
    } else {
      locationString = [job.location, job.area].filter(Boolean).join(', ')
    }
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(locationString)}`
  }

  const formatSalaryFull = (job: Job) => {
    if (!job.salaryMin && !job.salaryMax) return 'Competitive salary'
    const negotiable = (job.tags || []).includes('Salary negotiable') ? ' (negotiable)' : ''
    const single = !job.salaryMax || job.salaryMin === job.salaryMax
    if (job.salaryPeriod === 'hour') {
      return single ? `£${job.salaryMin} per hour${negotiable}` : `£${job.salaryMin} - £${job.salaryMax} per hour${negotiable}`
    }
    return single
      ? `£${job.salaryMin.toLocaleString()} per year${negotiable}`
      : `£${job.salaryMin.toLocaleString()} - £${job.salaryMax.toLocaleString()} per year${negotiable}`
  }

  const renderDescription = (text: string) => {
    if (typeof window !== 'undefined' && text.includes('<') && text.includes('>')) {
      const DOMPurify = require('dompurify')
      const clean = DOMPurify.sanitize(text, {
        ALLOWED_TAGS: ['h2', 'h3', 'h4', 'p', 'br', 'strong', 'em', 'u', 'ul', 'ol', 'li', 'a', 'blockquote'],
        ALLOWED_ATTR: ['href', 'target', 'rel', 'style'],
      })
      return <div dangerouslySetInnerHTML={{ __html: clean }} />
    }
    return text.split('\n').map((paragraph, index) => {
      if (paragraph.startsWith('**') && paragraph.endsWith('**')) {
        return <h4 key={index} style={{ fontWeight: 700, margin: '1rem 0 0.5rem' }}>{paragraph.slice(2, -2)}</h4>
      }
      if (paragraph.trim() === '') return <br key={index} />
      return <p key={index} style={{ margin: '0 0 0.5rem', lineHeight: 1.6 }}>{paragraph}</p>
    })
  }

  const clearFilters = () => {
    setSearchQuery('')
    setLocationQuery('')
    setDebouncedLocationQuery('')
    setLocationRadius(null)
    setLocationCoords(null)
    setActiveCategory('all')
    setFilters(emptyFilters())
    setQuickWorkStyle(null)
    setQuickExperienceLevel('')
  }

  // Apply flow handlers
  const handleApply = () => {
    if (!selectedJob) return
    if (!isLoggedIn) {
      router.push(`/login/employee?redirect=${encodeURIComponent(`/jobs?id=${selectedJob.id}`)}`)
      return
    }
    if (currentUserRole === 'employer') {
      alert("You can't apply to jobs as an employer")
      return
    }
    if (hasApplied) return
    trackClickEvent(selectedJob.id, 'apply_click')
    setScreeningAnswers({})
    setShowApplyModal(true)
  }

  const submitApplication = async () => {
    if (!selectedJob) return

    // Validate required screening questions
    const questions = selectedJob.screeningQuestions || []
    for (const q of questions) {
      if (q.required && !(screeningAnswers[q.id] || '').trim()) {
        alert('Please answer all required screening questions before applying.')
        return
      }
    }

    setIsSubmitting(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) throw new Error('Not authenticated')

      const candidateName = session.user.user_metadata?.full_name || 'Candidate'

      // Build screening answers array
      const answersPayload = questions
        .filter(q => (screeningAnswers[q.id] || '').trim())
        .map(q => ({
          questionId: q.id,
          question: q.question,
          answer: (screeningAnswers[q.id] || '').trim(),
        }))

      // 1. Insert into job_applications
      const { error: insertError } = await supabase
        .from('job_applications')
        .insert({
          job_id: selectedJob.id,
          candidate_id: session.user.id,
          status: 'pending',
          cover_letter: coverLetter || null,
          job_title: selectedJob.title,
          company: selectedJob.company,
          screening_answers: answersPayload.length > 0 ? answersPayload : null,
        })
      if (insertError) {
        console.warn('Supabase insert warning:', insertError.message)
      }

      // Increment application_count on the job. Supabase v2 rpc() returns a
      // thenable, not a Promise — using .catch() throws TypeError synchronously
      // and aborts the rest of this function. Use .then(_, errHandler) instead.
      ;(supabase as any).rpc('increment_application_count', { p_job_id: selectedJob.id }).then(undefined, () => {})

      // 2. Send notification to employer (the route finds the application this
      //    caller just created from the job + candidate relationship)
      await notify('applied', { jobId: selectedJob.id })

      // 3. Send email to employer via API route (non-blocking)
      fetch('/api/send-application-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jobTitle: selectedJob.title,
          company: selectedJob.company,
          employerId: selectedJob.employerId,
          candidateName,
          candidateEmail: session.user.email,
          coverLetter: coverLetter || '',
        }),
      }).catch(() => console.warn('Failed to send application email'))

      // 4. Auto-message to employer
      const autoMessage = `Hi, I've just applied for the ${selectedJob.title} position at ${selectedJob.company}. I'm very interested in this opportunity and would love to discuss it further. Please feel free to review my profile and CV. Thank you!`

      if (selectedJob.employerId) {
        try {
          const { data: employerProfile } = await supabase
            .from('employer_profiles')
            .select('company_name')
            .eq('user_id', selectedJob.employerId)
            .maybeSingle()

          const employerName = employerProfile?.company_name || selectedJob.company

          // Check for existing conversation before creating a new one
          const { data: existingConv } = await supabase
            .from('conversations')
            .select('id')
            .or(`and(participant_1.eq.${session.user.id},participant_2.eq.${selectedJob.employerId}),and(participant_1.eq.${selectedJob.employerId},participant_2.eq.${session.user.id})`)
            .eq('related_job_id', selectedJob.id)
            .maybeSingle()

          let convData = existingConv

          if (!convData) {
            const { data: newConv, error: convError } = await supabase
              .from('conversations')
              .insert({
                participant_1: session.user.id,
                participant_2: selectedJob.employerId,
                participant_1_name: candidateName,
                participant_1_role: 'candidate',
                participant_2_name: employerName,
                participant_2_role: 'employer',
                participant_2_company: selectedJob.company,
                related_job_id: selectedJob.id,
                related_job_title: selectedJob.title,
                last_message: autoMessage,
                last_message_at: new Date().toISOString(),
              })
              .select()
              .single()

            if (convError) {
              console.warn('Failed to create conversation:', convError.message)
            }
            convData = newConv
          } else {
            // Update existing conversation with latest message
            await supabase
              .from('conversations')
              .update({ last_message: autoMessage, last_message_at: new Date().toISOString() })
              .eq('id', convData.id)
          }

          if (convData) {
            await supabase
              .from('messages')
              .insert({
                conversation_id: convData.id,
                sender_id: session.user.id,
                sender_name: candidateName,
                sender_role: 'candidate',
                content: autoMessage,
                is_read: false,
              })

            const newConv: Conversation = {
              id: convData.id,
              connectionId: convData.id,
              participantId: selectedJob.employerId,
              participantName: employerName,
              participantRole: 'employer',
              participantCompany: selectedJob.company,
              participantProfilePicture: selectedJob.companyLogo || null,
              lastMessage: autoMessage,
              lastMessageAt: new Date().toISOString(),
              unreadCount: 0,
              isOnline: false,
              participantJobTitle: selectedJob.title,
            }
            addConversation(newConv)
          }
        } catch (convErr) {
          console.warn('Auto-message failed (non-blocking):', convErr)
        }
      }

      setHasApplied(true)
      setApplicationSubmitted(true)
      if (selectedJob) setAppliedJobIds(prev => { const next = new Set(prev); next.add(selectedJob.id); return next })
    } catch (err) {
      console.error('Application error:', err)
      alert('Failed to submit application. Please try again.')
    } finally {
      setIsSubmitting(false)
    }
  }

  const formatSalary = (job: Job) => {
    if (!job.salaryMin && !job.salaryMax) return 'Competitive salary'
    const negotiable = (job.tags || []).includes('Salary negotiable') ? ' (negotiable)' : ''
    const single = !job.salaryMax || job.salaryMin === job.salaryMax
    if (job.salaryPeriod === 'hour') {
      return single ? `£${job.salaryMin}/hr${negotiable}` : `£${job.salaryMin}-${job.salaryMax}/hr${negotiable}`
    }
    return single
      ? `£${(job.salaryMin / 1000).toFixed(0)}k/year${negotiable}`
      : `£${(job.salaryMin / 1000).toFixed(0)}k-${(job.salaryMax / 1000).toFixed(0)}k/year${negotiable}`
  }

  const getTagStyle = (index: number) => {
    const tagStyles = [styles.tagGreen, styles.tagBlue, styles.tagYellow]
    return tagStyles[index % tagStyles.length]
  }

  // Candidate personalisation
  const [candidatePrefs, setCandidatePrefs] = useState<{ sector?: string; jobTypes?: string[]; workPrefs?: string[] } | null>(null)
  const [prefsBannerDismissed, setPrefsBannerDismissed] = useState(false)
  // Messages for preferences the board could not honour. Empty is the normal
  // case and says nothing; a candidate only ever sees this when one of their
  // choices would have shown them an empty page.
  const [relaxedPrefs, setRelaxedPrefs] = useState<string[]>([])

  useEffect(() => {
    if (currentUserRole !== 'employee') return
    // "Browse all" entry (e.g. the dashboard "View All"): show every job, do NOT
    // pre-apply the candidate's profile filters or the matching-profile banner.
    if (searchParams.get('browse') === 'all') return
    const dismissed = sessionStorage.getItem('hex_prefs_banner_dismissed')
    if (dismissed) setPrefsBannerDismissed(true)

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) return
      supabase.from('candidate_profiles')
        .select('job_sector, preferred_job_types, work_location_preferences')
        .eq('user_id', session.user.id)
        .maybeSingle()
        .then(({ data }) => {
          if (data) {
            setCandidatePrefs({
              sector: data.job_sector || undefined,
              jobTypes: data.preferred_job_types || [],
              workPrefs: data.work_location_preferences || [],
            })
            // The preferences are only READ here. Deciding which of them the
            // board can honour happens in its own effect below, once there is
            // a board to test them against — see the comment there.
          }
        })
    })
  }, [currentUserRole])

  /**
   * DECIDE WHICH PREFERENCES THE BOARD CAN ACTUALLY HONOUR.
   *
   * Separate from the fetch above, and it has to be. That effect depends on
   * [currentUserRole], so it runs while `jobs` is still empty — and a
   * preference tested against an empty list can only ever look impossible.
   * The old sector guard (`jobs.some(...)`) sat inside that same effect and
   * had exactly this flaw, which is why the sector pre-set almost never fired
   * while the unguarded work-style one always did.
   *
   * So: read the profile there, decide here, once both are in hand.
   *
   * ONCE ONLY. `prefsApplied` stops this fighting the candidate — without it,
   * every refetch of the board would re-apply a preference they had just
   * cleared by hand, which is a worse bug than the one being fixed.
   */
  const prefsApplied = useRef(false)
  useEffect(() => {
    if (prefsApplied.current) return
    if (!candidatePrefs) return
    if (jobs.length === 0) return

    const wp = (candidatePrefs.workPrefs || [])
      .find((p: string) => normaliseWorkLocation(p) !== null)
    const sectorMatch = candidatePrefs.sector
      ? categories.find(c => c.id === candidatePrefs.sector)
      : undefined

    const wanted: PrefFilter<Job>[] = []
    if (activeCategory === 'all' && sectorMatch) {
      wanted.push(sectorPref<Job>(sectorMatch.id, sectorMatch.label))
    }
    if (!quickWorkStyle && wp) wanted.push(workStylePref<Job>(wp))
    if (wanted.length === 0) { prefsApplied.current = true; return }

    const resolved = resolvePrefFilters(jobs, wanted)
    if (resolved.undecided) return   // board not loaded — say nothing, decide nothing

    for (const pref of resolved.applied) {
      if (pref.key === 'sector' && sectorMatch) setActiveCategory(sectorMatch.id)
      if (pref.key === 'workStyle') setQuickWorkStyle(pref.value)
    }
    setRelaxedPrefs(resolved.relaxed.map(p => p.message))
    prefsApplied.current = true
  }, [candidatePrefs, jobs, activeCategory, quickWorkStyle])

  const dismissPrefsBanner = () => {
    setPrefsBannerDismissed(true)
    sessionStorage.setItem('hex_prefs_banner_dismissed', '1')
  }

  return (
    <main className="no-pad">
      <Header />

      {/* Search Section */}
      <div className={styles.searchSection}>
        <div className={styles.searchInner}>
          <h1 className={styles.pageTitle}>
            {currentUserRole === 'employer' ? 'Browse Job Listings' : 'Find Your Next Role'}
          </h1>
          <div className={styles.searchBar}>
            <div className={styles.searchInputWrap}>
              <input
                type="text"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="Job title or keyword"
                className={styles.searchInput}
              />
              {searchQuery && (
                <button className={styles.searchClear} onClick={() => setSearchQuery('')}>✕</button>
              )}
            </div>
            <div className={styles.searchInputWrap}>
              <input
                type="text"
                value={locationQuery}
                onChange={e => {
                  setLocationQuery(e.target.value)
                  if (!e.target.value) { setLocationRadius(null); setLocationCoords(null) }
                }}
                placeholder="City, town or postcode"
                className={styles.searchInput}
              />
              {geocodingLocation && <span className={styles.searchSpinner} />}
              {locationQuery && !geocodingLocation && (
                <button className={styles.searchClear} onClick={() => { setLocationQuery(''); setLocationRadius(null); setLocationCoords(null) }}>✕</button>
              )}
            </div>
          </div>
          {locationQuery && (
            <div className={styles.radiusOptions}>
              {([null, 10, 25, 50] as const).map(r => (
                <button
                  key={r ?? 'any'}
                  className={`${styles.filterPill} ${locationRadius === r ? styles.filterPillActive : ''}`}
                  onClick={() => setLocationRadius(r)}
                >
                  {r === null ? 'Any distance' : `Within ${r} mi`}
                </button>
              ))}
            </div>
          )}
        </div>
        <div className={styles.quickLinks}>
          <button className={styles.filterPill} onClick={clearFilters}>Browse All Jobs</button>
          <Link href="/jobs/recommended" className={styles.filterPill}>Jobs For You →</Link>
        </div>
      </div>

      {/* Filter Strip — sticky */}
      <div className={styles.filterStrip}>
        <div className={styles.filterStripInner}>
          <div className={styles.filterStripLeft}>
            {WORK_LOCATIONS.map(ws => (
              <button
                key={ws}
                className={`${styles.filterPill} ${quickWorkStyle === ws ? styles.filterPillActive : ''}`}
                onClick={() => setQuickWorkStyle(quickWorkStyle === ws ? null : ws)}
              >
                {ws}
              </button>
            ))}
            <select
              value={quickExperienceLevel}
              onChange={e => setQuickExperienceLevel(e.target.value)}
              className={`${styles.filterSelect} ${quickExperienceLevel ? styles.filterSelectActive : ''}`}
            >
              <option value="">Experience level</option>
              <option value="No experience required">No experience</option>
              <option value="Entry level">Entry level</option>
              <option value="Mid level">Mid level</option>
              <option value="Senior level">Senior level</option>
              <option value="Management">Management</option>
            </select>
            <button
              className={`${styles.filterPill} ${sectorsExpanded ? styles.filterPillActive : ''}`}
              onClick={() => setSectorsExpanded(!sectorsExpanded)}
            >
              Sectors {activeCategory !== 'all' ? `· ${categories.find(c => c.id === activeCategory)?.label}` : ''} ▾
            </button>
            <button
              className={`${styles.filterPill} ${filtersExpanded ? styles.filterPillActive : ''}`}
              onClick={() => setFiltersExpanded(!filtersExpanded)}
            >
              More filters{activeFilterCount > 0 ? ` (${activeFilterCount})` : ''} ▾
            </button>
          </div>
          <div className={styles.filterStripRight}>
            <span className={styles.jobCount}>{filteredJobs.length} jobs</span>
            {(activeFilterCount > 0 || searchQuery || locationQuery || activeCategory !== 'all' || quickWorkStyle || quickExperienceLevel) && (
              <button className={styles.clearFiltersBtn} onClick={clearFilters}>Clear filters</button>
            )}
          </div>
        </div>

        {/* Active filter chips — removable, beneath the one-line strip */}
        {(activeCategory !== 'all' || quickWorkStyle || quickExperienceLevel || activeFilterCount > 0) && (
          <div className={styles.activeChips}>
            {activeCategory !== 'all' && (
              <button className={styles.activeChip} onClick={() => setActiveCategory('all')}>
                {categories.find(c => c.id === activeCategory)?.label}<span aria-hidden="true">✕</span>
              </button>
            )}
            {quickWorkStyle && (
              <button className={styles.activeChip} onClick={() => setQuickWorkStyle(null)}>
                {quickWorkStyle}<span aria-hidden="true">✕</span>
              </button>
            )}
            {quickExperienceLevel && (
              <button className={styles.activeChip} onClick={() => setQuickExperienceLevel('')}>
                {quickExperienceLevel}<span aria-hidden="true">✕</span>
              </button>
            )}
            {filterSections.map(section => Array.from(filters[section.key]).map(option => (
              <button key={`${section.key}-${option}`} className={styles.activeChip} onClick={() => toggleFilter(section.key, option)}>
                {option}<span aria-hidden="true">✕</span>
              </button>
            )))}
          </div>
        )}
      </div>

      {/* Filter overlays — float ON TOP (popover on desktop, bottom sheet on
          mobile); fixed-position so the page height never changes when open. */}
      {(sectorsExpanded || filtersExpanded) && (
        <div className={styles.filterBackdrop} onClick={() => { setSectorsExpanded(false); setFiltersExpanded(false) }} />
      )}
      {sectorsExpanded && (
        <div className={styles.filterOverlay} role="dialog" aria-label="Sectors" aria-modal="true">
          <div className={styles.filterOverlayHead}>
            <span>Sectors</span>
            <button className={styles.filterOverlayClose} onClick={() => setSectorsExpanded(false)} aria-label="Close">✕</button>
          </div>
          <div className={styles.filterOverlayBody}>
            <div className={styles.filterGroupOptions}>
              {categories.map(category => (
                <button
                  key={category.id}
                  className={`${styles.filterPill} ${activeCategory === category.id ? styles.filterPillActive : ''}`}
                  onClick={() => { setActiveCategory(category.id); setSectorsExpanded(false) }}
                >
                  {category.label}
                </button>
              ))}
            </div>
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
            {filterSections.map(section => (
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
            <button className={styles.filterOverlayClear} onClick={clearFilters}>Clear all</button>
            <button className={styles.filterOverlayApply} onClick={() => setFiltersExpanded(false)}>Show {filteredJobs.length} jobs</button>
          </div>
        </div>
      )}

      {/* Personalisation Banner */}
      {/* RELAXED PREFERENCES ARE ANNOUNCED, NOT SWALLOWED.
          The condition includes relaxedPrefs deliberately: a candidate whose
          ONLY preference was dropped has no active filter, so the old
          condition would have hidden the banner and left them wondering why
          they were looking at on-site roles they never asked for. The whole
          point of relaxing rather than suppressing is that they get told. */}
      {candidatePrefs && !prefsBannerDismissed && (activeCategory !== 'all' || quickWorkStyle || relaxedPrefs.length > 0) && (
        <div className={styles.prefsBanner}>
          <span>
            {relaxedPrefs.length > 0
              ? relaxedPrefs.join(' ')
              : 'Showing jobs matching your profile'}
          </span>
          <Link href="/settings/profile" className={styles.prefsBannerLink}>Edit preferences</Link>
          <button className={styles.prefsBannerClose} onClick={dismissPrefsBanner}>✕</button>
        </div>
      )}

      {/* Job Card Grid */}
      <div className={styles.jobsContainer}>
        {/* Loading state — only while the first fetch is in flight (jobs still
            empty). Prevents the "No jobs match your search" empty state from
            flashing during load; a background refresh keeps the current list. */}
        {loading && jobs.length === 0 ? (
          <div className={styles.emptyState}>
            <div className={styles.emptyIcon}>
              <svg width="60" height="60" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="11" cy="11" r="8" />
                <path d="M21 21l-4.35-4.35" />
              </svg>
            </div>
            <h2 className={styles.emptyTitle}>Loading roles…</h2>
          </div>
        ) : filteredJobs.length > 0 ? (
          <div className={styles.jobsGrid} ref={listRef}>
            {filteredJobs.map(job => (
              <JobCard
                key={job.id}
                job={job}
                onSelect={selectJob}
                saved={isSaved(job.id)}
                onToggleSave={j => { if (!isSaved(j.id)) trackClickEvent(j.id, 'save_click'); toggleSave(j.id) }}
                applied={appliedJobIds.has(job.id)}
                shortlisted={shortlistedJobIds.has(job.id)}
                boosted={boostedJobIds.has(job.id)}
              />
            ))}
          </div>
        ) : (
          <div className={styles.emptyState}>
            <div className={styles.emptyIcon}>
              <svg width="60" height="60" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="11" cy="11" r="8" />
                <path d="M21 21l-4.35-4.35" />
              </svg>
            </div>
            <h2 className={styles.emptyTitle}>No jobs match your search</h2>
            <p className={styles.emptyText}>Try adjusting your filters or search terms</p>
            <button className={styles.browseBtn} onClick={clearFilters}>
              Clear all filters
            </button>
          </div>
        )}
      </div>

      {/* Job Detail Slide-in Modal */}
      {selectedJob && (
        <>
          <div className={styles.modalOverlay} onClick={closeJobModal} />
          <div className={styles.modalPanel}>
            <JobPostingSchema job={selectedJob} />
            <div className={styles.modalHeader}>
              <div className={styles.modalNav}>
                <button
                  className={styles.modalNavBtn}
                  onClick={() => navigateToJob('prev')}
                  disabled={getCurrentJobIndex() <= 0}
                >←</button>
                <button
                  className={styles.modalNavBtn}
                  onClick={() => navigateToJob('next')}
                  disabled={getCurrentJobIndex() >= filteredJobs.length - 1}
                >→</button>
              </div>
              <button className={styles.modalClose} onClick={closeJobModal}>✕</button>
            </div>

            <div className={styles.modalBody}>
              {(() => {
                // Banner cascade so the detail header is never bare (incl. jobs
                // saved without a banner, like Goldenkeys "Head Chef").
                const detailBanner = resolveJobBanner({ id: selectedJob.id, companyBanner: selectedJob.companyBanner, company: selectedJob.company, category: selectedJob.category })
                return (
                  <div className={styles.detailBanner}>
                    {detailBanner
                      ? <img src={detailBanner} alt={selectedJob.company} className={styles.detailBannerImg} />
                      : <BrandedJobFallback
                          company={selectedJob.company}
                          brandColour={selectedJob.brandColour}
                          quote={selectQuote(selectedJob)}
                          tags={selectedJob.tags}
                          variant="header"
                        />}
                  </div>
                )
              })()}

              <div className={styles.detailHeader}>
                <h1 className={styles.detailTitle}>{selectedJob.title}</h1>
                <p className={styles.detailCompany}>{selectedJob.company}</p>
                {selectedJob.companyWebsite && (
                  <a href={selectedJob.companyWebsite.startsWith('http') ? selectedJob.companyWebsite : `https://${selectedJob.companyWebsite}`} target="_blank" rel="noopener noreferrer" className={styles.detailWebsite}>
                    <Ico name="globe" size={16} /> {selectedJob.companyWebsite.replace(/^https?:\/\//, '')}
                  </a>
                )}
                <a href={getGoogleMapsUrl(selectedJob)} target="_blank" rel="noopener noreferrer" className={styles.detailLocation}>
                  <Ico name="map-pin" size={16} /> {selectedJob.fullLocation?.addressLine1
                    ? `${selectedJob.fullLocation.addressLine1}, ${selectedJob.fullLocation.city} ${selectedJob.fullLocation.postcode}`
                    : [selectedJob.location, selectedJob.area].filter(Boolean).join(', ')}
                </a>
                <p className={styles.detailSalary}>{formatSalaryFull(selectedJob)}</p>
                {selectedJob.expiresDate && (() => {
                  const daysLeft = Math.ceil((new Date(selectedJob.expiresDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24))
                  if (daysLeft <= 7 && daysLeft >= 0) {
                    return <p className={styles.detailExpiry}>⏰ Closes in {daysLeft === 0 ? 'today' : `${daysLeft} day${daysLeft === 1 ? '' : 's'}`}</p>
                  }
                  return null
                })()}
                <div className={styles.detailBadges}>
                  {Array.isArray(selectedJob.employmentType)
                    ? selectedJob.employmentType.map((type, i) => <span key={i} className={styles.detailBadge}>{type}</span>)
                    : selectedJob.employmentType && <span className={styles.detailBadge}>{selectedJob.employmentType}</span>
                  }
                  {selectedJob.urgent && <span className={`${styles.detailBadge} ${styles.detailBadgeUrgent}`}>Urgent</span>}
                </div>
                {selectedJob.tags && selectedJob.tags.length > 0 && (
                  <div className={styles.detailTags}>
                    {selectedJob.tags.map(tag => {
                      const cat = getTagCategory(tag)
                      return <span key={tag} className={`${styles.detailTag} ${cat ? styles[`detailTag_${cat}`] : ''}`}>{tag}</span>
                    })}
                  </div>
                )}
              </div>

              <div className={styles.detailActions}>
                <button
                  className={`${styles.detailApplyBtn} ${hasApplied ? styles.detailAppliedBtn : ''}`}
                  onClick={handleApply}
                  disabled={hasApplied || checkingApplied}
                >
                  {checkingApplied ? 'Checking...' : hasApplied ? 'Applied ✓' : 'Apply Now'}
                </button>
                <button
                  className={`${styles.detailSaveBtn} ${isSaved(selectedJob.id) ? styles.detailSavedBtn : ''}`}
                  onClick={() => { if (!isSaved(selectedJob.id)) trackClickEvent(selectedJob.id, 'save_click'); toggleSave(selectedJob.id) }}
                >
                  {isSaved(selectedJob.id) ? 'Saved ✓' : 'Save Job'}
                </button>
              </div>

              <div className={styles.detailSection}>
                <h2 className={styles.detailSectionTitle}>Job Details</h2>
                <div className={styles.detailGrid}>
                  <div className={styles.detailGridItem}><span className={styles.detailGridLabel}>Pay</span><span className={styles.detailGridValue}>{formatSalaryFull(selectedJob)}</span></div>
                  <div className={styles.detailGridItem}><span className={styles.detailGridLabel}>Job type</span><span className={styles.detailGridValue}>{Array.isArray(selectedJob.employmentType) ? selectedJob.employmentType.join(', ') : selectedJob.employmentType || 'Not specified'}</span></div>
                  <div className={styles.detailGridItem}><span className={styles.detailGridLabel}>Shift & schedule</span><span className={styles.detailGridValue}>{selectedJob.shiftSchedule || 'Not specified'}</span></div>
                  <div className={styles.detailGridItem}><span className={styles.detailGridLabel}>Work location</span><span className={styles.detailGridValue}>{selectedJob.workLocationType || 'In person'}</span></div>
                </div>
              </div>

              {selectedJob.benefits && selectedJob.benefits.length > 0 && (
                <div className={styles.detailSection}>
                  <h2 className={styles.detailSectionTitle}>Benefits</h2>
                  <ul className={styles.detailBenefits}>{selectedJob.benefits.map((b, i) => <li key={i}>✓ {b}</li>)}</ul>
                </div>
              )}

              {(() => {
                const raw = (selectedJob.fullDescription || selectedJob.description || '').replace(/<[^>]*>/g, '').trim()
                const isPlaceholder = /^join .+ as an? .+\.\s*apply now on thrive\.?$/i.test(raw)
                if (!raw || isPlaceholder) return null
                return (
                <div className={styles.detailSection}>
                  <h2 className={styles.detailSectionTitle}>Full Job Description</h2>
                  <div className={styles.detailDescription}>{renderDescription(selectedJob.fullDescription || selectedJob.description)}</div>
                </div>
                )
              })()}

              {selectedJob.requirements && selectedJob.requirements.length > 0 && (
                <div className={styles.detailSection}>
                  <h2 className={styles.detailSectionTitle}>Requirements</h2>
                  <ul className={styles.detailList}>{selectedJob.requirements.map((item, i) => <li key={i}>{item}</li>)}</ul>
                </div>
              )}

              {selectedJob.skillsRequired && selectedJob.skillsRequired.length > 0 && (
                <div className={styles.detailSection}>
                  <h2 className={styles.detailSectionTitle}>Skills Required</h2>
                  <div className={styles.detailSkills}>{selectedJob.skillsRequired.map((s, i) => <span key={i} className={styles.detailSkillTag}>{s}</span>)}</div>
                </div>
              )}

              <div className={styles.detailSection}>
                <h3 className={styles.detailSectionTitle}>Reviews for {selectedJob.company}</h3>
                <CompanyReviewsSummary companyName={selectedJob.company} />
              </div>

              <div className={styles.detailFooter}>
                <p>Posted {selectedJob.postedAt}</p>
                {selectedJob.applicationCount > 0 && <p>{selectedJob.applicationCount} applicants</p>}
                {selectedJob.category && <p>Category: {selectedJob.category}</p>}
              </div>
            </div>
          </div>
        </>
      )}

      {/* Apply Modal Overlay */}
      {showApplyModal && selectedJob && (
        <div className={styles.applyOverlay} onClick={(e) => { if (e.target === e.currentTarget) setShowApplyModal(false) }}>
          <div className={styles.applyModal}>
            {!applicationSubmitted ? (
              <>
                <div className={styles.applyHeader}>
                  <h2>Apply to {selectedJob.company}</h2>
                  <button className={styles.applyClose} onClick={() => setShowApplyModal(false)}>×</button>
                </div>
                <div className={styles.applyBody}>
                  <div className={styles.applyJobInfo}>
                    <h3>{selectedJob.title}</h3>
                    <p>{selectedJob.location} • {formatSalaryFull(selectedJob)}</p>
                  </div>
                  <div className={styles.applyField}>
                    <label>Cover Letter (optional)</label>
                    <textarea
                      value={coverLetter}
                      onChange={(e) => setCoverLetter(e.target.value)}
                      placeholder="Tell the employer why you're a great fit for this role..."
                      rows={6}
                      style={{ fontSize: '1rem' }}
                    />
                  </div>
                  {/* Screening Questions */}
                  {selectedJob.screeningQuestions && selectedJob.screeningQuestions.length > 0 && (
                    <div className={styles.applyField}>
                      <label style={{ fontWeight: 600, marginBottom: '0.5rem', display: 'block' }}>Screening Questions</label>
                      {selectedJob.screeningQuestions.map(q => (
                        <div key={q.id} style={{ marginBottom: '0.75rem' }}>
                          <p style={{ fontSize: '0.9rem', color: '#1e293b', margin: '0 0 0.375rem', fontWeight: 500 }}>
                            {q.question}{q.required && <span style={{ color: '#ef4444' }}> *</span>}
                          </p>
                          <textarea
                            value={screeningAnswers[q.id] || ''}
                            onChange={e => setScreeningAnswers(prev => ({ ...prev, [q.id]: e.target.value }))}
                            placeholder="Your answer..."
                            rows={2}
                            style={{ fontSize: '0.95rem', width: '100%' }}
                          />
                        </div>
                      ))}
                    </div>
                  )}

                  <div className={styles.applyCvSection}>
                    <p className={styles.applyCvNote}>Your profile CV will be attached automatically. Make sure it&apos;s up to date!</p>
                    <Link href="/cv-builder" className={styles.applyUpdateCvLink}>Update your CV →</Link>
                  </div>
                </div>
                <div className={styles.applyFooter}>
                  <button className={styles.applySubmitBtn} onClick={submitApplication} disabled={isSubmitting}>
                    {isSubmitting ? 'Submitting...' : 'Submit Application'}
                  </button>
                </div>
              </>
            ) : (
              <div className={styles.applySuccess}>
                <div className={styles.applySuccessIcon}>✓</div>
                <h2>Application Submitted!</h2>
                <p>Your application has been sent to {selectedJob.company}.</p>
                <p className={styles.applySuccessNote}>They will contact you if they&apos;re interested.</p>
                <button className={styles.applySuccessBtn} onClick={() => setShowApplyModal(false)}>Continue Browsing</button>
              </div>
            )}
          </div>
        </div>
      )}
    </main>
  )
}

export default function JobsPage() {
  return (
    <Suspense fallback={
      <main className="no-pad">
        <Header />
        <div style={{ textAlign: 'center', padding: '4rem' }}>
          Loading jobs...
        </div>
      </main>
    }>
      <JobsPageContent />
    </Suspense>
  )
}

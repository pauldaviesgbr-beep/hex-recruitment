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
import { useSavedJobs } from '@/lib/useSavedJobs'
import { getTagCategory } from '@/lib/jobTags'
import { Boost } from '@/lib/boostTypes'
import CompanyReviewsSummary from '@/components/CompanyReviewsSummary'
import CompanyLogo from '@/components/CompanyLogo'
import JobPostingSchema from '@/components/JobPostingSchema'
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
  { key: 'employmentType' as const, title: 'Employment Type', options: ['Full-time', 'Part-time', 'Contract', 'Temporary', 'Freelance', 'Internship', 'Apprenticeship'] },
  { key: 'experienceLevel' as const, title: 'Experience Level', options: ['No experience required', 'Entry level (0-2 years)', 'Mid level (3-5 years)', 'Senior (6-10 years)', 'Executive (10+ years)'] },
  { key: 'salaryRange' as const, title: 'Salary Range', options: ['Under £20k', '£20k-£30k', '£30k-£40k', '£40k-£50k', '£50k-£75k', '£75k-£100k', '£100k+'] },
  { key: 'postedDate' as const, title: 'Posted Date', options: ['Last 24 hours', 'Last 3 days', 'Last 7 days', 'Last 14 days', 'Last 30 days'] },
  { key: 'workArrangement' as const, title: 'Work Arrangement', options: ['On-site', 'Remote', 'Hybrid'] },
  { key: 'tags' as const, title: 'Job Tags', options: ['Immediate start', 'Urgent hire', 'No experience required', 'Entry level', 'Remote', 'Flexible hours', 'Training provided', 'Free meals', 'Staff discount', 'Career progression', 'Easy apply', 'Visa sponsorship'] },
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

const categories = [
  { id: 'all', label: 'All Jobs' },
  { id: 'accountancy', label: 'Accountancy Banking & Finance' },
  { id: 'business', label: 'Business Consulting & Management' },
  { id: 'charity', label: 'Charity & Voluntary Work' },
  { id: 'creative', label: 'Creative Arts & Design' },
  { id: 'digital', label: 'Digital & Information Technology' },
  { id: 'energy', label: 'Energy & Utilities' },
  { id: 'engineering', label: 'Engineering & Manufacturing' },
  { id: 'environment', label: 'Environment & Agriculture' },
  { id: 'healthcare', label: 'Healthcare & Social Care' },
  { id: 'hospitality', label: 'Hospitality Tourism & Sport' },
  { id: 'law', label: 'Law & Legal Services' },
  { id: 'marketing', label: 'Marketing Advertising & PR' },
  { id: 'media', label: 'Media & Internet' },
  { id: 'property', label: 'Property & Construction' },
  { id: 'public', label: 'Public Services & Administration' },
  { id: 'recruitment', label: 'Recruitment & HR' },
  { id: 'retail', label: 'Retail & Sales' },
  { id: 'science', label: 'Science & Pharmaceuticals' },
  { id: 'teaching', label: 'Teaching & Education' },
  { id: 'transport', label: 'Transport & Logistics' },
]

// Map job data to sector categories
const getJobSector = (job: { title: string; category?: string }): string => {
  const titleLower = job.title.toLowerCase()
  const catLower = (job.category || '').toLowerCase()

  // Hospitality Tourism & Sport
  if (['restaurant', 'hotel', 'cafe', 'contract catering', 'events', 'chef', 'waiter', 'bar', 'kitchen', 'barista', 'fastfood'].some(k => catLower.includes(k)))
    return 'hospitality'
  if (['chef', 'cook', 'waiter', 'waitress', 'bartender', 'bar ', 'barista', 'kitchen porter', 'porter', 'housekeeper', 'concierge', 'hotel', 'event', 'banquet', 'catering', 'sushi', 'server', 'host', 'coffee', 'restaurant', 'sommelier'].some(k => titleLower.includes(k)))
    return 'hospitality'

  // Direct sector category match (for jobs posted with sector categories)
  const sectorIds = ['accountancy', 'business', 'charity', 'creative', 'digital', 'energy', 'engineering', 'environment', 'healthcare', 'law', 'marketing', 'media', 'property', 'public', 'recruitment', 'retail', 'science', 'teaching', 'transport']
  if (sectorIds.includes(catLower)) return catLower

  // Management roles
  if (['manager', 'head', 'supervisor', 'director', 'consultant'].some(k => titleLower.includes(k)))
    return 'business'

  // Healthcare
  if (['nurse', 'doctor', 'care', 'health', 'medical', 'pharmacy', 'dental'].some(k => titleLower.includes(k)))
    return 'healthcare'

  // Digital & IT
  if (['developer', 'software', 'engineer', 'data', 'analyst', 'devops', 'cloud', 'cyber', 'tech'].some(k => titleLower.includes(k)))
    return 'digital'

  // Retail & Sales
  if (['sales', 'retail', 'shop', 'store', 'cashier', 'merchandis'].some(k => titleLower.includes(k)))
    return 'retail'

  // Teaching & Education
  if (['teacher', 'tutor', 'lecturer', 'education', 'training'].some(k => titleLower.includes(k)))
    return 'teaching'

  // Marketing
  if (['marketing', 'advertising', 'pr ', 'social media', 'content', 'brand'].some(k => titleLower.includes(k)))
    return 'marketing'

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

  // Default to hospitality since most legacy mock data is hospitality
  return 'hospitality'
}

function JobsPageContent() {
  const { jobs } = useJobs()
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
  const [hasApplied, setHasApplied] = useState(false)
  const [checkingApplied, setCheckingApplied] = useState(false)
  const [currentUserRole, setCurrentUserRole] = useState<string | null>(null)
  const [applicationStatus, setApplicationStatus] = useState<string | null>(null)
  const [shortlistedJobIds, setShortlistedJobIds] = useState<Set<string>>(new Set())
  const [boostedJobIds, setBoostedJobIds] = useState<Set<string>>(new Set())

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

  // Geocode search term when it looks like a UK postcode (debounced 500ms)
  useEffect(() => {
    const trimmed = locationQuery.trim()
    if (!trimmed || !UK_POSTCODE_RE.test(trimmed)) {
      setLocationCoords(null)
      return
    }
    const timer = setTimeout(() => {
      const postcode = trimmed.replace(/\s+/g, '').toUpperCase()
      setGeocodingLocation(true)
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
      if (!isLoggedIn) {
        router.push(`/login/employee?redirect=${encodeURIComponent(`/jobs?id=${jobId}`)}`)
        return
      }
      const job = jobs.find(j => j.id === jobId)
      if (job) {
        setSelectedJob(job)
      }
    } else if (!isMobile && !selectedJob) {
      // Don't clear selection on desktop - keep current or auto-select will handle
    } else if (isMobile) {
      setSelectedJob(null)
    }
  }, [searchParams, jobs, isLoggedIn, router, isMobile])

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
      if (filters.salaryRange.size > 0) {
        const yearSalary = job.salaryPeriod === 'hour' ? job.salaryMax * 2080 : job.salaryMax
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

      return true
    }).sort((a, b) => {
      const aBoost = boostedJobIds.has(a.id) ? 1 : 0
      const bBoost = boostedJobIds.has(b.id) ? 1 : 0
      return bBoost - aBoost
    })
  }, [jobs, searchQuery, debouncedLocationQuery, locationCoords, locationRadius, jobCoords, activeCategory, filters, boostedJobIds])

  // Auto-select first job on desktop when filtered jobs change
  useEffect(() => {
    if (isMobile) return
    if (filteredJobs.length > 0 && !searchParams.get('id')) {
      setSelectedJob(prev => {
        // Keep current selection if it's still in the filtered list
        if (prev && filteredJobs.some(j => j.id === prev.id)) return prev
        return filteredJobs[0]
      })
    } else if (filteredJobs.length === 0) {
      setSelectedJob(null)
    }
  }, [filteredJobs, isMobile, searchParams])

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
    trackJobView(job.id, 'search')
    if (isMobile) {
      // Mobile: check auth then open modal
      let loggedIn = isLoggedIn
      if (loggedIn === null) {
        const { data: { session } } = await supabase.auth.getSession()
        loggedIn = !!session
        setIsLoggedIn(loggedIn)
      }
      if (!loggedIn) {
        router.push(`/login/employee?redirect=${encodeURIComponent(`/jobs?id=${job.id}`)}`)
        return
      }
      setSelectedJob(job)
      router.push(`/jobs?id=${job.id}`, { scroll: false })
    } else {
      // Desktop: just select in the side panel
      setSelectedJob(job)
    }
  }

  const closeJobModal = () => {
    setSelectedJob(null)
    router.push('/jobs', { scroll: false })
  }

  const navigateToJob = (direction: 'prev' | 'next') => {
    if (!selectedJob) return
    const currentIndex = filteredJobs.findIndex(j => j.id === selectedJob.id)
    const newIndex = direction === 'prev' ? currentIndex - 1 : currentIndex + 1
    if (newIndex >= 0 && newIndex < filteredJobs.length) {
      const newJob = filteredJobs[newIndex]
      setSelectedJob(newJob)
      if (isMobile) {
        router.push(`/jobs?id=${newJob.id}`, { scroll: false })
      }
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
      locationString = `${job.location}, ${job.area}`
    }
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(locationString)}`
  }

  const formatSalaryFull = (job: Job) => {
    if (job.salaryPeriod === 'hour') return `£${job.salaryMin} - £${job.salaryMax} per hour`
    return `£${job.salaryMin.toLocaleString()} - £${job.salaryMax.toLocaleString()} per year`
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
    setShowApplyModal(true)
  }

  const submitApplication = async () => {
    if (!selectedJob) return
    setIsSubmitting(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) throw new Error('Not authenticated')

      const candidateName = session.user.user_metadata?.full_name || 'Candidate'

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
        })
      if (insertError) {
        console.warn('Supabase insert warning:', insertError.message)
      }

      // 2. Send notification to employer
      if (selectedJob.employerId) {
        try {
          await supabase.from('notifications').insert({
            user_id: selectedJob.employerId,
            type: 'new_application',
            title: 'New application received',
            message: `${candidateName} applied for ${selectedJob.title}`,
            link: '/my-jobs',
            related_id: selectedJob.id,
            related_type: 'application',
          })
        } catch {
          // Notification failure is non-blocking
        }
      }

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

          const { data: convData, error: convError } = await supabase
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
    } catch (err) {
      console.error('Application error:', err)
      alert('Failed to submit application. Please try again.')
    } finally {
      setIsSubmitting(false)
    }
  }

  const formatSalary = (job: Job) => {
    if (job.salaryPeriod === 'hour') {
      return `£${job.salaryMin}-${job.salaryMax}/hr`
    }
    return `£${(job.salaryMin / 1000).toFixed(0)}k-${(job.salaryMax / 1000).toFixed(0)}k/year`
  }

  const getTagStyle = (index: number) => {
    const tagStyles = [styles.tagGreen, styles.tagBlue, styles.tagYellow]
    return tagStyles[index % tagStyles.length]
  }

  return (
    <main>
      <Header />

      <div className={styles.pageHeader}>
        <h1 className={styles.pageTitle}>
          {currentUserRole === 'employer' ? 'Browse Job Listings' : 'Find Your Next Role'}
        </h1>
        <p className={styles.pageSubtitle}>
          {currentUserRole === 'employer'
            ? 'See what other companies are advertising across the UK'
            : 'Thousands of jobs across all sectors in the UK'}
        </p>
      </div>

      {/* Category Pills - Collapsible */}
      <section className={styles.categoriesSection}>
        <div className={styles.categoriesInner}>
          <div className={styles.categoriesHeader}>
            <button
              className={styles.sectorsToggle}
              onClick={() => setSectorsExpanded(!sectorsExpanded)}
            >
              Job Sectors
              {activeCategory !== 'all' && (
                <span className={styles.activeSectorLabel}>
                  {categories.find(c => c.id === activeCategory)?.label}
                </span>
              )}
              <span className={`${styles.chevron} ${sectorsExpanded ? styles.chevronUp : ''}`}>&#9662;</span>
            </button>
            {activeCategory !== 'all' && !sectorsExpanded && (
              <button
                className={styles.clearSectorBtn}
                onClick={() => setActiveCategory('all')}
              >
                Clear
              </button>
            )}
          </div>
          <div className={`${styles.categoriesCollapsible} ${sectorsExpanded ? styles.categoriesExpanded : ''}`}>
            <div className={styles.categoriesWrap}>
              {categories.map(category => (
                <button
                  key={category.id}
                  className={`${styles.categoryPill} ${activeCategory === category.id ? styles.categoryPillActive : ''}`}
                  onClick={() => setActiveCategory(category.id)}
                >
                  {category.label}
                </button>
              ))}
            </div>
          </div>

          <div className={styles.filtersDivider} />

          <div className={styles.categoriesHeader}>
            <button
              className={styles.sectorsToggle}
              onClick={() => setFiltersExpanded(!filtersExpanded)}
            >
              Filters{activeFilterCount > 0 && ` (${activeFilterCount})`}
              <span className={`${styles.chevron} ${filtersExpanded ? styles.chevronUp : ''}`}>&#9662;</span>
            </button>
            {activeFilterCount > 0 && !filtersExpanded && (
              <button
                className={styles.clearSectorBtn}
                onClick={clearFilters}
              >
                Clear all
              </button>
            )}
          </div>
          <div className={`${styles.categoriesCollapsible} ${filtersExpanded ? styles.categoriesExpanded : ''}`}>
            <div className={styles.filtersPanel}>
              {/* Keyword Search */}
              <div className={styles.filterSection}>
                <h4 className={styles.filterSectionTitle}>Keyword Search</h4>
                <div className={styles.locationInputWrapper}>
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)}
                    placeholder="Search by job title or keyword"
                    className={styles.locationInput}
                  />
                  {searchQuery && (
                    <button
                      className={styles.locationClear}
                      onClick={() => setSearchQuery('')}
                      aria-label="Clear search"
                    >✕</button>
                  )}
                </div>
              </div>

              {/* Location Filter */}
              <div className={`${styles.filterSection} ${styles.locationFilterSection}`}>
                <h4 className={styles.filterSectionTitle}>Location</h4>
                <div className={styles.locationInputWrapper}>
                  <input
                    type="text"
                    value={locationQuery}
                    onChange={e => {
                      setLocationQuery(e.target.value)
                      if (!e.target.value) { setLocationRadius(null); setLocationCoords(null) }
                    }}
                    placeholder="City, town or postcode"
                    className={styles.locationInput}
                  />
                  {geocodingLocation && <span className={styles.locationSpinner} />}
                  {locationQuery && !geocodingLocation && (
                    <button
                      className={styles.locationClear}
                      onClick={() => { setLocationQuery(''); setLocationRadius(null); setLocationCoords(null) }}
                      aria-label="Clear location"
                    >✕</button>
                  )}
                </div>
                {locationQuery && (
                  <div className={styles.radiusOptions}>
                    {([null, 10, 25, 50] as const).map(r => (
                      <button
                        key={r ?? 'any'}
                        className={`${styles.categoryPill} ${locationRadius === r ? styles.categoryPillActive : ''}`}
                        onClick={() => setLocationRadius(r)}
                      >
                        {r === null ? 'Any distance' : `Within ${r} mi`}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {filterSections.map(section => (
                <div key={section.key} className={styles.filterSection}>
                  <h4 className={styles.filterSectionTitle}>{section.title}</h4>
                  <div className={styles.filterOptions}>
                    {section.options.map(option => (
                      <button
                        key={option}
                        className={`${styles.categoryPill} ${filters[section.key].has(option) ? styles.categoryPillActive : ''}`}
                        onClick={() => toggleFilter(section.key, option)}
                      >
                        {option}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
              {(activeFilterCount > 0 || searchQuery || locationQuery || activeCategory !== 'all') && (
                <button className={styles.clearAllBtn} onClick={clearFilters}>
                  Clear all filters
                </button>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* Main Content */}
      <div className={styles.container}>
        <p className={styles.jobCount}>
          <span className={styles.jobCountHighlight}>{filteredJobs.length}</span> jobs found
          {activeCategory !== 'all' && ` in ${categories.find(c => c.id === activeCategory)?.label}`}
          {debouncedLocationQuery && ` in "${debouncedLocationQuery}"`}
        </p>

        {filteredJobs.length > 0 ? (
          <div className={styles.splitLayout}>
            {/* LEFT PANEL - Job List */}
            <div className={styles.jobListPanel} ref={listRef}>
              {filteredJobs.map(job => (
                <div
                  key={job.id}
                  className={`${styles.listCard} ${selectedJob?.id === job.id ? styles.listCardActive : ''} ${boostedJobIds.has(job.id) ? styles.listCardBoosted : ''}`}
                  onClick={() => selectJob(job)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => e.key === 'Enter' && selectJob(job)}
                >
                  <div className={styles.listCardLogo}>
                    <CompanyLogo
                      src={job.companyLogo}
                      alt={job.company}
                      className={styles.listCardLogoImg}
                    />
                  </div>
                  <div className={styles.listCardContent}>
                    <h3 className={styles.listCardTitle}>{job.title}</h3>
                    <p className={styles.listCardCompany}>{job.company}</p>
                    <p className={styles.listCardLocation}>{job.location}{job.area ? `, ${job.area}` : ''}</p>
                    <p className={styles.listCardSalary}>{formatSalary(job)}</p>
                  </div>
                  {boostedJobIds.has(job.id) && (
                    <span className={styles.listCardFeaturedBadge}>⚡ Featured</span>
                  )}
                  {shortlistedJobIds.has(job.id) && (
                    <span className={styles.listCardStamp}>SHORTLISTED</span>
                  )}
                </div>
              ))}
            </div>

            {/* RIGHT PANEL - Job Detail (desktop only) */}
            {!isMobile && selectedJob && (
              <div className={styles.detailPanel}>
                <JobPostingSchema job={selectedJob} />
                <div className={styles.detailInner}>

                  {/* Banner — only show if a dedicated banner image exists */}
                  {selectedJob.companyBanner && (
                    <div className={styles.detailBanner}>
                      <img
                        src={selectedJob.companyBanner}
                        alt={selectedJob.company}
                        className={styles.detailBannerImg}
                      />
                    </div>
                  )}

                  {/* Header */}
                  <div className={styles.detailHeader}>
                    <h1 className={styles.detailTitle}>{selectedJob.title}</h1>
                    <p className={styles.detailCompany}>{selectedJob.company}</p>
                    {selectedJob.companyWebsite && (
                      <a
                        href={selectedJob.companyWebsite.startsWith('http') ? selectedJob.companyWebsite : `https://${selectedJob.companyWebsite}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className={styles.detailWebsite}
                      >
                        🌐 {selectedJob.companyWebsite.replace(/^https?:\/\//, '')}
                      </a>
                    )}
                    <a
                      href={getGoogleMapsUrl(selectedJob)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={styles.detailLocation}
                    >
                      📍 {selectedJob.fullLocation?.addressLine1
                        ? `${selectedJob.fullLocation.addressLine1}, ${selectedJob.fullLocation.city} ${selectedJob.fullLocation.postcode}`
                        : `${selectedJob.location}, ${selectedJob.area}`}
                    </a>
                    <p className={styles.detailSalary}>{formatSalaryFull(selectedJob)}</p>
                    <div className={styles.detailBadges}>
                      {Array.isArray(selectedJob.employmentType)
                        ? selectedJob.employmentType.map((type, i) => (
                            <span key={i} className={styles.detailBadge}>{type}</span>
                          ))
                        : selectedJob.employmentType && <span className={styles.detailBadge}>{selectedJob.employmentType}</span>
                      }
                      {selectedJob.urgent && <span className={`${styles.detailBadge} ${styles.detailBadgeUrgent}`}>Urgent</span>}
                    </div>
                    {selectedJob.tags && selectedJob.tags.length > 0 && (
                      <div className={styles.detailTags}>
                        {selectedJob.tags.map(tag => {
                          const cat = getTagCategory(tag)
                          return (
                            <span key={tag} className={`${styles.detailTag} ${cat ? styles[`detailTag_${cat}`] : ''}`}>
                              {tag}
                            </span>
                          )
                        })}
                      </div>
                    )}
                  </div>

                  {/* Actions */}
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
                      {isSaved(selectedJob.id) ? 'Saved \u2713' : 'Save Job'}
                    </button>
                  </div>

                  {/* Details Grid */}
                  <div className={styles.detailSection}>
                    <h2 className={styles.detailSectionTitle}>Job Details</h2>
                    <div className={styles.detailGrid}>
                      <div className={styles.detailGridItem}>
                        <span className={styles.detailGridLabel}>Pay</span>
                        <span className={styles.detailGridValue}>{formatSalaryFull(selectedJob)}</span>
                      </div>
                      <div className={styles.detailGridItem}>
                        <span className={styles.detailGridLabel}>Job type</span>
                        <span className={styles.detailGridValue}>
                          {Array.isArray(selectedJob.employmentType) ? selectedJob.employmentType.join(', ') : selectedJob.employmentType || 'Not specified'}
                        </span>
                      </div>
                      <div className={styles.detailGridItem}>
                        <span className={styles.detailGridLabel}>Shift & schedule</span>
                        <span className={styles.detailGridValue}>{selectedJob.shiftSchedule || 'Not specified'}</span>
                      </div>
                      <div className={styles.detailGridItem}>
                        <span className={styles.detailGridLabel}>Work location</span>
                        <span className={styles.detailGridValue}>{selectedJob.workLocationType || 'In person'}</span>
                      </div>
                    </div>
                  </div>

                  {/* Benefits */}
                  {selectedJob.benefits && selectedJob.benefits.length > 0 && (
                    <div className={styles.detailSection}>
                      <h2 className={styles.detailSectionTitle}>Benefits</h2>
                      <ul className={styles.detailBenefits}>
                        {selectedJob.benefits.map((benefit, i) => (
                          <li key={i}>✓ {benefit}</li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {/* Description */}
                  {(selectedJob.fullDescription || selectedJob.description) && (
                    <div className={styles.detailSection}>
                      <h2 className={styles.detailSectionTitle}>Full Job Description</h2>
                      <div className={styles.detailDescription}>
                        {renderDescription(selectedJob.fullDescription || selectedJob.description)}
                      </div>
                    </div>
                  )}

                  {/* Requirements */}
                  {selectedJob.requirements && selectedJob.requirements.length > 0 && (
                    <div className={styles.detailSection}>
                      <h2 className={styles.detailSectionTitle}>Requirements</h2>
                      <ul className={styles.detailList}>
                        {selectedJob.requirements.map((item, i) => (
                          <li key={i}>{item}</li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {/* Skills */}
                  {selectedJob.skillsRequired && selectedJob.skillsRequired.length > 0 && (
                    <div className={styles.detailSection}>
                      <h2 className={styles.detailSectionTitle}>Skills Required</h2>
                      <div className={styles.detailSkills}>
                        {selectedJob.skillsRequired.map((skill, i) => (
                          <span key={i} className={styles.detailSkillTag}>{skill}</span>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Company Reviews */}
                  <div className={styles.detailSection}>
                    <h3 className={styles.detailSectionTitle}>Reviews for {selectedJob.company}</h3>
                    <CompanyReviewsSummary companyName={selectedJob.company} />
                  </div>

                  {/* Footer info */}
                  <div className={styles.detailFooter}>
                    <p>Posted {selectedJob.postedAt}</p>
                    {selectedJob.applicationCount > 0 && <p>{selectedJob.applicationCount} applicants</p>}
                    {selectedJob.category && <p>Category: {selectedJob.category}</p>}
                  </div>
                </div>
              </div>
            )}
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
                    />
                  </div>
                  <div className={styles.applyCvSection}>
                    <p className={styles.applyCvNote}>
                      Your profile CV will be attached automatically. Make sure it&apos;s up to date!
                    </p>
                    <Link href="/cv-builder" className={styles.applyUpdateCvLink}>
                      Update your CV →
                    </Link>
                  </div>
                </div>
                <div className={styles.applyFooter}>
                  <button
                    className={styles.applySubmitBtn}
                    onClick={submitApplication}
                    disabled={isSubmitting}
                  >
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
                <button className={styles.applySuccessBtn} onClick={() => setShowApplyModal(false)}>
                  Continue Browsing
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Job Detail Modal - mobile only */}
      {isMobile && selectedJob && (
        <JobDetailModal
          job={selectedJob}
          onClose={closeJobModal}
          onPrevious={() => navigateToJob('prev')}
          onNext={() => navigateToJob('next')}
          hasPrevious={getCurrentJobIndex() > 0}
          hasNext={getCurrentJobIndex() < filteredJobs.length - 1}
          viewSource="search"
        />
      )}
    </main>
  )
}

export default function JobsPage() {
  return (
    <Suspense fallback={
      <main>
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

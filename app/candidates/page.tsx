'use client'

import { useState, useEffect, useMemo, useRef, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import Header from '@/components/Header'
import { supabase } from '@/lib/supabase'
import { Candidate } from '@/lib/mockCandidates'
import { supabaseProfileToCandidate } from '@/lib/types'
import {
  MapPin, Clock, Briefcase, GraduationCap, User, Wrench,
  Award, Heart, Globe, MessageSquare, FileDown, Sliders
} from 'lucide-react'
import { Boost } from '@/lib/boostTypes'
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
  { key: 'workPreference' as const, title: 'Work Preference', options: ['Full-time', 'Part-time', 'Contract', 'Temporary', 'Freelance'] },
  { key: 'skills' as const, title: 'Key Skills', options: ['Right to Work', 'NI Number', 'Food Hygiene', 'First Aid', 'DBS Checked', 'Driving Licence', 'Language Skills', 'Management Experience'] },
]

const categories = [
  { id: 'all', label: 'All Candidates' },
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

const JOB_SECTOR_LABELS: Record<string, string> = {
  hospitality: 'Hospitality Tourism & Sport',
  accountancy: 'Accountancy Banking & Finance',
  business: 'Business Consulting & Management',
  charity: 'Charity & Voluntary Work',
  creative: 'Creative Arts & Design',
  digital: 'Digital & Information Technology',
  energy: 'Energy & Utilities',
  engineering: 'Engineering & Manufacturing',
  environment: 'Environment & Agriculture',
  healthcare: 'Healthcare & Social Care',
  law: 'Law & Legal Services',
  marketing: 'Marketing Advertising & PR',
  media: 'Media & Internet',
  property: 'Property & Construction',
  public: 'Public Services & Administration',
  recruitment: 'Recruitment & HR',
  retail: 'Retail & Sales',
  science: 'Science & Pharmaceuticals',
  teaching: 'Teaching & Education',
  transport: 'Transport & Logistics',
}

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

  return 'hospitality'
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
  const [activeCategory, setActiveCategory] = useState('all')
  const [filters, setFilters] = useState<Filters>(emptyFilters())
  const [sectorsExpanded, setSectorsExpanded] = useState(false)
  const [filtersExpanded, setFiltersExpanded] = useState(false)
  const [checkingAuth, setCheckingAuth] = useState(true)
  const [isEmployer, setIsEmployer] = useState(false)
  const [hasSubscription, setHasSubscription] = useState(false)
  const [allCandidates, setAllCandidates] = useState<Candidate[]>([])
  const [selectedCandidate, setSelectedCandidate] = useState<Candidate | null>(null)
  const [isMobile, setIsMobile] = useState(false)
  const [boostedProfileIds, setBoostedProfileIds] = useState<Set<string>>(new Set())
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

  const activeFilterCount = useMemo(() =>
    Object.values(filters).reduce((sum, set) => sum + set.size, 0)
  , [filters])

  const clearAllFilters = () => setFilters(emptyFilters())

  // Load candidates from Supabase
  useEffect(() => {
    const fetchCandidates = async () => {
      const { data, error } = await supabase
        .from('candidate_profiles')
        .select('*')
      if (!error && data) {
        setAllCandidates(data.map(supabaseProfileToCandidate))
      }
    }
    fetchCandidates()
  }, [])

  useEffect(() => {
    const checkAuth = async () => {
      const { data: { session } } = await supabase.auth.getSession()

      if (!session) {
        router.push('/login')
        return
      }

      const userRole = session.user.user_metadata?.role
      if (userRole !== 'employer') {
        setIsEmployer(false)
        setCheckingAuth(false)
        return
      }

      setIsEmployer(true)

      // Check subscription status from employer_subscriptions table
      const { data: subData } = await supabase
        .from('employer_subscriptions')
        .select('subscription_status')
        .eq('user_id', session.user.id)
        .single()

      if (subData && (subData.subscription_status === 'active' || subData.subscription_status === 'trialing')) {
        setHasSubscription(true)
      } else {
        setHasSubscription(false)
        setCheckingAuth(false)
        return
      }

      setCheckingAuth(false)
    }
    checkAuth()
  }, [router])

  const filteredCandidates = useMemo(() => {
    return allCandidates.filter(candidate => {
      // Search filter
      if (searchQuery) {
        const query = searchQuery.toLowerCase()
        const matchesSearch =
          candidate.fullName.toLowerCase().includes(query) ||
          candidate.jobTitle.toLowerCase().includes(query) ||
          candidate.skills.some(skill => skill.toLowerCase().includes(query)) ||
          candidate.bio.toLowerCase().includes(query)
        if (!matchesSearch) return false
      }

      // City filter
      if (locationQuery) {
        const city = locationQuery.toLowerCase()
        if (!candidate.location.toLowerCase().includes(city)) return false
      }

      // Sector filter
      if (activeCategory !== 'all') {
        const sector = getCandidateSector(candidate)
        if (sector !== activeCategory) return false
      }

      // Availability filter
      if (filters.availability.size > 0) {
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
      if (filters.experienceLevel.size > 0) {
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
      if (filters.skills.size > 0) {
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
      if (filters.workPreference.size > 0) {
        const candidateJobTypes = (candidate.preferredJobTypes || []).map(s => s.toLowerCase())
        let matches = false
        for (const pref of Array.from(filters.workPreference)) {
          if (candidateJobTypes.some(t => t.includes(pref.toLowerCase()))) matches = true
        }
        if (!matches) return false
      }

      return true
    }).sort((a, b) => {
      const aBoost = boostedProfileIds.has(a.id) ? 1 : 0
      const bBoost = boostedProfileIds.has(b.id) ? 1 : 0
      return bBoost - aBoost
    })
  }, [allCandidates, searchQuery, locationQuery, activeCategory, filters, boostedProfileIds])

  // Auto-select first candidate on desktop when filtered results change
  useEffect(() => {
    if (isMobile) return
    if (filteredCandidates.length > 0) {
      setSelectedCandidate(prev => {
        if (prev && filteredCandidates.some(c => c.id === prev.id)) return prev
        return filteredCandidates[0]
      })
    } else {
      setSelectedCandidate(null)
    }
  }, [filteredCandidates, isMobile])

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
    setActiveCategory('all')
    clearAllFilters()
  }

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
            <div className={styles.accessIcon}>🔒</div>
            <h2>Employer Access Only</h2>
            <p>
              Only employers with a subscription can browse candidate profiles.
              Subscribe to access thousands of qualified professionals.
            </p>
            <Link href="/subscribe" className="btn btn-primary">
              Start Free 14-Day Trial
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
            <div className={styles.accessIcon}>📋</div>
            <h2>Subscription Required</h2>
            <p>Redirecting to subscription page...</p>
          </div>
        </div>
      </main>
    )
  }

  return (
    <main>
      <Header />

      <div className={styles.pageHeader}>
        <h1 className={styles.pageTitle}>Find Your Perfect Candidate</h1>
        <p className={styles.pageSubtitle}>Browse profiles across all sectors in the UK</p>
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
                onClick={clearAllFilters}
              >
                Clear all
              </button>
            )}
          </div>
          <div className={`${styles.categoriesCollapsible} ${filtersExpanded ? styles.categoriesExpanded : ''}`}>
            <div className={styles.filtersPanel}>
              {candidateFilterSections.map(section => (
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
              {activeFilterCount > 0 && (
                <button className={styles.clearAllBtn} onClick={clearAllFilters}>
                  Clear all filters
                </button>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* Main Content */}
      <div className={styles.mainContainer}>
        <p className={styles.candidateCount}>
          <span className={styles.candidateCountHighlight}>{filteredCandidates.length}</span> candidates found
          {activeCategory !== 'all' && ` in ${categories.find(c => c.id === activeCategory)?.label}`}
          {locationQuery && ` in "${locationQuery}"`}
        </p>

        {filteredCandidates.length > 0 ? (
          <div className={styles.splitLayout}>
            {/* LEFT PANEL - Candidate List */}
            <div className={styles.listPanel} ref={listRef}>
              {filteredCandidates.map(candidate => (
                <div
                  key={candidate.id}
                  className={`${styles.listCard} ${selectedCandidate?.id === candidate.id ? styles.listCardActive : ''} ${boostedProfileIds.has(candidate.id) ? styles.listCardBoosted : ''}`}
                  onClick={() => selectCandidate(candidate)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => e.key === 'Enter' && selectCandidate(candidate)}
                >
                  <div className={styles.listCardContent}>
                    <h3 className={styles.listCardName}>{candidate.fullName}</h3>
                    <p className={styles.listCardCompany}>{candidate.jobTitle}</p>
                    <p className={styles.listCardLocation}>{candidate.yearsExperience} yrs exp · {candidate.location}</p>
                    <p className={styles.listCardSalary}>{candidate.bio}</p>
                    <div className={styles.listCardTags}>
                      {candidate.skills.slice(0, 3).map((skill, i) => (
                        <span key={i} className={styles.listCardTag}>{skill}</span>
                      ))}
                      {candidate.skills.length > 3 && (
                        <span className={styles.listCardTagMore}>+{candidate.skills.length - 3}</span>
                      )}
                    </div>
                  </div>
                  <div className={styles.listCardLogo}>
                    {candidate.profilePictureUrl ? (
                      <img src={candidate.profilePictureUrl} alt={candidate.fullName} className={styles.listCardLogoImg} />
                    ) : (
                      <span className={styles.listCardLogoPlaceholder}>
                        {candidate.fullName.split(' ').map(n => n[0]).join('')}
                      </span>
                    )}
                  </div>
                  {boostedProfileIds.has(candidate.id) && (
                    <span className={styles.listCardFeaturedBadge}>⚡ Featured</span>
                  )}

                </div>
              ))}
            </div>

            {/* RIGHT PANEL - Candidate Detail (desktop only) */}
            {!isMobile && selectedCandidate && (
              <div className={styles.detailPanel}>
                <div className={styles.detailInner}>
                  {/* Profile Header */}
                  <div className={styles.detailProfileHeader}>
                    <div className={styles.detailHeaderContent}>
                      <div className={styles.detailAvatar}>
                        {selectedCandidate.profilePictureUrl ? (
                          <img src={selectedCandidate.profilePictureUrl} alt={selectedCandidate.fullName} />
                        ) : (
                          <span className={styles.detailAvatarPlaceholder}>
                            {selectedCandidate.fullName.split(' ').map(n => n[0]).join('')}
                          </span>
                        )}
                      </div>
                      <div className={styles.detailHeaderInfo}>
                        <h1 className={styles.detailName}>{selectedCandidate.fullName}</h1>
                        <p className={styles.detailTitle}>{selectedCandidate.jobTitle}</p>
                        <div className={styles.detailHeaderMeta}>
                          {selectedCandidate.location && (
                            <span className={styles.detailMetaItem}>
                              <MapPin size={15} />
                              {selectedCandidate.location}
                            </span>
                          )}
                          {selectedCandidate.yearsExperience != null && (
                            <span className={styles.detailMetaItem}>
                              <Clock size={15} />
                              {selectedCandidate.yearsExperience} years experience
                            </span>
                          )}
                          {selectedCandidate.availability && (
                            <span className={`${styles.detailAvailBadge} ${styles[`detailAvail_${getAvailabilityColor(selectedCandidate.availability)}`]}`}>
                              <span className={styles.detailAvailDot} />
                              {selectedCandidate.availability}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Quick Stats */}
                    {(selectedCandidate.jobSector || (selectedCandidate.preferredJobTypes && selectedCandidate.preferredJobTypes.length > 0) || (selectedCandidate.workLocationPreferences && selectedCandidate.workLocationPreferences.length > 0)) && (
                      <div className={styles.detailQuickStats}>
                        {selectedCandidate.jobSector && (
                          <div className={styles.detailQuickStat}>
                            <span className={styles.detailQuickStatLabel}>Sector</span>
                            <span className={styles.detailQuickStatValue}>{JOB_SECTOR_LABELS[selectedCandidate.jobSector] || selectedCandidate.jobSector}</span>
                          </div>
                        )}
                        {selectedCandidate.preferredJobTypes && selectedCandidate.preferredJobTypes.length > 0 && (
                          <div className={styles.detailQuickStat}>
                            <span className={styles.detailQuickStatLabel}>Work Type</span>
                            <span className={styles.detailQuickStatValue}>{selectedCandidate.preferredJobTypes.join(', ')}</span>
                          </div>
                        )}
                        {selectedCandidate.workLocationPreferences && selectedCandidate.workLocationPreferences.length > 0 && (
                          <div className={styles.detailQuickStat}>
                            <span className={styles.detailQuickStatLabel}>Work Location</span>
                            <span className={styles.detailQuickStatValue}>{selectedCandidate.workLocationPreferences.join(', ')}</span>
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Action Buttons */}
                  <div className={styles.detailActions}>
                    <Link href={`/candidates/${selectedCandidate.id}`} className={styles.detailActionBtnPrimary}>
                      <MessageSquare size={16} />
                      Message
                    </Link>
                    {selectedCandidate.cvUrl ? (
                      <a href={selectedCandidate.cvUrl} target="_blank" rel="noopener noreferrer" download className={styles.detailActionBtn}>
                        <FileDown size={16} />
                        Download CV
                      </a>
                    ) : (
                      <button className={styles.detailActionBtn} disabled>
                        <FileDown size={16} />
                        No CV
                      </button>
                    )}
                    <Link href={`/candidates/${selectedCandidate.id}`} className={styles.detailActionBtn}>
                      View Full Profile
                    </Link>
                  </div>

                  {/* About Me */}
                  {selectedCandidate.bio && (
                    <div className={styles.detailSection}>
                      <div className={styles.detailSectionHeader}>
                        <User size={18} className={styles.detailSectionIcon} />
                        <h2 className={styles.detailSectionTitle}>About Me</h2>
                      </div>
                      <p className={styles.detailBio}>{selectedCandidate.bio}</p>
                    </div>
                  )}

                  {/* Work Experience */}
                  {selectedCandidate.workHistory && selectedCandidate.workHistory.length > 0 && (
                    <div className={styles.detailSection}>
                      <div className={styles.detailSectionHeader}>
                        <Briefcase size={18} className={styles.detailSectionIcon} />
                        <h2 className={styles.detailSectionTitle}>Work Experience</h2>
                      </div>
                      <div className={styles.detailTimeline}>
                        {selectedCandidate.workHistory.map((job, index) => (
                          <div key={index} className={styles.detailTimelineItem}>
                            <div className={styles.detailTimelineTrack}>
                              <div className={styles.detailTimelineDot} />
                              {index < selectedCandidate.workHistory.length - 1 && <div className={styles.detailTimelineLine} />}
                            </div>
                            <div className={styles.detailTimelineBody}>
                              <h3 className={styles.detailTimelineRole}>{job.title}</h3>
                              <p className={styles.detailTimelineCompany}>{job.company} &bull; {job.location}</p>
                              <p className={styles.detailTimelineDates}>{job.startDate} — {job.endDate || 'Present'}</p>
                              {job.description && <p className={styles.detailTimelineDesc}>{job.description}</p>}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Skills */}
                  {selectedCandidate.skills && selectedCandidate.skills.length > 0 && (
                    <div className={styles.detailSection}>
                      <div className={styles.detailSectionHeader}>
                        <Wrench size={18} className={styles.detailSectionIcon} />
                        <h2 className={styles.detailSectionTitle}>Skills</h2>
                      </div>
                      <div className={styles.detailSkillsGrid}>
                        {selectedCandidate.skills.map((skill, index) => (
                          <span key={index} className={styles.detailSkillPill}>{skill}</span>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Education */}
                  {selectedCandidate.education && selectedCandidate.education.length > 0 && selectedCandidate.education.some(edu => edu.institution || edu.qualification) && (
                    <div className={styles.detailSection}>
                      <div className={styles.detailSectionHeader}>
                        <GraduationCap size={18} className={styles.detailSectionIcon} />
                        <h2 className={styles.detailSectionTitle}>Education</h2>
                      </div>
                      <div className={styles.detailTimeline}>
                        {selectedCandidate.education.filter(edu => edu.institution || edu.qualification).map((edu, index, arr) => (
                          <div key={index} className={styles.detailTimelineItem}>
                            <div className={styles.detailTimelineTrack}>
                              <div className={styles.detailTimelineDot} />
                              {index < arr.length - 1 && <div className={styles.detailTimelineLine} />}
                            </div>
                            <div className={styles.detailTimelineBody}>
                              <h3 className={styles.detailTimelineRole}>{edu.qualification}{edu.fieldOfStudy ? ` in ${edu.fieldOfStudy}` : ''}</h3>
                              <p className={styles.detailTimelineCompany}>{edu.institution}{edu.grade ? ` • ${edu.grade}` : ''}</p>
                              <p className={styles.detailTimelineDates}>{edu.startDate} — {edu.inProgress ? 'In Progress' : (edu.endDate || 'N/A')}</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Languages */}
                  {selectedCandidate.languages && selectedCandidate.languages.length > 0 && selectedCandidate.languages.some(lang => lang.name) && (
                    <div className={styles.detailSection}>
                      <div className={styles.detailSectionHeader}>
                        <Globe size={18} className={styles.detailSectionIcon} />
                        <h2 className={styles.detailSectionTitle}>Languages</h2>
                      </div>
                      <div className={styles.detailSkillsGrid}>
                        {selectedCandidate.languages.filter(lang => lang.name).map((lang, index) => (
                          <span key={index} className={styles.detailLangPill}>
                            {lang.name} <span className={styles.detailLangLevel}>({lang.proficiency})</span>
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Certifications */}
                  {selectedCandidate.certifications && selectedCandidate.certifications.length > 0 && (
                    <div className={styles.detailSection}>
                      <div className={styles.detailSectionHeader}>
                        <Award size={18} className={styles.detailSectionIcon} />
                        <h2 className={styles.detailSectionTitle}>Certifications</h2>
                      </div>
                      <ul className={styles.detailCertList}>
                        {selectedCandidate.certifications.map((cert, index) => (
                          <li key={index} className={styles.detailCertItem}>
                            <span className={styles.detailCertCheck}>✓</span>
                            {cert}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {/* Preferences */}
                  {(selectedCandidate.preferredLocations || selectedCandidate.preferredJobTypes || selectedCandidate.salaryMin || selectedCandidate.salaryMax || selectedCandidate.desiredSalary) && (
                    <div className={styles.detailSection}>
                      <div className={styles.detailSectionHeader}>
                        <Sliders size={18} className={styles.detailSectionIcon} />
                        <h2 className={styles.detailSectionTitle}>Preferences</h2>
                      </div>
                      <div className={styles.detailPrefGrid}>
                        {(selectedCandidate.salaryMin || selectedCandidate.salaryMax || selectedCandidate.desiredSalary) && (
                          <div className={styles.detailPrefRow}>
                            <span className={styles.detailPrefLabel}>Desired Salary</span>
                            <span className={styles.detailPrefValue}>
                              {selectedCandidate.salaryMin && selectedCandidate.salaryMax ? (
                                <>£{Number(selectedCandidate.salaryMin).toLocaleString()} – £{Number(selectedCandidate.salaryMax).toLocaleString()}{selectedCandidate.salaryPeriod === 'hour' ? '/hour' : '/year'}</>
                              ) : selectedCandidate.desiredSalary ? (
                                <>£{Number(selectedCandidate.desiredSalary).toLocaleString()}{selectedCandidate.salaryPeriod === 'hour' ? '/hour' : '/year'}</>
                              ) : selectedCandidate.salaryMin ? (
                                <>From £{Number(selectedCandidate.salaryMin).toLocaleString()}{selectedCandidate.salaryPeriod === 'hour' ? '/hour' : '/year'}</>
                              ) : (
                                <>Up to £{Number(selectedCandidate.salaryMax).toLocaleString()}{selectedCandidate.salaryPeriod === 'hour' ? '/hour' : '/year'}</>
                              )}
                            </span>
                          </div>
                        )}
                        {selectedCandidate.preferredJobTypes && selectedCandidate.preferredJobTypes.length > 0 && (
                          <div className={styles.detailPrefRow}>
                            <span className={styles.detailPrefLabel}>Work Type</span>
                            <span className={styles.detailPrefValue}>{selectedCandidate.preferredJobTypes.join(', ')}</span>
                          </div>
                        )}
                        {selectedCandidate.workLocationPreferences && selectedCandidate.workLocationPreferences.length > 0 && (
                          <div className={styles.detailPrefRow}>
                            <span className={styles.detailPrefLabel}>Work Location</span>
                            <span className={styles.detailPrefValue}>{selectedCandidate.workLocationPreferences.join(', ')}</span>
                          </div>
                        )}
                        {selectedCandidate.preferredLocations && (
                          <div className={styles.detailPrefRow}>
                            <span className={styles.detailPrefLabel}>Preferred Areas</span>
                            <span className={styles.detailPrefValue}>{selectedCandidate.preferredLocations}</span>
                          </div>
                        )}
                        {selectedCandidate.availability && (
                          <div className={styles.detailPrefRow}>
                            <span className={styles.detailPrefLabel}>Availability</span>
                            <span className={styles.detailPrefValue}>{selectedCandidate.availability}</span>
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Interests & Hobbies */}
                  {(selectedCandidate.personalBio || (selectedCandidate.interests && selectedCandidate.interests.length > 0)) && (
                    <div className={styles.detailSection}>
                      <div className={styles.detailSectionHeader}>
                        <Heart size={18} className={styles.detailSectionIcon} />
                        <h2 className={styles.detailSectionTitle}>Interests & Hobbies</h2>
                      </div>
                      {selectedCandidate.personalBio && <p className={styles.detailBio}>{selectedCandidate.personalBio}</p>}
                      {selectedCandidate.interests && selectedCandidate.interests.length > 0 && (
                        <div className={styles.detailInterestsTags} style={selectedCandidate.personalBio ? { marginTop: '0.75rem' } : undefined}>
                          {selectedCandidate.interests.map((interest, index) => (
                            <span key={index} className={styles.detailInterestTag}>{interest}</span>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Verified Documents */}
                  {(selectedCandidate.hasNiNumber || selectedCandidate.hasBankAccount || selectedCandidate.hasRightToWork || selectedCandidate.hasP45) && (
                    <div className={styles.detailSection}>
                      <div className={styles.detailSectionHeader}>
                        <Award size={18} className={styles.detailSectionIcon} />
                        <h2 className={styles.detailSectionTitle}>Verified Documents</h2>
                      </div>
                      <div className={styles.detailVerificationBadges}>
                        {selectedCandidate.hasNiNumber && (
                          <div className={styles.detailVerificationBadge}>
                            <span className={styles.detailBadgeCheck}>✓</span>
                            NI Number
                          </div>
                        )}
                        {selectedCandidate.hasBankAccount && (
                          <div className={styles.detailVerificationBadge}>
                            <span className={styles.detailBadgeCheck}>✓</span>
                            UK Bank Account
                          </div>
                        )}
                        {selectedCandidate.hasRightToWork && (
                          <div className={styles.detailVerificationBadge}>
                            <span className={styles.detailBadgeCheck}>✓</span>
                            Right to Work
                          </div>
                        )}
                        {selectedCandidate.hasP45 && (
                          <div className={styles.detailVerificationBadge}>
                            <span className={styles.detailBadgeCheck}>✓</span>
                            P45 Available
                          </div>
                        )}
                      </div>
                    </div>
                  )}
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
            <h2 className={styles.emptyTitle}>No candidates match your search</h2>
            <p className={styles.emptyText}>Try adjusting your filters or search terms</p>
            <button className={styles.browseBtn} onClick={clearFilters}>
              Clear all filters
            </button>
          </div>
        )}
      </div>
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

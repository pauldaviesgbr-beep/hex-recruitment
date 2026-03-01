'use client'

import { useState, useEffect, useMemo, useRef } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import Header from '@/components/Header'
import styles from './page.module.css'
import { supabase } from '@/lib/supabase'

interface CompanySummary {
  name: string
  avgRating: number
  reviewCount: number
  image: string | null
}

export default function ReviewsLandingPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [companies, setCompanies] = useState<CompanySummary[]>([])
  const [search, setSearch] = useState('')
  const [showDropdown, setShowDropdown] = useState(false)
  const searchRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const fetchCompanies = async () => {
      // Fetch distinct company names from jobs table
      const { data: jobs } = await supabase
        .from('jobs')
        .select('company, company_logo_url, created_at')
        .order('created_at', { ascending: false })

      if (!jobs || jobs.length === 0) {
        setLoading(false)
        return
      }

      // Deduplicate company names (case-insensitive, keep most recent job's data)
      const companyMap = new Map<string, { name: string; image: string | null }>()
      jobs.forEach((j: any) => {
        if (j.company) {
          const key = j.company.toLowerCase()
          if (!companyMap.has(key)) {
            companyMap.set(key, {
              name: j.company,
              image: j.company_logo_url || null,
            })
          } else if (!companyMap.get(key)!.image && j.company_logo_url) {
            // Fill in image from an older job if the most recent one didn't have one
            companyMap.get(key)!.image = j.company_logo_url
          }
        }
      })

      // Fetch all reviews for ratings
      const { data: reviews } = await supabase
        .from('company_reviews')
        .select('company_name, overall_rating')

      // Group reviews by company (case-insensitive)
      const reviewGroups: Record<string, number[]> = {}
      if (reviews) {
        reviews.forEach((r: any) => {
          const key = r.company_name.toLowerCase()
          if (!reviewGroups[key]) reviewGroups[key] = []
          reviewGroups[key].push(r.overall_rating)
        })
      }

      // Build summaries for all companies from jobs
      const summaries: CompanySummary[] = []
      companyMap.forEach((companyData, key) => {
        const ratings = reviewGroups[key] || []
        summaries.push({
          name: companyData.name,
          avgRating: ratings.length > 0
            ? ratings.reduce((a, b) => a + b, 0) / ratings.length
            : 0,
          reviewCount: ratings.length,
          image: companyData.image,
        })
      })

      // Sort: companies with reviews first (by review count desc), then without reviews (alphabetically)
      summaries.sort((a, b) => {
        if (a.reviewCount > 0 && b.reviewCount === 0) return -1
        if (a.reviewCount === 0 && b.reviewCount > 0) return 1
        if (a.reviewCount > 0 && b.reviewCount > 0) return b.reviewCount - a.reviewCount
        return a.name.localeCompare(b.name)
      })

      setCompanies(summaries)
      setLoading(false)
    }

    fetchCompanies()
  }, [])

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
        setShowDropdown(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  // Filtered results for search
  const searchResults = useMemo(() => {
    if (!search.trim()) return []
    const q = search.toLowerCase()
    return companies.filter(c => c.name.toLowerCase().includes(q)).slice(0, 8)
  }, [search, companies])

  const handleSearchSelect = (companyName: string) => {
    setSearch('')
    setShowDropdown(false)
    router.push(`/reviews/${encodeURIComponent(companyName)}`)
  }

  const handleSearchKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && search.trim()) {
      if (searchResults.length === 1) {
        handleSearchSelect(searchResults[0].name)
      } else if (searchResults.length > 1) {
        handleSearchSelect(searchResults[0].name)
      }
    }
  }

  return (
    <main className={styles.page}>
      <Header />

      {/* Hero with search */}
      <div className={styles.hero}>
        <div className={styles.heroInner}>
          <h1 className={styles.heroTitle}>
            <span className={styles.heroAccent}>Company Reviews</span> from Real Employees
          </h1>
          <p className={styles.heroSub}>
            Read honest reviews and ratings to find the best places to work
          </p>

          <div className={styles.searchWrap} ref={searchRef}>
            <div className={styles.searchIcon}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="11" cy="11" r="8" />
                <line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
            </div>
            <input
              type="text"
              className={styles.searchInput}
              placeholder="Search for a company..."
              value={search}
              onChange={(e) => { setSearch(e.target.value); setShowDropdown(true) }}
              onFocus={() => { if (search.trim()) setShowDropdown(true) }}
              onKeyDown={handleSearchKeyDown}
            />

            {/* Search Results Dropdown */}
            {showDropdown && search.trim() && (
              <div className={styles.searchResults}>
                {searchResults.length > 0 ? (
                  searchResults.map(c => (
                    <div
                      key={c.name}
                      className={styles.searchResultItem}
                      onClick={() => handleSearchSelect(c.name)}
                    >
                      <span className={styles.resultName}>{c.name}</span>
                      <div className={styles.resultRight}>
                        {c.reviewCount > 0 ? (
                          <>
                            <span className={styles.resultRating}>
                              <svg width="14" height="14" viewBox="0 0 24 24" fill="#FFD700" stroke="#FFD700" strokeWidth="1" style={{ verticalAlign: -2, marginRight: 3 }}>
                                <path d="M12 2L15.09 8.26L22 9.27L17 14.14L18.18 21.02L12 17.77L5.82 21.02L7 14.14L2 9.27L8.91 8.26L12 2Z" />
                              </svg>
                              {c.avgRating.toFixed(1)}
                            </span>
                            <span className={styles.resultCount}>
                              ({c.reviewCount} review{c.reviewCount !== 1 ? 's' : ''})
                            </span>
                          </>
                        ) : (
                          <span className={styles.resultNoReviews}>No reviews yet</span>
                        )}
                      </div>
                    </div>
                  ))
                ) : (
                  <div className={styles.searchNoResults}>
                    No companies found for &ldquo;{search}&rdquo;
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Companies on the Platform */}
      <div className={styles.container}>
        {loading ? (
          <div className={styles.loadingState}>
            <div className={styles.spinner} />
            <span>Loading companies...</span>
          </div>
        ) : companies.length > 0 ? (
          <>
            <div className={styles.sectionHeader}>
              <h2 className={styles.sectionTitle}>Companies on Hex</h2>
            </div>

            <div className={styles.grid}>
              {companies.map(company => (
                <Link
                  key={company.name}
                  href={`/reviews/${encodeURIComponent(company.name)}`}
                  className={styles.companyCard}
                >
                  <div className={styles.cardHeader}>
                    {company.image ? (
                      <img
                        src={company.image}
                        alt={company.name}
                        className={styles.cardLogo}
                        onError={(e) => {
                          const img = e.target as HTMLImageElement
                          img.style.display = 'none'
                          const next = img.nextElementSibling as HTMLElement | null
                          if (next) next.style.display = 'flex'
                        }}
                      />
                    ) : null}
                    <div
                      className={styles.cardInitial}
                      style={company.image ? { display: 'none' } : undefined}
                    >
                      {company.name.charAt(0).toUpperCase()}
                    </div>
                    <h3 className={styles.cardName}>{company.name}</h3>
                  </div>
                  {company.reviewCount > 0 ? (
                    <>
                      <div className={styles.cardRatingRow}>
                        <span className={styles.cardAvg}>{company.avgRating.toFixed(1)}</span>
                        <div className={styles.cardStars}>
                          {[1, 2, 3, 4, 5].map(star => (
                            <svg
                              key={star}
                              width="16"
                              height="16"
                              viewBox="0 0 24 24"
                              fill={star <= Math.round(company.avgRating) ? '#FFD700' : 'none'}
                              stroke={star <= Math.round(company.avgRating) ? '#FFD700' : '#cbd5e1'}
                              strokeWidth="1.5"
                            >
                              <path d="M12 2L15.09 8.26L22 9.27L17 14.14L18.18 21.02L12 17.77L5.82 21.02L7 14.14L2 9.27L8.91 8.26L12 2Z" />
                            </svg>
                          ))}
                        </div>
                      </div>
                      <span className={styles.cardCount}>
                        {company.reviewCount} review{company.reviewCount !== 1 ? 's' : ''}
                      </span>
                      <span className={styles.cardLink}>
                        See reviews
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                          <polyline points="9 18 15 12 9 6" />
                        </svg>
                      </span>
                    </>
                  ) : (
                    <>
                      <span className={styles.cardNoReviews}>No reviews yet</span>
                      <span className={styles.cardLink}>
                        Be the first to review
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                          <polyline points="9 18 15 12 9 6" />
                        </svg>
                      </span>
                    </>
                  )}
                </Link>
              ))}
            </div>
          </>
        ) : (
          <div className={styles.emptyState}>
            <div className={styles.emptyIcon}>
              <svg width="56" height="56" viewBox="0 0 24 24" fill="none" stroke="#cbd5e1" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 2L15.09 8.26L22 9.27L17 14.14L18.18 21.02L12 17.77L5.82 21.02L7 14.14L2 9.27L8.91 8.26L12 2Z" />
              </svg>
            </div>
            <h3 className={styles.emptyTitle}>No companies yet</h3>
            <p className={styles.emptyText}>Companies will appear here once they post jobs on the platform.</p>
          </div>
        )}
      </div>
    </main>
  )
}

'use client'

import { useState, useEffect, useMemo, useCallback } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import Header from '@/components/Header'
import { supabase } from '@/lib/supabase'
import type { CompanyReview } from '@/lib/types'
import styles from './page.module.css'

type SortOption = 'newest' | 'oldest' | 'highest' | 'lowest' | 'helpful'

const SUB_RATING_KEYS = [
  { key: 'work_life_balance', label: 'Work-Life Balance' },
  { key: 'career_progression', label: 'Career Growth' },
  { key: 'management', label: 'Management' },
  { key: 'salary_benefits', label: 'Salary & Benefits' },
  { key: 'culture', label: 'Culture' },
] as const

export default function CompanyReviewsPage() {
  const params = useParams()
  const companySlug = decodeURIComponent(params.company as string)

  const [loading, setLoading] = useState(true)
  const [reviews, setReviews] = useState<CompanyReview[]>([])
  const [sortBy, setSortBy] = useState<SortOption>('newest')
  const [currentUserId, setCurrentUserId] = useState<string | null>(null)
  const [votedReviewIds, setVotedReviewIds] = useState<Set<string>>(new Set())
  const [bannerImage, setBannerImage] = useState<string | null>(null)
  const [companyLogo, setCompanyLogo] = useState<string | null>(null)

  const loadReviews = useCallback(async () => {
    const { data, error } = await supabase
      .from('company_reviews')
      .select('*')
      .ilike('company_name', companySlug)
      .order('created_at', { ascending: false })

    if (!error && data) {
      setReviews(data as CompanyReview[])

      // Fetch reviewer profiles
      const reviewerIds = data.map((r: any) => r.reviewer_id).filter(Boolean)
      if (reviewerIds.length > 0) {
        const { data: profiles } = await supabase
          .from('candidate_profiles')
          .select('user_id, full_name, profile_picture_url')
          .in('user_id', reviewerIds)

        if (profiles) {
          const profileMap = new Map(
            profiles.map((p: any) => [p.user_id, { full_name: p.full_name, avatar_url: p.profile_picture_url }])
          )
          setReviews(prev => prev.map(r => ({
            ...r,
            reviewer: profileMap.get(r.reviewer_id) || undefined,
          })))
        }
      }
    }

    setLoading(false)
  }, [companySlug])

  useEffect(() => {
    const init = async () => {
      const { data: { session } } = await supabase.auth.getSession()
      if (session) {
        setCurrentUserId(session.user.id)

        // Load user's helpful votes
        const { data: votes } = await supabase
          .from('review_helpful_votes')
          .select('review_id')
          .eq('user_id', session.user.id)

        if (votes) {
          setVotedReviewIds(new Set(votes.map((v: any) => v.review_id)))
        }
      }
      // Fetch company banner/logo from most recent job
      const { data: jobData } = await supabase
        .from('jobs')
        .select('company_banner_url, company_logo_url')
        .ilike('company', companySlug)
        .order('created_at', { ascending: false })
        .limit(1)

      if (jobData && jobData.length > 0) {
        if (jobData[0].company_banner_url) setBannerImage(jobData[0].company_banner_url)
        if (jobData[0].company_logo_url) setCompanyLogo(jobData[0].company_logo_url)
      }

      await loadReviews()
    }
    init()
  }, [loadReviews])

  // Average overall rating
  const avgRating = useMemo(() => {
    if (reviews.length === 0) return 0
    return reviews.reduce((sum, r) => sum + r.overall_rating, 0) / reviews.length
  }, [reviews])

  // Sub-rating averages
  const subRatingAverages = useMemo(() => {
    const result: Record<string, number> = {}
    for (const { key } of SUB_RATING_KEYS) {
      const withRating = reviews.filter(r => r[key] != null && r[key]! > 0)
      result[key] = withRating.length > 0
        ? withRating.reduce((sum, r) => sum + (r[key] as number), 0) / withRating.length
        : 0
    }
    return result
  }, [reviews])

  // Rating distribution
  const distribution = useMemo(() => {
    const counts = { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 }
    reviews.forEach(r => {
      const star = Math.min(5, Math.max(1, r.overall_rating)) as keyof typeof counts
      counts[star]++
    })
    return counts
  }, [reviews])

  // Recommend percentage
  const recommendPct = useMemo(() => {
    const withRecommend = reviews.filter(r => r.recommend_to_friend != null)
    if (withRecommend.length === 0) return null
    const yesCount = withRecommend.filter(r => r.recommend_to_friend === true).length
    return Math.round((yesCount / withRecommend.length) * 100)
  }, [reviews])

  // Sorted reviews
  const sortedReviews = useMemo(() => {
    const sorted = [...reviews]
    switch (sortBy) {
      case 'newest':
        return sorted.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
      case 'oldest':
        return sorted.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
      case 'highest':
        return sorted.sort((a, b) => b.overall_rating - a.overall_rating)
      case 'lowest':
        return sorted.sort((a, b) => a.overall_rating - b.overall_rating)
      case 'helpful':
        return sorted.sort((a, b) => b.helpful_count - a.helpful_count)
      default:
        return sorted
    }
  }, [reviews, sortBy])

  // Helpful vote handler
  const handleHelpful = async (reviewId: string) => {
    if (!currentUserId) return
    if (votedReviewIds.has(reviewId)) return

    setVotedReviewIds(prev => new Set(prev).add(reviewId))
    setReviews(prev =>
      prev.map(r => r.id === reviewId ? { ...r, helpful_count: r.helpful_count + 1 } : r)
    )

    // Insert vote record
    await supabase.from('review_helpful_votes').insert({
      review_id: reviewId,
      user_id: currentUserId,
    })

    // Increment count on the review
    const review = reviews.find(r => r.id === reviewId)
    if (review) {
      await supabase
        .from('company_reviews')
        .update({ helpful_count: review.helpful_count + 1 })
        .eq('id', reviewId)
    }
  }

  const hasSubRatings = SUB_RATING_KEYS.some(({ key }) => subRatingAverages[key] > 0)

  if (loading) {
    return (
      <main className={styles.page}>
        <Header />
        <div className={styles.loadingState}>
          <div className={styles.spinner} />
          <span>Loading reviews...</span>
        </div>
      </main>
    )
  }

  return (
    <main className={styles.page}>
      <Header />

      {/* Hero Banner */}
      <div
        className={`${styles.hero} ${bannerImage ? styles.heroWithBanner : ''}`}
        style={bannerImage ? { backgroundImage: `url(${bannerImage})` } : undefined}
      >
        {bannerImage && <div className={styles.heroOverlay} />}
        <div className={styles.heroInner}>
          <div className={styles.heroTop}>
            <div className={styles.heroInfo}>
              {companyLogo && (
                <img
                  src={companyLogo}
                  alt={`${companySlug} logo`}
                  className={styles.heroLogo}
                  onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }}
                />
              )}
              <h1 className={styles.heroCompany}>{companySlug} Reviews</h1>
              <div className={styles.heroRatingRow}>
                {reviews.length > 0 && (
                  <>
                    <span className={styles.heroAvg}>{avgRating.toFixed(1)}</span>
                    <div className={styles.heroStars}>
                      {renderStars(avgRating, 24)}
                    </div>
                  </>
                )}
                <span className={styles.heroCount}>
                  {reviews.length} review{reviews.length !== 1 ? 's' : ''}
                </span>
              </div>
              {recommendPct !== null && (
                <div className={styles.heroRecommend}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M14 9V5a3 3 0 0 0-3-3l-4 9v11h11.28a2 2 0 0 0 2-1.7l1.38-9a2 2 0 0 0-2-2.3H14z" />
                    <path d="M7 22H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h3" />
                  </svg>
                  <span className={styles.heroRecommendPct}>{recommendPct}%</span>
                  <span>recommend to a friend</span>
                </div>
              )}
            </div>
            <Link
              href={`/reviews/${encodeURIComponent(companySlug)}/write`}
              className={styles.writeReviewBtn}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
                <path d="m15 5 4 4" />
              </svg>
              Write a Review
            </Link>
          </div>

          {/* Sub-Ratings */}
          {hasSubRatings && (
            <div className={styles.subRatings}>
              {SUB_RATING_KEYS.map(({ key, label }) => (
                <div key={key} className={styles.subRatingItem}>
                  <span className={styles.subRatingLabel}>{label}</span>
                  <div className={styles.subRatingBarWrap}>
                    <div
                      className={styles.subRatingBar}
                      style={{ width: `${(subRatingAverages[key] / 5) * 100}%` }}
                    />
                  </div>
                  <span className={styles.subRatingValue}>
                    {subRatingAverages[key] > 0 ? subRatingAverages[key].toFixed(1) : '—'}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Content */}
      <div className={styles.container}>
        <div className={styles.layout}>
          {/* Sidebar: Distribution */}
          <aside className={styles.sidebar}>
            <div className={styles.distributionCard}>
              <h2 className={styles.distributionTitle}>Rating Distribution</h2>
              {[5, 4, 3, 2, 1].map(star => {
                const count = distribution[star as keyof typeof distribution]
                const pct = reviews.length > 0 ? (count / reviews.length) * 100 : 0
                return (
                  <div key={star} className={styles.distributionRow}>
                    <span className={styles.distributionLabel}>{star}
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="#FFD700" stroke="#FFD700" strokeWidth="1" style={{ marginLeft: 2, verticalAlign: -1 }}>
                        <path d="M12 2L15.09 8.26L22 9.27L17 14.14L18.18 21.02L12 17.77L5.82 21.02L7 14.14L2 9.27L8.91 8.26L12 2Z" />
                      </svg>
                    </span>
                    <div className={styles.distributionBarWrap}>
                      <div className={styles.distributionBar} style={{ width: `${pct}%` }} />
                    </div>
                    <span className={styles.distributionCount}>{count}</span>
                  </div>
                )
              })}
            </div>
          </aside>

          {/* Main: Reviews */}
          <div className={styles.main}>
            <div className={styles.sortBar}>
              <h2 className={styles.reviewsCount}>
                {reviews.length} Review{reviews.length !== 1 ? 's' : ''}
              </h2>
              {reviews.length > 1 && (
                <select
                  className={styles.sortSelect}
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value as SortOption)}
                >
                  <option value="newest">Most Recent</option>
                  <option value="oldest">Oldest First</option>
                  <option value="highest">Highest Rated</option>
                  <option value="lowest">Lowest Rated</option>
                  <option value="helpful">Most Helpful</option>
                </select>
              )}
            </div>

            {sortedReviews.length > 0 ? (
              sortedReviews.map(review => (
                <div key={review.id} className={styles.reviewCard}>
                  {/* Header */}
                  <div className={styles.reviewHeader}>
                    <div className={styles.reviewHeaderLeft}>
                      {review.review_title && (
                        <h3 className={styles.reviewTitle}>{review.review_title}</h3>
                      )}
                      <div className={styles.reviewStarsRow}>
                        <div className={styles.reviewStars}>
                          {[1, 2, 3, 4, 5].map(s => (
                            <svg
                              key={s}
                              width="16"
                              height="16"
                              viewBox="0 0 24 24"
                              fill={s <= review.overall_rating ? '#FFD700' : 'none'}
                              stroke={s <= review.overall_rating ? '#FFD700' : '#e2e8f0'}
                              strokeWidth="2"
                            >
                              <path d="M12 2L15.09 8.26L22 9.27L17 14.14L18.18 21.02L12 17.77L5.82 21.02L7 14.14L2 9.27L8.91 8.26L12 2Z" />
                            </svg>
                          ))}
                        </div>
                        <span className={styles.reviewDate}>{formatRelativeTime(review.created_at)}</span>
                      </div>
                    </div>
                    {currentUserId === review.reviewer_id && (
                      <Link
                        href={`/reviews/${encodeURIComponent(companySlug)}/write`}
                        className={styles.editReviewBtn}
                        aria-label="Edit your review"
                      >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
                          <path d="m15 5 4 4" />
                        </svg>
                        Edit
                      </Link>
                    )}
                  </div>

                  {/* Meta */}
                  <div className={styles.reviewMeta}>
                    <span className={styles.reviewerName}>
                      {review.reviewer?.full_name || 'Anonymous'}
                    </span>
                    {review.job_title && (
                      <>
                        <span className={styles.metaDot} />
                        <span className={styles.reviewJobTitle}>{review.job_title}</span>
                      </>
                    )}
                    {review.employment_status && (
                      <span className={`${styles.reviewBadge} ${review.employment_status === 'current' ? styles.badgeCurrent : styles.badgeFormer}`}>
                        {review.employment_status} employee
                      </span>
                    )}
                    {review.is_verified && (
                      <span className={`${styles.reviewBadge} ${styles.badgeVerified}`}>Verified</span>
                    )}
                  </div>

                  {/* Recommend */}
                  {review.recommend_to_friend != null && (
                    <div className={`${styles.recommendBadge} ${!review.recommend_to_friend ? styles.notRecommendBadge : ''}`}>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        {review.recommend_to_friend ? (
                          <>
                            <path d="M14 9V5a3 3 0 0 0-3-3l-4 9v11h11.28a2 2 0 0 0 2-1.7l1.38-9a2 2 0 0 0-2-2.3H14z" />
                            <path d="M7 22H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h3" />
                          </>
                        ) : (
                          <>
                            <path d="M10 15V19a3 3 0 0 0 3 3l4-9V2H5.72a2 2 0 0 0-2 1.7l-1.38 9a2 2 0 0 0 2 2.3H10z" />
                            <path d="M17 2h3a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2h-3" />
                          </>
                        )}
                      </svg>
                      {review.recommend_to_friend ? 'Recommends' : 'Does not recommend'}
                    </div>
                  )}

                  {/* Pros & Cons */}
                  <div className={styles.prosConsGrid}>
                    <div className={styles.prosSection}>
                      <span className={styles.sectionIcon}>
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className={styles.prosIcon}>
                          <polyline points="20 6 9 17 4 12" />
                        </svg>
                      </span>
                      <div className={styles.sectionBody}>
                        <p className={`${styles.sectionLabel} ${styles.labelPros}`}>Pros</p>
                        <p className={styles.sectionText}>{review.pros}</p>
                      </div>
                    </div>
                    <div className={styles.consSection}>
                      <span className={styles.sectionIcon}>
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className={styles.consIcon}>
                          <line x1="18" y1="6" x2="6" y2="18" />
                          <line x1="6" y1="6" x2="18" y2="18" />
                        </svg>
                      </span>
                      <div className={styles.sectionBody}>
                        <p className={`${styles.sectionLabel} ${styles.labelCons}`}>Cons</p>
                        <p className={styles.sectionText}>{review.cons}</p>
                      </div>
                    </div>
                  </div>

                  {/* Footer */}
                  <div className={styles.reviewFooter}>
                    <button
                      className={`${styles.helpfulBtn} ${votedReviewIds.has(review.id) ? styles.helpfulBtnActive : ''}`}
                      onClick={() => handleHelpful(review.id)}
                      disabled={!currentUserId || votedReviewIds.has(review.id)}
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M14 9V5a3 3 0 0 0-3-3l-4 9v11h11.28a2 2 0 0 0 2-1.7l1.38-9a2 2 0 0 0-2-2.3H14z" />
                        <path d="M7 22H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h3" />
                      </svg>
                      Helpful
                      {review.helpful_count > 0 && (
                        <span className={styles.helpfulCount}>({review.helpful_count})</span>
                      )}
                    </button>
                  </div>
                </div>
              ))
            ) : (
              <div className={styles.emptyState}>
                <div className={styles.emptyIcon}>
                  <svg width="56" height="56" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M12 2L15.09 8.26L22 9.27L17 14.14L18.18 21.02L12 17.77L5.82 21.02L7 14.14L2 9.27L8.91 8.26L12 2Z" />
                  </svg>
                </div>
                <h3 className={styles.emptyTitle}>No reviews yet</h3>
                <p className={styles.emptyText}>Be the first to review {companySlug}!</p>
                <Link
                  href={`/reviews/${encodeURIComponent(companySlug)}/write`}
                  className={styles.writeReviewBtn}
                >
                  Write a Review
                </Link>
              </div>
            )}
          </div>
        </div>
      </div>
    </main>
  )
}

// Star rendering helper
function renderStars(rating: number, size: number) {
  return [1, 2, 3, 4, 5].map(star => (
    <svg
      key={star}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={star <= Math.round(rating) ? '#FFD700' : 'none'}
      stroke={star <= Math.round(rating) ? '#FFD700' : '#475569'}
      strokeWidth="2"
    >
      <path d="M12 2L15.09 8.26L22 9.27L17 14.14L18.18 21.02L12 17.77L5.82 21.02L7 14.14L2 9.27L8.91 8.26L12 2Z" />
    </svg>
  ))
}

// Relative time formatter
function formatRelativeTime(isoDate: string): string {
  const now = new Date()
  const date = new Date(isoDate)
  const diffMs = now.getTime() - date.getTime()
  const diffMinutes = Math.floor(diffMs / 60000)
  const diffHours = Math.floor(diffMs / 3600000)
  const diffDays = Math.floor(diffMs / 86400000)

  if (diffMinutes < 1) return 'Just now'
  if (diffMinutes < 60) return `${diffMinutes}m ago`
  if (diffHours < 24) return `${diffHours}h ago`
  if (diffDays === 1) return 'Yesterday'
  if (diffDays < 7) return `${diffDays}d ago`
  if (diffDays < 30) return `${Math.floor(diffDays / 7)}w ago`
  return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}

'use client'

import { useState, useEffect, useMemo, useCallback } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import Header from '@/components/Header'
import { supabase } from '@/lib/supabase'
import styles from './page.module.css'

interface CompanyInfo {
  name: string
  logoUrl: string | null
  location: string | null
  industry: string | null
  description: string | null
  employerId: string | null
}

interface Review {
  id: string
  reviewerId: string
  overallRating: number
  pros: string
  cons: string
  jobTitle: string
  employmentStatus: 'current' | 'former'
  helpfulCount: number
  createdAt: string
}

const RATING_LABELS: Record<number, string> = {
  1: 'Poor',
  2: 'Fair',
  3: 'Good',
  4: 'Very Good',
  5: 'Excellent',
}

export default function CompanyPage() {
  const params = useParams()
  const slug = decodeURIComponent(params.slug as string)

  const [loading, setLoading] = useState(true)
  const [company, setCompany] = useState<CompanyInfo | null>(null)
  const [reviews, setReviews] = useState<Review[]>([])
  const [showModal, setShowModal] = useState(false)
  const [currentUserId, setCurrentUserId] = useState<string | null>(null)
  const [sortBy, setSortBy] = useState<'newest' | 'highest' | 'lowest'>('newest')

  const loadCompanyAndReviews = useCallback(async () => {
    // The slug is the company name (URL-encoded)
    const companyName = slug

    // Try to find the company in jobs table first (most reliable source of company data)
    const { data: jobData } = await supabase
      .from('jobs')
      .select('company, company_logo_url, company_description, employer_id, location')
      .ilike('company', companyName)
      .limit(1)

    // Also try employer_profiles
    const { data: employerData } = await supabase
      .from('employer_profiles')
      .select('user_id, company_name, logo_url, location, industry, description')
      .ilike('company_name', companyName)
      .limit(1)

    let companyInfo: CompanyInfo | null = null

    if (employerData && employerData.length > 0) {
      const emp = employerData[0]
      companyInfo = {
        name: emp.company_name,
        logoUrl: emp.logo_url || (jobData?.[0]?.company_logo_url || null),
        location: emp.location || (jobData?.[0]?.location || null),
        industry: emp.industry || null,
        description: emp.description || (jobData?.[0]?.company_description || null),
        employerId: emp.user_id,
      }
    } else if (jobData && jobData.length > 0) {
      const job = jobData[0]
      companyInfo = {
        name: job.company,
        logoUrl: job.company_logo_url || null,
        location: job.location || null,
        industry: null,
        description: job.company_description || null,
        employerId: job.employer_id,
      }
    } else {
      // Company not found in our system — still show reviews if any exist
      companyInfo = {
        name: companyName,
        logoUrl: null,
        location: null,
        industry: null,
        description: null,
        employerId: null,
      }
    }

    setCompany(companyInfo)

    // Load reviews for this company
    const { data: reviewData } = await supabase
      .from('company_reviews')
      .select('*')
      .ilike('company_name', companyName)
      .order('created_at', { ascending: false })

    if (reviewData) {
      setReviews(reviewData.map((r: any) => ({
        id: r.id,
        reviewerId: r.reviewer_id,
        overallRating: r.overall_rating,
        pros: r.pros,
        cons: r.cons,
        jobTitle: r.job_title,
        employmentStatus: r.employment_status,
        helpfulCount: r.helpful_count,
        createdAt: r.created_at,
      })))
    }

    setLoading(false)
  }, [slug])

  useEffect(() => {
    const checkAuth = async () => {
      const { data: { session } } = await supabase.auth.getSession()
      if (session) {
        setCurrentUserId(session.user.id)
      }
    }
    checkAuth()
    loadCompanyAndReviews()
  }, [loadCompanyAndReviews])

  // Computed values
  const avgRating = useMemo(() => {
    if (reviews.length === 0) return 0
    return reviews.reduce((sum, r) => sum + r.overallRating, 0) / reviews.length
  }, [reviews])

  const ratingBreakdown = useMemo(() => {
    const counts = { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 }
    reviews.forEach(r => {
      counts[r.overallRating as keyof typeof counts]++
    })
    return counts
  }, [reviews])

  const sortedReviews = useMemo(() => {
    const sorted = [...reviews]
    switch (sortBy) {
      case 'newest':
        return sorted.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      case 'highest':
        return sorted.sort((a, b) => b.overallRating - a.overallRating)
      case 'lowest':
        return sorted.sort((a, b) => a.overallRating - b.overallRating)
      default:
        return sorted
    }
  }, [reviews, sortBy])

  const hasUserReviewed = useMemo(() => {
    if (!currentUserId) return false
    return reviews.some(r => r.reviewerId === currentUserId)
  }, [reviews, currentUserId])

  const handleReviewSubmitted = (newReview: Review) => {
    setReviews(prev => [newReview, ...prev])
    setShowModal(false)
  }

  const handleHelpful = async (reviewId: string) => {
    const review = reviews.find(r => r.id === reviewId)
    if (!review) return
    const newCount = review.helpfulCount + 1
    setReviews(prev =>
      prev.map(r => r.id === reviewId ? { ...r, helpfulCount: newCount } : r)
    )
    await supabase
      .from('company_reviews')
      .update({ helpful_count: newCount })
      .eq('id', reviewId)
  }

  if (loading) {
    return (
      <main className={styles.page}>
        <Header />
        <div className={styles.loadingState}>
          <div className={styles.spinner} />
          <span>Loading company profile...</span>
        </div>
      </main>
    )
  }

  if (!company) {
    return (
      <main className={styles.page}>
        <Header />
        <div className={styles.notFound}>
          <h1 className={styles.notFoundTitle}>Company Not Found</h1>
          <p className={styles.notFoundText}>We couldn&apos;t find this company.</p>
          <Link href="/jobs" className={styles.backLink}>Browse Jobs</Link>
        </div>
      </main>
    )
  }

  return (
    <main className={styles.page}>
      <Header />

      {/* Company Banner */}
      <div className={styles.banner}>
        <div className={styles.bannerInner}>
          <div className={styles.bannerLogo}>
            {company.logoUrl ? (
              <img src={company.logoUrl} alt={company.name} className={styles.bannerLogoImg} />
            ) : (
              <span className={styles.bannerLogoFallback}>{company.name.charAt(0)}</span>
            )}
          </div>
          <div className={styles.bannerInfo}>
            <h1 className={styles.bannerCompany}>{company.name}</h1>
            <div className={styles.bannerMeta}>
              {reviews.length > 0 && (
                <>
                  <div className={styles.bannerStars}>
                    {renderStars(avgRating, 20)}
                    <span className={styles.bannerAvg}>{avgRating.toFixed(1)}</span>
                  </div>
                  <span className={styles.bannerCount}>
                    {reviews.length} review{reviews.length !== 1 ? 's' : ''}
                  </span>
                </>
              )}
              {company.location && (
                <span className={styles.bannerLocation}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
                    <circle cx="12" cy="10" r="3" />
                  </svg>
                  {company.location}
                </span>
              )}
              {company.industry && (
                <span className={styles.bannerIndustry}>{company.industry}</span>
              )}
            </div>
            {company.description && (
              <p className={styles.bannerDescription}>{company.description}</p>
            )}
          </div>
        </div>
      </div>

      <div className={styles.container}>
        {/* Rating Breakdown */}
        <div className={styles.breakdownCard}>
          <div className={styles.breakdownHeader}>
            <h2 className={styles.breakdownTitle}>Rating Breakdown</h2>
            {currentUserId && !hasUserReviewed && (
              <button className={styles.writeReviewBtn} onClick={() => setShowModal(true)}>
                Write a Review
              </button>
            )}
            {!currentUserId && (
              <Link href="/login" className={styles.writeReviewBtn} style={{ textDecoration: 'none' }}>
                Sign in to Review
              </Link>
            )}
          </div>
          <div className={styles.breakdownRows}>
            {[5, 4, 3, 2, 1].map(star => (
              <div key={star} className={styles.breakdownRow}>
                <span className={styles.breakdownLabel}>{star} star</span>
                <div className={styles.breakdownBarWrap}>
                  <div
                    className={styles.breakdownBar}
                    style={{ width: reviews.length > 0 ? `${(ratingBreakdown[star as keyof typeof ratingBreakdown] / reviews.length) * 100}%` : '0%' }}
                  />
                </div>
                <span className={styles.breakdownCount}>{ratingBreakdown[star as keyof typeof ratingBreakdown]}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Reviews List */}
        <div className={styles.reviewsHeader}>
          <h2 className={styles.reviewsTitle}>
            Reviews {reviews.length > 0 && `(${reviews.length})`}
          </h2>
          {reviews.length > 1 && (
            <select
              className={styles.reviewsSort}
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as any)}
            >
              <option value="newest">Most Recent</option>
              <option value="highest">Highest Rated</option>
              <option value="lowest">Lowest Rated</option>
            </select>
          )}
        </div>

        {sortedReviews.length > 0 ? (
          sortedReviews.map(review => (
            <div key={review.id} className={styles.reviewCard}>
              <div className={styles.reviewTop}>
                <div className={styles.reviewStars}>
                  {[1, 2, 3, 4, 5].map(star => (
                    <svg
                      key={star}
                      width="18"
                      height="18"
                      viewBox="0 0 24 24"
                      fill={star <= review.overallRating ? '#FFD700' : 'none'}
                      stroke={star <= review.overallRating ? '#FFD700' : '#e2e8f0'}
                      strokeWidth="2"
                      className={star <= review.overallRating ? styles.reviewStarFilled : styles.reviewStarEmpty}
                    >
                      <path d="M12 2L15.09 8.26L22 9.27L17 14.14L18.18 21.02L12 17.77L5.82 21.02L7 14.14L2 9.27L8.91 8.26L12 2Z" />
                    </svg>
                  ))}
                </div>
                <span className={styles.reviewDate}>
                  {new Date(review.createdAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                </span>
              </div>

              <div className={styles.reviewMeta}>
                <span className={styles.reviewJobTitle}>{review.jobTitle}</span>
                <span className={`${styles.reviewStatus} ${review.employmentStatus === 'current' ? styles.reviewStatusCurrent : ''}`}>
                  {review.employmentStatus} employee
                </span>
              </div>

              <div className={styles.reviewProsCons}>
                <div className={styles.reviewSection}>
                  <span className={styles.reviewSectionIcon}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={styles.prosIcon}>
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                  </span>
                  <div className={styles.reviewSectionContent}>
                    <p className={`${styles.reviewSectionLabel} ${styles.prosLabel}`}>Pros</p>
                    <p className={styles.reviewSectionText}>{review.pros}</p>
                  </div>
                </div>
                <div className={styles.reviewSection}>
                  <span className={styles.reviewSectionIcon}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={styles.consIcon}>
                      <line x1="18" y1="6" x2="6" y2="18" />
                      <line x1="6" y1="6" x2="18" y2="18" />
                    </svg>
                  </span>
                  <div className={styles.reviewSectionContent}>
                    <p className={`${styles.reviewSectionLabel} ${styles.consLabel}`}>Cons</p>
                    <p className={styles.reviewSectionText}>{review.cons}</p>
                  </div>
                </div>
              </div>

              <div className={styles.reviewFooter}>
                <button className={styles.helpfulBtn} onClick={() => handleHelpful(review.id)}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M14 9V5a3 3 0 0 0-3-3l-4 9v11h11.28a2 2 0 0 0 2-1.7l1.38-9a2 2 0 0 0-2-2.3H14z" />
                    <path d="M7 22H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h3" />
                  </svg>
                  Helpful {review.helpfulCount > 0 && `(${review.helpfulCount})`}
                </button>
              </div>
            </div>
          ))
        ) : (
          <div className={styles.emptyReviews}>
            <div className={styles.emptyIcon}>
              <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#cbd5e1" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 2L15.09 8.26L22 9.27L17 14.14L18.18 21.02L12 17.77L5.82 21.02L7 14.14L2 9.27L8.91 8.26L12 2Z" />
              </svg>
            </div>
            <p className={styles.emptyText}>No reviews yet for {company.name}</p>
            <p className={styles.emptySub}>Be the first to share your experience!</p>
          </div>
        )}
      </div>

      {/* Review Modal */}
      {showModal && company && (
        <ReviewModal
          companyName={company.name}
          employerId={company.employerId}
          reviewerId={currentUserId!}
          onClose={() => setShowModal(false)}
          onSubmit={handleReviewSubmitted}
        />
      )}
    </main>
  )
}

// Star rendering helper
function renderStars(rating: number, size: number = 18) {
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

// Review Form Modal
interface ReviewModalProps {
  companyName: string
  employerId: string | null
  reviewerId: string
  onClose: () => void
  onSubmit: (review: Review) => void
}

function ReviewModal({ companyName, employerId, reviewerId, onClose, onSubmit }: ReviewModalProps) {
  const [rating, setRating] = useState(0)
  const [hoverRating, setHoverRating] = useState(0)
  const [pros, setPros] = useState('')
  const [cons, setCons] = useState('')
  const [jobTitle, setJobTitle] = useState('')
  const [employmentStatus, setEmploymentStatus] = useState<'current' | 'former' | ''>('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  const isValid = rating > 0 && pros.trim() && cons.trim() && jobTitle.trim() && employmentStatus

  const handleSubmit = async () => {
    if (!isValid) {
      setError('Please fill in all required fields.')
      return
    }

    setSubmitting(true)
    setError('')

    const { data, error: dbError } = await supabase
      .from('company_reviews')
      .insert({
        reviewer_id: reviewerId,
        company_name: companyName,
        employer_id: employerId,
        overall_rating: rating,
        pros: pros.trim(),
        cons: cons.trim(),
        job_title: jobTitle.trim(),
        employment_status: employmentStatus,
      })
      .select()
      .single()

    if (dbError) {
      if (dbError.code === '23505') {
        setError('You have already reviewed this company.')
      } else {
        setError('Failed to submit review. Please try again.')
      }
      setSubmitting(false)
      return
    }

    onSubmit({
      id: data.id,
      reviewerId: data.reviewer_id,
      overallRating: data.overall_rating,
      pros: data.pros,
      cons: data.cons,
      jobTitle: data.job_title,
      employmentStatus: data.employment_status,
      helpfulCount: 0,
      createdAt: data.created_at,
    })
  }

  const displayRating = hoverRating || rating

  return (
    <div className={styles.modalOverlay} onClick={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div className={styles.modal}>
        <div className={styles.modalHeader}>
          <h2 className={styles.modalTitle}>Review {companyName}</h2>
          <button className={styles.modalClose} onClick={onClose}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        <div className={styles.modalBody}>
          {error && <div className={styles.formError}>{error}</div>}

          {/* Star Rating */}
          <div className={styles.ratingInput}>
            <label className={styles.ratingLabel}>
              Overall Rating<span className={styles.formRequired}>*</span>
            </label>
            <div className={styles.ratingStars}>
              {[1, 2, 3, 4, 5].map(star => (
                <svg
                  key={star}
                  width="32"
                  height="32"
                  viewBox="0 0 24 24"
                  fill={star <= displayRating ? '#FFD700' : 'none'}
                  stroke={star <= displayRating ? '#FFD700' : '#e2e8f0'}
                  strokeWidth="2"
                  className={`${styles.ratingStar} ${star <= displayRating ? styles.ratingStarActive : ''}`}
                  onClick={() => setRating(star)}
                  onMouseEnter={() => setHoverRating(star)}
                  onMouseLeave={() => setHoverRating(0)}
                >
                  <path d="M12 2L15.09 8.26L22 9.27L17 14.14L18.18 21.02L12 17.77L5.82 21.02L7 14.14L2 9.27L8.91 8.26L12 2Z" />
                </svg>
              ))}
            </div>
            {displayRating > 0 && (
              <span className={styles.ratingText}>{RATING_LABELS[displayRating]}</span>
            )}
          </div>

          {/* Job Title */}
          <div className={styles.formGroup}>
            <label className={styles.formLabel}>
              Your Job Title<span className={styles.formRequired}>*</span>
            </label>
            <input
              type="text"
              className={styles.formInput}
              placeholder="e.g. Front Desk Manager"
              value={jobTitle}
              onChange={(e) => setJobTitle(e.target.value)}
              maxLength={100}
            />
          </div>

          {/* Employment Status */}
          <div className={styles.formGroup}>
            <label className={styles.formLabel}>
              Employment Status<span className={styles.formRequired}>*</span>
            </label>
            <select
              className={styles.formSelect}
              value={employmentStatus}
              onChange={(e) => setEmploymentStatus(e.target.value as 'current' | 'former')}
            >
              <option value="">Select...</option>
              <option value="current">Current Employee</option>
              <option value="former">Former Employee</option>
            </select>
          </div>

          {/* Pros */}
          <div className={styles.formGroup}>
            <label className={styles.formLabel}>
              Pros<span className={styles.formRequired}>*</span>
            </label>
            <textarea
              className={styles.formTextarea}
              placeholder="What do you like about working here?"
              value={pros}
              onChange={(e) => setPros(e.target.value)}
              rows={3}
              maxLength={2000}
            />
            <span className={styles.formHint}>{pros.length}/2000</span>
          </div>

          {/* Cons */}
          <div className={styles.formGroup}>
            <label className={styles.formLabel}>
              Cons<span className={styles.formRequired}>*</span>
            </label>
            <textarea
              className={styles.formTextarea}
              placeholder="What could be improved?"
              value={cons}
              onChange={(e) => setCons(e.target.value)}
              rows={3}
              maxLength={2000}
            />
            <span className={styles.formHint}>{cons.length}/2000</span>
          </div>
        </div>

        <div className={styles.modalFooter}>
          <button className={styles.cancelBtn} onClick={onClose}>Cancel</button>
          <button
            className={styles.submitBtn}
            disabled={!isValid || submitting}
            onClick={handleSubmit}
          >
            {submitting ? 'Submitting...' : 'Submit Review'}
          </button>
        </div>
      </div>
    </div>
  )
}

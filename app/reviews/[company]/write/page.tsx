'use client'

import { useState, useEffect, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import Header from '@/components/Header'
import { supabase } from '@/lib/supabase'
import type { CompanyReview } from '@/lib/types'
import styles from './page.module.css'

const RATING_LABELS: Record<number, string> = {
  1: 'Poor',
  2: 'Fair',
  3: 'Good',
  4: 'Very Good',
  5: 'Excellent',
}

const SUB_RATINGS = [
  { key: 'work_life_balance', label: 'Work-Life Balance' },
  { key: 'career_progression', label: 'Career Progression' },
  { key: 'management', label: 'Management' },
  { key: 'salary_benefits', label: 'Salary & Benefits' },
  { key: 'culture', label: 'Culture' },
] as const

type SubRatingKey = typeof SUB_RATINGS[number]['key']

const MIN_PROS_CONS = 50

export default function WriteReviewPage() {
  const params = useParams()
  const router = useRouter()
  const companySlug = decodeURIComponent(params.company as string)

  // Title case fallback for create mode
  const titleCased = companySlug
    .split(' ')
    .map(w => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ')

  const [companyName, setCompanyName] = useState(titleCased)
  const [loading, setLoading] = useState(true)
  const [companyNotOnPlatform, setCompanyNotOnPlatform] = useState(false)
  const [userId, setUserId] = useState<string | null>(null)
  const [existingReview, setExistingReview] = useState<CompanyReview | null>(null)
  const [isEditing, setIsEditing] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [showToast, setShowToast] = useState(false)
  const [toastMessage, setToastMessage] = useState('')
  const [globalError, setGlobalError] = useState('')

  // Form state
  const [reviewTitle, setReviewTitle] = useState('')
  const [overallRating, setOverallRating] = useState(0)
  const [hoverRating, setHoverRating] = useState(0)
  const [pros, setPros] = useState('')
  const [cons, setCons] = useState('')
  const [jobTitle, setJobTitle] = useState('')
  const [employmentStatus, setEmploymentStatus] = useState<'current' | 'former' | ''>('')
  const [recommendToFriend, setRecommendToFriend] = useState<boolean | null>(null)
  const [subRatings, setSubRatings] = useState<Record<SubRatingKey, number>>({
    work_life_balance: 0,
    career_progression: 0,
    management: 0,
    salary_benefits: 0,
    culture: 0,
  })
  const [subHover, setSubHover] = useState<Record<SubRatingKey, number>>({
    work_life_balance: 0,
    career_progression: 0,
    management: 0,
    salary_benefits: 0,
    culture: 0,
  })

  // Validation touched state
  const [touched, setTouched] = useState({
    overallRating: false,
    pros: false,
    cons: false,
  })

  // Populate form from an existing review
  const populateFromReview = useCallback((review: CompanyReview) => {
    setReviewTitle(review.review_title || '')
    setOverallRating(review.overall_rating)
    setPros(review.pros)
    setCons(review.cons)
    setJobTitle(review.job_title || '')
    setEmploymentStatus(review.employment_status || '')
    setRecommendToFriend(review.recommend_to_friend)
    setSubRatings({
      work_life_balance: review.work_life_balance || 0,
      career_progression: review.career_progression || 0,
      management: review.management || 0,
      salary_benefits: review.salary_benefits || 0,
      culture: review.culture || 0,
    })
  }, [])

  useEffect(() => {
    const init = async () => {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) {
        router.push(`/login?redirect=${encodeURIComponent(`/reviews/${encodeURIComponent(companySlug)}/write`)}`)
        return
      }

      setUserId(session.user.id)

      // Validate company exists on platform (has posted jobs)
      const { data: jobMatch } = await supabase
        .from('jobs')
        .select('company')
        .ilike('company', companySlug)
        .limit(1)

      if (!jobMatch || jobMatch.length === 0) {
        setCompanyNotOnPlatform(true)
        setLoading(false)
        return
      }

      // Use the actual company name from jobs for correct casing
      setCompanyName(jobMatch[0].company)

      // Check for existing review
      const { data: existing } = await supabase
        .from('company_reviews')
        .select('*')
        .eq('reviewer_id', session.user.id)
        .ilike('company_name', companySlug)
        .limit(1)

      if (existing && existing.length > 0) {
        const review = existing[0] as CompanyReview
        setExistingReview(review)
        setCompanyName(review.company_name)
        populateFromReview(review)
        setIsEditing(true)
      }

      setLoading(false)
    }
    init()
  }, [router, companySlug, populateFromReview])

  // Delete handler
  const handleDelete = async () => {
    if (!existingReview || !userId) return
    setDeleting(true)

    const { error } = await supabase
      .from('company_reviews')
      .delete()
      .eq('id', existingReview.id)
      .eq('reviewer_id', userId)

    if (error) {
      setGlobalError(error.message || 'Failed to delete review. Please try again.')
      setDeleting(false)
      setShowDeleteConfirm(false)
      return
    }

    setShowDeleteConfirm(false)
    setToastMessage('Review deleted successfully')
    setShowToast(true)
    setTimeout(() => {
      router.push(`/reviews/${encodeURIComponent(companySlug)}`)
    }, 1500)
  }

  // Validation
  const errors = {
    overallRating: touched.overallRating && overallRating === 0 ? 'Please select a rating' : '',
    pros: touched.pros && pros.trim().length < MIN_PROS_CONS
      ? `Please write at least ${MIN_PROS_CONS} characters (${pros.trim().length}/${MIN_PROS_CONS})`
      : '',
    cons: touched.cons && cons.trim().length < MIN_PROS_CONS
      ? `Please write at least ${MIN_PROS_CONS} characters (${cons.trim().length}/${MIN_PROS_CONS})`
      : '',
  }

  const isValid = overallRating > 0
    && pros.trim().length >= MIN_PROS_CONS
    && cons.trim().length >= MIN_PROS_CONS

  const handleSubmit = async () => {
    // Touch all fields
    setTouched({ overallRating: true, pros: true, cons: true })

    if (!isValid || !userId) return

    setSubmitting(true)
    setGlobalError('')

    const payload = {
      reviewer_id: userId,
      company_name: companyName,
      overall_rating: overallRating,
      pros: pros.trim(),
      cons: cons.trim(),
      review_title: reviewTitle.trim() || null,
      job_title: jobTitle.trim() || null,
      employment_status: employmentStatus || null,
      recommend_to_friend: recommendToFriend,
      work_life_balance: subRatings.work_life_balance || null,
      career_progression: subRatings.career_progression || null,
      management: subRatings.management || null,
      salary_benefits: subRatings.salary_benefits || null,
      culture: subRatings.culture || null,
    }

    let error: any = null

    if (isEditing && existingReview) {
      // Update existing
      const result = await supabase
        .from('company_reviews')
        .update(payload)
        .eq('id', existingReview.id)

      error = result.error
    } else {
      // Insert new
      const result = await supabase
        .from('company_reviews')
        .insert(payload)

      error = result.error
    }

    if (error) {
      if (error.code === '23505') {
        setGlobalError('You have already submitted a review for this company.')
      } else {
        setGlobalError(error.message || 'Something went wrong. Please try again.')
      }
      setSubmitting(false)
      return
    }

    // Show toast then redirect
    setToastMessage(isEditing ? 'Review updated successfully!' : 'Review submitted successfully!')
    setShowToast(true)
    setTimeout(() => {
      router.push(`/reviews/${encodeURIComponent(companySlug)}`)
    }, 1500)
  }

  const displayRating = hoverRating || overallRating

  if (loading) {
    return (
      <main className={styles.page}>
        <Header />
        <div className={styles.loadingState}>
          <div className={styles.spinner} />
          <span>Loading...</span>
        </div>
      </main>
    )
  }

  if (companyNotOnPlatform) {
    return (
      <main className={styles.page}>
        <Header />
        <div className={styles.topBar}>
          <div className={styles.topBarInner}>
            <Link href="/reviews" className={styles.backLink}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="15 18 9 12 15 6" />
              </svg>
              Back to reviews
            </Link>
            <h1 className={styles.topBarTitle}>Write a Review</h1>
            <p className={styles.topBarCompany}>{companyName}</p>
          </div>
        </div>
        <div className={styles.container}>
          <div className={styles.notOnPlatform}>
            <div className={styles.notOnPlatformIcon}>
              <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="8" x2="12" y2="12" />
                <line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
            </div>
            <h2 className={styles.notOnPlatformTitle}>Company Not Found</h2>
            <p className={styles.notOnPlatformText}>
              This company hasn&apos;t posted any jobs on Hex yet.
              You can only review companies with active or past job listings.
            </p>
            <Link href="/reviews" className={styles.notOnPlatformLink}>
              Browse companies
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="9 18 15 12 9 6" />
              </svg>
            </Link>
          </div>
        </div>
      </main>
    )
  }

  return (
    <main className={styles.page}>
      <Header />

      {/* Top Bar */}
      <div className={styles.topBar}>
        <div className={styles.topBarInner}>
          <Link href={`/reviews/${encodeURIComponent(companySlug)}`} className={styles.backLink}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="15 18 9 12 15 6" />
            </svg>
            Back to reviews
          </Link>
          <h1 className={styles.topBarTitle}>
            {isEditing ? 'Edit Your Review' : 'Write a Review'}
          </h1>
          <p className={styles.topBarCompany}>{companyName}</p>
        </div>
      </div>

      <div className={styles.container}>
        {/* Form */}
          <div className={styles.formCard}>
            {globalError && (
              <div style={{ padding: '1.5rem 1.5rem 0' }}>
                <div className={styles.globalError}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="10" />
                    <line x1="15" y1="9" x2="9" y2="15" />
                    <line x1="9" y1="9" x2="15" y2="15" />
                  </svg>
                  {globalError}
                </div>
              </div>
            )}

            {/* Company Name (read-only) */}
            <div className={styles.section}>
              <label className={styles.label}>Company</label>
              <div className={styles.readOnlyField}>{companyName}</div>
            </div>

            {/* Section 1: Overall Rating */}
            <div className={styles.section}>
              <h2 className={styles.sectionTitle}>Overall Rating<span className={styles.required}>*</span></h2>
              <div className={styles.overallRating}>
                <div className={styles.starsRow}>
                  {[1, 2, 3, 4, 5].map(star => (
                    <button
                      key={star}
                      type="button"
                      className={styles.starBtn}
                      onClick={() => { setOverallRating(star); setTouched(t => ({ ...t, overallRating: true })) }}
                      onMouseEnter={() => setHoverRating(star)}
                      onMouseLeave={() => setHoverRating(0)}
                      aria-label={`${star} star${star > 1 ? 's' : ''}`}
                    >
                      <svg
                        width="36"
                        height="36"
                        viewBox="0 0 24 24"
                        fill={star <= displayRating ? '#FFD700' : 'none'}
                        stroke={star <= displayRating ? '#FFD700' : '#cbd5e1'}
                        strokeWidth="2"
                      >
                        <path d="M12 2L15.09 8.26L22 9.27L17 14.14L18.18 21.02L12 17.77L5.82 21.02L7 14.14L2 9.27L8.91 8.26L12 2Z" />
                      </svg>
                    </button>
                  ))}
                  {displayRating > 0 && (
                    <span className={styles.ratingLabel}>{RATING_LABELS[displayRating]}</span>
                  )}
                </div>
                {errors.overallRating && <p className={styles.fieldError}>{errors.overallRating}</p>}
              </div>
            </div>

            {/* Section 2: Review Title & Details */}
            <div className={styles.section}>
              <h2 className={styles.sectionTitle}>Your Review</h2>

              <div className={styles.formGroup}>
                <label className={styles.label}>
                  Review Title<span className={styles.optional}>(optional)</span>
                </label>
                <input
                  type="text"
                  className={styles.input}
                  placeholder='e.g. "Great place to grow your career"'
                  value={reviewTitle}
                  onChange={(e) => setReviewTitle(e.target.value)}
                  maxLength={150}
                />
              </div>

              <div className={styles.formGroup}>
                <label className={styles.label}>
                  Pros<span className={styles.required}>*</span>
                </label>
                <textarea
                  className={`${styles.textarea} ${errors.pros ? styles.textareaError : ''}`}
                  placeholder="What do you like about working here? What are the best parts?"
                  value={pros}
                  onChange={(e) => setPros(e.target.value)}
                  onBlur={() => setTouched(t => ({ ...t, pros: true }))}
                  maxLength={3000}
                  rows={4}
                />
                <div className={styles.fieldFooter}>
                  {errors.pros ? (
                    <span className={styles.fieldError}>{errors.pros}</span>
                  ) : (
                    <span />
                  )}
                  <span className={`${styles.charCount} ${pros.trim().length < MIN_PROS_CONS && pros.trim().length > 0 ? styles.charCountWarn : ''}`}>
                    {pros.length}/3000
                  </span>
                </div>
              </div>

              <div className={styles.formGroup}>
                <label className={styles.label}>
                  Cons<span className={styles.required}>*</span>
                </label>
                <textarea
                  className={`${styles.textarea} ${errors.cons ? styles.textareaError : ''}`}
                  placeholder="What could be improved? What are the downsides?"
                  value={cons}
                  onChange={(e) => setCons(e.target.value)}
                  onBlur={() => setTouched(t => ({ ...t, cons: true }))}
                  maxLength={3000}
                  rows={4}
                />
                <div className={styles.fieldFooter}>
                  {errors.cons ? (
                    <span className={styles.fieldError}>{errors.cons}</span>
                  ) : (
                    <span />
                  )}
                  <span className={`${styles.charCount} ${cons.trim().length < MIN_PROS_CONS && cons.trim().length > 0 ? styles.charCountWarn : ''}`}>
                    {cons.length}/3000
                  </span>
                </div>
              </div>
            </div>

            {/* Section 3: About You */}
            <div className={styles.section}>
              <h2 className={styles.sectionTitle}>About You</h2>

              <div className={styles.formGroup}>
                <label className={styles.label}>
                  Job Title<span className={styles.optional}>(optional)</span>
                </label>
                <input
                  type="text"
                  className={styles.input}
                  placeholder="e.g. Front Desk Manager"
                  value={jobTitle}
                  onChange={(e) => setJobTitle(e.target.value)}
                  maxLength={100}
                />
              </div>

              <div className={styles.formGroup}>
                <label className={styles.label}>Employment Status</label>
                <div className={styles.radioGroup}>
                  {[
                    { value: 'current', label: 'Current Employee' },
                    { value: 'former', label: 'Former Employee' },
                  ].map(opt => (
                    <label
                      key={opt.value}
                      className={`${styles.radioLabel} ${employmentStatus === opt.value ? styles.radioLabelActive : ''}`}
                    >
                      <input
                        type="radio"
                        name="employmentStatus"
                        value={opt.value}
                        checked={employmentStatus === opt.value}
                        onChange={() => setEmploymentStatus(opt.value as 'current' | 'former')}
                        className={styles.radioInput}
                      />
                      <span className={`${styles.radioDot} ${employmentStatus === opt.value ? styles.radioDotActive : ''}`} />
                      {opt.label}
                    </label>
                  ))}
                </div>
              </div>

              <div className={styles.formGroup}>
                <label className={styles.label}>Would you recommend this company to a friend?</label>
                <div className={styles.toggleGroup}>
                  <button
                    type="button"
                    className={`${styles.toggleBtn} ${recommendToFriend === true ? styles.toggleBtnYes : ''}`}
                    onClick={() => setRecommendToFriend(recommendToFriend === true ? null : true)}
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M14 9V5a3 3 0 0 0-3-3l-4 9v11h11.28a2 2 0 0 0 2-1.7l1.38-9a2 2 0 0 0-2-2.3H14z" />
                      <path d="M7 22H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h3" />
                    </svg>
                    Yes
                  </button>
                  <button
                    type="button"
                    className={`${styles.toggleBtn} ${recommendToFriend === false ? styles.toggleBtnNo : ''}`}
                    onClick={() => setRecommendToFriend(recommendToFriend === false ? null : false)}
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M10 15V19a3 3 0 0 0 3 3l4-9V2H5.72a2 2 0 0 0-2 1.7l-1.38 9a2 2 0 0 0 2 2.3H10z" />
                      <path d="M17 2h3a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2h-3" />
                    </svg>
                    No
                  </button>
                </div>
              </div>
            </div>

            {/* Section 4: Sub-Ratings */}
            <div className={styles.section}>
              <h2 className={styles.sectionTitle}>Category Ratings</h2>
              <p className={styles.sectionSubtitle}>Optional — rate specific aspects of working here</p>

              {SUB_RATINGS.map(({ key, label }) => {
                const displayVal = subHover[key] || subRatings[key]
                return (
                  <div key={key} className={styles.subRatingRow}>
                    <span className={styles.subRatingLabel}>{label}</span>
                    <div className={styles.subRatingStars}>
                      {[1, 2, 3, 4, 5].map(star => (
                        <button
                          key={star}
                          type="button"
                          className={styles.subStarBtn}
                          onClick={() => setSubRatings(prev => ({
                            ...prev,
                            [key]: prev[key] === star ? 0 : star,
                          }))}
                          onMouseEnter={() => setSubHover(prev => ({ ...prev, [key]: star }))}
                          onMouseLeave={() => setSubHover(prev => ({ ...prev, [key]: 0 }))}
                          aria-label={`${label} ${star} star${star > 1 ? 's' : ''}`}
                        >
                          <svg
                            width="22"
                            height="22"
                            viewBox="0 0 24 24"
                            fill={star <= displayVal ? '#FFD700' : 'none'}
                            stroke={star <= displayVal ? '#FFD700' : '#e2e8f0'}
                            strokeWidth="2"
                          >
                            <path d="M12 2L15.09 8.26L22 9.27L17 14.14L18.18 21.02L12 17.77L5.82 21.02L7 14.14L2 9.27L8.91 8.26L12 2Z" />
                          </svg>
                        </button>
                      ))}
                      {displayVal > 0 && (
                        <span style={{ fontSize: '0.75rem', color: '#64748b', marginLeft: '0.375rem' }}>
                          {RATING_LABELS[displayVal]}
                        </span>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>

            {/* Footer */}
            <div className={styles.formFooter}>
              <div className={styles.footerLeft}>
                <Link
                  href={`/reviews/${encodeURIComponent(companySlug)}`}
                  className={styles.cancelBtn}
                  style={{ textDecoration: 'none' }}
                >
                  Cancel
                </Link>
                {isEditing && existingReview && (
                  <button
                    type="button"
                    className={styles.deleteBtn}
                    onClick={() => setShowDeleteConfirm(true)}
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="3 6 5 6 21 6" />
                      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                    </svg>
                    Delete
                  </button>
                )}
              </div>
              <button
                className={styles.submitBtn}
                disabled={submitting}
                onClick={handleSubmit}
              >
                {submitting ? (
                  <>
                    <div className={styles.spinner} style={{ width: 18, height: 18, borderWidth: 2 }} />
                    Submitting...
                  </>
                ) : isEditing ? (
                  'Update Review'
                ) : (
                  'Submit Review'
                )}
              </button>
            </div>
          </div>
      </div>

      {/* Delete Confirmation Dialog */}
      {showDeleteConfirm && (
        <div className={styles.overlay} onClick={() => !deleting && setShowDeleteConfirm(false)}>
          <div className={styles.confirmDialog} onClick={(e) => e.stopPropagation()}>
            <div className={styles.confirmIcon}>
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="8" x2="12" y2="12" />
                <line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
            </div>
            <h3 className={styles.confirmTitle}>Delete your review?</h3>
            <p className={styles.confirmText}>
              This will permanently remove your review for {companyName}. This action cannot be undone.
            </p>
            <div className={styles.confirmActions}>
              <button
                className={styles.confirmCancelBtn}
                onClick={() => setShowDeleteConfirm(false)}
                disabled={deleting}
              >
                Keep Review
              </button>
              <button
                className={styles.confirmDeleteBtn}
                onClick={handleDelete}
                disabled={deleting}
              >
                {deleting ? (
                  <>
                    <div className={styles.spinner} style={{ width: 16, height: 16, borderWidth: 2, borderTopColor: '#fff' }} />
                    Deleting...
                  </>
                ) : (
                  'Delete Review'
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Success Toast */}
      {showToast && (
        <div className={styles.toast}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className={styles.toastIcon}>
            <polyline points="20 6 9 17 4 12" />
          </svg>
          {toastMessage}
        </div>
      )}
    </main>
  )
}

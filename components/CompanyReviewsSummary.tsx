'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import StarRating from './StarRating'
import { supabase } from '@/lib/supabase'
import styles from './CompanyReviewsSummary.module.css'

interface CompanyReviewsSummaryProps {
  companyName: string
  compact?: boolean
}

export default function CompanyReviewsSummary({
  companyName,
  compact = false,
}: CompanyReviewsSummaryProps) {
  const [loading, setLoading] = useState(true)
  const [avg, setAvg] = useState(0)
  const [count, setCount] = useState(0)

  useEffect(() => {
    let cancelled = false

    const fetchSummary = async () => {
      // Lightweight query: only fetch overall_rating column
      const { data, error } = await supabase
        .from('company_reviews')
        .select('overall_rating')
        .ilike('company_name', companyName)

      if (cancelled) return

      if (!error && data && data.length > 0) {
        const total = data.length
        const sum = data.reduce((s: number, r: any) => s + r.overall_rating, 0)
        setCount(total)
        setAvg(sum / total)
      }

      setLoading(false)
    }

    fetchSummary()
    return () => { cancelled = true }
  }, [companyName])

  const reviewsUrl = `/reviews/${encodeURIComponent(companyName)}`

  // Loading skeleton
  if (loading) {
    return (
      <div className={`${styles.skeleton} ${compact ? styles.skeletonCompact : ''}`}>
        <div className={styles.skeletonBlock} />
        <div className={styles.skeletonLines}>
          <div className={styles.skeletonLine} />
          <div className={styles.skeletonLine} />
        </div>
      </div>
    )
  }

  // No reviews yet
  if (count === 0) {
    if (compact) return null
    return (
      <div className={styles.card}>
        <span className={styles.empty}>No reviews yet</span>
        <Link href={`${reviewsUrl}/write`} className={styles.link}>
          Be the first
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="9 18 15 12 9 6" />
          </svg>
        </Link>
      </div>
    )
  }

  return (
    <div className={`${styles.card} ${compact ? styles.compact : ''}`}>
      <div className={styles.ratingBlock}>
        <span className={`${styles.avgNumber} ${compact ? styles.compactAvg : ''}`}>
          {avg.toFixed(1)}
        </span>
      </div>

      <div className={styles.info}>
        {!compact && (
          <p className={styles.companyName}>{companyName}</p>
        )}
        <div className={styles.meta}>
          <StarRating rating={avg} size={compact ? 'sm' : 'sm'} />
          <span className={`${styles.count} ${compact ? styles.compactCount : ''}`}>
            ({count} review{count !== 1 ? 's' : ''})
          </span>
        </div>
      </div>

      <Link href={reviewsUrl} className={`${styles.link} ${compact ? styles.compactLink : ''}`}>
        {compact ? 'Reviews' : 'See all reviews'}
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="9 18 15 12 9 6" />
        </svg>
      </Link>
    </div>
  )
}

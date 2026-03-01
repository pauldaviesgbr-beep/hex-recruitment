'use client'

import { useState, useCallback } from 'react'
import styles from './StarRating.module.css'

interface StarRatingProps {
  rating: number
  maxRating?: number
  size?: 'sm' | 'md' | 'lg'
  interactive?: boolean
  onRate?: (rating: number) => void
  showValue?: boolean
}

const SIZE_CONFIG = {
  sm: { px: 16, gap: 'gapSm' as const },
  md: { px: 22, gap: 'gapMd' as const },
  lg: { px: 32, gap: 'gapLg' as const },
}

const FILLED_COLOR = '#FFD700'
const EMPTY_STROKE = '#cbd5e1'

export default function StarRating({
  rating,
  maxRating = 5,
  size = 'md',
  interactive = false,
  onRate,
  showValue = false,
}: StarRatingProps) {
  const [hoverIndex, setHoverIndex] = useState<number | null>(null)

  const { px, gap } = SIZE_CONFIG[size]

  // The display rating: when hovering in interactive mode, show hover state
  const displayRating = interactive && hoverIndex !== null ? hoverIndex : rating

  const handleClick = useCallback((starIndex: number) => {
    if (interactive && onRate) {
      onRate(starIndex)
    }
  }, [interactive, onRate])

  const handleKeyDown = useCallback((e: React.KeyboardEvent, starIndex: number) => {
    if (!interactive || !onRate) return
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      onRate(starIndex)
    } else if (e.key === 'ArrowRight' || e.key === 'ArrowUp') {
      e.preventDefault()
      const next = Math.min(starIndex + 1, maxRating)
      onRate(next)
      // Move focus to next star
      const parent = (e.target as HTMLElement).parentElement
      const nextBtn = parent?.querySelector(`[data-star="${next}"]`) as HTMLElement | null
      nextBtn?.focus()
    } else if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') {
      e.preventDefault()
      const prev = Math.max(starIndex - 1, 1)
      onRate(prev)
      const parent = (e.target as HTMLElement).parentElement
      const prevBtn = parent?.querySelector(`[data-star="${prev}"]`) as HTMLElement | null
      prevBtn?.focus()
    }
  }, [interactive, onRate, maxRating])

  const stars = []
  for (let i = 1; i <= maxRating; i++) {
    // Determine fill state: full, partial, or empty
    const diff = displayRating - i + 1
    let fillType: 'full' | 'partial' | 'empty'
    let partialFraction = 0

    if (diff >= 1) {
      fillType = 'full'
    } else if (diff > 0) {
      fillType = 'partial'
      partialFraction = diff
    } else {
      fillType = 'empty'
    }

    // In interactive mode, only show full/empty (no partial)
    if (interactive) {
      fillType = i <= displayRating ? 'full' : 'empty'
    }

    const starSvg = (
      <StarSvg
        key={i}
        size={px}
        fillType={fillType}
        partialFraction={partialFraction}
        index={i}
      />
    )

    if (interactive) {
      stars.push(
        <button
          key={i}
          type="button"
          className={styles.starBtn}
          data-star={i}
          onClick={() => handleClick(i)}
          onMouseEnter={() => setHoverIndex(i)}
          onMouseLeave={() => setHoverIndex(null)}
          onKeyDown={(e) => handleKeyDown(e, i)}
          tabIndex={i === Math.max(1, Math.round(rating)) ? 0 : -1}
          role="radio"
          aria-checked={i === Math.round(rating)}
          aria-label={`${i} star${i !== 1 ? 's' : ''}`}
        >
          {starSvg}
        </button>
      )
    } else {
      stars.push(
        <span key={i} className={styles.starDisplay}>
          {starSvg}
        </span>
      )
    }
  }

  const valueClass = size === 'sm' ? styles.valueSm
    : size === 'lg' ? styles.valueLg
    : styles.valueMd

  return (
    <div
      className={styles.container}
      aria-label={interactive ? undefined : `Rating: ${rating} out of ${maxRating} stars`}
    >
      <div
        className={`${styles.stars} ${styles[gap]} ${interactive ? styles.interactive : ''}`}
        role={interactive ? 'radiogroup' : undefined}
        aria-label={interactive ? 'Star rating' : undefined}
      >
        {stars}
      </div>
      {showValue && rating > 0 && (
        <span className={`${styles.value} ${valueClass}`}>
          {Number.isInteger(rating) ? rating.toFixed(1) : rating.toFixed(1)}
        </span>
      )}
    </div>
  )
}

// Individual SVG star with full / partial / empty fill support
function StarSvg({
  size,
  fillType,
  partialFraction,
  index,
}: {
  size: number
  fillType: 'full' | 'partial' | 'empty'
  partialFraction: number
  index: number
}) {
  const clipId = `star-clip-${index}-${Math.random().toString(36).slice(2, 8)}`

  if (fillType === 'full') {
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" fill={FILLED_COLOR} stroke={FILLED_COLOR} strokeWidth="1.5">
        <path d="M12 2L15.09 8.26L22 9.27L17 14.14L18.18 21.02L12 17.77L5.82 21.02L7 14.14L2 9.27L8.91 8.26L12 2Z" />
      </svg>
    )
  }

  if (fillType === 'empty') {
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={EMPTY_STROKE} strokeWidth="1.5">
        <path d="M12 2L15.09 8.26L22 9.27L17 14.14L18.18 21.02L12 17.77L5.82 21.02L7 14.14L2 9.27L8.91 8.26L12 2Z" />
      </svg>
    )
  }

  // Partial fill using clipPath
  return (
    <svg width={size} height={size} viewBox="0 0 24 24">
      <defs>
        <clipPath id={clipId}>
          <rect x="0" y="0" width={24 * partialFraction} height="24" />
        </clipPath>
      </defs>
      {/* Empty background star */}
      <path
        d="M12 2L15.09 8.26L22 9.27L17 14.14L18.18 21.02L12 17.77L5.82 21.02L7 14.14L2 9.27L8.91 8.26L12 2Z"
        fill="none"
        stroke={EMPTY_STROKE}
        strokeWidth="1.5"
      />
      {/* Partially filled star */}
      <path
        d="M12 2L15.09 8.26L22 9.27L17 14.14L18.18 21.02L12 17.77L5.82 21.02L7 14.14L2 9.27L8.91 8.26L12 2Z"
        fill={FILLED_COLOR}
        stroke={FILLED_COLOR}
        strokeWidth="1.5"
        clipPath={`url(#${clipId})`}
      />
    </svg>
  )
}

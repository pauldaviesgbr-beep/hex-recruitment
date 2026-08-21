'use client'

import type { CSSProperties } from 'react'
import { fallbackVariant } from '@/lib/jobBanner'
import styles from './BrandedJobFallback.module.css'

/**
 * The universal "no uploaded photo" state for a job banner: a branded Thrive
 * panel (navy gradient + faded Thrive lockup + slogan) with a large ghosted
 * company initial for per-employer variation. All branding is watermark-weight
 * so that, where job text is overlaid (the card), the title/company/salary stay
 * crisp under the bottom scrim. Rendered identically in the card, the inline
 * desktop detail, and the JobDetailModal so the look is consistent everywhere.
 *
 * Sizes use container-query units so the same component scales correctly across
 * the tall card slot and the short detail-header strips. It fills its (relatively
 * positioned) parent — no scrim of its own; each slot keeps its existing scrim.
 */
export default function BrandedJobFallback({
  company,
  seed,
  className,
  logoUrl,
}: {
  company?: string | null
  seed?: string | null
  className?: string
  /**
   * The employer's logo. When present it becomes the watermark INSTEAD of the
   * Thrive lockup, so an advert with no photograph still reads as theirs.
   *
   * Not the same as the logo-hero this file replaced: that painted the mark at
   * full strength as the picture, competing with the identical logo rendering
   * as the avatar two centimetres below — one image twice, once huge and once
   * small. At watermark weight it is texture rather than a second image.
   */
  logoUrl?: string | null
}) {
  const initial = (company || '?').trim().charAt(0).toUpperCase() || '?'
  const v = fallbackVariant(seed || company || 'thrive')
  const vars = {
    '--fb-angle': `${v.angle}deg`,
    '--fb-glow-x': `${v.glowX}%`,
  } as CSSProperties
  const hasLogo = !!(logoUrl && logoUrl.trim())

  return (
    <div className={`${styles.fallback} ${className || ''}`} style={vars} aria-hidden="true">
      {hasLogo ? (
        // THE EMPLOYER'S MARK. The ghosted initial goes with it — the logo is
        // the same signal, better said, and both together is clutter.
        // eslint-disable-next-line @next/next/no-img-element
        <img src={logoUrl as string} alt="" className={styles.logoMark} />
      ) : (
        <>
          <span className={styles.ghost}>{initial}</span>
          <div className={styles.brand}>
            <span className={styles.mark}>
              <svg viewBox="0 0 24 24" width="100%" height="100%" fill="none" aria-hidden="true">
                <rect x="2" y="2" width="20" height="20" rx="5" fill="currentColor" />
                <path d="M7 8h10M12 8v8" stroke="#0A1628" strokeWidth="2.2" strokeLinecap="round" />
              </svg>
            </span>
            <span className={styles.wordmark}>Thrive</span>
            <span className={styles.slogan}>Hire faster. Apply smarter.</span>
          </div>
        </>
      )}
    </div>
  )
}

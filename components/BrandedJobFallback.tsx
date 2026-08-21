'use client'

import type { CSSProperties } from 'react'
import { fallbackVariant } from '@/lib/jobBanner'
import styles from './BrandedJobFallback.module.css'

/**
 * The universal "no uploaded photo" state for a job banner: a navy panel with
 * a per-employer gradient and a large ghosted company initial. All of it is
 * watermark-weight, so where job text is overlaid — the card, the inline
 * desktop detail, the modal — the title, company and salary stay crisp under
 * the bottom scrim. Rendered identically everywhere, so the look is consistent.
 *
 * Sizes use container-query units so the same component scales across the tall
 * card slot and the short detail-header strips. It fills its (relatively
 * positioned) parent and brings no scrim of its own.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * IT USED TO CARRY THE THRIVE LOCKUP — our mark, our wordmark, "Hire faster.
 * Apply smarter." — on a card advertising SOMEBODY ELSE'S job. Paul asked for
 * the employer's branding instead, and he is right: the board is theirs to be
 * seen on. Measured at the time: the lockup was showing on effectively every
 * no-photo card, because nearly every employer has a logo but few have a
 * photograph.
 *
 * THE EMPLOYER'S LOGO WAS TRIED HERE AND FAILED ON THE FIRST REAL ONE, which
 * is worth recording so it is not tried again the same way.
 *
 * Every logo in the bucket is flattened onto WHITE by the upload route
 * (`resize(200, 200, { fit: 'contain', background: white })`), so it is opaque
 * — and an opaque rectangle laid over the navy shows as a RECTANGLE whatever is
 * done to its colours. The filter chosen for it (invert, so the white ground
 * goes black, then `screen` to drop the black) is right for a dark mark on
 * white and does exactly the wrong thing to Collins King, which is white type
 * on a dark purple square: it turned their square light and painted a visible
 * pale panel across the card. A treatment that suits one common logo shape and
 * inverts the other is a coin toss, and it lost on the first throw.
 *
 * A letter cannot do that. It is type, it takes the per-company gradient, and
 * it reads the same for every employer.
 *
 * IF A REAL LOGO WATERMARK IS WANTED, THE FIX IS AT THE SOURCE: stop flattening
 * logos onto white when the upload carries transparency, and the mark can be
 * laid on alone with no ground to key out. That only helps logos uploaded
 * afterwards unless the existing ones are reprocessed, which is a write to real
 * employer rows.
 */
export default function BrandedJobFallback({
  company,
  seed,
  className,
}: {
  company?: string | null
  seed?: string | null
  className?: string
}) {
  const initial = (company || '?').trim().charAt(0).toUpperCase() || '?'
  const v = fallbackVariant(seed || company || 'thrive')
  const vars = {
    '--fb-angle': `${v.angle}deg`,
    '--fb-glow-x': `${v.glowX}%`,
  } as CSSProperties

  return (
    <div className={`${styles.fallback} ${className || ''}`} style={vars} aria-hidden="true">
      <span className={styles.ghost}>{initial}</span>
    </div>
  )
}

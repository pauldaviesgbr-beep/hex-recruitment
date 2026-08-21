'use client'

import type { CSSProperties } from 'react'
import { fallbackVariant } from '@/lib/jobBanner'
import styles from './BrandedJobFallback.module.css'

/**
 * The "no uploaded photo" panel: a navy ground with a per-employer gradient,
 * carrying the EMPLOYER'S LOGO at full strength — or their initial when they
 * have no logo.
 *
 * It fills its (relatively positioned) parent and brings no scrim of its own,
 * so the slot's existing scrim keeps the overlaid title and salary crisp.
 * Container-query units keep it proportional across the tall card slot and the
 * short detail-header strips.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * THREE VERSIONS OF THIS IN ONE MORNING, AND THE PATH IS WORTH KEEPING.
 *
 * 1. IT SHOWED THE THRIVE LOCKUP — our mark, our wordmark, "Hire faster. Apply
 *    smarter." — on a card advertising somebody else's job. It was on
 *    effectively every no-photo card, because nearly every employer has a logo
 *    and few have a photograph.
 *
 * 2. THE LOGO AS A FADED WATERMARK, centred, run through invert + grayscale +
 *    screen to key out the white ground the upload route bakes in. Right for a
 *    dark mark on white; exactly wrong for Collins King, which is white type on
 *    a solid purple block — inverting turned their block light and painted a
 *    grey panel across the card.
 *
 * 3. THE COMPANY INITIAL alone. Robust, and too quiet: "it's just C. Can we not
 *    put the whole logo… it needs to SHOUT the Collins King brand."
 *
 * So it is the logo, at full strength, and the reasoning that produced the
 * faded versions was wrong about the goal rather than the technique. A card
 * with no photograph is not trying to be subtle — it is the employer's card and
 * it should look like theirs.
 *
 * NO PLAQUE. An earlier component put every logo on a white tile, and Paul's
 * first report of this whole thread was "a purple rectangle on a white tile,
 * floating in the middle of a dark card… looks homemade". The tile added white
 * around a logo that already had its own ground. A logo sits on the navy as it
 * is: one that carries its own dark block reads as a brand panel, one on white
 * reads as their own card stock. Neither needs help from us.
 *
 * NO PER-LOGO PIXEL SAMPLING EITHER. The component this replaced sampled each
 * logo on a canvas, per card, to choose between treatments, and silently
 * guessed whenever a cross-origin read was blocked. One treatment for everyone
 * cannot fail in a way nobody sees.
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
  /** The employer's logo. Shown at full strength; the initial is the fallback
   *  for employers who have not uploaded one. */
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
        // eslint-disable-next-line @next/next/no-img-element
        <img src={logoUrl as string} alt="" className={styles.logoMark} />
      ) : (
        <span className={styles.ghost}>{initial}</span>
      )}
    </div>
  )
}

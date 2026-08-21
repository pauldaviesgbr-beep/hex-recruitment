'use client'

import type { CSSProperties } from 'react'
import { companyInitials } from '@/lib/jobQuote'
import { BRAND_FALLBACK } from '@/lib/brandColour'
import styles from './BrandedJobFallback.module.css'

/**
 * THE NO-PHOTOGRAPH CARD: the employer's colour, carrying the employer's words.
 *
 * ─── WHY THERE IS NO LOGO ON IT ────────────────────────────────────────────
 *
 * Four versions of this put a logo in the image slot and all four failed the
 * same way, which is how we learned the diagnosis was wrong. It was read as
 * "two visual systems on one card" — a Thrive-navy panel hosting somebody
 * else's brand — and that is the symptom. The cause is that A LOGO CANNOT DO A
 * PHOTOGRAPH'S JOB. A photo tells a chef about the room. A logo says who is
 * advertising, which the company name on the card already says. Every attempt
 * was filling a slot the logo cannot serve, and "all that empty card space
 * around it" is what that looks like on screen. Bigger, quieter, tinted or
 * ghosted, the space stays wrong, because the space was never asking for a logo.
 *
 * The four, in order, so none of them is tried again:
 *   1  the THRIVE lockup — our mark and our slogan on somebody else's advert
 *   2  the logo as a faded WATERMARK, inverted to key its white ground — right
 *      for a dark mark on white, and it turned Collins King's purple block into
 *      a grey panel across the whole card
 *   3  the company INITIAL alone, centred on our navy — "it's just C"
 *   4  the logo at FULL STRENGTH in the upper band — still a mark floating in
 *      space, because the space is photograph-shaped
 *
 * NOR IS THERE AN AVATAR. Three of the five real marks are illegible at 26px:
 * Sauce, Collins King and Neway are all wordmarks-in-a-block, around 5pt type
 * at that size. No slot shape fixes it — Sauce's ~4:1 mark needs about 80px of
 * width, a fifth of the card. ZERO logos rather than one ends the doubling
 * complaint completely, and the logo still appears on the detail page and the
 * employer profile at sizes where it reads. Letter initials in the avatar are
 * not the escape either: that only relocates "it's just C".
 *
 * ─── WHAT IT SHOWS INSTEAD ─────────────────────────────────────────────────
 *
 * One sentence lifted from the advert — see lib/jobQuote — on the employer's
 * own colour, computed once at upload by lib/brandColour and stored on the row.
 * Not a claim about the venue; a quotation from the employer. Two fallbacks
 * behind it: their tags at size, then a ghosted monogram.
 *
 * THE MONOGRAM IS THE ONE ELEMENT THAT CANNOT FAIL, and the instinct will be to
 * delete it as unused once quotations are working. Keep it. On a scraped board
 * the row where every text field is empty exists. At 20% of the card width it
 * is a shape rather than a letter, which is exactly why it works where the 26px
 * wordmark does not — and off-axis on their colour it reads as a monogram
 * rather than as the placeholder version 3 was.
 *
 * NO PER-CARD IMAGE ANALYSIS. A previous component sampled each logo on a
 * canvas, per card, to choose a treatment, and silently guessed whenever a
 * cross-origin read was blocked. Every image judgement now happens once,
 * server-side, at upload.
 */
export default function BrandedJobFallback({
  company,
  className,
  brandColour,
  quote,
  tags,
  variant = 'card',
  retired = false,
}: {
  company?: string | null
  className?: string
  /** Stored hex from the employer's logo. Navy when absent — see lib/brandColour. */
  brandColour?: string | null
  /** The lifted sentence. Null falls through to tags, then the monogram. */
  quote?: string | null
  /** The employer's own tag selections, for the middle fallback. */
  tags?: string[] | null
  /**
   * Which slot this is filling. It changes the CONTENT BOUNDS and nothing else.
   *
   * 'card' is the 16:11 grid card: badges are absolutely positioned over the top
   * of it and .cardContent is anchored to the bottom, so the sentence has to
   * live between them.
   *
   * 'header' is the 160px detail strip, which has neither — the title and
   * company sit BELOW the strip, not over it. Given the card's bounds there the
   * sentence would get a 28px band and be invisible, which is precisely the
   * class of fault that only shows up in the second slot a component is used in.
   *
   * There was briefly a third, 'preview', for a 190px thumbnail in the post-a-job
   * form. It is gone: that form already renders the REAL card component, and a
   * second preview beside it showed the same advert two different ways. The
   * fix was to feed the existing one, not to add another.
   */
  variant?: 'card' | 'header'
  /**
   * The advert is filled, closed or expired.
   *
   * THE QUOTATION COMES OFF, AND THIS IS A PRODUCT DECISION RATHER THAN A
   * LAYOUT ONE. A lifted sentence is the employer selling the job; under a
   * FILLED stamp it is selling a job that has gone. The stamp is the message,
   * and the card should not argue with it.
   *
   * It also happens to resolve a collision nobody had looked at: the retired
   * stamp is centred in the card's UPPER HALF and so is the quotation, and on
   * Manage Job Ads the word FILLED was drawn straight across the sentence on
   * all four adverts. The two were designed years apart and had never met.
   */
  retired?: boolean
}) {
  // A stored colour that is not a hex is not trusted onto a live card: the
  // white type's contrast is guaranteed by the BAND, and a value that never
  // went through the clamp has no such guarantee. Anything unexpected falls to
  // navy, which is the same answer the rule itself gives when it cannot tell.
  const colour = typeof brandColour === 'string' && /^#[0-9a-f]{6}$/i.test(brandColour.trim())
    ? brandColour.trim()
    : BRAND_FALLBACK

  const sentence = (quote || '').trim()
  const pills = (tags || []).filter(t => (t || '').trim()).slice(0, 4)

  const vars = { '--panel': colour } as CSSProperties

  // TWO SIBLINGS, NOT A WRAPPER, AND THE REASON IS GEOMETRY.
  //
  // The colour is an absolute layer behind everything. The CONTENT is a flex
  // child of the card itself, so it takes whatever height is left after the
  // company/title/pay block rather than a guessed percentage of the card.
  //
  // The first version nested the content inside the absolute panel and bounded
  // it at `bottom: 50%`. That measured clear on the 242px board card and
  // overlapped the title in the 206px form preview, where .cardContent holds
  // four badges and takes 65% of the card. A percentage of an unknown height is
  // a guess; `flex: 1` is an answer. This is the geometry the handoff specified
  // and the reason it specified it.
  //
  // The header variant keeps the absolute form: the detail strip is not a flex
  // column and has nothing below the panel to make room for.
  const body = (
    <div className={variant === 'header' ? styles.bodyHeader : styles.body}>
      {retired ? (
        // Just the monogram, quietly. The stamp carries the card.
        <span className={styles.monogram} aria-hidden="true">{companyInitials(company)}</span>
      ) : sentence ? (
          <>
            {/* Decorative: the sentence beside it is the content, and a screen
                reader announcing "left double quotation mark" adds nothing. */}
            <svg className={styles.quoteMark} viewBox="0 0 24 24" aria-hidden="true" focusable="false">
              <path d="M9.5 6.5C6.9 8 5.5 10.3 5.5 13.2c0 2.4 1.3 4.3 3.4 4.3 1.8 0 3.1-1.3 3.1-3 0-1.7-1.2-2.9-2.8-2.9-.3 0-.6 0-.8.1.3-1.5 1.3-2.8 2.9-3.8Z" />
              <path d="M19 6.5c-2.6 1.5-4 3.8-4 6.7 0 2.4 1.3 4.3 3.4 4.3 1.8 0 3.1-1.3 3.1-3 0-1.7-1.2-2.9-2.8-2.9-.3 0-.6 0-.8.1.3-1.5 1.3-2.8 2.9-3.8Z" />
            </svg>
            <span className={styles.quote}>{sentence}</span>
          </>
        ) : pills.length ? (
          <div className={styles.tags}>
            {pills.map(t => <span key={t} className={styles.tag}>{t}</span>)}
          </div>
        ) : (
          <span className={styles.monogram} aria-hidden="true">{companyInitials(company)}</span>
        )}
    </div>
  )

  return (
    <>
      <div className={`${styles.panel} ${className || ''}`} style={vars} aria-hidden="true" />
      {body}
    </>
  )
}

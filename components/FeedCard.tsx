'use client'

import type { ReactNode } from 'react'
import CompanyLogo from '@/components/CompanyLogo'
import BrandedJobFallback from '@/components/BrandedJobFallback'

// THE card. One shape, one set of rules, used by /jobs and by both card types in
// the /temp-work feed.
//
// Why this exists: the temp feed put a short white text card next to a tall dark
// photo card and it read as two products in one column. The fix isn't to style
// the shift card LIKE the job card — that's the arrangement that drifts apart
// the moment either page is touched. It's for there to be one card that takes a
// model, and for a job and a shift to be two ways of filling that model in.
//
// Anything genuinely per-page is a prop: the controls in the top-right corner
// (bookmark on /jobs, like + comment on a shift) come in as `controls`, and the
// card knows nothing about what they do.
//
// ON THE STYLESHEET: this imports app/jobs/page.module.css rather than owning a
// copy — same trade as before, kept deliberately. Sharing the sheet is what makes
// visual drift between the pages impossible, which is the property being bought.
import styles from '@/app/jobs/page.module.css'

export interface FeedCardBadge {
  label: string
  /** Yellow-outlined, for the one badge that is a call to action. */
  accent?: boolean
  /**
   * Makes this badge a real button rather than a label.
   *
   * "⚡ Easy apply" on a job card is a promise the card keeps when you tap it.
   * On a shift the equivalent action is putting yourself forward, and burying it
   * one expand deep made the page's whole purpose the second thing you could do.
   */
  onClick?: () => void
  disabled?: boolean
}

export interface FeedCardRetired {
  /** The word itself — FILLED, CLOSED, EXPIRED. Never colour alone. */
  label: string
}

/**
 * THE THREE STAMP VARIANTS ARE GONE — 'stamp', 'band' and 'watermark'.
 *
 * All three laid a large mark across the middle of the card, which was right
 * while the upper half was photograph and wrong the moment the branded panel
 * started putting a quotation there. Neither call site ever passed one, so all
 * three were rendering as the diagonal stamp anyway. The status is now a badge
 * in the same slot as New; the grey wash still does the receding.
 */

export interface FeedCardModel {
  /** Used to seed the branded fallback so an employer's card looks the same each time. */
  id: string
  banner: string | null
  logo: string | null
  company: string
  /** Appended to the company in dimmer text, e.g. "· via recruiter". */
  companyNote?: string | null
  title: string
  /** The location line. */
  where: string
  /** Already formatted — the card never does money. */
  pay?: string | null
  badges: FeedCardBadge[]
  isNew?: boolean

  /* ── The no-photograph panel. Ignored entirely when `banner` is set. ─────
     These three are the whole of the branded card: its colour, its sentence
     and its tags. They are computed once — the colour at logo upload, the
     sentence by lib/jobQuote at map time — so the card itself makes no
     judgement about an image or a description. */

  /** Stored hex from the employer's logo; navy when absent. lib/brandColour. */
  brandColour?: string | null
  /** One sentence lifted from the advert. Null falls to tags, then a monogram. */
  quote?: string | null
  /** The employer's own tag selections, at size, when there is no sentence. */
  panelTags?: string[] | null
}

export interface FeedCardProps {
  model: FeedCardModel
  onSelect?: () => void
  /** Top-right overlay controls. */
  controls?: ReactNode
  /** Top-left/other stamps, e.g. "Applied ✓", "SHORTLISTED", "Example". */
  stamps?: ReactNode
  boosted?: boolean
  /** Dashed outline for illustrative content. */
  example?: boolean
  /**
   * The card has a panel joined to its bottom edge, so it must stop behaving
   * like a free-floating tile.
   *
   * Two things, and the second is the one that would have been missed: square
   * off the bottom corners, and kill the hover lift. .jobCard:hover carries
   * translateY(-3px), which would slide the card up AWAY from the panel welded
   * beneath it at exactly the moment someone points at it. An inline transform
   * beats the stylesheet's :hover rule, which is why it is set here rather than
   * in a class.
   */
  attached?: boolean
  /**
   * THE SHIFT IS OVER BUT THE CARD IS STILL HERE.
   *
   * A filled shift deliberately stays on the board until its date, so the card
   * has two jobs that pull against each other: a chef scrolling at speed must
   * know it's gone WITHOUT READING, while the card itself should sink in the
   * feed rather than stand out. A louder badge does the first and the opposite
   * of the second.
   *
   * So the two are split. The PHOTO does the receding — dimmed and desaturated,
   * so a dead card is visibly quieter than a live one sitting next to it — and
   * the MARK does the telling, laid over the top. A SOLD board outside a house:
   * you don't look at it twice, but you know instantly.
   *
   * Takes a WORD, not a boolean called `filled`, because CLOSED and EXPIRED get
   * the same treatment and nothing here should need to change to give it to them.
   */
  retired?: FeedCardRetired
}

export default function FeedCard({
  model, onSelect, controls, stamps, boosted, example, attached, retired,
}: FeedCardProps) {
  const initial = (model.company || '?').trim().charAt(0).toUpperCase() || '?'

  return (
    <div
      className={`${styles.jobCard} ${model.banner ? '' : styles.jobCardFallback} ${boosted ? styles.jobCardBoosted : ''} ${retired ? styles.jobCardRetired : ''}`}
      style={{
        ...(example ? { outline: '2px dashed rgba(148,163,184,.9)', outlineOffset: -2 } : {}),
        ...(attached ? { borderBottomLeftRadius: 0, borderBottomRightRadius: 0, transform: 'none' } : {}),
      }}
      onClick={onSelect}
      role={onSelect ? 'button' : undefined}
      tabIndex={onSelect ? 0 : undefined}
      onKeyDown={e => { if (onSelect && e.key === 'Enter') onSelect() }}
    >
      {/* ONE FALLBACK FOR "NO PHOTO", AND IT CARRIES NO LOGO AT ALL.
           Four versions put a mark in this slot and every one failed the same
           way — a logo cannot do a photograph's job, so the space stayed wrong
           however the mark was treated. It is now the employer's colour with
           one sentence of their own advert on it. See BrandedJobFallback. */}
      {model.banner
        ? <div className={styles.cardBg} style={{ backgroundImage: `url(${model.banner})` }} aria-hidden="true" />
        : <BrandedJobFallback
            company={model.company}
            brandColour={model.brandColour}
            quote={model.quote}
            tags={model.panelTags}
            retired={!!retired}
          />}
      <div className={styles.cardScrim} aria-hidden="true" />

      {/* THE WASH — one element that greys the photo, the branded fallback and
          the logo fallback alike. It is a backdrop-filter rather than a filter
          on .cardBg precisely because there are three different things that can
          be painting the background, and this covers all of them without
          knowing which. Where backdrop-filter is unsupported the dark wash still
          lands, so the card still recedes; only the desaturation is lost. */}
      {retired && <div className={styles.cardRetiredWash} aria-hidden="true" />}

      {/* THE STATUS SLOT. New and FILLED are the same kind of thing — what
          state this advert is in — so they take the same position and are
          mutually exclusive by nature: a shift posted yesterday and filled
          today must not carry both.

          FILLED WAS A DIAGONAL STAMP ACROSS THE MIDDLE OF THE CARD, and that
          was right while the upper half was photograph. It is not right now
          the branded panel puts a quotation there: on Manage Job Ads the word
          was drawn straight through the employer's own sentence on all four
          adverts. The two treatments were designed years apart and had never
          been on the same card.

          A badge cannot collide with anything, works over a photograph and
          over a panel alike, and the grey wash above still does the receding —
          which was always the half that made a dead card read as dead. */}
      {model.isNew && !retired && <span className={styles.cardNew}>New</span>}
      {retired && <span className={styles.cardRetiredBadge}>{retired.label}</span>}
      {controls}

      <div className={styles.cardContent}>
        <div className={styles.cardCompanyRow}>
          {/* NO AVATAR ON THE BRANDED CARD — not the logo, and not a letter.
              Three of the five real marks are illegible at 26px (Sauce,
              Collins King and Neway are wordmarks-in-a-block, ~5pt at that
              size), so the slot was never going to carry them; and a letter
              here would only move "it's just C" from the panel to the chip.
              The company name beside it is the identifier and it is already
              on the card.

              The PHOTO card keeps its avatar, because there the image behind
              carries no brand at all and the mark is the only signal. That
              asymmetry is the point rather than an oversight. */}
          {model.banner && (
            <span className={styles.cardChip}>
              {model.logo
                ? <CompanyLogo src={model.logo} alt={model.company} className={styles.cardChipImg} />
                : initial}
            </span>
          )}
          <span className={styles.cardCompany}>
            {model.company}
            {model.companyNote && <span className={styles.cardViaRecruiter}> {model.companyNote}</span>}
          </span>
        </div>
        <h3 className={styles.cardRole}>{model.title}</h3>
        <div className={styles.cardMeta}>
          <span>{model.where}</span>
          {model.pay && <>
            <span className={styles.cardDot}>·</span>
            <span className={styles.cardSalary}>{model.pay}</span>
          </>}
        </div>
        <div className={styles.cardBadges}>
          {model.badges.map((b, i) => b.onClick ? (
            <button
              key={i}
              type="button"
              className={`${styles.cardBadge} ${b.accent ? styles.cardBadgeApply : ''}`}
              style={{ cursor: b.disabled ? 'default' : 'pointer', opacity: b.disabled ? 0.65 : 1 }}
              disabled={b.disabled}
              // The whole card is tappable, so an action inside it must not also
              // trigger the expand — otherwise one tap does two things.
              onClick={e => { e.stopPropagation(); b.onClick!() }}
            >
              {b.label}
            </button>
          ) : (
            <span key={i} className={`${styles.cardBadge} ${b.accent ? styles.cardBadgeApply : ''}`}>{b.label}</span>
          ))}
        </div>
      </div>

      {stamps}
    </div>
  )
}

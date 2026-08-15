'use client'

import type { CSSProperties } from 'react'
import SignedImage from '@/components/SignedImage'
import SignedLink from '@/components/SignedLink'
import { FileDown, Camera, X, Plus } from 'lucide-react'
import { Candidate } from '@/lib/mockCandidates'
import { fallbackVariant } from '@/lib/jobBanner'
import { joinedAgo } from '@/lib/joinedAgo'
import styles from './CandidateCard.module.css'
import { Ico } from '@/components/icons'

function initialsOf(name: string) {
  return name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()
}
function availClass(availability: string | undefined) {
  if (!availability) return styles.availGrey
  const l = availability.toLowerCase()
  if (l.includes('immediately') || l.includes('available') || l.includes('now')) return styles.availGreen
  if (l.includes('open') || l.includes('considering') || l.includes('notice')) return styles.availYellow
  return styles.availGrey
}

export interface MissingPrompt { key: string; label: string; onAdd: () => void; benefit?: string }

/**
 * One candidate card, two modes from one data source (candidate_profiles).
 * - employer: completed fields only, faded-initials watermark (NEVER a personal
 *   photo), a CV tag instead of skills. Click opens the detail.
 * - dashboard: a large EDITABLE photo (dashboard_photo_url, dashboard-only),
 *   faded "Add" prompts for missing fields, and a visibility toggle.
 * Dashboard-only props/UI are gated behind mode==='dashboard'.
 */
export default function CandidateCard(props: {
  candidate: Candidate
  mode: 'employer' | 'dashboard' | 'directory'
  // employer
  matchScore?: number
  featured?: boolean
  onOpen?: () => void
  /** Directory mode. Opens the one-to-one thread — /messages resolves a single
   *  participant, which is also why the answer line's action is a filter. */
  onMessage?: () => void
  // dashboard
  dashboardPhotoUrl?: string | null
  /** False when the displayed photo came from OAuth rather than an upload —
   *  there's nothing of ours to delete, so no remove control is offered. */
  photoRemovable?: boolean
  photoUploading?: boolean
  onPhotoClick?: () => void
  onPhotoRemove?: () => void
  completionPct?: number
  fieldsComplete?: number
  fieldsTotal?: number
  missingFields?: MissingPrompt[]
  /** Job title has its own slot in the card (the role heading), so it's kept
   *  out of the prompt grid and rendered there instead — same button format,
   *  no duplicate prompt for one field. */
  onAddJobTitle?: () => void
  isDiscoverable?: boolean
  onToggleDiscoverable?: (next: boolean) => void
}) {
  const { candidate: c, mode } = props
  const v = fallbackVariant(c.id || c.fullName || 'thrive')
  const bgVars = { ['--fb-angle' as any]: `${v.angle}deg`, ['--fb-glow-x' as any]: `${v.glowX}%` } as CSSProperties
  const initials = initialsOf(c.fullName)

  // ─────────── DIRECTORY MODE (/candidates) ───────────
  //
  // LIGHT, and the theme change is the smaller half of it. The deciding reason
  // was the data: twenty-one cards reading "0 yrs exp" beside a low-contrast
  // "No CV" on navy looked like a page that had failed to load. The same facts
  // on white read as a young marketplace telling the truth.
  //
  // THE RULE FOR THE WHOLE CARD: ABSENCES ARE NAMED, NEVER ZEROED. No 0, no
  // em-dash, no grey whisper. "0 yrs exp" is what this replaces and it is the
  // acceptance test — if it renders anywhere after this, the change hasn't
  // landed.
  //
  // No watermark; no personal photo (privacy — employers see initials only).
  if (mode === 'directory') {
    // DERIVED, NOT STORED, so a candidate who fills in a role later moves to
    // state A on their next render with nothing to migrate.
    const isSparse = !(c.jobTitle || '').trim() && !c.yearsExperience
    const location = (c.location || '').trim()
    const joined = c.createdAt ? joinedAgo(c.createdAt) : null

    return (
      <div
        className={`${styles.card} ${styles.cardDirectory} ${isSparse ? styles.cardSparse : ''}`}
        // State B is NOT a link — there is no profile worth opening, so the
        // card offers Message and nothing else rather than a click that lands
        // on an empty page.
        onClick={isSparse ? undefined : props.onOpen}
        role={isSparse ? undefined : 'button'}
        tabIndex={isSparse ? undefined : 0}
        onKeyDown={isSparse ? undefined : (e) => e.key === 'Enter' && props.onOpen?.()}
      >
        {(props.matchScore || props.featured) && (
          <div className={styles.dirTopBadges}>
            {props.matchScore ? <span className={styles.matchBadge}>{props.matchScore}% match</span> : null}
            {props.featured ? <span className={styles.dirFeatured}><Ico name="zap" size={16} /> Featured</span> : null}
          </div>
        )}

        <div className={styles.dirHeader}>
          <span className={styles.dirAvatar} aria-hidden="true">{initials}</span>
          <div className={styles.dirNameRole}>
            <span className={styles.dirName}>{c.fullName}</span>
            {isSparse
              ? <span className={styles.dirRoleSparse}>Profile not filled in yet</span>
              : c.jobTitle ? <span className={styles.dirRole}>{c.jobTitle}</span> : null}
          </div>
        </div>

        <div className={styles.dirMeta}>
          {isSparse ? (
            // ONE line, carrying the one fact a blank profile still has.
            // In practice that fact is usually the join date: twenty of the
            // twenty-one discoverable candidates have no location by any path,
            // so this branch is the normal rendering rather than the fallback.
            <span>{location ? `${location} · joined ${joined}` : joined ? `Joined ${joined}` : 'Joined recently'}</span>
          ) : (
            <>
              <span>
                {location}
                {location && c.yearsExperience ? ' · ' : ''}
                {c.yearsExperience ? `${c.yearsExperience} yrs exp` : ''}
              </span>
              {!location && !c.yearsExperience && joined && <span>Joined {joined}</span>}
            </>
          )}
        </div>

        <div className={styles.badges}>
          {c.availability ? (
            <span className={`${styles.badge} ${styles.availWash}`}>{c.availability}</span>
          ) : (
            <span className={`${styles.badge} ${styles.badgeDashed}`}>No availability set</span>
          )}
          {c.cvUrl ? (
            <SignedLink src={c.cvUrl} download className={`${styles.badge} ${styles.badgeOutlined}`} onClick={(e: any) => e.stopPropagation()}>
              <FileDown size={12} /> CV
            </SignedLink>
          ) : (
            <span className={`${styles.badge} ${styles.badgeDashed}`}>No CV</span>
          )}
        </div>

        {/* Pinned to the bottom by margin-top:auto so a mixed row equalises
            rather than one card sitting short. No fixed height — a 60-character
            scraped title must be able to breathe. */}
        <div className={styles.dirActions}>
          {isSparse ? (
            // "Ask for a CV" is specified as the secondary here and is OMITTED:
            // there is no request-profile-completion email and no route behind
            // it. A dead control is worse than a missing one.
            <button
              type="button"
              className={styles.actionPrimary}
              onClick={(e) => { e.stopPropagation(); props.onMessage?.() }}
            >
              Message
            </button>
          ) : (
            <>
              <button
                type="button"
                className={styles.actionPrimary}
                onClick={(e) => { e.stopPropagation(); props.onOpen?.() }}
              >
                View profile
              </button>
              <button
                type="button"
                className={styles.actionSecondary}
                onClick={(e) => { e.stopPropagation(); props.onMessage?.() }}
              >
                Message
              </button>
            </>
          )}
        </div>
      </div>
    )
  }

  // ─────────── EMPLOYER MODE ───────────
  if (mode === 'employer') {
    return (
      <div
        className={`${styles.card} ${styles.cardEmployer}`}
        onClick={props.onOpen}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => e.key === 'Enter' && props.onOpen?.()}
      >
        <div className={styles.backdrop} style={bgVars} aria-hidden="true">
          <span className={styles.ghostInitials}>{initials}</span>
        </div>
        <div className={styles.scrim} aria-hidden="true" />

        {(props.matchScore || props.featured) && (
          <div className={styles.topBadges}>
            {props.matchScore ? <span className={styles.matchBadge}>{props.matchScore}% match</span> : null}
            {props.featured ? <span className={styles.featuredBadge}><Ico name="zap" size={16} /> Featured</span> : null}
          </div>
        )}

        <div className={styles.identity}>
          <span className={styles.chip}>{initials}</span>
          <span className={styles.identityName}>{c.fullName}</span>
        </div>

        <div className={styles.content}>
          <h3 className={styles.role}>{c.jobTitle}</h3>
          {c.headline && <p className={styles.cardHeadline}>{c.headline}</p>}
          <div className={styles.meta}>
            {c.location && <span>{c.location}</span>}
            {c.location && <span className={styles.dot}>·</span>}
            <span>{c.yearsExperience} yrs exp</span>
          </div>
          <div className={styles.badges}>
            {c.availability && (
              <span className={`${styles.badge} ${styles.availBadge} ${availClass(c.availability)}`}>
                <span className={styles.availDot} />{c.availability}
              </span>
            )}
            {c.cvUrl ? (
              <SignedLink src={c.cvUrl} download className={`${styles.badge} ${styles.cvTag}`} onClick={(e: any) => e.stopPropagation()}>
                <FileDown size={12} /> CV
              </SignedLink>
            ) : (
              <span className={`${styles.badge} ${styles.cvTagEmpty}`}><FileDown size={12} /> No CV</span>
            )}
          </div>
        </div>
      </div>
    )
  }

  // ─────────── DASHBOARD MODE ───────────
  // Compact card: identity top-left, toggle top-right, the completion bar as the
  // centrepiece (no watermark), then employer-style data + Add to-dos at the
  // bottom. Flows to its own height — no large empty centre.
  const pct = Math.max(0, Math.min(100, Math.round(props.completionPct ?? 0)))
  const showCount = props.fieldsTotal != null && props.fieldsComplete != null
  return (
    <div className={`${styles.card} ${styles.cardDashboard}`}>
      <div className={styles.dashInner}>
        {/* Top row: identity (editable chip + name) left, visibility toggle right */}
        <div className={styles.dashTop}>
          <div className={styles.dashId}>
            <span className={styles.dashChipWrap}>
              <button
                type="button"
                className={styles.dashChip}
                onClick={props.onPhotoClick}
                disabled={props.photoUploading}
                aria-label={props.dashboardPhotoUrl ? 'Change your profile photo' : 'Add a profile photo'}
                title={props.dashboardPhotoUrl ? 'Change your profile photo' : 'Add a profile photo'}
              >
                {props.dashboardPhotoUrl ? (
                  <SignedImage
                    src={props.dashboardPhotoUrl}
                    alt={c.fullName}
                    className={styles.dashChipImg}
                    // If the photo 404s, prompt rather than silently showing
                    // initials the candidate can't act on.
                    fallback={<span className={styles.dashChipEmpty}><Camera size={20} /><span>Add photo</span></span>}
                  />
                ) : (
                  // Deliberately NOT initials: initials look like a finished
                  // state, so nobody realises a photo is missing or that this
                  // is the control for adding one.
                  <span className={styles.dashChipEmpty}>
                    <Camera size={20} />
                    <span>Add photo</span>
                  </span>
                )}
                <span className={styles.dashChipOverlay} aria-hidden="true">
                  {props.photoUploading ? <span className={styles.dashSpinner} /> : <Camera size={24} />}
                </span>
                {/* Persistent affordance, LinkedIn-style. The hover overlay
                    above never appears on a touch screen, so on mobile this
                    badge is the only thing saying "you can change this". */}
                {!props.photoUploading && (
                  <span className={styles.dashChipEdit} aria-hidden="true"><Plus size={14} /></span>
                )}
              </button>
              {props.dashboardPhotoUrl && props.photoRemovable && !props.photoUploading && (
                <button type="button" className={styles.dashChipRemove} onClick={props.onPhotoRemove} aria-label="Remove your profile photo" title="Remove photo"><X size={12} /></button>
              )}
            </span>
            <span className={styles.identityName}>{c.fullName}</span>
          </div>

          {/* THE LABEL NAMES THE STATE, NOT THE ACTION — Paul, 15 Aug 2026,
              looking at it on a new account. It used to read "Hide my profile"
              in both positions, which is the classic negatively-labelled
              switch: the words describe an ACTION while the control shows a
              STATE, so the reader has to work out whether ON means hidden or
              shown. Two people can look at the same switch and disagree about
              what it is currently doing, and the cost of being wrong here is
              a candidate who thinks employers can see them when they cannot.

              So the switch is now ON when you are FINDABLE — the conventional
              direction, on = the good thing happening — and the label changes
              with it. `is_discoverable` is untouched: this is a reading of the
              same value, not a new one.

              The label says EMPLOYERS rather than headhunters. Paul asked for
              "available for headhunters" and then confirmed employers is right
              (15 Aug 2026), because being discoverable exposes you to every
              employer hiring on Thrive, not only to recruiters — the narrower
              word would understate what the switch actually does. Settled, not
              an oversight: do not "correct" it back without a new decision. */}
          <label
            className={styles.dashToggleCompact}
            title={props.isDiscoverable
              ? 'Employers hiring on Thrive can find your profile in candidate search and approach you about roles. Turn this off to hide it from everyone.'
              : 'Your profile is hidden from every employer — nobody can find you in candidate search or contact you. Turn this on to be found.'}
          >
            <input
              type="checkbox"
              checked={!!props.isDiscoverable}
              onChange={(e) => props.onToggleDiscoverable?.(e.target.checked)}
            />
            <span className={styles.dashToggleTrack}><span className={styles.dashToggleThumb} /></span>
            <span className={styles.dashToggleLabel}>
              {props.isDiscoverable ? 'Employers can find you' : 'Profile hidden'}
            </span>
          </label>
        </div>

        {/* Middle: completion bar centrepiece, with the Add to-dos right below it */}
        <div className={styles.dashMid}>
          <div className={styles.dashProgress}>
            <div className={styles.dashProgressTrack}><div className={styles.dashProgressFill} style={{ width: `${pct}%` }} /></div>
            <div className={styles.dashProgressMeta}>
              <span className={styles.dashProgressPct}>{pct === 100 ? 'Profile complete' : `${pct}% complete`}</span>
              {showCount && <span className={styles.dashProgressCount}>{props.fieldsComplete} of {props.fieldsTotal} fields</span>}
            </div>
          </div>
          {/* Tiles in a grid rather than thin inline pills: each is a proper
              tap target on a phone, all the same size, and the benefit line has
              room to be read instead of being squeezed onto one line. */}
          {props.missingFields && props.missingFields.length > 0 && (
            <div className={styles.dashPrompts}>
              {props.missingFields.map(f => (
                <button
                  key={f.key}
                  type="button"
                  className={styles.dashPrompt}
                  onClick={f.onAdd}
                  title={f.benefit ? `Add ${f.label} — ${f.benefit}` : `Add ${f.label}`}
                >
                  <span className={styles.dashPromptPlus} aria-hidden="true"><Plus size={14} /></span>
                  <span className={styles.dashPromptLabel}>{f.label}</span>
                  {f.benefit && <span className={styles.dashPromptBenefit}>{f.benefit}</span>}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Bottom: employer-style data */}
        <div className={styles.dashBottom}>
          {c.jobTitle ? (
            <h3 className={styles.dashRole}>{c.jobTitle}</h3>
          ) : props.onAddJobTitle ? (
            <button
              type="button"
              className={`${styles.dashPrompt} ${styles.dashPromptInline}`}
              onClick={props.onAddJobTitle}
              title="Add Job title — match the right roles"
            >
              <span className={styles.dashPromptPlus} aria-hidden="true"><Plus size={14} /></span>
              <span className={styles.dashPromptLabel}>Job title</span>
              <span className={styles.dashPromptBenefit}>match the right roles</span>
            </button>
          ) : (
            <h3 className={styles.dashRole}>Add your job title</h3>
          )}
          <div className={styles.dashMeta}>
            {c.location && <span>{c.location}</span>}
            {c.location && <span className={styles.dot}>·</span>}
            <span>{c.yearsExperience} yrs</span>
            {c.availability && (
              <span className={`${styles.badge} ${styles.availBadge} ${availClass(c.availability)}`}>
                <span className={styles.availDot} />{c.availability}
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

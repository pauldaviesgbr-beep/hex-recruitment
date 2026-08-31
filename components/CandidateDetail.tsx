'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import SignedImage from '@/components/SignedImage'
import SignedLink from '@/components/SignedLink'
import { FaLinkedinIn } from 'react-icons/fa'
import {
  MapPin, Clock, Briefcase, GraduationCap, User, Wrench,
  Award, Heart, Globe, MessageSquare, FileDown, Mail, Sliders,
} from 'lucide-react'
import { Candidate } from '@/lib/mockCandidates'
import { VisibilitySettings } from '@/lib/profileVisibility'
import { getCategoryLabel } from '@/lib/categories'
import { isRelayAddress } from '@/lib/emailDomains'
import styles from './CandidateDetail.module.css'
import { initialsOf } from '@/lib/tempWork'

function normalizeUrl(url: string | undefined): string {
  if (!url || url.trim() === '') return ''
  const u = url.trim()
  return /^https?:\/\//i.test(u) ? u : 'https://' + u
}
function availClass(availability: string | undefined): string {
  if (!availability) return styles.availGrey
  const l = availability.toLowerCase()
  if (l.includes('immediately') || l.includes('available') || l.includes('now')) return styles.availGreen
  if (l.includes('open') || l.includes('considering') || l.includes('notice')) return styles.availYellow
  return styles.availGrey
}

/**
 * Shared, privacy-aware candidate profile. Rendered identically inside the
 * /candidates slide-in modal and the /candidates/[id] page. Every personal
 * field is gated by the candidate's visibility_settings — a hidden field never
 * renders.
 *
 * THIS USED TO SAY "shows the employer-facing profile_picture_url (NOT the
 * dashboard-only dashboard_photo_url)". That was the intent and it cost us
 * three of our four uploaded photos: only one candidate ever used that column.
 * Since 24 Aug 2026 the mapper reads EITHER column — see
 * supabaseProfileToCandidate — so an uploaded photo shows here whichever field
 * it landed in. A photo a candidate uploaded to a recruitment profile is one
 * they chose to put there.
 *
 * Still NOT the OAuth avatar from auth.users metadata. That arrived as a side
 * effect of a sign-in button and was never a decision to publish a face.
 */
export default function CandidateDetail({
  candidate: c,
  visibility: v,
  lastActive,
}: {
  candidate: Candidate
  visibility: VisibilitySettings
  lastActive?: string | null
}) {
  const router = useRouter()
  const [showContact, setShowContact] = useState(false)

  // 'them' is a PRONOUN IN A SENTENCE, not a name. "Message them" and
  // "message them through Thrive" both read correctly; "Message" alone reads
  // broken. This is the same distinction as greetingName's 'there' — copy that
  // works without a name, rather than a placeholder standing in for one.
  const firstName = c.fullName?.split(' ')[0] || 'them'
  // A RELAY ADDRESS IS NOT SHOWN AS A MAILTO, AND THAT IS NOT COSMETIC.
  // Mailing one only works if the SENDER'S domain is registered with Apple,
  // and a hiring manager's Outlook never will be. So it is not a slightly
  // worse address — it is a dead link that fails SILENTLY on their side,
  // where neither they nor we ever find out. Same far-end shape as the
  // privacy@ mailbox that never existed.
  //
  // Detected from RELAY_DOMAINS in lib/emailDomains.ts — the same declaration
  // the signup classifier uses, not a second copy.
  const emailIsRelay = isRelayAddress(c.email)
  const hasEmail = v.show_email && !!c.email && !emailIsRelay
  // show_email is UNCHANGED. This is about what is rendered, not the setting.
  const showRelayNote = v.show_email && !!c.email && emailIsRelay
  const hasPhone = v.show_phone && !!c.phone
  const hasContact = hasEmail || hasPhone || showRelayNote
  const hasSalary = v.show_desired_salary && (c.salaryMin || c.salaryMax || c.desiredSalary)
  const sector = c.jobSector ? getCategoryLabel(c.jobSector) : null

  return (
    <div className={styles.detail}>
      {/* ── Header ───────────────────────────────────── */}
      <div className={styles.header}>
        <div className={styles.avatar}>
          {c.profilePictureUrl ? (
            <SignedImage src={c.profilePictureUrl} alt={c.fullName || ''} />
          ) : (
            <span className={styles.avatarInitials}>{initialsOf(c.fullName)}</span>
          )}
        </div>
        <div className={styles.headerInfo}>
          <h1 className={styles.name}>{c.fullName}</h1>
          <p className={styles.title}>{c.jobTitle}</p>
          {c.headline && <p className={styles.headline}>{c.headline}</p>}
          {v.show_availability && c.availability && (
            <span className={`${styles.availBadge} ${availClass(c.availability)}`}>
              <span className={styles.availDot} />{c.availability}
            </span>
          )}
          <div className={styles.metaRow}>
            {c.location && <span className={styles.metaItem}><MapPin size={14} />{c.location}</span>}
            {c.yearsExperience != null && <span className={styles.metaItem}><Clock size={14} />{c.yearsExperience} yrs experience</span>}
            {lastActive && <span className={styles.metaItem}><span className={styles.activeDot} />{lastActive}</span>}
          </div>
        </div>
      </div>

      {/* ── Quick stats ──────────────────────────────── */}
      {(sector || (c.preferredJobTypes && c.preferredJobTypes.length > 0) || (c.workLocationPreferences && c.workLocationPreferences.length > 0) || (v.show_nationality && c.nationality) || (v.show_date_of_birth && c.age)) && (
        <div className={styles.quickStats}>
          {sector && <div className={styles.quickStat}><span className={styles.quickStatLabel}>Sector</span><span className={styles.quickStatValue}>{sector}</span></div>}
          {c.preferredJobTypes && c.preferredJobTypes.length > 0 && <div className={styles.quickStat}><span className={styles.quickStatLabel}>Work type</span><span className={styles.quickStatValue}>{c.preferredJobTypes.join(', ')}</span></div>}
          {c.workLocationPreferences && c.workLocationPreferences.length > 0 && <div className={styles.quickStat}><span className={styles.quickStatLabel}>Work location</span><span className={styles.quickStatValue}>{c.workLocationPreferences.join(', ')}</span></div>}
          {v.show_nationality && c.nationality && <div className={styles.quickStat}><span className={styles.quickStatLabel}>Nationality</span><span className={styles.quickStatValue}>{c.nationality}</span></div>}
          {v.show_date_of_birth && c.age && <div className={styles.quickStat}><span className={styles.quickStatLabel}>Age</span><span className={styles.quickStatValue}>{c.age}</span></div>}
        </div>
      )}

      {/* ── Actions ──────────────────────────────────── */}
      <div className={styles.actions}>
        <button type="button" className={styles.actionPrimary} onClick={() => router.push(`/messages?candidate=${c.id}`)}>
          <MessageSquare size={16} />Message {firstName}
        </button>
        {hasContact ? (
          <button type="button" className={styles.actionBtn} onClick={() => setShowContact(s => !s)}>
            <Mail size={15} />{showContact ? 'Hide contact' : 'View contact'}
          </button>
        ) : (
          <button type="button" className={styles.actionBtn} disabled><Mail size={15} />Contact private</button>
        )}
        {v.show_cv && c.cvUrl ? (
          <SignedLink src={c.cvUrl} download className={styles.actionBtn}><FileDown size={15} />Download CV</SignedLink>
        ) : (
          <button type="button" className={styles.actionBtn} disabled><FileDown size={15} />No CV</button>
        )}
      </div>
      {showContact && hasContact && (
        <div className={styles.contactReveal}>
          {hasEmail && <div className={styles.contactItem}><span className={styles.contactLabel}>Email</span><a href={`mailto:${c.email}`} className={styles.contactValue}>{c.email}</a></div>}
          {hasPhone && <div className={styles.contactItem}><span className={styles.contactLabel}>Phone</span><a href={`tel:${c.phone}`} className={styles.contactValue}>{c.phone}</a></div>}
          {showRelayNote && (
            <div className={styles.contactItem}>
              <span className={styles.contactLabel}>Email</span>
              <span className={styles.contactValue}>
                Private email &mdash; message {firstName} through Thrive and they&apos;ll get it.
              </span>
            </div>
          )}
        </div>
      )}

      {/* ── Declared by the candidate ─────────────────
          THIS SAID "Verified", WITH AN AWARD ICON AND FOUR GREEN TICKS, AND
          NOTHING VERIFIED ANY OF IT. All four read booleans the candidate sets
          by ticking a box in their own profile form. Thrive has never seen a
          document.

          IT IS THE ONE PLACE IN THE PRODUCT WHERE THE WORDING WALKED A USER
          TOWARDS A LEGAL RISK RATHER THAN A MISSING FEATURE. An employer who
          relies on a right-to-work assurance and hires someone without it
          faces a UK civil penalty of up to £60,000 per worker — and this is
          the employer-facing screen, on /candidates and /candidates/[id],
          which is exactly where a recruiter complaining about applicants
          without the right to work would go looking for that signal.

          THE TICK IS GONE, NOT JUST THE WORD. A green ✓ is the claim; leaving
          it under a truthful heading would still read as a check we had made.
          The badges are neutral now and the sentence says who is asserting it.
          Same family as "Flagged · still visible" — a label stating a fact it
          never reads. */}
      {v.show_verification_badges && (c.hasRightToWork || c.hasNiNumber || c.hasBankAccount || c.hasP45) && (
        <div className={styles.section}>
          <div className={styles.sectionHead}><Award size={18} className={styles.sectionIcon} /><h2 className={styles.sectionTitle}>Declared by the candidate</h2></div>
          <div className={styles.badgeRow}>
            {c.hasRightToWork && <span className={styles.verifyBadge}>Right to work in the UK</span>}
            {c.hasNiNumber && <span className={styles.verifyBadge}>NI number</span>}
            {c.hasBankAccount && <span className={styles.verifyBadge}>UK bank account</span>}
            {c.hasP45 && <span className={styles.verifyBadge}>P45</span>}
          </div>
          <p className={styles.declaredNote}>
            These are the candidate&rsquo;s own statements. Thrive has not seen or checked any documents. You still need to carry out your own right-to-work check before employing anyone.
          </p>
        </div>
      )}

      {/* ── About ────────────────────────────────────── */}
      {/* Reads personal_bio — the box candidates actually fill in. This section
          previously rendered the `bio` column, which had no input anywhere in
          the UI, so it could never display anything for anyone. */}
      {c.personalBio && (
        <div className={styles.section}>
          <div className={styles.sectionHead}><User size={18} className={styles.sectionIcon} /><h2 className={styles.sectionTitle}>About</h2></div>
          <p className={styles.bio}>{c.personalBio}</p>
        </div>
      )}

      {/* ── Work experience ──────────────────────────── */}
      {c.workHistory && c.workHistory.length > 0 && (
        <div className={styles.section}>
          <div className={styles.sectionHead}><Briefcase size={18} className={styles.sectionIcon} /><h2 className={styles.sectionTitle}>Work experience</h2></div>
          <div className={styles.timeline}>
            {c.workHistory.map((job, i) => (
              <div key={i} className={styles.timelineItem}>
                <div className={styles.timelineTrack}><div className={styles.timelineDot} />{i < c.workHistory.length - 1 && <div className={styles.timelineLine} />}</div>
                <div className={styles.timelineBody}>
                  <h3 className={styles.timelineRole}>{job.title}</h3>
                  <p className={styles.timelineCompany}>{job.company}{job.location ? ` • ${job.location}` : ''}</p>
                  <p className={styles.timelineDates}>{job.startDate} — {job.endDate || 'Present'}</p>
                  {job.description && <p className={styles.timelineDesc}>{job.description}</p>}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Strengths / Notable venues / Skills ──────── */}
      {c.specialties && c.specialties.length > 0 && (
        <div className={styles.section}>
          <div className={styles.sectionHead}><Award size={18} className={styles.sectionIcon} /><h2 className={styles.sectionTitle}>Strengths</h2></div>
          <div className={styles.pillGrid}>{c.specialties.map((s, i) => <span key={i} className={styles.pill}>{s}</span>)}</div>
        </div>
      )}
      {c.notableVenues && c.notableVenues.length > 0 && (
        <div className={styles.section}>
          <div className={styles.sectionHead}><MapPin size={18} className={styles.sectionIcon} /><h2 className={styles.sectionTitle}>Notable venues</h2></div>
          <div className={styles.pillGrid}>{c.notableVenues.map((s, i) => <span key={i} className={styles.pill}>{s}</span>)}</div>
        </div>
      )}
      {c.skills && c.skills.length > 0 && (
        <div className={styles.section}>
          <div className={styles.sectionHead}><Wrench size={18} className={styles.sectionIcon} /><h2 className={styles.sectionTitle}>Skills</h2></div>
          <div className={styles.pillGrid}>{c.skills.map((s, i) => <span key={i} className={styles.pill}>{s}</span>)}</div>
        </div>
      )}

      {/* ── Education ─────────────────────────────────── */}
      {c.education && c.education.length > 0 && c.education.some(e => e.institution || e.qualification) && (
        <div className={styles.section}>
          <div className={styles.sectionHead}><GraduationCap size={18} className={styles.sectionIcon} /><h2 className={styles.sectionTitle}>Education</h2></div>
          <div className={styles.timeline}>
            {c.education.filter(e => e.institution || e.qualification).map((e, i, arr) => (
              <div key={i} className={styles.timelineItem}>
                <div className={styles.timelineTrack}><div className={styles.timelineDot} />{i < arr.length - 1 && <div className={styles.timelineLine} />}</div>
                <div className={styles.timelineBody}>
                  <h3 className={styles.timelineRole}>{e.qualification}{e.fieldOfStudy ? ` in ${e.fieldOfStudy}` : ''}</h3>
                  <p className={styles.timelineCompany}>{e.institution}{e.grade ? ` • ${e.grade}` : ''}</p>
                  <p className={styles.timelineDates}>{e.startDate} — {e.inProgress ? 'In Progress' : (e.endDate || 'N/A')}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Languages ─────────────────────────────────── */}
      {c.languages && c.languages.length > 0 && c.languages.some(l => l.name) && (
        <div className={styles.section}>
          <div className={styles.sectionHead}><Globe size={18} className={styles.sectionIcon} /><h2 className={styles.sectionTitle}>Languages</h2></div>
          <div className={styles.pillGrid}>{c.languages.filter(l => l.name).map((l, i) => <span key={i} className={styles.pill}>{l.name} <span className={styles.langLevel}>({l.proficiency})</span></span>)}</div>
        </div>
      )}

      {/* ── Certifications ────────────────────────────── */}
      {c.certifications && c.certifications.length > 0 && (
        <div className={styles.section}>
          <div className={styles.sectionHead}><Award size={18} className={styles.sectionIcon} /><h2 className={styles.sectionTitle}>Certifications</h2></div>
          <ul className={styles.certList}>{c.certifications.map((cert, i) => <li key={i} className={styles.certItem}><span className={styles.certCheck}>✓</span>{cert}</li>)}</ul>
        </div>
      )}

      {/* ── Preferences ───────────────────────────────── */}
      {(hasSalary || c.preferredLocations) && (
        <div className={styles.section}>
          <div className={styles.sectionHead}><Sliders size={18} className={styles.sectionIcon} /><h2 className={styles.sectionTitle}>Preferences</h2></div>
          <div className={styles.prefGrid}>
            {hasSalary && (
              <div className={styles.prefRow}><span className={styles.prefLabel}>Desired salary</span><span className={styles.prefValue}>
                {c.salaryMin && c.salaryMax ? <>£{Number(c.salaryMin).toLocaleString()} – £{Number(c.salaryMax).toLocaleString()}{c.salaryPeriod === 'hour' ? '/hr' : '/yr'}</>
                  : c.desiredSalary ? <>£{Number(c.desiredSalary).toLocaleString()}{c.salaryPeriod === 'hour' ? '/hr' : '/yr'}</>
                  : c.salaryMin ? <>From £{Number(c.salaryMin).toLocaleString()}{c.salaryPeriod === 'hour' ? '/hr' : '/yr'}</>
                  : <>Up to £{Number(c.salaryMax).toLocaleString()}{c.salaryPeriod === 'hour' ? '/hr' : '/yr'}</>}
              </span></div>
            )}
            {c.preferredLocations && <div className={styles.prefRow}><span className={styles.prefLabel}>Preferred areas</span><span className={styles.prefValue}>{c.preferredLocations}</span></div>}
          </div>
        </div>
      )}

      {/* ── Interests ─────────────────────────────────── */}
      {c.interests && c.interests.length > 0 && (
        <div className={styles.section}>
          <div className={styles.sectionHead}><Heart size={18} className={styles.sectionIcon} /><h2 className={styles.sectionTitle}>Interests</h2></div>
          <div className={styles.pillGrid}>{c.interests.map((s, i) => <span key={i} className={styles.pillSoft}>{s}</span>)}</div>
        </div>
      )}

      {/* ── LinkedIn ──────────────────────────────────── */}
      {/* LinkedIn only. Facebook/Instagram are personal accounts that tell an
          employer nothing about someone's work — surfacing them to employers
          invited judgement on things that aren't the job. */}
      {v.show_social_links && c.linkedinUrl && (
        <div className={styles.section}>
          <div className={styles.sectionHead}><Globe size={18} className={styles.sectionIcon} /><h2 className={styles.sectionTitle}>Links</h2></div>
          <div className={styles.socialRow}>
            <a href={normalizeUrl(c.linkedinUrl)} target="_blank" rel="noopener noreferrer" className={styles.socialLink} aria-label="LinkedIn"><FaLinkedinIn /></a>
          </div>
        </div>
      )}
    </div>
  )
}

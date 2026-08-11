// Canonical notification-preferences schema (single source of truth).
//
// This is the NESTED shape that every real `notification_preferences` row in the
// DB already uses ({ email:{…}, sms:{…}, frequency }). An earlier settings page
// used a FLAT shape (email_job_matches, …, notification_frequency) that was never
// actually persisted — it only ever misread nested rows as defaults and, on save,
// threatened to clobber them. This module is the canonical replacement, shared by
// the settings page (read + write) and the data normaliser, and reused by the
// job-digest cron (Phase 3) so opt-ins are read the same way everywhere.
//
// Keys mirror the live data exactly, per role — do NOT invent keys here without a
// matching data migration.

export type NotificationFrequency = 'instant' | 'daily' | 'weekly'
export type Role = 'employee' | 'employer'

export interface CandidatePrefs {
  email: {
    job_matches: boolean
    job_digest: boolean
    new_messages: boolean
    application_updates: boolean
    marketing: boolean
  }
  sms: {
    job_alerts: boolean
    new_messages: boolean
  }
  /**
   * PUSH. A fourth channel alongside email and sms, added 11 Aug 2026 with a
   * data migration that backfilled every existing row — per this file's own
   * warning about inventing keys.
   *
   * NOTE THE sms KEYS ABOVE ARE ASPIRATIONAL: no SMS sender exists anywhere in
   * the repo, so their presence proves nothing about whether that channel
   * works. push is deliberately NOT left in that state — it has a dispatcher,
   * a transport and a log behind it before these keys were added.
   */
  push: {
    job_matches: boolean
    new_messages: boolean
    application_updates: boolean
  }
  frequency: NotificationFrequency
}

export interface EmployerPrefs {
  email: {
    new_applications: boolean
    job_views: boolean
    new_messages: boolean
    application_updates: boolean
    marketing: boolean
  }
  sms: {
    new_messages: boolean
    urgent_applications: boolean
  }
  /** See the note on CandidatePrefs.push. */
  push: {
    new_applications: boolean
    new_messages: boolean
    application_updates: boolean
  }
  frequency: NotificationFrequency
}

export type NotificationPrefs = CandidatePrefs | EmployerPrefs

export const CANDIDATE_DEFAULTS: CandidatePrefs = {
  email: { job_matches: true, job_digest: true, new_messages: true, application_updates: true, marketing: false },
  sms: { job_alerts: false, new_messages: false },
  push: { job_matches: true, new_messages: true, application_updates: true },
  frequency: 'instant',
}

export const EMPLOYER_DEFAULTS: EmployerPrefs = {
  email: { new_applications: true, job_views: true, new_messages: true, application_updates: true, marketing: false },
  sms: { new_messages: false, urgent_applications: false },
  push: { new_applications: true, new_messages: true, application_updates: true },
  frequency: 'instant',
}

export function defaultsFor(role: Role): NotificationPrefs {
  return role === 'employer' ? clone(EMPLOYER_DEFAULTS) : clone(CANDIDATE_DEFAULTS)
}

function clone<T>(v: T): T {
  return JSON.parse(JSON.stringify(v))
}

const FREQUENCIES: NotificationFrequency[] = ['instant', 'daily', 'weekly']

// Read a possibly-legacy/partial/mixed stored value and produce a complete,
// canonical object for the given role. Only canonical nested keys are honoured;
// stray flat keys (email_job_matches, notification_frequency, …) are ignored.
// Missing keys fall back to the role defaults. This is what the settings page
// uses on load (so it shows the user's REAL saved opt-ins) and what save/normalise
// emit (so we only ever write clean canonical data).
export function normalisePrefs(role: Role, stored: unknown): NotificationPrefs {
  const base = defaultsFor(role)
  if (!stored || typeof stored !== 'object') return base
  const s = stored as Record<string, any>

  const email = { ...(base.email as Record<string, boolean>) }
  if (s.email && typeof s.email === 'object') {
    for (const k of Object.keys(email)) {
      if (typeof s.email[k] === 'boolean') email[k] = s.email[k]
    }
  }

  const sms = { ...(base.sms as Record<string, boolean>) }
  if (s.sms && typeof s.sms === 'object') {
    for (const k of Object.keys(sms)) {
      if (typeof s.sms[k] === 'boolean') sms[k] = s.sms[k]
    }
  }

  const push = { ...((base as any).push as Record<string, boolean>) }
  if (s.push && typeof s.push === 'object') {
    for (const k of Object.keys(push)) {
      if (typeof s.push[k] === 'boolean') push[k] = s.push[k]
    }
  }

  const frequency: NotificationFrequency = FREQUENCIES.includes(s.frequency) ? s.frequency : base.frequency

  return { email, sms, push, frequency } as NotificationPrefs
}

// True if the stored value is already exactly canonical (same keys, no stray
// top-level keys) — lets the data normaliser skip rows that need no change and
// stay idempotent.
export function isCanonical(role: Role, stored: unknown): boolean {
  if (!stored || typeof stored !== 'object') return false
  const canonical = normalisePrefs(role, stored)
  return JSON.stringify(sortDeep(stored)) === JSON.stringify(sortDeep(canonical))
}

function sortDeep(v: any): any {
  if (v && typeof v === 'object' && !Array.isArray(v)) {
    const out: Record<string, any> = {}
    for (const k of Object.keys(v).sort()) out[k] = sortDeep(v[k])
    return out
  }
  return v
}

/**
 * Which push preference key governs a given notification.type.
 *
 * Returns null when a type has no key, and the dispatcher treats null as
 * ALLOWED. That is the deliberate direction: a new notification type added by
 * someone who never reads this file should still reach the person, rather than
 * being silently swallowed by a preference that does not exist. Silence is the
 * failure mode this whole phase is about.
 *
 * Live types as at 11 Aug 2026: new_application, application_update,
 * temp_interest, temp_comment, temp_comment_reply.
 */
export function pushPrefKeyFor(notificationType: string): string | null {
  switch (notificationType) {
    case 'new_application': return 'new_applications'
    case 'application_update': return 'application_updates'
    case 'job_match': return 'job_matches'
    case 'new_message': return 'new_messages'
    default: return null
  }
}

/** True if this person wants a push for this notification type. */
export function pushAllowed(prefs: NotificationPrefs, notificationType: string): boolean {
  const key = pushPrefKeyFor(notificationType)
  if (!key) return true
  const push = (prefs as any).push as Record<string, boolean> | undefined
  if (!push || !(key in push)) return true
  return push[key] !== false
}

// WHAT ERASING A CANDIDATE ACTUALLY DOES, AS DATA RATHER THAN AS CODE.
//
// THE WHOLE PLAN IS A LIST YOU CAN READ. Every table a person touches, what
// happens to it, and WHY — in one place, so the answer to "what did we delete"
// is a document rather than an archaeology exercise through an imperative
// script. The executor walks this list; it decides nothing itself.
//
// WHY THIS SHAPE. There is not one foreign key from public to auth.users, so
// nothing cascades and every deletion is a manual enumeration. A list that can
// be diffed, reviewed and asserted against the live catalogue is the only way
// that stays correct as tables are added — an imperative script silently goes
// stale the day someone adds a table and doesn't think about erasure.
//
// THE DECISIONS BELOW ARE PAUL'S, made 25 Aug 2026 as sole director of the data
// controller. They are recorded here with their reasoning so the next person
// changing one knows what they are overruling. Where a case is NOT covered, the
// entry says so and the executor refuses rather than guessing.

export type Action =
  /** The row goes. */
  | 'delete'
  /** The row stays; identifying columns are nulled or blanked. */
  | 'anonymise'
  /** Deliberately untouched, with a reason. */
  | 'keep'
  /** Cannot be done as decided — a constraint blocks it. The executor STOPS. */
  | 'blocked'

export interface TableRule {
  table: string
  /** The column carrying the person's id. */
  column: string
  action: Action
  /** For 'anonymise': columns set to null. */
  nullColumns?: string[]
  /** For 'anonymise': columns set to a literal (used where NOT NULL forbids null). */
  literalColumns?: { column: string; value: string }[]
  why: string
  /** Set when action is 'blocked' — what stops it, and what the options are. */
  blocker?: string
}

// ─── THE PLAN ──────────────────────────────────────────────────────────────

export const ERASURE_PLAN: TableRule[] = [
  // ── The person themselves ────────────────────────────────────────────────
  { table: 'candidate_profiles', column: 'user_id', action: 'delete',
    why: 'The profile is the person. Name, email, phone, address, date of birth, work history, CV-derived data.' },
  { table: 'candidate_cvs', column: 'user_id', action: 'delete',
    why: 'cv_data jsonb is the richest personal data we hold — the parsed CV.' },

  // ── Theirs alone: nobody else has an interest ────────────────────────────
  { table: 'saved_jobs', column: 'candidate_id', action: 'delete', why: 'Their shortlist. No other party.' },
  { table: 'job_alerts', column: 'candidate_id', action: 'delete',
    why: 'Their alert subscriptions. Also stops future email reaching a deleted person.' },
  { table: 'apply_starts', column: 'candidate_id', action: 'delete', why: 'Funnel analytics about them alone.' },
  { table: 'device_tokens', column: 'user_id', action: 'delete',
    why: 'MUST go, or push notifications keep arriving on their device after the account is gone.' },
  { table: 'push_log', column: 'user_id', action: 'delete', why: 'Delivery log for pushes to them.' },
  { table: 'user_onboarding', column: 'user_id', action: 'delete', why: 'Their onboarding progress.' },
  { table: 'boosts', column: 'user_id', action: 'delete', why: 'Their profile boosts.' },
  { table: 'review_helpful_votes', column: 'user_id', action: 'delete', why: 'A vote carries no content.' },
  { table: 'saved_candidates', column: 'candidate_id', action: 'delete',
    why: "An employer's shortlist entry pointing at a person who no longer exists." },
  { table: 'temp_post_likes', column: 'user_id', action: 'delete', why: 'A like carries no content.' },
  { table: 'temp_interest', column: 'candidate_user_id', action: 'delete',
    why: 'An expression of interest in a shift. The employer keeps the shift; the interest was personal.' },

  // ── PAUL'S DECISION (a): APPLICATIONS ANONYMISE, NOT DELETE ──────────────
  //
  // An employer's record of their own hiring is THEIR data, and rows vanishing
  // from a pipeline with no explanation corrupts it. The shell and its status
  // history stay; everything identifying goes.
  //
  // DROPPING candidate_id IS WHAT MAKES THIS LAWFUL. If the link back to the
  // person survives, this is PSEUDONYMISATION — still personal data, and it
  // does not satisfy an erasure request. Verified nullable before building.
  { table: 'job_applications', column: 'candidate_id', action: 'anonymise',
    nullColumns: ['candidate_id', 'cv_url', 'cover_letter', 'screening_answers'],
    why: "Decision (a). The employer keeps the application and its status history; the person becomes unlinkable. " +
         "cover_letter and screening_answers are cleared because they are the candidate's own free text and " +
         "routinely contain their name and contact details — leaving them would defeat the unlinkability the " +
         "decision explicitly requires. employer_notes is NOT touched: those are the employer's words." },

  // ── PAUL'S DECISION (b): MESSAGES — their words go, the other side stays ──
  { table: 'messages', column: 'sender_id', action: 'anonymise',
    literalColumns: [{ column: 'content', value: '[deleted]' }],
    why: "Decision (b). The employer's own messages are their words and must not vanish from their inbox. " +
         "Thread structure intact. NOTE THE LIMIT: sender_id is NOT NULL so it survives as a dangling id, and " +
         "the OTHER party's messages may still name the person — we are not editing someone else's words." },

  // ── PAUL'S DECISION (c): NOTIFICATIONS ABOUT THEM, SENT TO OTHERS ────────
  { table: 'notifications', column: 'user_id', action: 'delete',
    why: 'Decision (c). A notification is an alert, not a record. Nothing depends on a months-old ' +
         '"X applied to your role", and the application it points at is anonymised anyway.' },

  // ── PAUL'S DECISION (d): PUBLIC COMMENTS — the Reddit model ──────────────
  { table: 'temp_post_comments', column: 'user_id', action: 'blocked',
    literalColumns: [{ column: 'body', value: '[deleted]' }],
    why: 'Decision (d): body removed, row kept, author anonymised — so replies do not answer something that ' +
         'is no longer there.',
    blocker: 'temp_post_comments.user_id is NOT NULL, so the author CANNOT be anonymised as decided. ' +
             'Blanking the body while keeping user_id leaves a public comment still linked to the erased ' +
             'person, which is pseudonymisation and does not satisfy the request. Two options, both Paul\'s: ' +
             '(1) a migration making user_id nullable, or (2) a sentinel "deleted user" id. NOT CHOSEN HERE.' },

  // ── PAUL'S DECISION (e): OFFERS AND THE AUDIT LOG — KEEP ─────────────────
  //
  // A signed offer is a contract; both parties have a legitimate interest and
  // UK GDPR permits retention for legal claims. The surveillance columns are
  // NOT contract terms and are cleared.
  { table: 'job_offers', column: 'candidate_id', action: 'anonymise',
    nullColumns: ['signature_ip', 'signature_user_agent'],
    why: 'Decision (e). The contract is kept — candidate_id is NOT NULL and stays, deliberately. ' +
         'signature_ip and signature_user_agent are cleared: they are surveillance data, not contract terms, ' +
         'and nothing about the contract surviving requires them.' },
  { table: 'offer_audit_log', column: 'actor_user_id', action: 'keep',
    why: 'Decision (e). The audit trail of a contract. Kept for the same reason as the contract itself.' },

  // ── Analytics: the row is useful, the person is not ──────────────────────
  { table: 'job_views', column: 'viewer_id', action: 'anonymise', nullColumns: ['viewer_id'],
    why: 'A null viewer_id already means "anonymous" in this table, so the view count stays honest ' +
         'while the person disappears. Nothing is lost that anyone reads.' },
  { table: 'job_click_events', column: 'user_id', action: 'anonymise', nullColumns: ['user_id'],
    why: 'As job_views — the event stays, the person goes.' },
  { table: 'job_impressions', column: 'user_id', action: 'anonymise', nullColumns: ['user_id'],
    why: 'As job_views — the event stays, the person goes.' },
  { table: 'platform_feedback', column: 'user_id', action: 'anonymise', nullColumns: ['user_id'],
    why: 'The feedback is useful to us; who wrote it is not. Nullable, so genuinely unlinkable.' },
  { table: 'application_status_events', column: 'actor_id', action: 'anonymise', nullColumns: ['actor_id'],
    why: "The employer's audit trail of their own pipeline stays; the actor becomes unlinkable. " +
         'Nullable, verified.' },

  // profile_views is DELETE rather than anonymise, and that is a correction to
  // my own earlier proposal: BOTH viewer_id and profile_id are NOT NULL, so
  // nulling is impossible. Deleting is the only option that erases.
  { table: 'profile_views', column: 'viewer_id', action: 'delete',
    why: 'Views BY them. Proposed as anonymise originally; viewer_id is NOT NULL so that is not possible ' +
         'and the row is deleted instead.' },
  { table: 'profile_views', column: 'profile_id', action: 'delete',
    why: 'Views OF them. Same constraint, same treatment.' },

  // ── Reachable ONLY by email — a *_id sweep misses all of these ───────────
  //
  // THIS IS THE GROUP THAT MAKES SOMEONE "DELETED" AND STILL PRESENT. They
  // carry an address and no user id at all, so nothing keyed on ids finds them.
  { table: 'email_log', column: 'recipient', action: 'delete',
    why: 'Decision: delete. A delivery log is useful for deliverability work, but not against an explicit ' +
         'erasure request. MATCHED BY EMAIL — there is no user id on this table.' },
  { table: 'waitlist', column: 'email', action: 'delete',
    why: 'Nothing but the address. MATCHED BY EMAIL.' },
  { table: 'employer_members', column: 'invited_email', action: 'delete',
    why: 'A pending invitation to an address that no longer exists. MATCHED BY EMAIL.' },

  // ── Kept, deliberately ───────────────────────────────────────────────────
  { table: 'deletion_requests', column: 'user_id', action: 'keep',
    why: 'The audit trail OF the erasure. Deleting it destroys the evidence that we complied with the ' +
         'request — the one record that proves we did what was asked.' },
  { table: 'user_departures', column: 'user_id', action: 'keep',
    why: 'It IS the departure log, and it stores an email DOMAIN rather than an address.' },
]

/** Tables matched by email address rather than by a user id. */
export const EMAIL_MATCHED = ERASURE_PLAN
  .filter(r => ['email_log', 'waitlist', 'employer_members'].includes(r.table))
  .map(r => r.table)

/**
 * EVERY STORAGE LAYOUT A PERSON'S FILES CAN BE UNDER.
 *
 * FIVE, NOT ONE, AND THE LAST IS THE TRAP. 23 objects sit under a BARE
 * `<uuid>/` folder with no prefix, so the owner is foldername[1] rather than
 * foldername[2]. A script that assumes a prefix misses three quarters of the
 * bucket — which is exactly how 51 objects were orphaned across February to
 * June 2026.
 */
export const STORAGE_LAYOUTS = [
  { prefix: 'photos', ownerAt: 2 },
  { prefix: 'cvs', ownerAt: 2 },
  { prefix: 'signatures', ownerAt: 2 },
  { prefix: 'offer-letters', ownerAt: 2 },
  { prefix: null, ownerAt: 1 }, // bare <uuid>/… — the legacy layout
] as const

export const BUCKET = 'profiles'

/** Does this object path belong to this user, under ANY of the five layouts? */
export function objectBelongsTo(name: string, userId: string): boolean {
  const parts = name.split('/')
  // Bare layout: <uuid>/file
  if (parts[0] === userId) return true
  // Prefixed layout: <prefix>/<uuid>/file
  const known = STORAGE_LAYOUTS.filter(l => l.prefix).map(l => l.prefix as string)
  if (known.includes(parts[0]) && parts[1] === userId) return true
  return false
}

/** Anything the plan cannot carry out as decided. The executor must refuse. */
export function blockers(): TableRule[] {
  return ERASURE_PLAN.filter(r => r.action === 'blocked')
}

export interface ReceiptLine {
  table: string
  action: Action
  matched: number
  affected: number
  note?: string
}

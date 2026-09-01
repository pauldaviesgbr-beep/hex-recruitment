// WHAT ERASING A CANDIDATE ACTUALLY DOES, AS DATA RATHER THAN AS CODE.
//
// THE WHOLE PLAN IS A LIST YOU CAN READ. Every table a person touches, what
// happens to it, and WHY — in one place, so the answer to "what did we delete"
// is a document rather than an archaeology exercise through an imperative
// script. The executor walks this list; it decides nothing itself.
//
// WHY THIS SHAPE. A list that can be diffed, reviewed and asserted against the
// live catalogue is the only thing that stays correct as tables are added — an
// imperative script silently goes stale the day someone adds a table and
// doesn't think about erasure.
//
// ╔═══════════════════════════════════════════════════════════════════════╗
// ║ THIS COMMENT USED TO SAY: "There is not one foreign key from public to ║
// ║ auth.users, so nothing cascades and every deletion is a manual         ║
// ║ enumeration."  IT IS FALSE, AND IT WAS FALSE WHEN IT WAS WRITTEN.      ║
// ╚═══════════════════════════════════════════════════════════════════════╝
//
// Measured 1 Sept 2026 from `pg_constraint`: about 55 foreign keys point into
// auth.users and MOST OF THEM CASCADE — jobs, messages, conversations,
// notifications, employer_profiles, interviews, job_offers, saved_candidates,
// candidate_profiles and more.
//
// WHY NOBODY SAW IT: `information_schema`'s constraint views return nothing
// useful for these tables. A foreign-key query against it on `jobs` comes back
// EMPTY. Only `pg_constraint` shows them. That is a tool chosen specifically to
// answer this question, answering it wrongly — the same shape as `cat -A` not
// showing the \r and `executablePath()` returning a path for a binary that does
// not exist.
//
// ── IT INVERTS THE RISK THE PLAN WAS DESIGNED AROUND ──────────────────────
//
// Every rule below was written as though a row would SURVIVE unless the plan
// named it. The truth is often the opposite: rows go WHETHER OR NOT the plan
// names them, at the moment auth.users is deleted — which is the LAST step,
// after every careful anonymise above it.
//
// ┌─ THE RULE ──────────────────────────────────────────────────────────────┐
// │ An ANONYMISE rule on a CASCADE table survives ONLY IF it nulls the       │
// │ column the constraint follows.                                          │
// │ A KEEP rule on a CASCADE table does not survive at all.                 │
// │ Check pg_constraint — never information_schema — before deciding that   │
// │ a row will survive.                                                      │
// └─────────────────────────────────────────────────────────────────────────┘
//
// ── THE AUDIT, 1 Sept 2026: ALL 31 RULES ─────────────────────────────────
//
// THE THREE `keep` RULES:
//   user_departures     no FK at all                    SURVIVES
//   offer_audit_log     actor_user_id  NO ACTION        SURVIVES — and blocks, see below
//   deletion_requests   user_id        CASCADE          ✗ DESTROYED — the erasure
//                                                         destroys its own audit trail
//
// THE NINE `anonymise` RULES — and note WHY each survivor survives:
//   job_applications    CASCADE   survives: the rule nulls candidate_id
//   messages            CASCADE   survives: the rule nulls sender_id
//   temp_post_comments  CASCADE   survives: the rule nulls user_id
//   job_offers          CASCADE   ✗ DESTROYED — deliberately does NOT null candidate_id
//   job_views           SET NULL  survives: the constraint nulls it for us
//   job_click_events    SET NULL  survives
//   job_impressions     SET NULL  survives
//   platform_feedback   SET NULL  survives
//   application_status_events  no FK   survives
//
// THE NINETEEN `delete` RULES are unaffected — a cascade would remove them
// anyway; the plan simply gets there first.
//
// THE THREE SURVIVING ANONYMISE RULES SURVIVE BY LUCK, NOT BY DESIGN. Nobody
// chose to null the FK column in order to defeat a cascade; they nulled it
// because the person had to become unlinkable, and defeating the cascade fell
// out of that. It is now load-bearing and nothing said so until today.
//
// ── AND TWO CONSTRAINTS THAT REFUSE THE DELETE OUTRIGHT ───────────────────
//
//   offer_audit_log.actor_user_id   → auth.users   NO ACTION   0 rows today
//   employer_members.invited_by     → auth.users   NO ACTION   0 of 9 rows set
//
// NO ACTION IS NOT "SAFE". If a referencing row exists, deleting auth.users
// RAISES and the whole transaction rolls back. eraseAccount catches it, skips
// the auth delete, and the route returns "your account has NOT been deleted".
//
// SO ANYONE WHO HAS EVER SIGNED AN OFFER, OR EVER INVITED A COLLEAGUE, CANNOT
// DELETE THEIR ACCOUNT AT ALL. It is a dead end, not data loss — it fails
// loudly, which is the better direction — but it is 5.1.1(v) failing on a real
// person. It is a FUSE rather than a fault only because both tables are empty:
// nobody has used the offer flow or the team invites yet. It is a fuse on the
// CANDIDATE path as much as the employer one.
//
// NOT FIXED IN THIS CHANGE, deliberately, and costed separately.
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
    nullColumns: ['candidate_id', 'cv_url', 'cover_letter', 'screening_answers', 'employer_notes'],
    why: "Decision (a). The employer keeps the application and its status history; the person becomes unlinkable. " +
         "cover_letter and screening_answers are cleared because they are the candidate's own free text and " +
         "routinely contain their name and contact details — leaving them would defeat the unlinkability the " +
         "decision explicitly requires. " +
         // employer_notes JOINED THIS LIST ON 27 AUG 2026, REVERSING AN EARLIER
         // DECISION. It used to be exempt, on the reasoning that "those are the
         // employer's words".
         //
         // THE QUESTION IS NOT WHO WROTE IT. IT IS WHO IT IDENTIFIES. A note
         // reading "spoke to Sarah, strong on pastry, available from the 3rd"
         // is personal data about Sarah whoever typed it, and leaving it
         // defeats the very unlinkability the sentence above demands. That
         // sentence was already written, one clause earlier, about exactly this
         // risk — it simply was not carried across to the next field.
         //
         // Changed while it was free: 87 applications, ZERO notes, longest note
         // 0 characters. Nobody had ever written one. Doing it later would have
         // meant deciding what to do with real employer content, which is a
         // different and worse conversation.
         "employer_notes is cleared for the same reason: it is the employer's writing but the CANDIDATE'S " +
         "personal data, and an erasure that leaves a note naming the person has not erased them." },

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
  { table: 'temp_post_comments', column: 'user_id', action: 'anonymise',
    nullColumns: ['user_id', 'author_name', 'author_avatar'],
    literalColumns: [{ column: 'body', value: '[deleted]' }],
    why: 'Decision (d), the Reddit model: body removed, row kept, author anonymised — so replies do not ' +
         'answer something that is no longer there. user_id is NULL rather than a sentinel: a "deleted ' +
         'user" would be a real row in a table of real people and would leak into counts and sends, and ' +
         'NULL is simply true — there is no author. ' +
         'author_name AND author_avatar ARE CLEARED TOO, and that is the part that makes this work: they ' +
         'are DENORMALISED onto the comment row by a BEFORE INSERT trigger, so nulling user_id alone would ' +
         'have left the erased person\'s name and photograph sitting on a public comment.' },

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

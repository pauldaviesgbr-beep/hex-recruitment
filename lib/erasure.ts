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
//   job_applications    CASCADE   survives: the rule nulls candidate_id (nullable)
//   temp_post_comments  CASCADE   survives: the rule nulls user_id (nullable)
//   messages            CASCADE   ✗ DESTROYED — sender_id is NOT NULL, so the rule
//                                   CANNOT null it and does not try. Its own comment
//                                   says "sender_id is NOT NULL so it survives as a
//                                   dangling id" — that is exactly backwards: the
//                                   dangling id is what the cascade follows.
//   job_offers          CASCADE   ✗ DESTROYED — candidate_id is NOT NULL and the rule
//                                   deliberately keeps it, "because the contract is kept"
//   job_views           SET NULL  survives: the constraint nulls it for us
//   job_click_events    SET NULL  survives
//   job_impressions     SET NULL  survives
//   platform_feedback   SET NULL  survives
//   application_status_events  no FK   survives
//
// THE NINETEEN `delete` RULES are unaffected — a cascade would remove them
// anyway; the plan simply gets there first.
//
// THE TWO SURVIVING ANONYMISE RULES SURVIVE BY LUCK, NOT BY DESIGN. Nobody
// chose to null the FK column in order to defeat a cascade; they nulled it
// because the person had to become unlinkable, and defeating the cascade fell
// out of that. It is now load-bearing and nothing said so until today.
//
// AND THE DIVIDING LINE IS NULLABILITY, WHICH IS WHY IT LOOKS ARBITRARY:
// job_applications.candidate_id and temp_post_comments.user_id are NULLABLE, so
// the rules could null them and did. messages.sender_id and
// job_offers.candidate_id are NOT NULL, so those rules could not — and both
// wrote a comment explaining the value would "survive as a dangling id",
// unaware that the dangling id is precisely what the cascade follows.
// The fix for both is a TOMBSTONE user id rather than NULL.
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
  /** The row stays and stays whole; it is taken out of circulation. */
  | 'archive'
  /** Deliberately untouched, with a reason. */
  | 'keep'
  /** Cannot be done as decided — a constraint blocks it. The executor STOPS. */
  | 'blocked'

/**
 * WHICH ID THE `column` HOLDS. Employer tables use TWO DIFFERENT ID SPACES and
 * getting it wrong is SILENT: the executor treats zero matches as success, so a
 * rule pointed at the wrong space reports `matched: 0` and looks like a table
 * the employer simply had no rows in.
 *
 * Measured across the live data on 1 Sept 2026 rather than assumed:
 *
 *     jobs                   319 / 319 rows match a user_id     → 'user'
 *     employer_availability    7 /   7 rows match a user_id     → 'user'
 *     temp_posts               1 /   1 rows match a user_id     → 'user'
 *     employer_members         9 /   9 rows match a PROFILE id  → 'profile'
 *
 * NINE MORE TABLES WERE EMPTY, so the data could not answer for them and their
 * space was READ FROM THE CODE THAT WRITES THEM instead — `job_offers` carries
 * the comment "employer_id MUST be the employer OWNER's user id", and
 * `employer_email_templates` "keyed employer_id = owner user_id". Every writer
 * uses `getCurrentEmployerOwnerId()`.
 *
 * So the rule is: **every `employer_id` in this schema is the owner's USER id
 * except `employer_members`, which is the employer PROFILE id.**
 */
export type IdSpace = 'user' | 'profile' | 'email'

export interface TableRule {
  table: string
  /** The column carrying the person's id. */
  column: string
  action: Action
  /** Which id `column` holds. Defaults to 'user'. */
  idSpace?: IdSpace
  /** For 'anonymise': columns set to null. */
  nullColumns?: string[]
  /** For 'anonymise' and 'archive': columns set to a literal. */
  literalColumns?: { column: string; value: string }[]
  /**
   * For 'anonymise': columns repointed at TOMBSTONE_USER_ID.
   *
   * THE ONLY THING THAT SAVES A NOT NULL FK COLUMN ON A CASCADE TABLE. Nulling
   * is what makes the other anonymise rules survive; where the column forbids
   * null, this is the same move with a placeholder instead of nothing.
   *
   * NOT a literalColumns entry, deliberately: the value is a real account id
   * resolved at runtime, and writing it as a literal in the plan would put a
   * uuid in a document people edit by hand — where a typo produces a valid uuid
   * pointing at nobody, NOT NULL is satisfied, and the row is orphaned silently.
   */
  tombstoneColumns?: string[]
  /**
   * Match `column` against the ids of THIS EMPLOYER'S JOBS rather than against
   * a user or profile id. Only job_applications needs it: the employer link is
   * job_applications.job_id → jobs.employer_id, and there is no employer column
   * to `.eq()` on. The executor resolves the job list first.
   */
  viaEmployerJobs?: boolean
  why: string
  /** Set when action is 'blocked' — what stops it, and what the options are. */
  blocker?: string
}

// ─── THE TOMBSTONE OWNER ───────────────────────────────────────────────────
//
// SOME ROWS MUST OUTLIVE THE PERSON, AND THEIR LINK TO THAT PERSON IS A
// NOT NULL COLUMN WITH A CASCADE BEHIND IT. They cannot be nulled, so they are
// pointed here instead — at an account that is never deleted:
//
//     job_offers.candidate_id   NOT NULL → auth.users CASCADE   a signed contract
//     messages.sender_id        NOT NULL → auth.users CASCADE   a thread's shape
//     jobs.employer_id          NOT NULL → auth.users CASCADE   an archived advert
//
// WHY NOT MAKE THE COLUMNS NULLABLE? That is a migration against `jobs` — 319
// rows, 251 of them live on the public board — plus an audit of every consumer
// that assumes non-null, while an App Store review is open against a binary
// that loads production directly. The tombstone needs no schema change and is
// reversible with an UPDATE.
//
// ⚠️ AUTHENTICATING AS THIS ACCOUNT WOULD MEAN OWNING EVERY ARCHIVED ADVERT AND
// EVERY HISTORICAL CONTRACT, because RLS grants on `auth.uid() = employer_id`
// and `auth.uid() = candidate_id`. It is protected by three independent guards,
// none of which depends on a password staying secret — the `.invalid` address
// cannot receive mail anywhere on the internet (RFC 2606, a property of the DNS
// root rather than of our configuration), the account is BANNED so Supabase
// refuses authentication outright, and the password is random and never
// recorded. See scripts/create-tombstone-owner.ts, which proves all three.
//
// IT IS NOT UNDELETABLE. Nothing refuses a deleteUser call on it, and a note is
// not a guard. That is separate work.
// RE-EXPORTED, NOT REDEFINED. The values live in lib/protectedAccounts.ts,
// which is also what `protected:prove` reads when it asserts every run that the
// account still exists and is still banned.
//
// THEY WERE DEFINED HERE FIRST AND THAT WAS A SECOND DEFINITION. Both copies
// were correct, which is exactly the failure CLAUDE.md records under "when two
// versions of a thing exist, the wrong one gets read" — nothing would have been
// inconsistent until somebody rotated the account and updated one of them.
// A constant that has drifted from the live row is worse than no constant: the
// erasure would point rows at a uuid belonging to nobody, and NOT NULL would
// not save us, because the value is still a perfectly valid uuid.
// Consumers import them from lib/protectedAccounts directly. Deliberately NOT
// re-exported through here: a re-export is a second NAME for the same value,
// and the next person greping for where the tombstone id comes from should
// find one answer rather than two paths to it.

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
  // ⚠️ THIS RULE DID NOT WORK AT ALL UNTIL 1 SEPT 2026, AND ITS OWN COMMENT
  // EXPLAINED WHY WITHOUT NOTICING. It used to end: "sender_id is NOT NULL so it
  // survives as a dangling id". That is exactly backwards — `messages.sender_id`
  // has an ON DELETE CASCADE to auth.users, so the dangling id is precisely what
  // the cascade follows, and every message was DELETED rather than blanked. The
  // policy and the delete panel both promise "anything you wrote in a message
  // becomes '[deleted]'", and instead the whole row vanished, taking the other
  // party's thread structure with it.
  //
  // The column cannot be nulled, so it is repointed at the tombstone. Same move
  // as job_applications' NULL, with a placeholder because NOT NULL forbids none.
  { table: 'messages', column: 'sender_id', action: 'anonymise',
    tombstoneColumns: ['sender_id'],
    literalColumns: [
      { column: 'content', value: '[deleted]' },
      // sender_name is NOT NULL and denormalised, so it would otherwise keep
      // naming the person on every message they ever sent.
      { column: 'sender_name', value: 'Deleted account' },
    ],
    why: "Decision (b). The employer's own messages are their words and must not vanish from their inbox, and " +
         "the thread keeps its shape so their replies still make sense. The person's words go, their name goes, " +
         "and sender_id is repointed at the tombstone because it is NOT NULL and cannot be cleared. " +
         "NOTE THE LIMIT, which is unchanged: the OTHER party's messages may still name the person — we are " +
         "not editing someone else's words." },

  // ⚠️ `conversations` WAS NOT IN THIS PLAN AT ALL, AND IT DEFEATED THE RULE
  // ABOVE A SECOND TIME. Found 1 Sept 2026 by the live proof: even after
  // messages.sender_id was repointed at the tombstone, the message was still
  // GONE when read back. The reason is one level up —
  //
  //     conversations.participant_1 → auth.users   ON DELETE CASCADE
  //     conversations.participant_2 → auth.users   ON DELETE CASCADE
  //     messages.conversation_id    → conversations ON DELETE CASCADE
  //
  // — so deleting the person destroyed the CONVERSATION, and every message in
  // it went with it, INCLUDING THE EMPLOYER'S OWN. Decision (b) says the
  // employer's words must not vanish from their inbox; the thread they were in
  // was being deleted out from under them.
  //
  // TWO RULES, ONE PER SIDE, because a conversation has two participant columns
  // and the executor matches one column at a time. `profile_views` is already
  // in the plan twice for the same reason.
  { table: 'conversations', column: 'participant_1', action: 'anonymise',
    tombstoneColumns: ['participant_1'],
    literalColumns: [{ column: 'participant_1_name', value: 'Deleted account' }],
    nullColumns: ['participant_1_company'],
    why: 'The thread survives so the OTHER party keeps their own messages and the replies still make ' +
         'sense. The person is replaced by the tombstone because the column is NOT NULL and carries a ' +
         'CASCADE — without this the whole conversation, and every message in it, is destroyed.' },
  { table: 'conversations', column: 'participant_2', action: 'anonymise',
    tombstoneColumns: ['participant_2'],
    literalColumns: [{ column: 'participant_2_name', value: 'Deleted account' }],
    nullColumns: ['participant_2_company'],
    why: 'The same, for the other side of the thread. Which side a person is on is an accident of who ' +
         'started the conversation, so both must be handled or half of them are destroyed.' },

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
  // ⚠️ THE SAME FAULT, AND HERE THE REASONING WAS THE CAUSE. This rule used to
  // say "the contract is kept — candidate_id is NOT NULL and stays,
  // deliberately", and `job_offers.candidate_id` has an ON DELETE CASCADE to
  // auth.users. THE DELIBERATELY-KEPT COLUMN IS THE ONE THE CASCADE FOLLOWS, so
  // the argument for preserving the contract is what guaranteed it was
  // destroyed. Vacuously safe until now only because no offer has ever been
  // signed — job_offers has 0 rows.
  //
  // ── WHAT A CONTRACT NEEDS, AND WHAT ERASURE TAKES ────────────────────────
  //
  // These pull against each other and the resolution is not "keep less".
  // A contract's evidential value is in its TERMS and its SIGNATURES, not in a
  // foreign key to a login. The row already carries `signature_name` — the name
  // the candidate typed when they signed — plus the timestamp, the signature
  // image and the terms via job_id. All of that stays.
  //
  // WHAT GOES IS THE LINK TO A PLATFORM ACCOUNT, which is what makes the row a
  // record OF A USER rather than a record of an agreement. And keeping the
  // signed name is lawful rather than an exception we are stretching: the
  // erasure right is not absolute, and a signed employment contract sits
  // squarely inside the carve-outs for legal obligations and for the
  // establishment or defence of legal claims. A contract signed by nobody would
  // not be a contract, which is the whole reason this rule is not 'delete'.
  { table: 'job_offers', column: 'candidate_id', action: 'anonymise',
    tombstoneColumns: ['candidate_id'],
    nullColumns: ['signature_ip', 'signature_user_agent'],
    why: 'Decision (e). The contract is kept, and NOW ACTUALLY SURVIVES: candidate_id is NOT NULL so it is ' +
         'repointed at the tombstone rather than left pointing at a user who is being deleted, which used to ' +
         'destroy the row through the cascade. signature_name, the signature image, the timestamp and the ' +
         'terms all stay — they are what makes it a contract. signature_ip and signature_user_agent are ' +
         'cleared: surveillance data, not contract terms, and nothing about the contract requires them.' },
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

// ─── THE EMPLOYER PLAN ─────────────────────────────────────────────────────
//
// WHAT ERASING AN EMPLOYER DOES. A SEPARATE LIST, NOT A BRANCH IN THE FIRST
// ONE, because almost nothing is shared: the candidate plan reasons about a
// person applying for work, and this one reasons about a business account that
// other people's data hangs off.
//
// PAUL'S DECISIONS, 1 Sept 2026, recorded with their reasoning:
//
//   (a) ADVERTS ARE ARCHIVED, NOT DELETED. A live vacancy nobody can answer is
//       worse than one that has gone; but deleting the row would take the
//       CONTEXT of every application under it — a candidate's own record of
//       what they applied for. Archiving satisfies both.
//
//   (b) APPLICATIONS ARE KEPT, AND THE EMPLOYER SIDE IS ANONYMISED. Candidates
//       applied in confidence to a company. That is CANDIDATE data, and it does
//       not become deletable because the employer's login goes. This is the
//       exact mirror of what we already do to an employer's records when a
//       CANDIDATE leaves.
//
//   (c) DELETION REFUSES WHILE OTHER TEAM MEMBERS EXIST. Removing the owner
//       under a colleague's feet would break their account silently. The owner
//       is told to remove the team first. Ownership TRANSFER is a follow-up
//       feature and deliberately not a prerequisite.
//
// AND ONE THING THAT NEEDED NO DECISION, because the schema already handles it:
// THE FOUNDING-COHORT SPOT RETURNS TO THE POOL ON ITS OWN.
// `count_founding_spots_claimed()` is `COUNT(*) FROM employer_subscriptions s
// JOIN auth.users u ON u.id = s.user_id`, so the moment the auth row goes the
// spot stops being counted. No code here does that, and none should.
export const EMPLOYER_ERASURE_PLAN: TableRule[] = [
  // ── THE ADVERTS: ARCHIVED AND REPOINTED, IN ONE RULE ─────────────────────
  //
  // THIS RULE WAS BLOCKED UNTIL THE TOMBSTONE EXISTED, and the reason is worth
  // keeping because it nearly cost a migration:
  //
  //     jobs_employer_id_fkey        jobs.employer_id → auth.users   CASCADE
  //     job_applications_job_id_fkey job_applications.job_id → jobs  CASCADE
  //
  // The LAST step of the erasure is deleting auth.users — that is what makes
  // the login actually go — and it took every advert with it, and every
  // application underneath those adverts with them. Archiving them first
  // worked perfectly and was undone a moment later.
  //
  // MEASURED, NOT REASONED. The live proof archived the advert and anonymised
  // the application — receipt `jobs archive matched=1 affected=1` — and both
  // rows were GONE when read back. The executor was correct; the schema removed
  // its work.
  //
  // THE FIRST PROPOSED FIX WAS A MIGRATION making employer_id nullable with ON
  // DELETE SET NULL. It was dropped in favour of the tombstone: a schema change
  // to the table behind 251 live adverts, plus an audit of every consumer that
  // assumes non-null, is a poor trade against pointing the column at an account
  // that is never deleted. Same outcome, no migration, reversible with an
  // UPDATE.
  { table: 'jobs', column: 'employer_id', action: 'archive',
    tombstoneColumns: ['employer_id'],
    literalColumns: [{ column: 'status', value: 'archived' }],
    why: "Decision (a). The advert comes off the board so no candidate applies to a company that is gone, " +
         "and the ROW stays because every application under it needs its title and company for the " +
         "candidate's own record — deleting it would erase candidate history in order to erase an " +
         "employer. employer_id is repointed at the tombstone because it is NOT NULL and carries a " +
         "CASCADE; without that the row is destroyed a moment after being archived." },


  // DECISION (b), AND THE ONE RULE THAT CANNOT BE A SIMPLE `.eq()`.
  // There is no employer column on job_applications — the link is
  // job_applications.job_id → jobs.employer_id. `viaEmployerJobs` tells the
  // executor to resolve that job list first and match `job_id` against it.
  //
  // NOT modelled as 'blocked': that action makes the ROUTE refuse the whole
  // erasure, which is the opposite of what should happen here.
  { table: 'job_applications', column: 'job_id', action: 'anonymise', viaEmployerJobs: true,
    nullColumns: ['employer_notes'],
    why: "Decision (b). The application STAYS — it is the candidate's record of applying, and it does not " +
         "become deletable because the employer left. What goes is the employer side: `employer_notes` is " +
         "free text an employer wrote about a named candidate, which is that candidate's personal data as " +
         "much as anyone's. Exact mirror of the candidate plan, which nulls the same column." },

  // ── Theirs alone: no other party has an interest ─────────────────────────
  { table: 'employer_profiles', column: 'user_id', action: 'delete',
    why: 'The profile is the business account: company name, contact name, email, phone, business address.' },
  { table: 'employer_subscriptions', column: 'user_id', action: 'delete',
    why: "The commercial relationship, keyed to a user id that is about to stop existing. NOTHING HAS " +
         "EVER BEEN CHARGED — free founding mode, Stripe unreachable — so no financial record is lost " +
         "and the 6-year HMRC retention does not bite. REVISIT THE DAY MONEY CHANGES HANDS: this becomes " +
         "'keep' the moment there is an invoice behind it." },
  { table: 'employer_availability', column: 'employer_id', action: 'delete',
    why: 'Their interview availability. Meaningless without them.' },
  { table: 'employer_availability_overrides', column: 'employer_id', action: 'delete',
    why: 'Block-outs against the availability above.' },
  { table: 'employer_email_templates', column: 'employer_id', action: 'delete',
    why: 'Their own message templates. Their words, about their own hiring, to nobody now.' },
  { table: 'ai_generation_usage', column: 'employer_id', action: 'delete',
    why: 'Usage metering for one account.' },
  { table: 'saved_candidates', column: 'employer_id', action: 'delete',
    why: 'Their shortlist of candidates. The candidates are untouched; the shortlist was theirs.' },
  { table: 'interview_notes', column: 'employer_id', action: 'delete',
    why: 'Free text they wrote about candidates. Under decision (b) this is the employer side of a ' +
         'candidate record and it goes — a note naming a candidate is that candidate\'s data too.' },
  { table: 'temp_posts', column: 'employer_id', action: 'delete',
    why: 'Short-notice shift posts. Unlike a job advert nothing hangs off one: interest is recorded ' +
         'separately and is deleted with the candidate who expressed it.' },
  { table: 'interviews', column: 'employer_id', action: 'delete',
    why: 'An interview with an employer who no longer exists cannot happen. Deleted rather than kept so ' +
         'no candidate is left holding a booking against nobody. ZERO ROWS TODAY — this rule exists so ' +
         'the first one is not a surprise.' },
  { table: 'interview_bookings', column: 'employer_id', action: 'delete',
    why: 'The booked slot behind an interview. Same reasoning. NOTE, and it is not ours to fix here: a ' +
         'booking that reached Google Calendar is NOT removed from the calendar by this — the privacy ' +
         'policy already says disconnecting does not delete existing events. ZERO ROWS TODAY.' },

  // ── Team ────────────────────────────────────────────────────────────────
  //
  // MATCHED ON THE PROFILE ID, NOT THE USER ID. The one table in the schema
  // that does. Getting this wrong deletes nothing and reports success.
  { table: 'employer_members', column: 'employer_id', idSpace: 'profile', action: 'delete',
    why: 'Membership rows for a company that no longer exists. Reached ONLY once the refusal above has ' +
         'confirmed no OTHER member remains, so in practice this removes the owner\'s own row.' },

  // ── Shared with the candidate plan: same table, same reasoning ───────────
  { table: 'device_tokens', column: 'user_id', action: 'delete',
    why: 'MUST go, or push notifications keep arriving after the account is gone.' },
  { table: 'push_log', column: 'user_id', action: 'delete', why: 'Delivery log for pushes to them.' },
  { table: 'notifications', column: 'user_id', action: 'delete', why: 'Their own notifications.' },
  { table: 'user_onboarding', column: 'user_id', action: 'delete', why: 'Their onboarding progress.' },
  { table: 'platform_feedback', column: 'user_id', action: 'anonymise', nullColumns: ['user_id'],
    why: 'The feedback is useful; who sent it is not.' },
  // sender_id is NOT NULL — this rule said `nullColumns: ['sender_id']` when it
  // was written and would have THROWN on the first employer with a message.
  // Repointed at the tombstone instead, exactly as the candidate plan does.
  { table: 'messages', column: 'sender_id', action: 'anonymise',
    tombstoneColumns: ['sender_id'],
    literalColumns: [{ column: 'content', value: '[deleted]' },
                     { column: 'sender_name', value: 'Deleted account' }],
    why: 'Same treatment a candidate gets. The thread keeps its shape so the other party\'s replies still ' +
         'make sense; the words and the author go.' },
  // AND THE THREAD ITSELF, or the messages above are destroyed one level up:
  // both participant columns cascade and messages cascade from conversations.
  // Missing from both plans until the live proof found it.
  { table: 'conversations', column: 'participant_1', action: 'anonymise',
    tombstoneColumns: ['participant_1'],
    literalColumns: [{ column: 'participant_1_name', value: 'Deleted account' }],
    nullColumns: ['participant_1_company'],
    why: 'The thread survives so the candidate keeps their own messages and the replies still make sense.' },
  { table: 'conversations', column: 'participant_2', action: 'anonymise',
    tombstoneColumns: ['participant_2'],
    literalColumns: [{ column: 'participant_2_name', value: 'Deleted account' }],
    nullColumns: ['participant_2_company'],
    why: 'The same, for the other side. Which side someone is on is an accident of who started the thread.' },
  { table: 'job_views', column: 'viewer_id', action: 'anonymise', nullColumns: ['viewer_id'],
    why: 'A view stays in the statistics with nobody attached. The row is a count, not a person.' },
  { table: 'job_click_events', column: 'user_id', action: 'anonymise', nullColumns: ['user_id'],
    why: 'A click on a board result. Kept for the funnel, with the person detached from it.' },
  { table: 'job_impressions', column: 'user_id', action: 'anonymise', nullColumns: ['user_id'],
    why: 'An impression carries the SEARCH QUERY that produced it, which is declared to Apple as Search ' +
         'History linked to the user. Detaching the user is what makes keeping the query honest.' },
  { table: 'application_status_events', column: 'actor_id', action: 'anonymise', nullColumns: ['actor_id'],
    why: 'The event happened and matters to the candidate; who moved it does not.' },
  { table: 'profile_views', column: 'viewer_id', action: 'delete',
    why: 'Candidate profiles THEY viewed. viewer_id is NOT NULL so anonymising is impossible.' },

  // ── Reachable only by email ─────────────────────────────────────────────
  { table: 'email_log', column: 'recipient', idSpace: 'email', action: 'delete',
    why: 'Delivery log against an address that is being erased. MATCHED BY EMAIL.' },
  { table: 'waitlist', column: 'email', idSpace: 'email', action: 'delete',
    why: 'Nothing but the address. MATCHED BY EMAIL.' },

  // ── Kept, deliberately ──────────────────────────────────────────────────
  { table: 'company_reviews', column: 'employer_id', action: 'keep',
    why: "A review is the CANDIDATE'S speech about a workplace, not the employer's data. Deleting an " +
         "employer must not delete what people said about working for them. `employer_response` is the " +
         "one part they wrote, and it is public commentary they chose to publish." },
  { table: 'job_offers', column: 'employer_id', action: 'keep',
    why: 'A signed offer is a CONTRACT and is kept for the same reason it is kept when a candidate ' +
         'leaves. Zero rows today; this rule exists so the first one is not a surprise.' },
  { table: 'offer_audit_log', column: 'actor_user_id', action: 'keep',
    why: 'The audit trail of a contract.' },
  { table: 'deletion_requests', column: 'user_id', action: 'keep',
    why: 'The record that proves we did what was asked.' },
  { table: 'user_departures', column: 'user_id', action: 'keep',
    why: 'The departure log. Stores an email DOMAIN, not an address.' },
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

/** The same question, asked of the employer plan. */
export function employerBlockers(): TableRule[] {
  return EMPLOYER_ERASURE_PLAN.filter(r => r.action === 'blocked')
}

export interface ReceiptLine {
  table: string
  action: Action
  matched: number
  affected: number
  note?: string
}

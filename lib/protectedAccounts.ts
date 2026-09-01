// THE ACCOUNTS THAT MUST NOT BE DELETED, IN ONE PLACE.
//
// ── WHY THIS FILE EXISTS ──────────────────────────────────────────────────
//
// Two accounts now depend for their survival on nobody running the wrong
// thing, and CLAUDE.md has said so about both. A note is not a guard. On
// 1 Sept 2026 we found `scripts/delete-test-users.js` hardcoding Paul's real
// account with no argument and no confirmation, and established that `is_test`
// is a LABEL rather than a guard — nothing consults it before deleting
// anything. That is three instances of the same shape in one day.
//
// This does not refuse a deletion. It is the CENSUS: `protected:prove` asserts
// that every account below still exists and is still in the state it needs to
// be in. It cannot prevent the loss; it makes the loss impossible to miss.
//
// ── THE STRONGER GUARD IS DELIBERATELY NOT THIS ───────────────────────────
//
// A `before delete on auth.users` trigger would REFUSE, and would cover the
// route, a script, a stray SQL statement and the Supabase dashboard alike. It
// is the right answer and it is a migration on auth.users — which is the exact
// thing the tombstone design was chosen to avoid doing while an App Store
// review is open. Held on purpose, not forgotten.
//
// ── WHY A CENSUS IS WORTH HAVING ANYWAY ───────────────────────────────────
//
// Because there is NO INSTRUMENT that records a self-deletion. Nothing in the
// database would show that one of these had gone, or when. Without this, the
// first sign that the Apple review credential had been deleted would be a
// rejected app update with no visible cause — which is precisely how the
// `+demo` and `+e2e` accounts went on 14 Aug 2026 and nobody noticed for days.

export interface ProtectedAccount {
  /** The auth.users id. Asserted against the live row, not trusted. */
  id: string
  email: string
  /** What breaks, in one line, if this account disappears. */
  whatBreaks: string
  /** Extra state this account must be in, beyond simply existing. */
  requires: {
    /** Sign-in must be REFUSED (banned). Used by the tombstone. */
    banned?: boolean
    /** email_confirmed_at must be set, or reap-unconfirmed removes it. */
    emailConfirmed?: boolean
    /** A candidate_profiles row must exist — an empty login is not a fixture. */
    candidateProfile?: boolean
  }
}

/**
 * THE TOMBSTONE OWNER.
 *
 * Rows that must outlive a deleted person are repointed at this account:
 * `job_offers.candidate_id`, `messages.sender_id`, `conversations.participant_*`
 * and `jobs.employer_id` are all NOT NULL with an ON DELETE CASCADE, so they
 * cannot be nulled and would otherwise be destroyed.
 *
 * ⚠️ DELETING IT WOULD DESTROY EVERY ROW POINTING AT IT — every archived
 * advert, every historical contract, every anonymised message — by the same
 * cascade it exists to defeat. It is the single most dangerous row in the
 * database to remove.
 */
export const TOMBSTONE_EMAIL = 'deleted-account@thrive.invalid'
export const TOMBSTONE_USER_ID = '66ea10d4-75f3-489f-9cae-21df327c8f79'

export const PROTECTED_ACCOUNTS: ProtectedAccount[] = [
  {
    id: '4ba92141-677d-4422-91cf-9b6f4e0067ca',
    email: 'pauldavies.gbr+applereview@gmail.com',
    whatBreaks:
      'THE CREDENTIAL APPLE SIGNS IN WITH TO REVIEW THE APP. It is pasted into App Store Connect under ' +
      'App Review Information and is expected to work months from now. If it stops working, Apple rejects ' +
      'an update and there is NO VISIBLE CAUSE — the app simply does not let the reviewer in. ' +
      'It carries a real-looking name (Marcus Hale), an avatar, a CV, saved jobs and applications. ' +
      'A SWEEP BY EMAIL PATTERN WOULD DELETE IT: that is exactly how +demo and +e2e went on 14 Aug 2026.',
    requires: { emailConfirmed: true, candidateProfile: true },
  },
  {
    id: 'dfad7ed4-21a7-4d61-b3ea-b784511f9c01',
    email: 'pauldavies.gbr+applereviewemployer@gmail.com',
    whatBreaks:
      'THE EMPLOYER CREDENTIAL APPLE SIGNS IN WITH. Created 1 Sept 2026 as a distinct account so that a ' +
      'reviewer testing the account-deletion we asked them to look at costs us nothing — deleting Thrive ' +
      'Test Employer instead would send its four filled adverts to the tombstone permanently, and several ' +
      'drives assert against them. Company "Thrive Demo Kitchen", three FILLED adverts (never active: ' +
      'nothing of ours belongs on the public board while the agencies are browsing it), two applications ' +
      'from Marcus and one message thread with him, so both sides of the demonstration are review fixtures.',
    // No candidateProfile — this one owns an employer_profiles row instead.
    requires: { emailConfirmed: true },
  },
  {
    id: TOMBSTONE_USER_ID,
    email: TOMBSTONE_EMAIL,
    whatBreaks:
      'THE TOMBSTONE OWNER. Every row that outlives a deleted person points at it — archived adverts, ' +
      'signed contracts, anonymised messages and conversations. All of those columns are NOT NULL with ' +
      'an ON DELETE CASCADE, so deleting this account destroys every one of them, silently, by the same ' +
      'mechanism it exists to defeat. It must also stay BANNED: RLS grants on auth.uid() = employer_id ' +
      'and auth.uid() = candidate_id, so anyone able to authenticate as it would own the lot.',
    // NOT candidateProfile: it is a placeholder, not a person, and giving it a
    // profile row would put "Deleted account" in the employer directory.
    requires: { banned: true, emailConfirmed: true },
  },
]

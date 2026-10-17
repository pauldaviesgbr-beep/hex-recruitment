// WHAT DELETING AN ACCOUNT SAYS, IN ONE PLACE. The website's /settings/privacy
// and the iOS app's Delete account screen (design S3: "the website's own
// sentence, word for word") both read these, so the two cannot drift. The
// sentence is a claim about lib/erasure.ts's candidate plan: change one, read
// the other.

/** Typed by the person, so it cannot be an accidental tap or a stray fetch. */
export const DELETE_CONFIRM_WORD = 'DELETE'

export const CANDIDATE_DELETE_TEXT =
  'Deletes your account and your data straight away. Your profile, CV, photo, ' +
  'saved jobs, alerts and notifications are removed. Applications you sent stay ' +
  'with the employer with your name and details stripped out, anything you wrote ' +
  'in a message becomes "[deleted]", and a signed job offer is kept because it is ' +
  'a contract. This cannot be undone.'

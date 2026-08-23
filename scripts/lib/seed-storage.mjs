// THE STATES A RETURNING VISITOR ACTUALLY HAS.
//
// Playwright hands you a browser with no localStorage, no cookies and no
// session. That is a real state — somebody's first ever visit — and it is the
// ONLY state anybody had been driving. So every check was of the page a
// stranger sees, and the pages returning visitors see went unmeasured.
//
// It cost three faults on one screen on 22 Aug 2026, all on /login/employee,
// all invisible to every drive because the box holding them renders only when
// `thrive_pending_confirm` is set:
//
//   · an email address running 101px past its container, off a 390px screen
//   · a notice eating 290px of an 844px fold — 34% of the first screen
//   · that notice naming an account that had been DELETED the day before
//
// Paul found all three by looking at his own phone. The measurements in that
// morning's report — "Create an account sits at y=942" — were of a page that
// does not exist for a returning visitor. With the stored value it is y=1169.
//
// WHY A HELPER AND NOT A NOTE. "Remember to drive both states" is the kind of
// rule that gets written down after the second failure and broken three more
// times — the same argument that produced migrations:check and preview-url.
// Make the correct move the easy one: one call, before the first navigation.
//
// ADD STATES HERE AS THE PRODUCT GROWS ONE. The value of this file is that the
// list of "things a browser might be carrying" lives in one place where the
// next person can see what they are NOT driving.

/**
 * Named states, each a function of the site origin returning the localStorage
 * pairs a browser in that state would hold.
 *
 * Keep every value in the SHAPE THE APP ACTUALLY WRITES. A seeded value that
 * the app would never produce tests a page nobody can reach — which is the
 * mistake this file exists to stop, in a new costume.
 */
export const STORAGE_STATES = {
  /**
   * Started a sign-up, never confirmed. Renders the blue "Confirm your email
   * to apply" box on /login/employee.
   *
   * Stamped, because lib/pendingConfirm.ts expires these after seven days and
   * an unstamped value is treated as legacy and dropped on read — seeding the
   * bare string would silently produce the EMPTY state and quietly test
   * nothing. `at` is set to now so the state is fresh whenever it runs.
   */
  pendingConfirm: () => ({
    thrive_pending_confirm: JSON.stringify({
      email: 'seeded.returning.visitor@example.com',
      at: Date.now(),
    }),
  }),

  /**
   * The same, but a LEGACY bare-string value — the format that is sitting in
   * real browsers today, including Paul's. Drives the path where the notice
   * should disappear exactly once.
   */
  pendingConfirmLegacy: () => ({
    thrive_pending_confirm: 'legacy.bare.string@example.com',
  }),

  /** Cookie banner already answered — the state every returning visitor is in. */
  consentAccepted: () => ({
    hex_cookie_consent: 'all',
  }),

  /** Dismissed the profile-matching banner earlier in the session. */
  prefsBannerDismissed: () => ({
    hex_prefs_banner_dismissed: '1',
  }),
}

/**
 * Seed one or more named states into `page` BEFORE its first navigation.
 *
 * Must be called before `page.goto`: addInitScript runs on every document, and
 * a value written after the page has loaded is a value the component has
 * already rendered without.
 *
 *   await withSeededStorage(page, 'pendingConfirm', 'consentAccepted')
 *   await page.goto(url)
 *
 * Returns the pairs it seeded, so a drive can PRINT WHICH STATE IT MEASURED —
 * which is the half of the rule that makes a number re-checkable later.
 */
export async function withSeededStorage(page, ...names) {
  const pairs = {}
  for (const name of names) {
    const build = STORAGE_STATES[name]
    if (!build) {
      throw new Error(
        `unknown storage state ${JSON.stringify(name)} — known: ${Object.keys(STORAGE_STATES).join(', ')}`
      )
    }
    Object.assign(pairs, build())
  }
  await page.addInitScript(entries => {
    try {
      for (const [k, v] of Object.entries(entries)) localStorage.setItem(k, v)
    } catch { /* storage disabled — the drive is still valid, just unseeded */ }
  }, pairs)
  return pairs
}

/**
 * The two states worth walking a stored-state page in, so a drive can loop
 * rather than a person remembering to.
 *
 * `null` is the first-ever visit and is NOT the default — it is listed
 * explicitly, because the whole fault was that it had been the default without
 * anybody choosing it.
 */
export const RETURNING_VISITOR_STATES = [null, 'pendingConfirm']

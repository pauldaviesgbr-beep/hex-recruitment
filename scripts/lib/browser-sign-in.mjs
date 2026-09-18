// SIGNING A DRIVE IN, ONCE, CORRECTLY.
//
// ── WHY THIS EXISTS: SIX DRIVES COULD NOT SIGN IN AND NOBODY KNEW ────────
//
// Every browser drive in this repo opened with some variant of
//
//     await page.goto(`${BASE}/login/employer`)
//     await page.fill('input[name="email"]', EMAIL)
//     await page.fill('input[name="password"]', PASSWORD)
//     await page.click('button[type="submit"]')
//
// and none of it works any more. Measured against a live deployment on
// 12 Sept 2026:
//
//   · /login/employer is a STUB that redirects to /login — the login pages
//     were unified, which is a good change that nothing told these scripts
//     about;
//   · the fields carry IDS AND NO NAME ATTRIBUTE — `#login-email` and
//     `#login-password` — so `input[name="email"]` matches NOTHING and
//     page.fill waits thirty seconds and throws;
//   · there are TWO `button[type="submit"]` on that page, and the second one
//     is the Ask Thrive chat widget's ➤. This repo has already lost a session
//     to that exact widget winning `.last()` on a submit click.
//
// Six files: drive-my-jobs-controls, drive-candidate-photos,
// drive-candidate-cannot-see-employer-tools, drive-post-job-photo-block,
// drive-post-job-walkthrough, drive-cv-upload-and-confirm.
//
// ── AND THE FAILURE IS THE INTERESTING PART ──────────────────────────────
//
// A drive that cannot sign in does not report "the login selector is stale".
// It reports a TIMEOUT, which reads as a slow network or a flaky test, and it
// reports it before any assertion has run — so the output is a stack trace
// rather than a finding. Nobody ran these often enough to care, and a check
// nobody runs is indistinguishable from a check that passes.
//
// Same family as the disabled secret scanner and the `email_log` table that
// did not exist yet: SILENCE FROM AN INSTRUMENT NOBODY HAS SEEN SPEAK.
//
// ── WHAT THIS DOES DIFFERENTLY ───────────────────────────────────────────
//
// It asserts that it ARRIVED, rather than assuming the click worked. A sign-in
// that silently failed and left the browser on /login would otherwise send
// every assertion below it looking at a logged-out page — and "the control is
// missing" is exactly what that looks like.
//
// It also SCOPES the submit to the form holding the email field, so the chat
// widget cannot win, and it never prints the password.

/**
 * @param {import('playwright').Page} page
 * @param {{ base: string, email: string, password: string }} opts
 * @returns {Promise<string>} the URL it came to rest on
 */
export async function signInAsFixture(page, { base, email, password }) {
  if (!password) throw new Error('signInAsFixture: no password — read it from the environment, never a literal')

  await page.goto(`${base}/login`, { waitUntil: 'domcontentloaded' })

  // Wait for the FIELD, not for the page to be "big enough". A length
  // threshold is cleared by the navigation menu on its own.
  await page.locator('#login-email').waitFor({ state: 'visible', timeout: 45_000 })

  await page.fill('#login-email', email)
  await page.fill('#login-password', password)

  // THE SUBMIT INSIDE THE LOGIN FORM, never a bare button[type=submit].
  const form = page.locator('form').filter({ has: page.locator('#login-email') })
  await form.locator('button[type="submit"]:not([disabled])').first().waitFor({ timeout: 30_000 })
  await form.locator('button[type="submit"]').first().click()

  // WAIT FOR "NO LONGER ON AN AUTH PAGE", NOT FOR A LIST OF DESTINATIONS.
  // An allowlist is a claim about where each role lands, and this product has
  // two roles landing in at least five places — /dashboard, /employer/dashboard,
  // /my-jobs, /welcome, /jobs. Enumerating them in a SHARED helper puts the
  // per-caller detail back that the helper exists to remove, and gets it wrong
  // for whichever role the author was not thinking about.
  //
  // It is also the right shape: false while we are still on /login, true the
  // moment we are not, and it cannot be satisfied by a page that has not
  // navigated. A failed sign-in keeps us on /login and this keeps waiting.
  await page.waitForURL(u => !/\/login|\/register/.test(u.toString()), { timeout: 60_000 })

  // ASSERT THE ARRIVAL. If we are still on an auth page the sign-in did not
  // happen, whatever the click appeared to do, and everything downstream would
  // be measuring a logged-out page while reporting on a logged-in one.
  const landed = page.url()
  if (/\/login|\/register/.test(landed)) {
    throw new Error(`sign-in did not complete — came to rest on ${landed}`)
  }
  return landed
}

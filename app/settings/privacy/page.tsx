'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import Header from '@/components/Header'
import { supabase } from '@/lib/supabase'
import { DEV_MODE, getMockUser, getMockUserType } from '@/lib/mockAuth'
import styles from './page.module.css'
import { Ico } from '@/components/icons'
import { CANDIDATE_DELETE_TEXT, DELETE_CONFIRM_WORD } from '@/lib/accountDeletion'
import { parseHold, holdState } from '@/lib/duplicateHold'

// TEN SWITCHES ON THIS PAGE CONTROLLED NOTHING (design review A17, 14 Nov 2026).
//
// "Visible to employers", "Private mode", "Hide contact details", "Show
// availability", "Appear in search results", "Personalised recommendations",
// "Allow profile bookmarking", "Profile view tracking", and for employers
// "Company visible to job seekers" and "Public job postings". They were saved
// into privacy_settings and NOTHING in the codebase ever read that blob back.
//
// The worst of them misreported a real state: every hidden candidate (14 of
// 14 real ones) was shown "Visible to employers: on", because the page read
// its own defaults while the directory reads candidate_profiles.is_discoverable.
//
// So the page now carries ONE switch, the real one, written exactly as the
// dashboard switch and the iOS app's switch write it (PUT /api/app/me/visibility,
// refused while a duplicate check holds the profile). The rest are removed
// rather than wired up: same treatment as the SMS rows, the marketing-emails
// switch and the analytics toggle — a control for something that does not
// happen is a false statement to the person using it.
//
// privacy_settings is left in the database untouched. Nothing reads it, and
// clearing real people's rows is not this change's job.

export default function PrivacySettingsPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [exporting, setExporting] = useState(false)
  const [userType, setUserType] = useState<'employer' | 'employee' | null>(null)

  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  // The real visibility: candidate_profiles.is_discoverable. Null until read,
  // so the switch never shows a guessed state.
  const [discoverable, setDiscoverable] = useState<boolean | null>(null)
  const [held, setHeld] = useState(false)
  const [visSaving, setVisSaving] = useState(false)
  const [requesting, setRequesting] = useState(false)
  // Null until asked. Asked on load, so the screen can say "we have your
  // request" instead of offering the button to someone who already pressed it.
  const [openRequest, setOpenRequest] = useState<{ requestedAt: string } | null>(null)
  const [confirming, setConfirming] = useState(false)
  const [confirmText, setConfirmText] = useState('')
  const [deleting, setDeleting] = useState(false)

  // ── WHO OWNS A COMPANY, AS A ROW RATHER THAN AS A CLAIM ──────────────────
  //
  // THE DELETION PANEL USED TO BRANCH ON `userType`, WHICH COMES FROM
  // user_metadata.role — AND THAT IS WRONG FOR TEAM MEMBERS, IN THE DIRECTION
  // THAT DENIES SOMEBODY A RIGHT.
  //
  // All three invite routes — /api/team/accept, /api/team/invite-code and
  // /api/team/invite-signup — stamp `role: 'employer'` into a member's
  // metadata. A member owns NO employer_profiles row of their own. So the
  // screen told them "your account is closed by hand, email us", while
  // /api/account/delete — which checks the ROW, not the metadata — would have
  // erased them normally on request. We were refusing a deletion to the one
  // class of user entitled to it, and telling them something untrue about
  // their own account to do it.
  //
  // NULL UNTIL ASKED, so the panel renders nothing rather than guessing during
  // the fetch. Guessing 'employee' would flash a Delete button at an owner;
  // guessing 'employer' would flash the wrong message at a member.
  const [ownsEmployerProfile, setOwnsEmployerProfile] = useState<boolean | null>(null)

  useEffect(() => {
    const loadSettings = async () => {
      if (DEV_MODE) {
        const type = getMockUserType()
        if (!type) {
          router.push('/login')
          return
        }
        setUserType(type)
        // Dev mode has no database to ask, so the mock role stands in. It is
        // the one place the metadata IS the answer, because there is no row to
        // disagree with it.
        setOwnsEmployerProfile(type === 'employer')

        if (type !== 'employer') setDiscoverable(true)

        setLoading(false)
        return
      }

      // Non-dev mode: Check Supabase session
      const { data: { session }, error: sessionError } = await supabase.auth.getSession()

      if (sessionError || !session) {
        router.push('/login')
        return
      }

      const role = session.user.user_metadata?.role
      const type = role === 'employer' ? 'employer' : 'employee'
      setUserType(type)

      // ASKED SEPARATELY FROM THE SETTINGS FETCH, ON PURPOSE.
      // The visibility query below (candidates only) would return
      // null both for "no row" and for "the query failed" — and treating a
      // failure as "no company" would show an owner a Delete button that the
      // server then refuses. This asks one question with one answer, and
      // leaves the flag null if it cannot be answered.
      const { data: ownedCompany, error: companyErr } = await supabase
        .from('employer_profiles')
        .select('id')
        .eq('user_id', session.user.id)
        .maybeSingle()
      if (!companyErr) setOwnsEmployerProfile(!!ownedCompany)

      // ASK WHETHER THEY ALREADY HAVE ONE OUTSTANDING. Best effort — if this
      // fails the button is simply offered, and a second press is a no-op
      // server-side because one open request per person is enforced by a
      // unique index rather than by this fetch succeeding.
      fetch('/api/account/deletion-request', {
        headers: { Authorization: `Bearer ${session.access_token}` },
      })
        .then(r => r.json())
        .then(b => { if (b?.open) setOpenRequest({ requestedAt: b.open.requestedAt }) })
        .catch(() => {})
      // Candidates only: employers have no directory visibility to set.
      if (type !== 'employer') {
        const { data: profile, error } = await supabase
          .from('candidate_profiles')
          .select('is_discoverable, duplicate_hold')
          .eq('user_id', session.user.id)
          .maybeSingle()
        // Left null on failure: the switch then says it could not load,
        // rather than showing a state nobody read.
        if (!error && profile) {
          setDiscoverable(!!profile.is_discoverable)
          setHeld(holdState(parseHold(profile.duplicate_hold)) === 'held')
        }
      }

      setLoading(false)
    }

    loadSettings()
  }, [router])

  // Saves as soon as it is flipped, like the dashboard switch: no Save button
  // for one control, and no way to leave the page thinking it changed when it
  // did not. Optimistic, reverted on any refusal.
  const handleVisibility = async () => {
    if (discoverable === null || held || visSaving) return
    const next = !discoverable
    setDiscoverable(next)
    setVisSaving(true)
    setMessage(null)
    try {
      if (!DEV_MODE) {
        const { data: { session } } = await supabase.auth.getSession()
        if (!session) throw new Error('signed_out')
        const res = await fetch('/api/app/me/visibility', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
          body: JSON.stringify({ discoverable: next }),
        })
        if (res.status === 409) { setHeld(true); throw new Error('held') }
        if (!res.ok) throw new Error('not_saved')
      }
      setMessage({ type: 'success', text: next ? 'Employers can now find you.' : 'Your profile is now hidden from employers.' })
    } catch {
      setDiscoverable(!next)
      setMessage({ type: 'error', text: 'That did not save. Please try again.' })
    } finally {
      setVisSaving(false)
    }
  }

  const handleExportData = async () => {
    setExporting(true)
    setMessage(null)

    try {
      let exportData: any = {}

      if (DEV_MODE) {
        // Export mock data from localStorage
        const mockUser = getMockUser()
        exportData = {
          user: mockUser,
          notificationPreferences: localStorage.getItem('notificationPreferences')
            ? JSON.parse(localStorage.getItem('notificationPreferences')!)
            : null,
          exportedAt: new Date().toISOString(),
        }
      } else {
        const { data: { session } } = await supabase.auth.getSession()
        if (!session) throw new Error('No session found')

        const tableName = userType === 'employer' ? 'employer_profiles' : 'candidate_profiles'

        // Fetch all profile data
        const { data: profile, error } = await supabase
          .from(tableName)
          .select('*')
          .eq('user_id', session.user.id)
          .maybeSingle()

        if (error) throw error

        exportData = {
          profile: profile,
          email: session.user.email,
          userType: userType,
          exportedAt: new Date().toISOString(),
        }
      }

      // Create and download JSON file
      const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `my-data-export-${new Date().toISOString().split('T')[0]}.json`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)

      // NAMES WHAT IT CONTAINS. "Your data has been exported successfully!"
      // was true of the download and false about the data: a partial export
      // presented as a complete one is the same fault as the deletion button,
      // one notch quieter.
      setMessage({
        type: 'success',
        text: 'Downloaded your profile and account details. This does not include applications, ' +
              'messages or CVs — email contact@thrivecareer.co.uk for everything we hold.',
      })
    } catch (error: any) {
      console.error('Error exporting data:', error)
      setMessage({ type: 'error', text: error.message || 'Failed to export data' })
    } finally {
      setExporting(false)
    }
  }

  // THE REQUEST NOW REACHES A HUMAN AND LEAVES A ROW.
  //
  // The version of this that started the whole thread set a success message
  // and returned. Driven on production 24 Aug 2026, clicking Confirm fired
  // ZERO network requests while telling the person their request was submitted
  // and a confirmation email would arrive within 48 hours. Nothing was
  // recorded, nobody was emailed, nothing was deleted.
  //
  // THE TIMESCALE COMES FROM THE SERVER, NOT FROM THIS FILE, so the number on
  // screen cannot drift away from the one the route actually promises. It is
  // 30 days, which is what UK GDPR allows and what the Privacy Policy already
  // publishes — never 48 hours again.
  // ── THE DOOR, NOT THE DOORBELL ─────────────────────────────────────────
  //
  // /api/account/delete has existed, tested and merged, since 25 Aug 2026 and
  // HAD NO CALLER. This screen posted to /api/account/deletion-request — which
  // writes a row and emails a human — while the button said "Request deletion"
  // and the copy said "we reply within 30 days".
  //
  // That is the specific pattern App Store Review Guideline 5.1.1(v) names as
  // a rejection: deletion must be INITIATED AND COMPLETED in the app, and a
  // request form that ends at a person doing it by hand is "contact support"
  // wearing a button. Our own docs/erasure-scope.md said "assume rejection if
  // submitted as-is".
  //
  // So this now calls the endpoint that actually erases, and the account is
  // gone before the promise is made rather than after.
  //
  // NO DARK PATTERN, AND THAT IS A DELIBERATE CONSTRAINT RATHER THAN A STYLE
  // CHOICE. The confirmation is a typed word because the action is
  // irreversible and must not be an accidental tap — it is NOT there to add
  // friction until somebody gives up. No guilt copy, no "are you sure you want
  // to lose everything", no retention offer, no pre-ticked anything. Apple
  // asks for a confirmation step; it does not ask us to talk people out of it,
  // and a flow that tries to is itself a rejection risk.
  const handleDeleteAccount = async () => {
    setDeleting(true)
    setMessage(null)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) throw new Error('Please sign in again')
      const res = await fetch('/api/account/delete', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
        // The route requires this exact word. Sending the constant rather than
        // the box's contents would make the typed confirmation decorative.
        body: JSON.stringify({ confirm: confirmText.trim() }),
      })
      const body = await res.json().catch(() => ({}))

      // BOTH HALVES. A 200 that does not say deleted:true is not a deletion,
      // and the route returns 500 with the account intact when any step fails
      // — that path must not read as success.
      if (!res.ok || body?.deleted !== true) {
        throw new Error(body?.error || 'Could not delete your account')
      }

      // The account no longer exists, so the session in this browser points at
      // nothing. Clear it before leaving, or the next page load spends a
      // moment pretending they are still signed in.
      try { await supabase.auth.signOut() } catch { /* the user is already gone */ }
      window.location.href = '/?deleted=1'
      return                                   // deliberately no setDeleting(false)
    } catch (e: any) {
      setMessage({ type: 'error', text: e.message || 'Could not delete your account' })
      setDeleting(false)
    }
  }

  const handleRequestDeletion = async () => {
    setRequesting(true)
    setMessage(null)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) throw new Error('Please sign in again')
      const res = await fetch('/api/account/deletion-request', {
        method: 'POST',
        headers: { Authorization: `Bearer ${session.access_token}` },
      })
      const body = await res.json()
      if (!res.ok) throw new Error(body?.error || 'Could not record your request')

      setOpenRequest({ requestedAt: body.requestedAt })
      setMessage({
        type: 'success',
        text: body.alreadyOpen
          ? `You already have a deletion request with us. We will reply within ${body.responseDays} days.`
          : `We have your request. We will reply within ${body.responseDays} days. Nothing has been deleted yet.`,
      })
    } catch (e: any) {
      setMessage({ type: 'error', text: e.message || 'Could not record your request' })
    } finally {
      setRequesting(false)
    }
  }

  // WHAT THE OLD CODE DID, kept as the reason this shape exists.
  //
  // It used to set a success message reading "Data deletion request submitted.
  // You will receive a confirmation email within 48 hours." and return. Its own
  // comment said "In a real app, this would send a deletion request to admin or
  // trigger account deletion". Driven on production 24 Aug 2026: clicking
  // Confirm fired ZERO network requests. Nothing was recorded, nobody was
  // emailed, nothing was deleted — and the person was told to expect a
  // confirmation that would never arrive, so they had no reason to chase it.
  //
  // That is a false statement made to someone exercising a legal right, which
  // is worse than having no control at all.
  //
  // REMOVING THE BUTTON AND LEAVING NOTHING WOULD BE THE SAME FAILURE with a
  // quieter face — the person still could not exercise the right. So the
  // control now routes to a human at the address the Privacy Policy already
  // publishes for exactly this, with the timescale that page already commits
  // to (30 days, which is what UK GDPR allows — NOT the 48 hours the old copy
  // invented).
  //
  // INTERIM. When the request route lands (a recorded row + an email to a
  // human + a status the candidate can see), this becomes a real button again.

  const Toggle = ({ checked, onChange, disabled = false }: { checked: boolean; onChange: () => void; disabled?: boolean }) => (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      className={`${styles.toggle} ${checked ? styles.toggleOn : styles.toggleOff} ${disabled ? styles.toggleDisabled : ''}`}
      onClick={onChange}
      disabled={disabled}
    >
      <span className={styles.toggleThumb} />
    </button>
  )

  if (loading) {
    return (
      <main>
        <Header />
        <div className={styles.container}>
          <div className={styles.loading}>
            <div className={styles.loadingSpinner}></div>
            <p>Loading privacy settings...</p>
          </div>
        </div>
      </main>
    )
  }

  return (
    <main>
      <Header />
      <div className={styles.container}>
        <button className={styles.backBtn} onClick={() => router.push('/settings')}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6" /></svg>
          Back to Settings
        </button>
        {/* Breadcrumb Navigation */}
        <nav className={styles.breadcrumb} aria-label="Breadcrumb">
          <Link href="/settings" className={styles.breadcrumbLink}>Settings</Link>
          <span className={styles.breadcrumbSeparator}>›</span>
          <span className={styles.breadcrumbCurrent}>Privacy</span>
        </nav>

        <div className={styles.header}>
          <div className={styles.headerIcon}><Ico name="lock" size={20} /></div>
          <div>
            <h1 className={styles.title}>Privacy Settings</h1>
            <p className={styles.subtitle}>
              {userType === 'employer' ? 'Your data and your account' : 'Choose whether employers can find you, and manage your data'}
            </p>
          </div>
        </div>

        {message && (
          <div
            className={`${styles.message} ${message.type === 'success' ? styles.messageSuccess : styles.messageError}`}
            role="alert"
            aria-live="polite"
          >
            {message.type === 'success' ? <>✓ </> : <><Ico name="alert-triangle" size={16} /> </>}
            {message.text}
          </div>
        )}

        {userType !== 'employer' && (
          <div className={styles.section}>
            <div className={styles.sectionHeader}>
              <span className={styles.sectionIcon}><Ico name="eye" size={20} /></span>
              <h2 className={styles.sectionTitle}>Who can see you</h2>
            </div>
            <div className={styles.settingsList}>
              <div className={styles.settingItem}>
                <div className={styles.settingInfo}>
                  <span className={styles.settingName}>Employers can find you</span>
                  <span className={styles.settingDescription}>
                    {held
                      ? 'We’re checking your profile against another with the same name. Nothing’s wrong, and you can change this once that’s done.'
                      : discoverable === null
                      ? 'We couldn’t load this setting. Reload the page to try again.'
                      : 'Your profile shows in the candidate directory, where employers hiring on Thrive can find you and message you.'}
                  </span>
                </div>
                <Toggle
                  checked={!!discoverable}
                  onChange={handleVisibility}
                  disabled={discoverable === null || held || visSaving}
                />
              </div>
            </div>
          </div>
        )}

        {/* Danger Zone */}
        <div className={styles.dangerSection}>
          <div className={styles.sectionHeader}>
            <span className={styles.sectionIcon}><Ico name="alert-triangle" size={20} /></span>
            <h2 className={styles.dangerTitle}>Your Data</h2>
          </div>
          <p className={styles.sectionDescription}>
            Download or request deletion of your personal data
          </p>

          <div className={styles.dangerActions}>
            <div className={styles.dangerItem}>
              <div className={styles.dangerInfo}>
                <span className={styles.dangerName}>Download my data</span>
                {/* IT SAID "all your profile data, settings, and activity".
                    It exports the profile row and the account email. Not
                    applications, messages, CVs, interviews, saved jobs, alerts
                    or notifications. Widening it is separate work; describing
                    it accurately is not. */}
                <span className={styles.dangerDescription}>
                  Download your profile and account details as a JSON file. For everything
                  we hold &mdash; applications, messages, CVs &mdash; email contact@thrivecareer.co.uk.
                </span>
              </div>
              <button
                type="button"
                className={styles.exportBtn}
                onClick={handleExportData}
                disabled={exporting}
              >
                {exporting ? (
                  <>
                    <span className={styles.exportSpinner}></span>
                    Exporting...
                  </>
                ) : (
                  <>
                    <span className={styles.downloadIcon}>↓</span>
                    Export Data
                  </>
                )}
              </button>
            </div>

            {/* AN EMPLOYER GETS A DIFFERENT ANSWER, NOT A HIDDEN BUTTON.
                The route refuses them server-side regardless — that is the
                half that protects the data, because anyone with a session can
                call it directly. This is the half that stops a real employer
                pressing something that would refuse them.

                contact@thrivecareer.co.uk is used because it is PROVEN to
                receive real inbound mail. privacy@ was printed on the policy
                four times and never existed; no catch-all, no bounce, every
                message silently gone. Do not print an address here that has
                not been tested. */}
            {/* ONE PANEL FOR BOTH ROLES, AND THAT IS THE POINT OF THE CHANGE.
                Until 1 Sept 2026 an employer got a different panel here with no
                button and an email address on it. That was a real gap — App
                Store Guideline 5.1.1(v) requires an app offering account
                creation to offer account deletion in the app, "Hire on Thrive"
                is the primary call to action on our own launch screen, and our
                Terms promised employers this route in three places while it did
                not exist.

                THE CONTROL IS IDENTICAL AND ONLY THE DESCRIPTION DIFFERS,
                because the two roles genuinely lose different things and a
                shared sentence would have to be vague about both. What must NOT
                differ is the path: one button, one typed confirmation, one
                endpoint. The server decides which erasure plan runs.

                AND THE DESCRIPTION BRANCHES ON THE ROW, NOT ON
                user_metadata.role — the same fact /api/account/delete checks. A
                team member carries role:'employer' in their metadata and owns no
                company, so the metadata test would tell them their adverts are
                being archived when they have none. NULL MEANS NOT ASKED YET and
                renders nothing: defaulting either way describes the wrong
                consequences to somebody for the length of a fetch. */}
            {ownsEmployerProfile === null ? null : (
            <div className={styles.dangerItem}>
              <div className={styles.dangerInfo}>
                <span className={styles.dangerName}>Delete my account</span>
                {/* WHAT IT SAYS MUST MATCH THE PRIVACY POLICY, WORD FOR WORD IN
                    SUBSTANCE. Section 7 tells people three things are kept and
                    why; a settings screen that says "everything is deleted"
                    would make that page a lie the moment they read it. */}
                {ownsEmployerProfile ? (
                  <span className={styles.dangerDescription}>
                    Deletes your account and your company profile straight away. Your job adverts are
                    archived, so they come off the board and nobody can apply to them. Applications
                    candidates already sent you are kept — they are the candidate&apos;s own record of
                    applying — but any notes you wrote about them are removed, along with your saved
                    candidates, interview availability and message templates. Anything you wrote in a
                    message becomes &quot;[deleted]&quot;, and reviews people left about your company stay,
                    because those are their words rather than yours. This cannot be undone.
                  </span>
                ) : (
                  <span className={styles.dangerDescription}>
                    {/* Shared with the iOS app's Delete account screen. */}
                    {CANDIDATE_DELETE_TEXT}
                  </span>
                )}
              </div>
              {/* IT IS A BUTTON AGAIN, AND NOW IT EARNS THAT. It was briefly a
                  mailto link, on the principle that a button implies something
                  happens when it is pressed and nothing did. Something does
                  now: a row is written and a human is emailed.

                  THE OUTSTANDING STATE IS THE HALF THAT MATTERS. Offering the
                  button again to someone who already asked is how they end up
                  unsure a second time, which is the original fault wearing a
                  different coat. */}
              {confirming ? (
                <div className={styles.confirmDelete}>
                  {/* type="button" throughout, and nothing here is wrapped in a form element. This page carries
                      a header, a chat widget, a feedback control and a cookie
                      banner, all of which use type="submit" — a form here would
                      put the most irreversible control in the product into that
                      pile, where a stray Enter could reach it. */}
                  <label htmlFor="deleteConfirm" className={styles.confirmLabel}>
                    Type {DELETE_CONFIRM_WORD} to confirm
                  </label>
                  <input
                    id="deleteConfirm"
                    type="text"
                    autoComplete="off"
                    className={styles.confirmInput}
                    value={confirmText}
                    onChange={e => setConfirmText(e.target.value)}
                    disabled={deleting}
                  />
                  {/* THE BUTTONS GET THEIR OWN ROW, AND THE REASON IS A
                      SCREENSHOT. .confirmButtons is flex-direction:
                      column-reverse below 640px — correct for the two buttons
                      it was written for, and it silently inverted this whole
                      panel when the label and input were put inside it. On a
                      phone it rendered Cancel, then Delete, then the box, then
                      the instruction telling you what to type. Seventeen
                      assertions passed on that. */}
                  <div className={styles.confirmDelete}>
                    <button
                      type="button"
                      className={styles.confirmDeleteBtn}
                      onClick={handleDeleteAccount}
                      disabled={deleting || confirmText.trim() !== DELETE_CONFIRM_WORD}
                    >
                      {deleting ? 'Deleting…' : 'Delete my account'}
                    </button>
                    <button
                      type="button"
                      className={styles.cancelDeleteBtn}
                      onClick={() => { setConfirming(false); setConfirmText('') }}
                      disabled={deleting}
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  className={styles.deleteRequestBtn}
                  onClick={() => setConfirming(true)}
                >
                  Delete my account
                </button>
              )}
            </div>
            )}
          </div>
        </div>
      </div>
    </main>
  )
}

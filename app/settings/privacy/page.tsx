'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import Header from '@/components/Header'
import { supabase } from '@/lib/supabase'
import { DEV_MODE, getMockUser, getMockUserType } from '@/lib/mockAuth'
import styles from './page.module.css'
import { Ico } from '@/components/icons'

interface PrivacySettings {
  // Profile Visibility - Job Seekers
  profile_visible_to_employers: boolean
  hide_from_search: boolean
  hide_contact_until_connected: boolean
  show_availability_publicly: boolean

  // Profile Visibility - Employers
  company_visible_to_seekers: boolean
  jobs_visible_to_public: boolean

  // Data & Privacy
  allow_in_search_results: boolean
  share_activity_for_recommendations: boolean
  allow_profile_bookmarking: boolean
  allow_view_tracking: boolean
}

const defaultJobSeekerSettings: PrivacySettings = {
  profile_visible_to_employers: true,
  hide_from_search: false,
  hide_contact_until_connected: true,
  show_availability_publicly: true,
  company_visible_to_seekers: true,
  jobs_visible_to_public: true,
  allow_in_search_results: true,
  share_activity_for_recommendations: true,
  allow_profile_bookmarking: true,
  allow_view_tracking: true,
}

const defaultEmployerSettings: PrivacySettings = {
  profile_visible_to_employers: true,
  hide_from_search: false,
  hide_contact_until_connected: false,
  show_availability_publicly: true,
  company_visible_to_seekers: true,
  jobs_visible_to_public: true,
  allow_in_search_results: true,
  share_activity_for_recommendations: true,
  allow_profile_bookmarking: true,
  allow_view_tracking: true,
}

export default function PrivacySettingsPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [userType, setUserType] = useState<'employer' | 'employee' | null>(null)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const [settings, setSettings] = useState<PrivacySettings>(defaultJobSeekerSettings)
  const [requesting, setRequesting] = useState(false)
  // Null until asked. Asked on load, so the screen can say "we have your
  // request" instead of offering the button to someone who already pressed it.
  const [openRequest, setOpenRequest] = useState<{ requestedAt: string } | null>(null)
  const [confirming, setConfirming] = useState(false)
  const [confirmText, setConfirmText] = useState('')
  const [deleting, setDeleting] = useState(false)

  useEffect(() => {
    const loadSettings = async () => {
      if (DEV_MODE) {
        const type = getMockUserType()
        if (!type) {
          router.push('/login')
          return
        }
        setUserType(type)

        // Load from localStorage
        const savedSettings = localStorage.getItem('privacySettings')
        const defaults = type === 'employer' ? defaultEmployerSettings : defaultJobSeekerSettings
        if (savedSettings) {
          setSettings({ ...defaults, ...JSON.parse(savedSettings) })
        } else {
          setSettings(defaults)
        }

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
      const defaults = type === 'employer' ? defaultEmployerSettings : defaultJobSeekerSettings

      // Fetch settings from appropriate table
      try {
        const tableName = type === 'employer' ? 'employer_profiles' : 'candidate_profiles'
        const { data: profile, error } = await supabase
          .from(tableName)
          .select('privacy_settings')
          .eq('user_id', session.user.id)
          .maybeSingle()

        if (!error && profile?.privacy_settings) {
          setSettings({ ...defaults, ...profile.privacy_settings })
        } else {
          setSettings(defaults)
        }
      } catch (err) {
        console.error('Error loading privacy settings:', err)
        setSettings(defaults)
      }

      setLoading(false)
    }

    loadSettings()
  }, [router])

  const handleToggle = (key: keyof PrivacySettings) => {
    setSettings(prev => ({
      ...prev,
      [key]: !prev[key]
    }))
    setMessage(null)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    setMessage(null)

    try {
      if (DEV_MODE) {
        localStorage.setItem('privacySettings', JSON.stringify(settings))
        setMessage({ type: 'success', text: 'Privacy settings saved successfully!' })
      } else {
        const { data: { session } } = await supabase.auth.getSession()
        if (!session) throw new Error('No session found')

        const tableName = userType === 'employer' ? 'employer_profiles' : 'candidate_profiles'

        // Check if profile exists
        const { data: existingProfile } = await supabase
          .from(tableName)
          .select('id')
          .eq('user_id', session.user.id)
          .maybeSingle()

        let error
        if (existingProfile) {
          const result = await supabase
            .from(tableName)
            .update({
              privacy_settings: settings,
              updated_at: new Date().toISOString()
            })
            .eq('user_id', session.user.id)
          error = result.error
        } else {
          // Create minimal profile with privacy settings
          const result = await supabase
            .from(tableName)
            .insert({
              user_id: session.user.id,
              privacy_settings: settings,
              ...(userType === 'employer'
                ? { company_name: session.user.user_metadata?.company_name || 'My Company' }
                : { full_name: session.user.user_metadata?.full_name || 'User' }
              )
            })
          error = result.error
        }

        if (error) throw error
        setMessage({ type: 'success', text: 'Privacy settings saved successfully!' })
      }
    } catch (error: any) {
      console.error('Error saving privacy settings:', error)
      setMessage({ type: 'error', text: error.message || 'Failed to save settings' })
    } finally {
      setSaving(false)
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
          privacySettings: settings,
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
            <p className={styles.subtitle}>Control who can see your information and how your data is used</p>
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

        <form onSubmit={handleSubmit} className={styles.form}>
          {/* Profile Visibility */}
          <div className={styles.section}>
            <div className={styles.sectionHeader}>
              <span className={styles.sectionIcon}><Ico name="eye" size={20} /></span>
              <h2 className={styles.sectionTitle}>Profile Visibility</h2>
            </div>
            <p className={styles.sectionDescription}>
              Control who can see your profile and what information is displayed
            </p>

            <div className={styles.settingsList}>
              {userType === 'employee' ? (
                <>
                  <div className={styles.settingItem}>
                    <div className={styles.settingInfo}>
                      <span className={styles.settingName}>Visible to employers</span>
                      <span className={styles.settingDescription}>
                        Allow employers to find and view your profile when searching for candidates
                      </span>
                    </div>
                    <Toggle
                      checked={settings.profile_visible_to_employers}
                      onChange={() => handleToggle('profile_visible_to_employers')}
                    />
                  </div>

                  <div className={styles.settingItem}>
                    <div className={styles.settingInfo}>
                      <span className={styles.settingName}>Private mode</span>
                      <span className={styles.settingDescription}>
                        Hide your profile from search results. You can still apply to jobs directly.
                      </span>
                    </div>
                    <Toggle
                      checked={settings.hide_from_search}
                      onChange={() => handleToggle('hide_from_search')}
                    />
                  </div>

                  <div className={styles.settingItem}>
                    <div className={styles.settingInfo}>
                      <span className={styles.settingName}>Hide contact details</span>
                      <span className={styles.settingDescription}>
                        Only show your email and phone after you've connected with an employer
                      </span>
                    </div>
                    <Toggle
                      checked={settings.hide_contact_until_connected}
                      onChange={() => handleToggle('hide_contact_until_connected')}
                    />
                  </div>

                  <div className={styles.settingItem}>
                    <div className={styles.settingInfo}>
                      <span className={styles.settingName}>Show availability status</span>
                      <span className={styles.settingDescription}>
                        Display your current availability (e.g., "Available immediately") on your profile
                      </span>
                    </div>
                    <Toggle
                      checked={settings.show_availability_publicly}
                      onChange={() => handleToggle('show_availability_publicly')}
                    />
                  </div>
                </>
              ) : (
                <>
                  <div className={styles.settingItem}>
                    <div className={styles.settingInfo}>
                      <span className={styles.settingName}>Company visible to job seekers</span>
                      <span className={styles.settingDescription}>
                        Allow job seekers to view your company profile and information
                      </span>
                    </div>
                    <Toggle
                      checked={settings.company_visible_to_seekers}
                      onChange={() => handleToggle('company_visible_to_seekers')}
                    />
                  </div>

                  <div className={styles.settingItem}>
                    <div className={styles.settingInfo}>
                      <span className={styles.settingName}>Public job postings</span>
                      <span className={styles.settingDescription}>
                        Show your job postings to everyone. If disabled, only registered users can view them.
                      </span>
                    </div>
                    <Toggle
                      checked={settings.jobs_visible_to_public}
                      onChange={() => handleToggle('jobs_visible_to_public')}
                    />
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Data & Privacy */}
          <div className={styles.section}>
            <div className={styles.sectionHeader}>
              <span className={styles.sectionIcon}><Ico name="bar-chart-3" size={20} /></span>
              <h2 className={styles.sectionTitle}>Data & Privacy</h2>
            </div>
            <p className={styles.sectionDescription}>
              Choose how your data is used to improve your experience
            </p>

            <div className={styles.settingsList}>
              <div className={styles.settingItem}>
                <div className={styles.settingInfo}>
                  <span className={styles.settingName}>Appear in search results</span>
                  <span className={styles.settingDescription}>
                    {userType === 'employee'
                      ? 'Allow your profile to appear when employers search for candidates'
                      : 'Allow your company to appear in job seeker searches'}
                  </span>
                </div>
                <Toggle
                  checked={settings.allow_in_search_results}
                  onChange={() => handleToggle('allow_in_search_results')}
                />
              </div>

              <div className={styles.settingItem}>
                <div className={styles.settingInfo}>
                  <span className={styles.settingName}>Personalised recommendations</span>
                  <span className={styles.settingDescription}>
                    {userType === 'employee'
                      ? 'Share your activity to receive better job recommendations'
                      : 'Share your activity to receive better candidate recommendations'}
                  </span>
                </div>
                <Toggle
                  checked={settings.share_activity_for_recommendations}
                  onChange={() => handleToggle('share_activity_for_recommendations')}
                />
              </div>

              {userType === 'employee' && (
                <div className={styles.settingItem}>
                  <div className={styles.settingInfo}>
                    <span className={styles.settingName}>Allow profile bookmarking</span>
                    <span className={styles.settingDescription}>
                      Let employers save your profile to their shortlist for later review
                    </span>
                  </div>
                  <Toggle
                    checked={settings.allow_profile_bookmarking}
                    onChange={() => handleToggle('allow_profile_bookmarking')}
                  />
                </div>
              )}

              <div className={styles.settingItem}>
                <div className={styles.settingInfo}>
                  <span className={styles.settingName}>Profile view tracking</span>
                  <span className={styles.settingDescription}>
                    {userType === 'employee'
                      ? 'See which employers have viewed your profile'
                      : 'See which candidates have viewed your job postings'}
                  </span>
                </div>
                <Toggle
                  checked={settings.allow_view_tracking}
                  onChange={() => handleToggle('allow_view_tracking')}
                />
              </div>
            </div>
          </div>

          {/* Form Actions */}
          <div className={styles.actions}>
            <Link href="/settings" className={styles.cancelBtn}>
              Cancel
            </Link>
            <button
              type="submit"
              className={styles.saveBtn}
              disabled={saving}
              aria-busy={saving}
            >
              {saving ? (
                <>
                  <span className={styles.savingSpinner}></span>
                  Saving...
                </>
              ) : (
                'Save Settings'
              )}
            </button>
          </div>
        </form>

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

            <div className={styles.dangerItem}>
              <div className={styles.dangerInfo}>
                <span className={styles.dangerName}>Delete my account</span>
                {/* WHAT IT SAYS MUST MATCH THE PRIVACY POLICY, WORD FOR WORD IN
                    SUBSTANCE. Section 7 tells people three things are kept and
                    why; a settings screen that says "everything is deleted"
                    would make that page a lie the moment they read it. */}
                <span className={styles.dangerDescription}>
                  Deletes your account and your data straight away. Your profile, CV, photo,
                  saved jobs, alerts and notifications are removed. Applications you sent stay
                  with the employer with your name and details stripped out, anything you wrote
                  in a message becomes &quot;[deleted]&quot;, and a signed job offer is kept because it is
                  a contract. This cannot be undone.
                </span>
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
                    Type DELETE to confirm
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
                      disabled={deleting || confirmText.trim() !== 'DELETE'}
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
          </div>
        </div>
      </div>
    </main>
  )
}

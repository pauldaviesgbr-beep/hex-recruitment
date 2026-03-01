'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import Header from '@/components/Header'
import { supabase } from '@/lib/supabase'
import { DEV_MODE, getMockUser, getMockUserType } from '@/lib/mockAuth'
import styles from './page.module.css'

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
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)

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

      setMessage({ type: 'success', text: 'Your data has been exported successfully!' })
    } catch (error: any) {
      console.error('Error exporting data:', error)
      setMessage({ type: 'error', text: error.message || 'Failed to export data' })
    } finally {
      setExporting(false)
    }
  }

  const handleRequestDeletion = async () => {
    // In a real app, this would send a deletion request to admin or trigger account deletion
    setMessage({
      type: 'success',
      text: 'Data deletion request submitted. You will receive a confirmation email within 48 hours.'
    })
    setShowDeleteConfirm(false)
  }

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
        {/* Breadcrumb Navigation */}
        <nav className={styles.breadcrumb} aria-label="Breadcrumb">
          <Link href="/settings" className={styles.breadcrumbLink}>Settings</Link>
          <span className={styles.breadcrumbSeparator}>›</span>
          <span className={styles.breadcrumbCurrent}>Privacy</span>
        </nav>

        <div className={styles.header}>
          <div className={styles.headerIcon}>🔒</div>
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
            {message.type === 'success' ? '✓ ' : '⚠ '}
            {message.text}
          </div>
        )}

        <form onSubmit={handleSubmit} className={styles.form}>
          {/* Profile Visibility */}
          <div className={styles.section}>
            <div className={styles.sectionHeader}>
              <span className={styles.sectionIcon}>👁️</span>
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
              <span className={styles.sectionIcon}>📊</span>
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
            <span className={styles.sectionIcon}>⚠️</span>
            <h2 className={styles.dangerTitle}>Your Data</h2>
          </div>
          <p className={styles.sectionDescription}>
            Download or request deletion of your personal data
          </p>

          <div className={styles.dangerActions}>
            <div className={styles.dangerItem}>
              <div className={styles.dangerInfo}>
                <span className={styles.dangerName}>Download my data</span>
                <span className={styles.dangerDescription}>
                  Export all your profile data, settings, and activity as a JSON file
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
                <span className={styles.dangerName}>Request data deletion</span>
                <span className={styles.dangerDescription}>
                  Submit a request to permanently delete all your data. This action cannot be undone.
                </span>
              </div>
              {!showDeleteConfirm ? (
                <button
                  type="button"
                  className={styles.deleteRequestBtn}
                  onClick={() => setShowDeleteConfirm(true)}
                >
                  Request Deletion
                </button>
              ) : (
                <div className={styles.confirmButtons}>
                  <button
                    type="button"
                    className={styles.confirmDeleteBtn}
                    onClick={handleRequestDeletion}
                  >
                    Confirm Request
                  </button>
                  <button
                    type="button"
                    className={styles.cancelDeleteBtn}
                    onClick={() => setShowDeleteConfirm(false)}
                  >
                    Cancel
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </main>
  )
}

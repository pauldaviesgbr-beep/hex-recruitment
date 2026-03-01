'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import Header from '@/components/Header'
import { supabase } from '@/lib/supabase'
import { DEV_MODE, getMockUser, getMockUserType } from '@/lib/mockAuth'
import styles from './page.module.css'

interface NotificationPreferences {
  // Email notifications
  email_job_matches: boolean
  email_application_updates: boolean
  email_new_messages: boolean
  email_job_posting_updates: boolean
  email_weekly_digest: boolean
  email_marketing: boolean

  // SMS notifications
  sms_new_messages: boolean
  sms_application_updates: boolean
  sms_job_alerts: boolean

  // Frequency
  notification_frequency: 'instant' | 'daily' | 'weekly'
}

const defaultPreferences: NotificationPreferences = {
  email_job_matches: true,
  email_application_updates: true,
  email_new_messages: true,
  email_job_posting_updates: true,
  email_weekly_digest: false,
  email_marketing: false,
  sms_new_messages: false,
  sms_application_updates: false,
  sms_job_alerts: false,
  notification_frequency: 'instant',
}

export default function NotificationsSettingsPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [userType, setUserType] = useState<'employer' | 'employee' | null>(null)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const [preferences, setPreferences] = useState<NotificationPreferences>(defaultPreferences)

  useEffect(() => {
    const loadPreferences = async () => {
      if (DEV_MODE) {
        const type = getMockUserType()
        if (!type) {
          router.push('/login')
          return
        }
        setUserType(type)

        // Load from localStorage
        const savedPrefs = localStorage.getItem('notificationPreferences')
        if (savedPrefs) {
          setPreferences({ ...defaultPreferences, ...JSON.parse(savedPrefs) })
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
      setUserType(role === 'employer' ? 'employer' : 'employee')

      // Fetch preferences from appropriate table
      try {
        const tableName = role === 'employer' ? 'employer_profiles' : 'candidate_profiles'
        const { data: profile, error } = await supabase
          .from(tableName)
          .select('notification_preferences')
          .eq('user_id', session.user.id)
          .maybeSingle()

        if (!error && profile?.notification_preferences) {
          setPreferences({ ...defaultPreferences, ...profile.notification_preferences })
        }
      } catch (err) {
        console.error('Error loading preferences:', err)
      }

      setLoading(false)
    }

    loadPreferences()
  }, [router])

  const handleToggle = (key: keyof NotificationPreferences) => {
    setPreferences(prev => ({
      ...prev,
      [key]: !prev[key]
    }))
    setMessage(null)
  }

  const handleFrequencyChange = (frequency: 'instant' | 'daily' | 'weekly') => {
    setPreferences(prev => ({
      ...prev,
      notification_frequency: frequency
    }))
    setMessage(null)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    setMessage(null)

    try {
      if (DEV_MODE) {
        localStorage.setItem('notificationPreferences', JSON.stringify(preferences))
        setMessage({ type: 'success', text: 'Notification preferences saved!' })
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
              notification_preferences: preferences,
              updated_at: new Date().toISOString()
            })
            .eq('user_id', session.user.id)
          error = result.error
        } else {
          // Create minimal profile with preferences
          const result = await supabase
            .from(tableName)
            .insert({
              user_id: session.user.id,
              notification_preferences: preferences,
              ...(userType === 'employer'
                ? { company_name: session.user.user_metadata?.company_name || 'My Company' }
                : { full_name: session.user.user_metadata?.full_name || 'User' }
              )
            })
          error = result.error
        }

        if (error) throw error
        setMessage({ type: 'success', text: 'Notification preferences saved!' })
      }
    } catch (error: any) {
      console.error('Error saving preferences:', error)
      setMessage({ type: 'error', text: error.message || 'Failed to save preferences' })
    } finally {
      setSaving(false)
    }
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
            <p>Loading notification settings...</p>
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
          <span className={styles.breadcrumbCurrent}>Notifications</span>
        </nav>

        <div className={styles.header}>
          <div className={styles.headerIcon}>🔔</div>
          <div>
            <h1 className={styles.title}>Notification Settings</h1>
            <p className={styles.subtitle}>Choose how and when you want to be notified</p>
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
          {/* Email Notifications */}
          <div className={styles.section}>
            <div className={styles.sectionHeader}>
              <span className={styles.sectionIcon}>📧</span>
              <h2 className={styles.sectionTitle}>Email Notifications</h2>
            </div>

            <div className={styles.settingsList}>
              {userType === 'employee' && (
                <div className={styles.settingItem}>
                  <div className={styles.settingInfo}>
                    <span className={styles.settingName}>New job matches</span>
                    <span className={styles.settingDescription}>
                      Get notified when new jobs match your profile
                    </span>
                  </div>
                  <Toggle
                    checked={preferences.email_job_matches}
                    onChange={() => handleToggle('email_job_matches')}
                  />
                </div>
              )}

              <div className={styles.settingItem}>
                <div className={styles.settingInfo}>
                  <span className={styles.settingName}>Application updates</span>
                  <span className={styles.settingDescription}>
                    {userType === 'employer'
                      ? 'Get notified when candidates apply to your jobs'
                      : 'Get notified when your application status changes'}
                  </span>
                </div>
                <Toggle
                  checked={preferences.email_application_updates}
                  onChange={() => handleToggle('email_application_updates')}
                />
              </div>

              <div className={styles.settingItem}>
                <div className={styles.settingInfo}>
                  <span className={styles.settingName}>New messages</span>
                  <span className={styles.settingDescription}>
                    Get notified when you receive a new message
                  </span>
                </div>
                <Toggle
                  checked={preferences.email_new_messages}
                  onChange={() => handleToggle('email_new_messages')}
                />
              </div>

              {userType === 'employer' && (
                <div className={styles.settingItem}>
                  <div className={styles.settingInfo}>
                    <span className={styles.settingName}>Job posting updates</span>
                    <span className={styles.settingDescription}>
                      Get notified when your jobs are viewed or saved
                    </span>
                  </div>
                  <Toggle
                    checked={preferences.email_job_posting_updates}
                    onChange={() => handleToggle('email_job_posting_updates')}
                  />
                </div>
              )}

              {userType === 'employee' && (
                <div className={styles.settingItem}>
                  <div className={styles.settingInfo}>
                    <span className={styles.settingName}>Weekly job digest</span>
                    <span className={styles.settingDescription}>
                      Receive a weekly summary of new job opportunities
                    </span>
                  </div>
                  <Toggle
                    checked={preferences.email_weekly_digest}
                    onChange={() => handleToggle('email_weekly_digest')}
                  />
                </div>
              )}

              <div className={styles.settingItem}>
                <div className={styles.settingInfo}>
                  <span className={styles.settingName}>Marketing emails</span>
                  <span className={styles.settingDescription}>
                    Receive tips, news, and product updates
                  </span>
                </div>
                <Toggle
                  checked={preferences.email_marketing}
                  onChange={() => handleToggle('email_marketing')}
                />
              </div>
            </div>
          </div>

          {/* SMS Notifications */}
          <div className={styles.section}>
            <div className={styles.sectionHeader}>
              <span className={styles.sectionIcon}>📱</span>
              <h2 className={styles.sectionTitle}>SMS Notifications</h2>
            </div>
            <p className={styles.sectionDescription}>
              Standard messaging rates may apply
            </p>

            <div className={styles.settingsList}>
              <div className={styles.settingItem}>
                <div className={styles.settingInfo}>
                  <span className={styles.settingName}>New messages</span>
                  <span className={styles.settingDescription}>
                    Get a text when you receive an important message
                  </span>
                </div>
                <Toggle
                  checked={preferences.sms_new_messages}
                  onChange={() => handleToggle('sms_new_messages')}
                />
              </div>

              <div className={styles.settingItem}>
                <div className={styles.settingInfo}>
                  <span className={styles.settingName}>Application updates</span>
                  <span className={styles.settingDescription}>
                    {userType === 'employer'
                      ? 'Get a text when you receive a new application'
                      : 'Get a text when your application status changes'}
                  </span>
                </div>
                <Toggle
                  checked={preferences.sms_application_updates}
                  onChange={() => handleToggle('sms_application_updates')}
                />
              </div>

              {userType === 'employee' && (
                <div className={styles.settingItem}>
                  <div className={styles.settingInfo}>
                    <span className={styles.settingName}>Job alerts</span>
                    <span className={styles.settingDescription}>
                      Get a text for urgent job opportunities
                    </span>
                  </div>
                  <Toggle
                    checked={preferences.sms_job_alerts}
                    onChange={() => handleToggle('sms_job_alerts')}
                  />
                </div>
              )}
            </div>
          </div>

          {/* Notification Frequency */}
          <div className={styles.section}>
            <div className={styles.sectionHeader}>
              <span className={styles.sectionIcon}>⏰</span>
              <h2 className={styles.sectionTitle}>Email Frequency</h2>
            </div>
            <p className={styles.sectionDescription}>
              Choose how often you want to receive email notifications
            </p>

            <div className={styles.frequencyOptions}>
              <label className={styles.frequencyOption}>
                <input
                  type="radio"
                  id="frequency-instant"
                  name="frequency"
                  value="instant"
                  checked={preferences.notification_frequency === 'instant'}
                  onChange={() => handleFrequencyChange('instant')}
                  className={styles.radioInput}
                />
                <div className={styles.frequencyContent}>
                  <span className={styles.frequencyName}>Instant</span>
                  <span className={styles.frequencyDescription}>
                    Receive notifications as they happen
                  </span>
                </div>
                <span className={`${styles.radioIndicator} ${preferences.notification_frequency === 'instant' ? styles.radioChecked : ''}`} />
              </label>

              <label className={styles.frequencyOption}>
                <input
                  type="radio"
                  id="frequency-daily"
                  name="frequency"
                  value="daily"
                  checked={preferences.notification_frequency === 'daily'}
                  onChange={() => handleFrequencyChange('daily')}
                  className={styles.radioInput}
                />
                <div className={styles.frequencyContent}>
                  <span className={styles.frequencyName}>Daily digest</span>
                  <span className={styles.frequencyDescription}>
                    Receive a daily summary at 9am
                  </span>
                </div>
                <span className={`${styles.radioIndicator} ${preferences.notification_frequency === 'daily' ? styles.radioChecked : ''}`} />
              </label>

              <label className={styles.frequencyOption}>
                <input
                  type="radio"
                  id="frequency-weekly"
                  name="frequency"
                  value="weekly"
                  checked={preferences.notification_frequency === 'weekly'}
                  onChange={() => handleFrequencyChange('weekly')}
                  className={styles.radioInput}
                />
                <div className={styles.frequencyContent}>
                  <span className={styles.frequencyName}>Weekly digest</span>
                  <span className={styles.frequencyDescription}>
                    Receive a weekly summary every Monday
                  </span>
                </div>
                <span className={`${styles.radioIndicator} ${preferences.notification_frequency === 'weekly' ? styles.radioChecked : ''}`} />
              </label>
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
                'Save Preferences'
              )}
            </button>
          </div>
        </form>
      </div>
    </main>
  )
}

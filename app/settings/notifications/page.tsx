'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import Header from '@/components/Header'
import { supabase } from '@/lib/supabase'
import { DEV_MODE, getMockUserType } from '@/lib/mockAuth'
import {
  type Role, type NotificationPrefs, type NotificationFrequency,
  defaultsFor, normalisePrefs,
} from '@/lib/notificationPrefs'
import PushToggle from '@/components/PushToggle'
import styles from './page.module.css'
import { Ico } from '@/components/icons'

// UI config — maps each canonical nested key to its label/description, per role.
// The toggle rows are rendered from these, so the UI can never drift from the
// stored schema (lib/notificationPrefs.ts) again.
type Row = { key: string; name: string; desc: string }

const CANDIDATE_EMAIL: Row[] = [
  { key: 'job_matches', name: 'New job matches', desc: 'Get emailed when new jobs match your profile' },
  { key: 'job_digest', name: 'Job digest', desc: 'Receive a periodic summary of new job opportunities' },
  { key: 'application_updates', name: 'Application updates', desc: 'Get notified when your application status changes' },
  { key: 'new_messages', name: 'New messages', desc: 'Get notified when you receive a new message' },
  { key: 'marketing', name: 'Marketing emails', desc: 'Receive tips, news, and product updates' },
]
const CANDIDATE_SMS: Row[] = [
  { key: 'new_messages', name: 'New messages', desc: 'Get a text when you receive an important message' },
  { key: 'job_alerts', name: 'Job alerts', desc: 'Get a text for urgent job opportunities' },
]
const EMPLOYER_EMAIL: Row[] = [
  { key: 'new_applications', name: 'New applications', desc: 'Get notified when candidates apply to your jobs' },
  { key: 'application_updates', name: 'Application updates', desc: 'Get notified when an application status changes' },
  { key: 'new_messages', name: 'New messages', desc: 'Get notified when you receive a new message' },
  { key: 'job_views', name: 'Job views & saves', desc: 'Get notified when your jobs are viewed or saved' },
  { key: 'marketing', name: 'Marketing emails', desc: 'Receive tips, news, and product updates' },
]
const EMPLOYER_SMS: Row[] = [
  { key: 'new_messages', name: 'New messages', desc: 'Get a text when you receive an important message' },
  { key: 'urgent_applications', name: 'Urgent applications', desc: 'Get a text for urgent applications' },
]

function sectionsFor(role: Role) {
  return role === 'employer'
    ? { email: EMPLOYER_EMAIL, sms: EMPLOYER_SMS }
    : { email: CANDIDATE_EMAIL, sms: CANDIDATE_SMS }
}

export default function NotificationsSettingsPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [userType, setUserType] = useState<Role | null>(null)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const [preferences, setPreferences] = useState<NotificationPrefs>(defaultsFor('employee'))

  useEffect(() => {
    const loadPreferences = async () => {
      if (DEV_MODE) {
        const type = getMockUserType()
        if (!type) { router.push('/login'); return }
        const role: Role = type === 'employer' ? 'employer' : 'employee'
        setUserType(role)
        const saved = localStorage.getItem('notificationPreferences')
        setPreferences(normalisePrefs(role, saved ? JSON.parse(saved) : null))
        setLoading(false)
        return
      }

      const { data: { session }, error: sessionError } = await supabase.auth.getSession()
      if (sessionError || !session) { router.push('/login'); return }

      const role: Role = session.user.user_metadata?.role === 'employer' ? 'employer' : 'employee'
      setUserType(role)

      try {
        const tableName = role === 'employer' ? 'employer_profiles' : 'candidate_profiles'
        const { data: profile, error } = await supabase
          .from(tableName)
          .select('notification_preferences')
          .eq('user_id', session.user.id)
          .maybeSingle()
        // normalisePrefs reads the user's REAL nested opt-ins and ignores any
        // legacy flat keys, so the toggles reflect what's actually saved.
        if (!error) setPreferences(normalisePrefs(role, profile?.notification_preferences))
      } catch (err) {
        console.error('Error loading preferences:', err)
      }
      setLoading(false)
    }
    loadPreferences()
  }, [router])

  const toggle = (channel: 'email' | 'sms', key: string) => {
    setPreferences(prev => ({
      ...prev,
      [channel]: { ...(prev as any)[channel], [key]: !(prev as any)[channel][key] },
    }))
    setMessage(null)
  }

  const setFrequency = (frequency: NotificationFrequency) => {
    setPreferences(prev => ({ ...prev, frequency }))
    setMessage(null)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!userType) return
    setSaving(true)
    setMessage(null)
    try {
      // Always persist a clean canonical object — never stray keys.
      const toSave = normalisePrefs(userType, preferences)
      if (DEV_MODE) {
        localStorage.setItem('notificationPreferences', JSON.stringify(toSave))
        setMessage({ type: 'success', text: 'Notification preferences saved!' })
      } else {
        const { data: { session } } = await supabase.auth.getSession()
        if (!session) throw new Error('No session found')
        const tableName = userType === 'employer' ? 'employer_profiles' : 'candidate_profiles'
        const { data: existingProfile } = await supabase
          .from(tableName)
          .select('id')
          .eq('user_id', session.user.id)
          .maybeSingle()

        let error
        if (existingProfile) {
          const result = await supabase
            .from(tableName)
            .update({ notification_preferences: toSave, updated_at: new Date().toISOString() })
            .eq('user_id', session.user.id)
          error = result.error
        } else {
          const result = await supabase
            .from(tableName)
            .insert({
              user_id: session.user.id,
              notification_preferences: toSave,
              ...(userType === 'employer'
                ? { company_name: session.user.user_metadata?.company_name || 'My Company' }
                : { full_name: session.user.user_metadata?.full_name || 'User' }),
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

  const Toggle = ({ checked, onChange }: { checked: boolean; onChange: () => void }) => (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      className={`${styles.toggle} ${checked ? styles.toggleOn : styles.toggleOff}`}
      onClick={onChange}
    >
      <span className={styles.toggleThumb} />
    </button>
  )

  if (loading || !userType) {
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

  const sections = sectionsFor(userType)
  const email = (preferences as any).email as Record<string, boolean>
  const sms = (preferences as any).sms as Record<string, boolean>

  return (
    <main>
      <Header />
      <div className={styles.container}>
        <button className={styles.backBtn} onClick={() => router.push('/settings')}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6" /></svg>
          Back to Settings
        </button>
        <nav className={styles.breadcrumb} aria-label="Breadcrumb">
          <Link href="/settings" className={styles.breadcrumbLink}>Settings</Link>
          <span className={styles.breadcrumbSeparator}>›</span>
          <span className={styles.breadcrumbCurrent}>Notifications</span>
        </nav>

        <div className={styles.header}>
          <div className={styles.headerIcon}><Ico name="bell" size={20} /></div>
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

        {/*
          PUSH SITS OUTSIDE THE FORM DELIBERATELY. Everything below saves
          preferences to the profile row on submit; this one talks to the
          BROWSER — it takes out or tears down a real subscription and writes
          device_tokens through its own endpoint. Putting it inside the form
          would imply it needs saving, and someone who flipped it and navigated
          away would think it had not taken effect when it had.
        */}
        <div className={styles.section}>
          <div className={styles.sectionHeader}>
            <span className={styles.sectionIcon}><Ico name="bell" size={20} /></span>
            <h2 className={styles.sectionTitle}>Push Notifications</h2>
          </div>
          <div className={styles.settingsList}>
            <div className={styles.settingItem}>
              <div className={styles.settingInfo}>
                <span className={styles.settingName}>Notifications on this device</span>
                <span className={styles.settingDescription}>
                  Get told when an employer messages you, invites you to an interview, or makes an offer.
                </span>
              </div>
              <PushToggle />
            </div>
          </div>
          {/*
            THE WAY IN TO THE TEST PAGE FROM AN INSTALLED APP.
            A standalone PWA has no address bar and the manifest starts at '/',
            so /diag-push was unreachable on the one device that can prove push
            works — the page built for the job could not be opened for the job.
            A link from here is the fix: settings is reachable from the app's
            own navigation.
          */}
          <p style={{ margin: '0.85rem 0 0', fontSize: '0.82rem', color: '#94a3b8' }}>
            Not working?{' '}
            <Link href="/diag-push" style={{ color: '#16a34a', fontWeight: 600 }}>
              Run the push test
            </Link>{' '}
            to see exactly where it stops.
          </p>
        </div>

        <form onSubmit={handleSubmit} className={styles.form}>
          {/* Email Notifications */}
          <div className={styles.section}>
            <div className={styles.sectionHeader}>
              <span className={styles.sectionIcon}><Ico name="mail" size={20} /></span>
              <h2 className={styles.sectionTitle}>Email Notifications</h2>
            </div>
            <div className={styles.settingsList}>
              {sections.email.map(row => (
                <div className={styles.settingItem} key={`email-${row.key}`}>
                  <div className={styles.settingInfo}>
                    <span className={styles.settingName}>{row.name}</span>
                    <span className={styles.settingDescription}>{row.desc}</span>
                  </div>
                  <Toggle checked={!!email[row.key]} onChange={() => toggle('email', row.key)} />
                </div>
              ))}
            </div>
          </div>

          {/* SMS Notifications */}
          <div className={styles.section}>
            <div className={styles.sectionHeader}>
              <span className={styles.sectionIcon}><Ico name="smartphone" size={20} /></span>
              <h2 className={styles.sectionTitle}>SMS Notifications</h2>
            </div>
            <p className={styles.sectionDescription}>Standard messaging rates may apply</p>
            <div className={styles.settingsList}>
              {sections.sms.map(row => (
                <div className={styles.settingItem} key={`sms-${row.key}`}>
                  <div className={styles.settingInfo}>
                    <span className={styles.settingName}>{row.name}</span>
                    <span className={styles.settingDescription}>{row.desc}</span>
                  </div>
                  <Toggle checked={!!sms[row.key]} onChange={() => toggle('sms', row.key)} />
                </div>
              ))}
            </div>
          </div>

          {/* Email Frequency */}
          <div className={styles.section}>
            <div className={styles.sectionHeader}>
              <span className={styles.sectionIcon}><Ico name="clock" size={20} /></span>
              <h2 className={styles.sectionTitle}>Email Frequency</h2>
            </div>
            <p className={styles.sectionDescription}>Choose how often you want to receive email notifications</p>
            <div className={styles.frequencyOptions}>
              {([
                { value: 'instant', name: 'Instant', desc: 'Receive notifications as they happen' },
                { value: 'daily', name: 'Daily digest', desc: 'Receive a daily summary at 9am' },
                { value: 'weekly', name: 'Weekly digest', desc: 'Receive a weekly summary every Monday' },
              ] as { value: NotificationFrequency; name: string; desc: string }[]).map(opt => (
                <label className={styles.frequencyOption} key={opt.value}>
                  <input
                    type="radio"
                    id={`frequency-${opt.value}`}
                    name="frequency"
                    value={opt.value}
                    checked={preferences.frequency === opt.value}
                    onChange={() => setFrequency(opt.value)}
                    className={styles.radioInput}
                  />
                  <div className={styles.frequencyContent}>
                    <span className={styles.frequencyName}>{opt.name}</span>
                    <span className={styles.frequencyDescription}>{opt.desc}</span>
                  </div>
                  <span className={`${styles.radioIndicator} ${preferences.frequency === opt.value ? styles.radioChecked : ''}`} />
                </label>
              ))}
            </div>
          </div>

          <div className={styles.actions}>
            <Link href="/settings" className={styles.cancelBtn}>Cancel</Link>
            <button type="submit" className={styles.saveBtn} disabled={saving} aria-busy={saving}>
              {saving ? (<><span className={styles.savingSpinner}></span>Saving...</>) : 'Save Preferences'}
            </button>
          </div>
        </form>
      </div>
    </main>
  )
}

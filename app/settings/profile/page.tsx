'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import Header from '@/components/Header'
import { supabase } from '@/lib/supabase'
import { DEV_MODE, getMockUserType } from '@/lib/mockAuth'
import styles from './page.module.css'

interface VisibilitySettings {
  show_email: boolean
  show_phone: boolean
  show_address: boolean
  show_date_of_birth: boolean
  show_nationality: boolean
  show_desired_salary: boolean
  show_social_links: boolean
  show_availability: boolean
  show_verification_badges: boolean
  show_cv: boolean
}

const DEFAULT_VISIBILITY: VisibilitySettings = {
  show_email: true,
  show_phone: true,
  show_address: false,
  show_date_of_birth: false,
  show_nationality: true,
  show_desired_salary: true,
  show_social_links: true,
  show_availability: true,
  show_verification_badges: true,
  show_cv: true,
}

interface ToggleItem {
  key: keyof VisibilitySettings
  label: string
  description: string
  icon: string
}

const VISIBILITY_TOGGLES: ToggleItem[] = [
  {
    key: 'show_email',
    label: 'Email Address',
    description: 'Allow employers to see your email address',
    icon: '📧',
  },
  {
    key: 'show_phone',
    label: 'Phone Number',
    description: 'Allow employers to see your phone number',
    icon: '📱',
  },
  {
    key: 'show_address',
    label: 'Home Address',
    description: 'Show your full address to employers',
    icon: '🏠',
  },
  {
    key: 'show_date_of_birth',
    label: 'Date of Birth / Age',
    description: 'Show your age on your public profile',
    icon: '🎂',
  },
  {
    key: 'show_nationality',
    label: 'Nationality',
    description: 'Show your nationality to employers',
    icon: '🌍',
  },
  {
    key: 'show_desired_salary',
    label: 'Desired Salary',
    description: 'Show your salary expectations to employers',
    icon: '💷',
  },
  {
    key: 'show_social_links',
    label: 'Social Links',
    description: 'Show LinkedIn and Instagram links on your profile',
    icon: '🔗',
  },
  {
    key: 'show_availability',
    label: 'Availability',
    description: 'Show your notice period / availability status',
    icon: '📅',
  },
  {
    key: 'show_verification_badges',
    label: 'Verification Badges',
    description: 'Show NI Number, Right to Work, and other verified documents',
    icon: '✅',
  },
  {
    key: 'show_cv',
    label: 'CV / Resume',
    description: 'Allow employers to download your CV',
    icon: '📄',
  },
]

export default function ProfileVisibilityPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const messageTimerRef = useRef<NodeJS.Timeout | null>(null)

  const [visibility, setVisibility] = useState<VisibilitySettings>(DEFAULT_VISIBILITY)

  // Auto-dismiss toast after 4 seconds
  useEffect(() => {
    if (message) {
      if (messageTimerRef.current) clearTimeout(messageTimerRef.current)
      messageTimerRef.current = setTimeout(() => setMessage(null), 4000)
    }
    return () => { if (messageTimerRef.current) clearTimeout(messageTimerRef.current) }
  }, [message])

  useEffect(() => {
    const loadSettings = async () => {
      if (DEV_MODE) {
        const type = getMockUserType()
        if (!type || type !== 'employee') {
          router.push('/login')
          return
        }

        // Load from localStorage
        const saved = localStorage.getItem('visibilitySettings')
        if (saved) {
          setVisibility({ ...DEFAULT_VISIBILITY, ...JSON.parse(saved) })
        }

        setLoading(false)
        return
      }

      const { data: { session } } = await supabase.auth.getSession()
      if (!session || session.user.user_metadata?.role !== 'employee') {
        router.push('/login')
        return
      }

      // Load visibility_settings from candidate_profiles
      const { data: profile, error } = await supabase
        .from('candidate_profiles')
        .select('visibility_settings')
        .eq('user_id', session.user.id)
        .maybeSingle()

      if (!error && profile?.visibility_settings) {
        setVisibility({ ...DEFAULT_VISIBILITY, ...profile.visibility_settings })
      }

      setLoading(false)
    }

    loadSettings()
  }, [router])

  const handleToggle = (key: keyof VisibilitySettings) => {
    setVisibility(prev => ({ ...prev, [key]: !prev[key] }))
    setMessage(null)
  }

  const handleSave = async () => {
    setSaving(true)
    setMessage(null)

    try {
      if (DEV_MODE) {
        localStorage.setItem('visibilitySettings', JSON.stringify(visibility))
        setMessage({ type: 'success', text: 'Visibility settings saved successfully!' })
      } else {
        const { data: { session } } = await supabase.auth.getSession()
        if (!session) throw new Error('Not authenticated')

        const { error } = await supabase
          .from('candidate_profiles')
          .update({
            visibility_settings: visibility,
            updated_at: new Date().toISOString(),
          })
          .eq('user_id', session.user.id)

        if (error) throw error
        setMessage({ type: 'success', text: 'Visibility settings saved successfully!' })
      }
    } catch (error: any) {
      setMessage({ type: 'error', text: error.message || 'Failed to save settings' })
    } finally {
      setSaving(false)
    }
  }

  const handleReset = () => {
    setVisibility(DEFAULT_VISIBILITY)
    setMessage(null)
  }

  if (loading) {
    return (
      <main>
        <Header />
        <div className={styles.container}>
          <div className={styles.loading}>Loading settings...</div>
        </div>
      </main>
    )
  }

  return (
    <main>
      <Header />
      <div className={styles.container}>
        <Link href="/settings" className={styles.backLink}>
          <span className={styles.backArrow}>←</span>
          Back to Settings
        </Link>

        <div className={styles.header}>
          <div className={styles.headerIcon}>🔒</div>
          <div>
            <h1 className={styles.title}>Profile Settings</h1>
            <p className={styles.subtitle}>Control what employers can see when they view your profile</p>
          </div>
        </div>

        <div className={styles.infoBox}>
          <span className={styles.infoBoxIcon}>ℹ️</span>
          <div>
            <strong>Your profile data is managed on the Profile page.</strong>
            <p className={styles.infoBoxText}>
              These settings only control what employers can see. Your name, job title, bio, skills, and work experience are always visible on your public profile. To edit your profile data, go to <Link href="/profile" className={styles.infoLink}>My Profile</Link>.
            </p>
          </div>
        </div>

        <div className={styles.bankNote}>
          <span>🔒</span>
          <span>Bank details are <strong>always private</strong> and never shown to employers, regardless of these settings.</span>
        </div>

        {/* Toggle Cards */}
        <div className={styles.toggleSection}>
          <h2 className={styles.sectionTitle}>Visibility Controls</h2>
          <div className={styles.toggleList}>
            {VISIBILITY_TOGGLES.map(item => (
              <div key={item.key} className={styles.toggleCard}>
                <div className={styles.toggleInfo}>
                  <span className={styles.toggleIcon}>{item.icon}</span>
                  <div>
                    <span className={styles.toggleLabel}>{item.label}</span>
                    <span className={styles.toggleDesc}>{item.description}</span>
                  </div>
                </div>
                <button
                  className={`${styles.toggle} ${visibility[item.key] ? styles.toggleOn : styles.toggleOff}`}
                  onClick={() => handleToggle(item.key)}
                  role="switch"
                  aria-checked={visibility[item.key]}
                  aria-label={`Toggle ${item.label} visibility`}
                >
                  <span className={styles.toggleThumb} />
                </button>
              </div>
            ))}
          </div>
        </div>

        {/* Actions */}
        <div className={styles.actions}>
          <button
            type="button"
            className={styles.resetBtn}
            onClick={handleReset}
          >
            Reset to Defaults
          </button>
          <button
            type="button"
            className={styles.saveBtn}
            onClick={handleSave}
            disabled={saving}
          >
            {saving ? 'Saving...' : 'Save Settings'}
          </button>
        </div>
      </div>

      {/* Toast notification */}
      {message && (
        <div className={`${styles.toast} ${message.type === 'success' ? styles.toastSuccess : styles.toastError}`}>
          <span>{message.type === 'success' ? '✓' : '!'}</span>
          {message.text}
          <button className={styles.toastClose} onClick={() => setMessage(null)}>×</button>
        </div>
      )}
    </main>
  )
}

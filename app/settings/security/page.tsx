'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import Header from '@/components/Header'
import PasswordInput from '@/components/PasswordInput'
import { supabase } from '@/lib/supabase'
import { DEV_MODE, getMockUserType } from '@/lib/mockAuth'
import styles from './page.module.css'

export default function SecuritySettingsPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  const [passwordForm, setPasswordForm] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: '',
  })

  const [passwordStrength, setPasswordStrength] = useState<{
    score: number
    label: string
    color: string
  }>({ score: 0, label: '', color: '' })

  useEffect(() => {
    const checkAuth = async () => {
      if (DEV_MODE) {
        const type = getMockUserType()
        if (!type) {
          router.push('/login')
          return
        }
        setLoading(false)
        return
      }

      const { data: { session } } = await supabase.auth.getSession()
      if (!session) {
        router.push('/login')
        return
      }

      setLoading(false)
    }

    checkAuth()
  }, [router])

  const checkPasswordStrength = (password: string) => {
    let score = 0

    if (password.length >= 8) score++
    if (password.length >= 12) score++
    if (/[a-z]/.test(password) && /[A-Z]/.test(password)) score++
    if (/\d/.test(password)) score++
    if (/[!@#$%^&*(),.?":{}|<>]/.test(password)) score++

    const labels = ['', 'Weak', 'Fair', 'Good', 'Strong', 'Very Strong']
    const colors = ['', '#ef4444', '#f97316', '#eab308', '#22c55e', '#10b981']

    setPasswordStrength({
      score,
      label: labels[score] || '',
      color: colors[score] || '',
    })
  }

  const handlePasswordChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target
    setPasswordForm(prev => ({ ...prev, [name]: value }))
    setMessage(null)

    if (name === 'newPassword') {
      checkPasswordStrength(value)
    }
  }

  const handlePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    setMessage(null)

    // Validation
    if (passwordForm.newPassword.length < 8) {
      setMessage({ type: 'error', text: 'Password must be at least 8 characters long' })
      setSaving(false)
      return
    }

    if (passwordForm.newPassword !== passwordForm.confirmPassword) {
      setMessage({ type: 'error', text: 'New passwords do not match' })
      setSaving(false)
      return
    }

    try {
      if (DEV_MODE) {
        // Simulate password change in dev mode
        await new Promise(resolve => setTimeout(resolve, 500))
        setMessage({ type: 'success', text: 'Password changed successfully!' })
        setPasswordForm({ currentPassword: '', newPassword: '', confirmPassword: '' })
        setPasswordStrength({ score: 0, label: '', color: '' })
      } else {
        // Update password via Supabase
        const { error } = await supabase.auth.updateUser({
          password: passwordForm.newPassword
        })

        if (error) throw error
        setMessage({ type: 'success', text: 'Password changed successfully!' })
        setPasswordForm({ currentPassword: '', newPassword: '', confirmPassword: '' })
        setPasswordStrength({ score: 0, label: '', color: '' })
      }
    } catch (error: any) {
      setMessage({ type: 'error', text: error.message || 'Failed to change password' })
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <main>
        <Header />
        <div className={styles.container}>
          <div className={styles.loading}>Loading security settings...</div>
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
            <h1 className={styles.title}>Security Settings</h1>
            <p className={styles.subtitle}>Manage your password and account security</p>
          </div>
        </div>

        {message && (
          <div className={`${styles.message} ${message.type === 'success' ? styles.messageSuccess : styles.messageError}`}>
            {message.text}
          </div>
        )}

        <form onSubmit={handlePasswordSubmit} className={styles.form}>
          <div className={styles.section}>
            <h2 className={styles.sectionTitle}>Change Password</h2>
            <p className={styles.sectionDescription}>
              Choose a strong password with at least 8 characters, including uppercase letters, numbers, and symbols.
            </p>

            <div className={styles.field}>
              <label htmlFor="currentPassword" className={styles.label}>Current Password</label>
              <PasswordInput
                id="currentPassword"
                name="currentPassword"
                value={passwordForm.currentPassword}
                onChange={handlePasswordChange}
                className={styles.input}
                required
                autoComplete="current-password"
              />
            </div>

            <div className={styles.field}>
              <label htmlFor="newPassword" className={styles.label}>New Password</label>
              <PasswordInput
                id="newPassword"
                name="newPassword"
                value={passwordForm.newPassword}
                onChange={handlePasswordChange}
                className={styles.input}
                required
                minLength={8}
                autoComplete="new-password"
              />
              {passwordForm.newPassword && (
                <div className={styles.strengthMeter}>
                  <div className={styles.strengthBar}>
                    <div
                      className={styles.strengthFill}
                      style={{
                        width: `${(passwordStrength.score / 5) * 100}%`,
                        backgroundColor: passwordStrength.color,
                      }}
                    />
                  </div>
                  <span className={styles.strengthLabel} style={{ color: passwordStrength.color }}>
                    {passwordStrength.label}
                  </span>
                </div>
              )}
            </div>

            <div className={styles.field}>
              <label htmlFor="confirmPassword" className={styles.label}>Confirm New Password</label>
              <PasswordInput
                id="confirmPassword"
                name="confirmPassword"
                value={passwordForm.confirmPassword}
                onChange={handlePasswordChange}
                className={styles.input}
                required
                minLength={8}
                autoComplete="new-password"
              />
              {passwordForm.confirmPassword && passwordForm.newPassword !== passwordForm.confirmPassword && (
                <p className={styles.fieldError}>Passwords do not match</p>
              )}
            </div>

            <div className={styles.passwordTips}>
              <h4 className={styles.tipsTitle}>Password Tips</h4>
              <ul className={styles.tipsList}>
                <li className={passwordForm.newPassword.length >= 8 ? styles.tipMet : ''}>
                  At least 8 characters
                </li>
                <li className={/[A-Z]/.test(passwordForm.newPassword) && /[a-z]/.test(passwordForm.newPassword) ? styles.tipMet : ''}>
                  Mix of uppercase and lowercase
                </li>
                <li className={/\d/.test(passwordForm.newPassword) ? styles.tipMet : ''}>
                  Include numbers
                </li>
                <li className={/[!@#$%^&*(),.?":{}|<>]/.test(passwordForm.newPassword) ? styles.tipMet : ''}>
                  Include symbols (!@#$%^&*)
                </li>
              </ul>
            </div>
          </div>

          <div className={styles.actions}>
            <Link href="/settings" className={styles.cancelBtn}>
              Cancel
            </Link>
            <button
              type="submit"
              className={styles.saveBtn}
              disabled={saving || passwordForm.newPassword !== passwordForm.confirmPassword}
            >
              {saving ? 'Changing Password...' : 'Change Password'}
            </button>
          </div>
        </form>

        <div className={styles.section}>
          <h2 className={styles.sectionTitle}>Two-Factor Authentication</h2>
          <p className={styles.sectionDescription}>
            Add an extra layer of security to your account by enabling two-factor authentication.
          </p>
          <div className={styles.twoFactorStatus}>
            <span className={styles.statusBadge}>Not Enabled</span>
            <button className={styles.enableBtn} disabled>
              Enable 2FA (Coming Soon)
            </button>
          </div>
        </div>

        <div className={styles.section}>
          <h2 className={styles.sectionTitle}>Active Sessions</h2>
          <p className={styles.sectionDescription}>
            Manage devices where you're currently logged in.
          </p>
          <div className={styles.sessionItem}>
            <div className={styles.sessionIcon}>💻</div>
            <div className={styles.sessionInfo}>
              <span className={styles.sessionDevice}>Current Session</span>
              <span className={styles.sessionDetails}>This device • Active now</span>
            </div>
            <span className={styles.currentBadge}>Current</span>
          </div>
          <button className={styles.logoutAllBtn} disabled>
            Log Out All Other Devices (Coming Soon)
          </button>
        </div>
      </div>
    </main>
  )
}

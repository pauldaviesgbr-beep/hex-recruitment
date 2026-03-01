'use client'

import { useState } from 'react'
import styles from './PhoneVerificationModal.module.css'

interface PhoneVerificationModalProps {
  onComplete: () => void
}

const countries = [
  { code: 'GB', name: 'United Kingdom', dialCode: '+44' },
  { code: 'IE', name: 'Ireland', dialCode: '+353' },
  { code: 'US', name: 'United States', dialCode: '+1' },
  { code: 'FR', name: 'France', dialCode: '+33' },
  { code: 'DE', name: 'Germany', dialCode: '+49' },
  { code: 'ES', name: 'Spain', dialCode: '+34' },
  { code: 'IT', name: 'Italy', dialCode: '+39' },
  { code: 'PT', name: 'Portugal', dialCode: '+351' },
  { code: 'NL', name: 'Netherlands', dialCode: '+31' },
  { code: 'PL', name: 'Poland', dialCode: '+48' },
]

export default function PhoneVerificationModal({ onComplete }: PhoneVerificationModalProps) {
  const [selectedCountry, setSelectedCountry] = useState(countries[0])
  const [phoneNumber, setPhoneNumber] = useState('')
  const [smsAlerts, setSmsAlerts] = useState(false)
  const [promotionalSms, setPromotionalSms] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleCountryChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const country = countries.find(c => c.code === e.target.value)
    if (country) setSelectedCountry(country)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    if (!phoneNumber.trim()) {
      setError('Please enter your phone number')
      return
    }

    // Basic phone validation (digits only, reasonable length)
    const digitsOnly = phoneNumber.replace(/\D/g, '')
    if (digitsOnly.length < 7 || digitsOnly.length > 15) {
      setError('Please enter a valid phone number')
      return
    }

    setLoading(true)

    try {
      // TODO: Save to database
      // For now, just simulate saving and complete
      await new Promise(resolve => setTimeout(resolve, 500))

      // Store in localStorage that verification is complete
      localStorage.setItem('phoneVerified', 'true')
      localStorage.setItem('employerPhone', `${selectedCountry.dialCode}${digitsOnly}`)
      localStorage.setItem('smsAlertsConsent', String(smsAlerts))
      localStorage.setItem('promotionalSmsConsent', String(promotionalSms))

      onComplete()
    } catch (err: any) {
      setError(err.message || 'Something went wrong')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className={styles.overlay}>
      <div className={styles.modal}>
        <div className={styles.header}>
          <span className={styles.icon}>📱</span>
          <h1 className={styles.title}>Verify phone</h1>
          <p className={styles.subtitle}>You only have to do this once</p>
        </div>

        <form onSubmit={handleSubmit} className={styles.form}>
          {error && <div className={styles.error}>{error}</div>}

          <div className={styles.formGroup}>
            <label htmlFor="country">Country</label>
            <select
              id="country"
              name="country"
              value={selectedCountry.code}
              onChange={handleCountryChange}
              className={styles.select}
              autoComplete="country"
            >
              {countries.map(country => (
                <option key={country.code} value={country.code}>
                  {country.name} ({country.dialCode})
                </option>
              ))}
            </select>
          </div>

          <div className={styles.formGroup}>
            <label htmlFor="phone">Phone number</label>
            <div className={styles.phoneInput}>
              <span className={styles.dialCode}>{selectedCountry.dialCode}</span>
              <input
                type="tel"
                id="phone"
                name="phone"
                value={phoneNumber}
                onChange={(e) => setPhoneNumber(e.target.value)}
                placeholder="7911 123456"
                className={styles.input}
                autoComplete="tel"
              />
            </div>
          </div>

          <div className={styles.toggleSection}>
            <label className={styles.toggle}>
              <input
                type="checkbox"
                checked={smsAlerts}
                onChange={(e) => setSmsAlerts(e.target.checked)}
              />
              <span className={styles.toggleSlider}></span>
              <div className={styles.toggleText}>
                <span className={styles.toggleTitle}>I agree to receive SMS alerts</span>
                <span className={styles.toggleDescription}>
                  Get instant notifications when candidates apply to your jobs or respond to messages
                </span>
              </div>
            </label>

            <label className={styles.toggle}>
              <input
                type="checkbox"
                checked={promotionalSms}
                onChange={(e) => setPromotionalSms(e.target.checked)}
              />
              <span className={styles.toggleSlider}></span>
              <div className={styles.toggleText}>
                <span className={styles.toggleTitle}>I agree to receive promotional SMS</span>
                <span className={styles.toggleDescription}>
                  Receive updates about new features, special offers, and hiring tips from Hex
                </span>
              </div>
            </label>
          </div>

          <button
            type="submit"
            disabled={loading}
            className={styles.submitBtn}
          >
            {loading ? 'Verifying...' : 'Continue'}
          </button>
        </form>
      </div>
    </div>
  )
}

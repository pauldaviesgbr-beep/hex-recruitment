'use client'

import { useState, useEffect, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import Header from '@/components/Header'
import PasswordInput from '@/components/PasswordInput'
import PostcodeLookup, { type AddressData } from '@/components/PostcodeLookup'
import styles from '../../login/page.module.css'
import registerStyles from './page.module.css'

const planDetails: Record<string, { name: string; price: number }> = {
  starter: { name: 'Starter', price: 49 },
  professional: { name: 'Professional', price: 149 },
  enterprise: { name: 'Enterprise', price: 299 },
}

function RegisterEmployerPageContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const plan = searchParams.get('plan')

  const [formData, setFormData] = useState({
    companyName: '',
    contactName: '',
    email: '',
    password: '',
    confirmPassword: '',
    phone: '',
    addressLine1: '',
    addressLine2: '',
    city: '',
    county: '',
    postcode: '',
    website: '',
  })
  const [addressFound, setAddressFound] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    // Redirect to subscribe if no plan selected
    if (!plan || !planDetails[plan]) {
      router.push('/subscribe')
    }
  }, [plan, router])

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData(prev => ({
      ...prev,
      [e.target.name]: e.target.value
    }))
  }

  const handleAddressFound = (address: AddressData) => {
    setFormData(prev => ({
      ...prev,
      addressLine1: address.addressLine1,
      addressLine2: address.addressLine2,
      city: address.city,
      county: address.county,
      postcode: address.postcode,
    }))
    setAddressFound(true)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    // Validate passwords match
    if (formData.password !== formData.confirmPassword) {
      setError('Passwords do not match')
      return
    }

    if (formData.password.length < 6) {
      setError('Password must be at least 6 characters')
      return
    }

    setLoading(true)

    try {
      // Create auth user
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email: formData.email,
        password: formData.password,
        options: {
          data: {
            full_name: formData.contactName,
            company_name: formData.companyName,
            role: 'employer',
            subscription_plan: plan,
            address_line1: formData.addressLine1,
            address_line2: formData.addressLine2,
            city: formData.city,
            county: formData.county,
            postcode: formData.postcode,
          }
        }
      })

      if (authError) throw authError

      if (authData.user) {
        // Create employer profile (fallback in case DB trigger doesn't fire)
        await supabase.from('employer_profiles').upsert({
          user_id: authData.user.id,
          company_name: formData.companyName,
          contact_name: formData.contactName,
          email: formData.email,
          location: [formData.addressLine1, formData.addressLine2, formData.city, formData.county, formData.postcode].filter(Boolean).join(', ') || null,
          business_address: {
            address_line_1: formData.addressLine1 || '',
            address_line_2: formData.addressLine2 || '',
            city: formData.city || '',
            county: formData.county || '',
            postcode: formData.postcode || '',
          },
        }, { onConflict: 'user_id' })

        // Send welcome email (non-blocking)
        fetch('/api/email/send', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            to: formData.email,
            type: 'welcome',
            data: { companyName: formData.companyName },
          }),
        }).catch(() => {})

        alert('Registration successful! Please check your email to verify your account. You can start posting jobs after verification.')
        router.push('/login/employer')
      }
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  if (!plan || !planDetails[plan]) {
    return null
  }

  const selectedPlan = planDetails[plan]

  return (
    <main>
      <Header />
      <div className={styles.container}>
        <div className={styles.formCard} style={{ maxWidth: '600px' }}>
          <h1 className={styles.title}>Create Employer Account</h1>
          <p className={styles.subtitle}>
            You selected the <strong>{selectedPlan.name}</strong> plan at <strong>£{selectedPlan.price}/month</strong>
          </p>

          <form onSubmit={handleSubmit} className={styles.form}>
            {error && <div className={styles.error}>{error}</div>}

            <div className={styles.formGroup}>
              <label htmlFor="companyName">Company Name *</label>
              <input
                type="text"
                id="companyName"
                name="companyName"
                value={formData.companyName}
                onChange={handleChange}
                required
                className={styles.input}
                autoComplete="organization"
              />
            </div>

            <div className={styles.formGroup}>
              <label htmlFor="contactName">Contact Name *</label>
              <input
                type="text"
                id="contactName"
                name="contactName"
                value={formData.contactName}
                onChange={handleChange}
                required
                className={styles.input}
                autoComplete="name"
              />
            </div>

            <div className={styles.formGroup}>
              <label htmlFor="email">Email *</label>
              <input
                type="email"
                id="email"
                name="email"
                value={formData.email}
                onChange={handleChange}
                required
                className={styles.input}
                autoComplete="email"
              />
            </div>

            <div className={styles.formGroup}>
              <label htmlFor="password">Password * (minimum 6 characters)</label>
              <PasswordInput
                id="password"
                name="password"
                value={formData.password}
                onChange={handleChange}
                required
                minLength={6}
                className={styles.input}
                autoComplete="new-password"
              />
            </div>

            <div className={styles.formGroup}>
              <label htmlFor="confirmPassword">Confirm Password *</label>
              <PasswordInput
                id="confirmPassword"
                name="confirmPassword"
                value={formData.confirmPassword}
                onChange={handleChange}
                required
                className={styles.input}
                autoComplete="new-password"
              />
            </div>

            <div className={styles.formGroup}>
              <label htmlFor="phone">Phone</label>
              <input
                type="tel"
                id="phone"
                name="phone"
                value={formData.phone}
                onChange={handleChange}
                className={styles.input}
                autoComplete="tel"
              />
            </div>

            {/* Address Section with Postcode Lookup */}
            <div className={registerStyles.addressSection}>
              <h3 className={registerStyles.sectionTitle}>Company Address</h3>

              <div className={styles.formGroup}>
                <label>Postcode Lookup</label>
                <PostcodeLookup
                  onAddressFound={handleAddressFound}
                  initialPostcode={formData.postcode}
                />
              </div>

              {addressFound && (
                <div className={registerStyles.addressFields}>
                  <div className={styles.formGroup}>
                    <label htmlFor="addressLine1">Address Line 1</label>
                    <input
                      type="text"
                      id="addressLine1"
                      name="addressLine1"
                      value={formData.addressLine1}
                      onChange={handleChange}
                      className={styles.input}
                      placeholder="Street address"
                      autoComplete="address-line1"
                    />
                  </div>

                  <div className={styles.formGroup}>
                    <label htmlFor="addressLine2">Address Line 2</label>
                    <input
                      type="text"
                      id="addressLine2"
                      name="addressLine2"
                      value={formData.addressLine2}
                      onChange={handleChange}
                      className={styles.input}
                      placeholder="Flat, suite, unit (optional)"
                      autoComplete="address-line2"
                    />
                  </div>

                  <div className={registerStyles.addressRow}>
                    <div className={styles.formGroup}>
                      <label htmlFor="city">City</label>
                      <input
                        type="text"
                        id="city"
                        name="city"
                        value={formData.city}
                        onChange={handleChange}
                        className={styles.input}
                        autoComplete="address-level2"
                      />
                    </div>

                    <div className={styles.formGroup}>
                      <label htmlFor="county">County</label>
                      <input
                        type="text"
                        id="county"
                        name="county"
                        value={formData.county}
                        onChange={handleChange}
                        className={styles.input}
                        autoComplete="address-level1"
                      />
                    </div>
                  </div>

                  <div className={styles.formGroup}>
                    <label htmlFor="postcode">Postcode</label>
                    <input
                      type="text"
                      id="postcode"
                      name="postcode"
                      value={formData.postcode}
                      onChange={handleChange}
                      className={styles.input}
                      autoComplete="postal-code"
                      style={{ maxWidth: '180px' }}
                    />
                  </div>
                </div>
              )}
            </div>

            <div className={styles.formGroup}>
              <label htmlFor="website">Company Website</label>
              <input
                type="url"
                id="website"
                name="website"
                value={formData.website}
                onChange={handleChange}
                placeholder="https://www.example.com"
                className={styles.input}
                autoComplete="url"
              />
            </div>

            <button type="submit" disabled={loading} className="btn btn-primary" style={{ width: '100%' }}>
              {loading ? 'Creating account...' : 'Create Employer Account'}
            </button>

            <p style={{ marginTop: '1rem', fontSize: '0.85rem', color: '#666', textAlign: 'center' }}>
              Payment will be processed after email verification
            </p>
          </form>

          <div className={styles.links}>
            <p>Already have an account?</p>
            <Link href="/login/employer" className={styles.link}>
              Log in here
            </Link>
          </div>

          <div className={styles.links}>
            <Link href="/subscribe" className={styles.link}>
              Change subscription plan
            </Link>
          </div>
        </div>
      </div>
    </main>
  )
}

// Wrap in Suspense for useSearchParams
export default function RegisterEmployerPage() {
  return (
    <Suspense fallback={
      <main>
        <Header />
        <div style={{ textAlign: 'center', padding: '4rem' }}>
          Loading...
        </div>
      </main>
    }>
      <RegisterEmployerPageContent />
    </Suspense>
  )
}

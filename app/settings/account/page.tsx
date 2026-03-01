'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import Header from '@/components/Header'
import PostcodeLookup, { type AddressData } from '@/components/PostcodeLookup'
import { supabase } from '@/lib/supabase'
import { DEV_MODE, getMockUser, getMockUserType } from '@/lib/mockAuth'
import styles from './page.module.css'

interface AccountFormData {
  firstName: string
  lastName: string
  email: string
  phone: string
  addressLine1: string
  addressLine2: string
  city: string
  county: string
  postcode: string
  country: string
}

export default function AccountSettingsPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [userType, setUserType] = useState<'employer' | 'employee' | null>(null)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  const [formData, setFormData] = useState<AccountFormData>({
    firstName: '',
    lastName: '',
    email: '',
    phone: '',
    addressLine1: '',
    addressLine2: '',
    city: '',
    county: '',
    postcode: '',
    country: 'United Kingdom',
  })
  const [addressFound, setAddressFound] = useState(false)

  useEffect(() => {
    const loadAccountData = async () => {
      if (DEV_MODE) {
        const type = getMockUserType()
        if (!type) {
          router.push('/login')
          return
        }
        setUserType(type)

        // Load from localStorage based on user type
        if (type === 'employer') {
          const savedProfile = localStorage.getItem('employerProfile')
          if (savedProfile) {
            const profile = JSON.parse(savedProfile)
            setFormData({
              firstName: profile.contactFirstName || '',
              lastName: profile.contactLastName || '',
              email: profile.email || '',
              phone: profile.phone || '',
              addressLine1: profile.addressLine1 || '',
              addressLine2: profile.addressLine2 || '',
              city: profile.city || '',
              county: profile.county || '',
              postcode: profile.postcode || '',
              country: profile.country || 'United Kingdom',
            })
            if (profile.addressLine1 || profile.city || profile.postcode) {
              setAddressFound(true)
            }
          }
        } else {
          const savedProfile = localStorage.getItem('jobSeekerProfile')
          if (savedProfile) {
            const profile = JSON.parse(savedProfile)
            setFormData({
              firstName: profile.firstName || '',
              lastName: profile.lastName || '',
              email: profile.email || '',
              phone: profile.phone || '',
              addressLine1: profile.addressLine1 || '',
              addressLine2: profile.addressLine2 || '',
              city: profile.city || '',
              county: profile.county || '',
              postcode: profile.postcode || '',
              country: profile.country || 'United Kingdom',
            })
            if (profile.addressLine1 || profile.city || profile.postcode) {
              setAddressFound(true)
            }
          }
        }

        setLoading(false)
        return
      }

      const { data: { session } } = await supabase.auth.getSession()
      if (!session) {
        router.push('/login')
        return
      }

      const role = session.user.user_metadata?.role
      setUserType(role === 'employer' ? 'employer' : 'employee')

      // Load data from session metadata
      const metadata = session.user.user_metadata || {}
      setFormData({
        firstName: metadata.first_name || '',
        lastName: metadata.last_name || '',
        email: session.user.email || '',
        phone: metadata.phone || '',
        addressLine1: metadata.address_line_1 || '',
        addressLine2: metadata.address_line_2 || '',
        city: metadata.city || '',
        county: metadata.county || '',
        postcode: metadata.postcode || '',
        country: metadata.country || 'United Kingdom',
      })
      if (metadata.address_line_1 || metadata.city || metadata.postcode) {
        setAddressFound(true)
      }

      setLoading(false)
    }

    loadAccountData()
  }, [router])

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target
    setFormData(prev => ({ ...prev, [name]: value }))
    setMessage(null)
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
    setSaving(true)
    setMessage(null)

    try {
      if (DEV_MODE) {
        // Save to localStorage
        if (userType === 'employer') {
          const existing = JSON.parse(localStorage.getItem('employerProfile') || '{}')
          localStorage.setItem('employerProfile', JSON.stringify({
            ...existing,
            contactFirstName: formData.firstName,
            contactLastName: formData.lastName,
            email: formData.email,
            phone: formData.phone,
            addressLine1: formData.addressLine1,
            addressLine2: formData.addressLine2,
            city: formData.city,
            county: formData.county,
            postcode: formData.postcode,
            country: formData.country,
          }))
        } else {
          const existing = JSON.parse(localStorage.getItem('jobSeekerProfile') || '{}')
          localStorage.setItem('jobSeekerProfile', JSON.stringify({
            ...existing,
            firstName: formData.firstName,
            lastName: formData.lastName,
            email: formData.email,
            phone: formData.phone,
            addressLine1: formData.addressLine1,
            addressLine2: formData.addressLine2,
            city: formData.city,
            county: formData.county,
            postcode: formData.postcode,
            country: formData.country,
          }))
        }
        setMessage({ type: 'success', text: 'Account settings saved successfully!' })
      } else {
        // Update Supabase user metadata
        const { error } = await supabase.auth.updateUser({
          data: {
            first_name: formData.firstName,
            last_name: formData.lastName,
            phone: formData.phone,
            address_line_1: formData.addressLine1,
            address_line_2: formData.addressLine2,
            city: formData.city,
            county: formData.county,
            postcode: formData.postcode,
            country: formData.country,
          }
        })

        if (error) throw error
        setMessage({ type: 'success', text: 'Account settings saved successfully!' })
      }
    } catch (error: any) {
      setMessage({ type: 'error', text: error.message || 'Failed to save settings' })
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <main>
        <Header />
        <div className={styles.container}>
          <div className={styles.loading}>Loading account settings...</div>
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
          <div className={styles.headerIcon}>👤</div>
          <div>
            <h1 className={styles.title}>Account Settings</h1>
            <p className={styles.subtitle}>Update your contact information and address</p>
          </div>
        </div>

        {message && (
          <div className={`${styles.message} ${message.type === 'success' ? styles.messageSuccess : styles.messageError}`}>
            {message.text}
          </div>
        )}

        <form onSubmit={handleSubmit} className={styles.form}>
          <div className={styles.section}>
            <h2 className={styles.sectionTitle}>Personal Information</h2>

            <div className={styles.row}>
              <div className={styles.field}>
                <label htmlFor="firstName" className={styles.label}>First Name</label>
                <input
                  type="text"
                  id="firstName"
                  name="firstName"
                  value={formData.firstName}
                  onChange={handleChange}
                  className={styles.input}
                  required
                  autoComplete="given-name"
                />
              </div>

              <div className={styles.field}>
                <label htmlFor="lastName" className={styles.label}>Last Name</label>
                <input
                  type="text"
                  id="lastName"
                  name="lastName"
                  value={formData.lastName}
                  onChange={handleChange}
                  className={styles.input}
                  required
                  autoComplete="family-name"
                />
              </div>
            </div>

            <div className={styles.row}>
              <div className={styles.field}>
                <label htmlFor="email" className={styles.label}>Email Address</label>
                <input
                  type="email"
                  id="email"
                  name="email"
                  value={formData.email}
                  onChange={handleChange}
                  className={styles.input}
                  required
                  disabled={!DEV_MODE}
                  autoComplete="email"
                />
                {!DEV_MODE && (
                  <p className={styles.fieldHint}>Contact support to change your email address</p>
                )}
              </div>

              <div className={styles.field}>
                <label htmlFor="phone" className={styles.label}>Phone Number</label>
                <input
                  type="tel"
                  id="phone"
                  name="phone"
                  value={formData.phone}
                  onChange={handleChange}
                  className={styles.input}
                  placeholder="+44 7XXX XXXXXX"
                  autoComplete="tel"
                />
              </div>
            </div>
          </div>

          <div className={styles.section}>
            <h2 className={styles.sectionTitle}>Address</h2>

            <div className={styles.field}>
              <label className={styles.label}>Postcode Lookup</label>
              <PostcodeLookup
                onAddressFound={handleAddressFound}
                initialPostcode={formData.postcode}
              />
            </div>

            {addressFound && (
              <>
                <div className={styles.field}>
                  <label htmlFor="addressLine1" className={styles.label}>Address Line 1</label>
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

                <div className={styles.field}>
                  <label htmlFor="addressLine2" className={styles.label}>Address Line 2 (Optional)</label>
                  <input
                    type="text"
                    id="addressLine2"
                    name="addressLine2"
                    value={formData.addressLine2}
                    onChange={handleChange}
                    className={styles.input}
                    placeholder="Apartment, suite, unit, etc."
                    autoComplete="address-line2"
                  />
                </div>

                <div className={styles.row}>
                  <div className={styles.field}>
                    <label htmlFor="city" className={styles.label}>City</label>
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

                  <div className={styles.field}>
                    <label htmlFor="county" className={styles.label}>County</label>
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

                <div className={styles.row}>
                  <div className={styles.field}>
                    <label htmlFor="postcode" className={styles.label}>Postcode</label>
                    <input
                      type="text"
                      id="postcode"
                      name="postcode"
                      value={formData.postcode}
                      onChange={handleChange}
                      className={styles.input}
                      placeholder="SW1A 1AA"
                      autoComplete="postal-code"
                    />
                  </div>

                  <div className={styles.field}>
                    <label htmlFor="country" className={styles.label}>Country</label>
                    <select
                      id="country"
                      name="country"
                      value={formData.country}
                      onChange={handleChange}
                      className={styles.select}
                      autoComplete="country-name"
                    >
                      <option value="United Kingdom">United Kingdom</option>
                      <option value="Ireland">Ireland</option>
                    </select>
                  </div>
                </div>
              </>
            )}
          </div>

          <div className={styles.actions}>
            <Link href="/settings" className={styles.cancelBtn}>
              Cancel
            </Link>
            <button type="submit" className={styles.saveBtn} disabled={saving}>
              {saving ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        </form>
      </div>
    </main>
  )
}

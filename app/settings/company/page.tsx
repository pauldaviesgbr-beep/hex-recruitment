'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import Header from '@/components/Header'
import PostcodeLookup, { type AddressData } from '@/components/PostcodeLookup'
import { supabase } from '@/lib/supabase'
import { DEV_MODE, getMockUserType } from '@/lib/mockAuth'
import styles from './page.module.css'

const INDUSTRY_OPTIONS = [
  'Accountancy, Banking & Finance',
  'Business, Consulting & Management',
  'Charity & Voluntary Work',
  'Creative Arts & Design',
  'Digital & Information Technology',
  'Energy & Utilities',
  'Engineering & Manufacturing',
  'Environment & Agriculture',
  'Healthcare & Social Care',
  'Hospitality, Tourism & Sport',
  'Law & Legal Services',
  'Marketing, Advertising & PR',
  'Media & Internet',
  'Property & Construction',
  'Public Services & Administration',
  'Recruitment & HR',
  'Retail & Sales',
  'Science & Pharmaceuticals',
  'Teaching & Education',
  'Transport & Logistics',
  'Other',
]

const COMPANY_SIZE_OPTIONS = [
  '1-10 employees',
  '11-50 employees',
  '51-200 employees',
  '201-500 employees',
  '501-1000 employees',
  '1000+ employees',
]

interface CompanyFormData {
  companyName: string
  contactFirstName: string
  contactLastName: string
  email: string
  phone: string
  addressLine1: string
  addressLine2: string
  city: string
  county: string
  postcode: string
  country: string
  website: string
  logoUrl: string
  industry: string
  companySize: string
  description: string
}

export default function CompanySettingsPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [logoUploading, setLogoUploading] = useState(false)
  const [logoUploadError, setLogoUploadError] = useState('')
  const [logoFileName, setLogoFileName] = useState('')
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  const [formData, setFormData] = useState<CompanyFormData>({
    companyName: '',
    contactFirstName: '',
    contactLastName: '',
    email: '',
    phone: '',
    addressLine1: '',
    addressLine2: '',
    city: '',
    county: '',
    postcode: '',
    country: 'United Kingdom',
    website: '',
    logoUrl: '',
    industry: '',
    companySize: '',
    description: '',
  })
  const [addressFound, setAddressFound] = useState(false)

  useEffect(() => {
    const loadCompanyData = async () => {
      if (DEV_MODE) {
        const type = getMockUserType()
        if (!type || type !== 'employer') {
          router.push('/login')
          return
        }

        // Load from localStorage
        const savedProfile = localStorage.getItem('employerProfile')
        if (savedProfile) {
          const profile = JSON.parse(savedProfile)
          setFormData({
            companyName: profile.companyName || '',
            contactFirstName: profile.contactFirstName || '',
            contactLastName: profile.contactLastName || '',
            email: profile.email || '',
            phone: profile.phone || '',
            addressLine1: profile.addressLine1 || '',
            addressLine2: profile.addressLine2 || '',
            city: profile.city || '',
            county: profile.county || '',
            postcode: profile.postcode || '',
            country: profile.country || 'United Kingdom',
            website: profile.website || '',
            logoUrl: profile.logoUrl || '',
            industry: profile.industry || '',
            companySize: profile.companySize || '',
            description: profile.description || '',
          })
          if (profile.addressLine1 || profile.city || profile.postcode) {
            setAddressFound(true)
          }
        }

        setLoading(false)
        return
      }

      // Non-dev mode: Check Supabase session
      const { data: { session }, error: sessionError } = await supabase.auth.getSession()

      if (sessionError) {
        console.error('Session error:', sessionError)
        router.push('/login')
        return
      }

      if (!session) {
        router.push('/login')
        return
      }

      // Check user role
      const userRole = session.user.user_metadata?.role
      if (userRole !== 'employer') {
        router.push('/login')
        return
      }

      // Fetch company profile from employer_profiles table
      // Use maybeSingle() to avoid 406 error when no row exists
      try {
        const { data: profile, error } = await supabase
          .from('employer_profiles')
          .select('*')
          .eq('user_id', session.user.id)
          .maybeSingle()

        // Handle specific error codes
        if (error) {
          // PGRST116 = no rows returned (not an error for us)
          // 406 = Not Acceptable (RLS policy blocking or no match)
          if (error.code !== 'PGRST116') {
            console.error('Error fetching profile:', error.message, error.code)
          }
          // Continue with empty form - user can create profile on save
        }

        if (profile) {
          // Parse business_address JSONB if it exists
          const address = profile.business_address || {}

          // Parse contact_name into first/last if possible
          const contactParts = (profile.contact_name || '').split(' ')
          const contactFirst = contactParts[0] || ''
          const contactLast = contactParts.slice(1).join(' ') || ''

          // If business_address is empty but we have a location string, try to parse it
          let addressLine1 = address.address_line_1 || ''
          let addressLine2 = address.address_line_2 || ''
          let city = address.city || ''
          let postcode = address.postcode || ''
          let country = address.country || ''

          // Fallback: If no structured address, try to get city from location field
          if (!city && !addressLine1 && profile.location) {
            // location is typically "City, Country" or "Address, City, Postcode, Country"
            const locationParts = profile.location.split(', ')
            if (locationParts.length >= 2) {
              // Assume last part is country, second-to-last might be postcode or city
              const lastPart = locationParts[locationParts.length - 1]
              if (lastPart === 'United Kingdom' || lastPart === 'Ireland') {
                country = lastPart
                // Check if second-to-last looks like a postcode (UK pattern)
                const secondLast = locationParts[locationParts.length - 2]
                if (secondLast && /^[A-Z]{1,2}\d/.test(secondLast.toUpperCase())) {
                  postcode = secondLast
                  city = locationParts[locationParts.length - 3] || ''
                  addressLine1 = locationParts.slice(0, -3).join(', ')
                } else {
                  city = secondLast
                  addressLine1 = locationParts.slice(0, -2).join(', ')
                }
              } else {
                city = locationParts[0] || ''
              }
            } else if (locationParts.length === 1) {
              city = locationParts[0]
            }
          }

          setFormData({
            companyName: profile.company_name || '',
            contactFirstName: contactFirst,
            contactLastName: contactLast,
            email: profile.email || session.user.email || '',
            phone: profile.phone || '',
            addressLine1: addressLine1,
            addressLine2: addressLine2,
            city: city,
            county: address.county || '',
            postcode: postcode,
            country: country || 'United Kingdom',
            website: profile.website || '',
            logoUrl: profile.logo_url || '',
            industry: profile.industry || '',
            companySize: profile.company_size || '',
            description: profile.description || '',
          })
          if (addressLine1 || city || postcode) {
            setAddressFound(true)
          }
        } else {
          // No profile exists yet - load from user metadata as fallback
          const metadata = session.user.user_metadata || {}
          setFormData(prev => ({
            ...prev,
            companyName: metadata.company_name || '',
            contactFirstName: metadata.full_name?.split(' ')[0] || '',
            contactLastName: metadata.full_name?.split(' ').slice(1).join(' ') || '',
            email: session.user.email || '',
          }))
        }
      } catch (fetchError: any) {
        // Catch any unexpected errors during fetch
        console.error('Unexpected error fetching profile:', fetchError)
        // Still show the form with user metadata
        const metadata = session.user.user_metadata || {}
        setFormData(prev => ({
          ...prev,
          companyName: metadata.company_name || '',
          email: session.user.email || '',
        }))
      }

      setLoading(false)
    }

    loadCompanyData()
  }, [router])

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
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

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    setLogoUploading(true)
    setLogoUploadError('')

    try {
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => {
          const img = new window.Image()
          img.onload = () => {
            const canvas = document.createElement('canvas')
            canvas.width = 200
            canvas.height = 200
            const ctx = canvas.getContext('2d')!
            ctx.fillStyle = '#ffffff'
            ctx.fillRect(0, 0, 200, 200)
            const scale = Math.min(200 / img.width, 200 / img.height)
            const w = img.width * scale
            const h = img.height * scale
            ctx.drawImage(img, (200 - w) / 2, (200 - h) / 2, w, h)
            resolve(canvas.toDataURL('image/png'))
          }
          img.onerror = reject
          img.src = reader.result as string
        }
        reader.onerror = reject
        reader.readAsDataURL(file)
      })

      setFormData(prev => ({ ...prev, logoUrl: dataUrl }))
      setLogoFileName(file.name)
    } catch {
      setLogoUploadError('Failed to process logo image.')
    } finally {
      setLogoUploading(false)
      e.target.value = ''
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    setMessage(null)

    // Validation
    if (!formData.companyName.trim()) {
      setMessage({ type: 'error', text: 'Company name is required' })
      setSaving(false)
      return
    }

    if (!formData.email.trim()) {
      setMessage({ type: 'error', text: 'Email address is required' })
      setSaving(false)
      return
    }

    try {
      if (DEV_MODE) {
        // Save to localStorage
        const existing = JSON.parse(localStorage.getItem('employerProfile') || '{}')
        localStorage.setItem('employerProfile', JSON.stringify({
          ...existing,
          companyName: formData.companyName,
          contactFirstName: formData.contactFirstName,
          contactLastName: formData.contactLastName,
          email: formData.email,
          phone: formData.phone,
          addressLine1: formData.addressLine1,
          addressLine2: formData.addressLine2,
          city: formData.city,
          postcode: formData.postcode,
          country: formData.country,
          website: formData.website,
          logoUrl: formData.logoUrl,
          industry: formData.industry,
          companySize: formData.companySize,
          description: formData.description,
        }))
        setMessage({ type: 'success', text: 'Company profile saved successfully!' })
      } else {
        // Get current session
        const { data: { session } } = await supabase.auth.getSession()
        if (!session) throw new Error('No session found')

        // Build business_address JSONB - only include non-empty values
        const businessAddress: Record<string, string> = {}
        if (formData.addressLine1?.trim()) businessAddress.address_line_1 = formData.addressLine1.trim()
        if (formData.addressLine2?.trim()) businessAddress.address_line_2 = formData.addressLine2.trim()
        if (formData.city?.trim()) businessAddress.city = formData.city.trim()
        if (formData.postcode?.trim()) businessAddress.postcode = formData.postcode.trim()
        if (formData.country?.trim()) businessAddress.country = formData.country.trim()

        // Build formatted location string for display (full address)
        const locationParts = [
          formData.addressLine1?.trim(),
          formData.city?.trim(),
          formData.postcode?.trim(),
          formData.country?.trim()
        ].filter(Boolean)
        const formattedLocation = locationParts.join(', ') || null

        // Combine contact name
        const contactName = `${formData.contactFirstName} ${formData.contactLastName}`.trim()

        // Profile data to save
        const profileData = {
          user_id: session.user.id,
          company_name: formData.companyName,
          contact_name: contactName || null,
          email: formData.email,
          phone: formData.phone || null,
          location: formattedLocation,
          website: formData.website || null,
          logo_url: formData.logoUrl || null,
          industry: formData.industry || null,
          company_size: formData.companySize || null,
          description: formData.description || null,
          business_address: Object.keys(businessAddress).length > 0 ? businessAddress : null,
          updated_at: new Date().toISOString(),
        }

        // First, check if profile exists
        const { data: existingProfile } = await supabase
          .from('employer_profiles')
          .select('id')
          .eq('user_id', session.user.id)
          .maybeSingle()

        let error
        if (existingProfile) {
          // Update existing profile
          const result = await supabase
            .from('employer_profiles')
            .update(profileData)
            .eq('user_id', session.user.id)
          error = result.error
        } else {
          // Insert new profile
          const result = await supabase
            .from('employer_profiles')
            .insert(profileData)
          error = result.error
        }

        if (error) {
          console.error('Save error:', error)
          // Provide more helpful error messages
          if (error.code === '42501') {
            throw new Error('Permission denied. Please check your account permissions.')
          } else if (error.code === '23505') {
            throw new Error('A profile already exists for this account.')
          } else {
            throw new Error(error.message || 'Failed to save profile')
          }
        }

        // Also update user metadata (logo_url used by Header avatar)
        await supabase.auth.updateUser({
          data: {
            company_name: formData.companyName,
            logo_url: formData.logoUrl || null,
          }
        })

        setMessage({ type: 'success', text: 'Company profile saved successfully!' })
      }
    } catch (error: any) {
      console.error('Error saving profile:', error)
      setMessage({ type: 'error', text: error.message || 'Failed to save company profile' })
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <main>
        <Header />
        <div className={styles.container}>
          <div className={styles.loading}>
            <div className={styles.loadingSpinner}></div>
            <p>Loading company profile...</p>
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
          <span className={styles.breadcrumbCurrent}>Company Profile</span>
        </nav>

        <div className={styles.header}>
          <div className={styles.headerIcon}>🏢</div>
          <div>
            <h1 className={styles.title}>Company Profile</h1>
            <p className={styles.subtitle}>Manage your company information and branding</p>
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
          {/* Company Logo */}
          <div className={styles.section}>
            <h2 className={styles.sectionTitle}>Company Logo</h2>
            <input
              type="file"
              id="logoUpload"
              accept="image/jpeg,image/png"
              onChange={handleLogoUpload}
              disabled={logoUploading}
              className={styles.fileInput}
            />
            {formData.logoUrl ? (
              <div className={styles.logoPreviewContainer}>
                <div className={styles.logoPreview}>
                  <img src={formData.logoUrl} alt="Company logo" className={styles.logoImage} />
                </div>
                <div className={styles.logoPreviewActions}>
                  <button
                    type="button"
                    className={styles.changeLogoBtn}
                    onClick={() => document.getElementById('logoUpload')?.click()}
                  >
                    Change Logo
                  </button>
                  <button
                    type="button"
                    className={styles.removeLogoBtn}
                    onClick={() => { setFormData(prev => ({ ...prev, logoUrl: '' })); setLogoFileName('') }}
                  >
                    Remove
                  </button>
                </div>
              </div>
            ) : (
              <label htmlFor="logoUpload" className={styles.uploadLabel}>
                {logoUploading ? (
                  <span>Processing logo...</span>
                ) : (
                  <>
                    <span className={styles.uploadIcon}>📁</span>
                    <span>Choose a logo image</span>
                    <span className={styles.uploadHint}>PNG or JPG — resized to 200x200px square</span>
                  </>
                )}
              </label>
            )}
            {logoFileName && !logoUploadError && (
              <p className={styles.logoSuccess}>Uploaded: {logoFileName}</p>
            )}
            {logoUploadError && (
              <p className={styles.uploadError}>{logoUploadError}</p>
            )}
          </div>

          {/* Company Information */}
          <div className={styles.section}>
            <h2 className={styles.sectionTitle}>Company Information</h2>

            <div className={styles.field}>
              <label htmlFor="companyName" className={styles.label}>
                Company Name <span className={styles.required}>*</span>
              </label>
              <input
                type="text"
                id="companyName"
                name="companyName"
                value={formData.companyName}
                onChange={handleChange}
                className={styles.input}
                required
                aria-required="true"
                autoComplete="organization"
              />
            </div>

            <div className={styles.row}>
              <div className={styles.field}>
                <label htmlFor="industry" className={styles.label}>Industry</label>
                <select
                  id="industry"
                  name="industry"
                  value={formData.industry}
                  onChange={handleChange}
                  className={styles.select}
                >
                  <option value="">Select industry...</option>
                  {INDUSTRY_OPTIONS.map(industry => (
                    <option key={industry} value={industry}>{industry}</option>
                  ))}
                </select>
              </div>

              <div className={styles.field}>
                <label htmlFor="companySize" className={styles.label}>Company Size</label>
                <select
                  id="companySize"
                  name="companySize"
                  value={formData.companySize}
                  onChange={handleChange}
                  className={styles.select}
                >
                  <option value="">Select size...</option>
                  {COMPANY_SIZE_OPTIONS.map(size => (
                    <option key={size} value={size}>{size}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className={styles.field}>
              <label htmlFor="website" className={styles.label}>Website</label>
              <input
                type="url"
                id="website"
                name="website"
                value={formData.website}
                onChange={handleChange}
                className={styles.input}
                placeholder="https://www.yourcompany.com"
                autoComplete="url"
              />
            </div>

            <div className={styles.field}>
              <label htmlFor="description" className={styles.label}>Company Description</label>
              <textarea
                id="description"
                name="description"
                value={formData.description}
                onChange={handleChange}
                className={styles.textarea}
                rows={4}
                placeholder="Tell candidates about your company, culture, and what makes you a great place to work..."
                aria-describedby="descriptionHelp"
              />
              <p id="descriptionHelp" className={styles.fieldHint}>
                This will be displayed on your job listings
              </p>
            </div>
          </div>

          {/* Contact Person */}
          <div className={styles.section}>
            <h2 className={styles.sectionTitle}>Contact Person</h2>

            <div className={styles.row}>
              <div className={styles.field}>
                <label htmlFor="contactFirstName" className={styles.label}>First Name</label>
                <input
                  type="text"
                  id="contactFirstName"
                  name="contactFirstName"
                  value={formData.contactFirstName}
                  onChange={handleChange}
                  className={styles.input}
                  autoComplete="given-name"
                />
              </div>

              <div className={styles.field}>
                <label htmlFor="contactLastName" className={styles.label}>Last Name</label>
                <input
                  type="text"
                  id="contactLastName"
                  name="contactLastName"
                  value={formData.contactLastName}
                  onChange={handleChange}
                  className={styles.input}
                  autoComplete="family-name"
                />
              </div>
            </div>

            <div className={styles.row}>
              <div className={styles.field}>
                <label htmlFor="email" className={styles.label}>
                  Email Address <span className={styles.required}>*</span>
                </label>
                <input
                  type="email"
                  id="email"
                  name="email"
                  value={formData.email}
                  onChange={handleChange}
                  className={styles.input}
                  required
                  aria-required="true"
                  autoComplete="email"
                />
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

          {/* Company Address */}
          <div className={styles.section}>
            <h2 className={styles.sectionTitle}>Company Address</h2>

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
                    placeholder="Building, floor, suite, etc."
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
                'Save Changes'
              )}
            </button>
          </div>
        </form>
      </div>
    </main>
  )
}

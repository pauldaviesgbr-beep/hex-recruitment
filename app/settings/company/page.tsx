'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import Header from '@/components/Header'
import PostcodeLookup, { type AddressData } from '@/components/PostcodeLookup'
import { supabase } from '@/lib/supabase'
import { getEmployerCapabilities } from '@/lib/employer'
import { DEV_MODE, getMockUserType } from '@/lib/mockAuth'
import { employerLoginPath } from '@/lib/loginRedirect'
import { focusField } from '@/lib/focusField'
import FieldError from '@/components/FieldError'
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
  // WHICH field a validation error is about, so the message can sit beside it as
  // well as in the banner. This page's banner is shared with success messages,
  // so the field is tracked separately rather than folded into it — and cleared
  // by every setMessage that is not one of the three field validations below.
  const [errorField, setErrorField] = useState<string | null>(null)
  const [scrapeUrl, setScrapeUrl] = useState('')
  const [scraping, setScraping] = useState(false)
  const [isDirty, setIsDirty] = useState(false)

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

  const handleScrape = async () => {
    if (!scrapeUrl.trim()) return
    setScraping(true)
    setMessage(null)
    setErrorField(null)
    try {
      const res = await fetch('/api/company/scrape', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: scrapeUrl.trim() }),
      })
      const json = await res.json()
      if (!res.ok || !json.data) {
        setMessage({ type: 'error', text: json.error || "Couldn't import from that URL — please fill in manually" })
        setErrorField(null)
        setScraping(false)
        return
      }
      const d = json.data as Record<string, string | null>

      // Map AI-extracted industry to the closest dropdown option
      const matchIndustry = (raw: string | null): string => {
        if (!raw) return ''
        const lower = raw.toLowerCase()
        const match = INDUSTRY_OPTIONS.find(opt => opt.toLowerCase().includes(lower) || lower.includes(opt.toLowerCase().split(',')[0]))
        if (match) return match
        // Fuzzy match common synonyms
        const map: Record<string, string> = {
          technology: 'Digital & Information Technology', tech: 'Digital & Information Technology', software: 'Digital & Information Technology', it: 'Digital & Information Technology',
          finance: 'Accountancy, Banking & Finance', banking: 'Accountancy, Banking & Finance',
          healthcare: 'Healthcare & Social Care', health: 'Healthcare & Social Care', medical: 'Healthcare & Social Care',
          hospitality: 'Hospitality, Tourism & Sport', hotel: 'Hospitality, Tourism & Sport', tourism: 'Hospitality, Tourism & Sport',
          retail: 'Retail & Sales', sales: 'Retail & Sales', ecommerce: 'Retail & Sales',
          education: 'Teaching & Education', training: 'Teaching & Education',
          construction: 'Property & Construction', property: 'Property & Construction', 'real estate': 'Property & Construction',
          manufacturing: 'Engineering & Manufacturing', engineering: 'Engineering & Manufacturing',
          marketing: 'Marketing, Advertising & PR', advertising: 'Marketing, Advertising & PR', pr: 'Marketing, Advertising & PR',
          media: 'Media & Internet', publishing: 'Media & Internet',
          legal: 'Law & Legal Services', law: 'Law & Legal Services',
          energy: 'Energy & Utilities', utilities: 'Energy & Utilities',
          transport: 'Transport & Logistics', logistics: 'Transport & Logistics',
          charity: 'Charity & Voluntary Work', nonprofit: 'Charity & Voluntary Work',
          consulting: 'Business, Consulting & Management', management: 'Business, Consulting & Management',
          recruitment: 'Recruitment & HR', hr: 'Recruitment & HR',
          science: 'Science & Pharmaceuticals', pharma: 'Science & Pharmaceuticals',
          creative: 'Creative Arts & Design', design: 'Creative Arts & Design',
          agriculture: 'Environment & Agriculture', environment: 'Environment & Agriculture',
          government: 'Public Services & Administration', 'public sector': 'Public Services & Administration',
        }
        return map[lower] || 'Other'
      }

      // Map AI-extracted size to dropdown option
      const matchSize = (raw: string | null): string => {
        if (!raw) return ''
        const num = parseInt(raw.replace(/[^0-9]/g, ''), 10)
        if (raw.includes('1000+') || num >= 1000) return '1000+ employees'
        if (num >= 501) return '501-1000 employees'
        if (num >= 201) return '201-500 employees'
        if (num >= 51) return '51-200 employees'
        if (num >= 11) return '11-50 employees'
        if (num >= 1) return '1-10 employees'
        // Try matching the raw string directly
        const match = COMPANY_SIZE_OPTIONS.find(opt => raw.includes(opt.split(' ')[0]))
        return match || ''
      }

      // Only overwrite fields that are currently empty. NOTE: the logo is
      // intentionally NOT auto-filled from the import — a scraped logo is a
      // hotlinked favicon/og:image on the third party's server, so it's low
      // quality and can silently break if they remove/block it. The logo is
      // upload-only (no logo → the initials placeholder).
      setFormData(prev => ({
        ...prev,
        companyName: prev.companyName || d.companyName || prev.companyName,
        description: prev.description || d.description || prev.description,
        city: prev.city || d.location || prev.city,
        website: prev.website || d.website || prev.website,
        industry: prev.industry || matchIndustry(d.industry) || prev.industry,
        companySize: prev.companySize || matchSize(d.companySize) || prev.companySize,
      }))
      setIsDirty(true)
      setMessage({ type: 'success', text: 'Profile imported — review and save your details' })
      setErrorField(null)
    } catch {
      setMessage({ type: 'error', text: "Couldn't import from that URL — please fill in manually" })
      setErrorField(null)
    }
    setScraping(false)
  }

  useEffect(() => {
    const loadCompanyData = async () => {
      if (DEV_MODE) {
        const type = getMockUserType()
        if (!type || type !== 'employer') {
          router.push('/login/employer')
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
        router.push('/login/employer')
        return
      }

      if (!session) {
        router.push(employerLoginPath())
        return
      }

      // Check user role
      const userRole = session.user.user_metadata?.role
      if (userRole !== 'employer') {
        router.push('/login/employer')
        return
      }

      // Multi-user: editing the company profile is owner/edit_company only. A
      // team member without it is bounced to Settings (RLS also blocks the write).
      const caps = await getEmployerCapabilities(supabase)
      if (!caps.edit_company) {
        router.push('/settings')
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

  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (isDirty) {
        e.preventDefault()
        e.returnValue = ''
      }
    }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [isDirty])

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target
    setFormData(prev => ({ ...prev, [name]: value }))
    setIsDirty(true)
    setMessage(null)
    setErrorField(null)
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
    setIsDirty(true)
  }

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    setLogoUploading(true)
    setLogoUploadError('')

    try {
      // THE LOGO IS A FILE, NOT A STRING.
      //
      // This used to draw the image onto a canvas and keep canvas.toDataURL() —
      // roughly 34KB of base64 — which was then stored in the database AND
      // written into user_metadata, where it rode inside the auth cookie on
      // every request until Vercel refused them. It was the one image in the
      // product that never went to Storage.
      //
      // Same endpoint as banners and temp posts now, with the same 200x200
      // contain-on-white geometry the canvas produced, so existing logos look
      // identical and only where they live has changed.
      const fd = new FormData()
      fd.append('image', file)
      fd.append('bucket', 'company-logos')
      // Requires edit_company at the route now, so the session has to go with it.
      const { data: { session } } = await supabase.auth.getSession()
      const res = await fetch('/api/upload-image', {
        method: 'POST',
        headers: session ? { Authorization: `Bearer ${session.access_token}` } : undefined,
        body: fd,
      })
      const json = await res.json()
      if (!res.ok) {
        setLogoUploadError(json.error || 'Failed to upload logo.')
        return
      }
      if (!json.storedToBucket) {
        // The route falls back to a base64 data URL when Storage is unavailable.
        // For a banner that is a reasonable degradation; for the logo it is the
        // exact failure we just fixed, so refuse it rather than quietly
        // reintroducing a 34KB string.
        setLogoUploadError('Could not reach image storage. Please try again in a moment.')
        return
      }

      setFormData(prev => ({ ...prev, logoUrl: json.url }))
      setLogoFileName(file.name)
      setIsDirty(true)
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
    setErrorField(null)

    // Validation
    // The banner here already carries role="alert" and aria-live, which is more
    // than most of the platform — what it lacked was any movement. Measured on
    // production before this: the banner rendered at top = -946px, 946 pixels
    // above the window, with focus left on body. Focusing the field the message
    // is about is what brings the page to it.
    if (!formData.companyName.trim()) {
      setMessage({ type: 'error', text: 'Company name is required' })
      setErrorField('companyName')
      focusField('companyName')
      setSaving(false)
      return
    }

    if (!formData.email.trim()) {
      setMessage({ type: 'error', text: 'Email address is required' })
      setErrorField('email')
      focusField('email')
      setSaving(false)
      return
    }

    if (formData.website.trim()) {
      try {
        new URL(formData.website.trim())
      } catch {
        setMessage({ type: 'error', text: 'Please enter a valid website URL (e.g. https://www.yourcompany.com)' })
        setErrorField('website')
        focusField('website')
        setSaving(false)
        return
      }
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
        setErrorField(null)
        setIsDirty(false)
        window.scrollTo({ top: 0, behavior: 'smooth' })
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

        // Company name only. The LOGO MUST NOT GO IN HERE.
        //
        // user_metadata is embedded in the JWT, and the JWT is the auth cookie
        // sent on every single request. handleLogoUpload produces a base64 data
        // URL — around 34KB for a 200x200 PNG — so writing it here grew one
        // employer's cookie to roughly 46KB across fifteen chunks and Vercel
        // rejected her requests at the edge with REQUEST_HEADER_TOO_LARGE. She
        // could not use the product at all, and nothing reached our logs because
        // nothing reached our code.
        //
        // The Header now reads employer_profiles.logo_url instead, which is
        // where the logo already was.
        await supabase.auth.updateUser({
          data: { company_name: formData.companyName },
        })

        setMessage({ type: 'success', text: 'Company profile saved successfully!' })
        setErrorField(null)
        setIsDirty(false)
        window.scrollTo({ top: 0, behavior: 'smooth' })
      }
    } catch (error: any) {
      console.error('Error saving profile:', error)
      setMessage({ type: 'error', text: error.message || 'Failed to save company profile' })
      setErrorField(null)
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
        <button className={styles.backBtn} onClick={() => router.push('/settings')}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6" /></svg>
          Back to Settings
        </button>
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
          {/* Import from website */}
          <div className={styles.section}>
            <h2 className={styles.sectionTitle}>Import from website</h2>
            <p style={{ fontSize: '0.85rem', color: '#64748b', margin: '0 0 0.75rem' }}>
              Paste your company website and we&apos;ll auto-fill your profile.
            </p>
            <div className={styles.scrapeRow}>
              <input
                type="text"
                value={scrapeUrl}
                onChange={e => setScrapeUrl(e.target.value)}
                onBlur={e => {
                  const v = e.target.value.trim()
                  if (v && !v.match(/^https?:\/\//i)) setScrapeUrl('https://' + v)
                }}
                placeholder="https://yourcompany.com"
                className={`${styles.input} ${styles.scrapeInput}`}
                disabled={scraping}
              />
              <button
                type="button"
                onClick={handleScrape}
                disabled={scraping || !scrapeUrl.trim()}
                className={`${styles.saveBtn} ${styles.scrapeBtn}`}
              >
                {scraping ? 'Importing…' : 'Auto-fill'}
              </button>
            </div>
          </div>

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
                    onClick={() => { setFormData(prev => ({ ...prev, logoUrl: '' })); setLogoFileName(''); setIsDirty(true) }}
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
                /* NO NATIVE `required`. It masked the app's own validation
                   entirely: the browser blocked the submit, focused this field
                   itself and showed "Please fill out this field." in a bubble
                   that is not a DOM node, so handleSubmit never ran and the
                   banner, the FieldError and the focusField call below it were
                   all unreachable. Measured 8 Aug: focus moved, zero message
                   nodes, and "Company name is required" nowhere on the page.
                   aria-required stays — assistive tech is still told. Same
                   choice as post-job, which carries its own comment saying the
                   browser does not validate these fields. */
                aria-required="true"
                autoComplete="organization"
              />
              <FieldError activeField={errorField} name="companyName" message={message?.type === 'error' ? message.text : null} />
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
                type="text"
                id="website"
                name="website"
                value={formData.website}
                onChange={handleChange}
                onBlur={e => {
                  const v = e.target.value.trim()
                  if (v && !v.match(/^https?:\/\//i)) {
                    setFormData(prev => ({ ...prev, website: 'https://' + v }))
                  }
                }}
                className={styles.input}
                placeholder="https://www.yourcompany.com"
                autoComplete="url"
              />
              <FieldError activeField={errorField} name="website" message={message?.type === 'error' ? message.text : null} />
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
                  /* Same mask as companyName above, same fix. `required` goes,
                     type="email" STAYS — a blank value is valid for an unrequired
                     email input, so the app's blank check now runs, while the
                     browser still rejects a MALFORMED address. That is why this
                     is two attribute deletions rather than noValidate on the
                     form: noValidate would have taken the format check with it,
                     and nothing in handleSubmit replaces it — it only tests
                     .trim(). */
                  aria-required="true"
                  autoComplete="email"
                />
                <FieldError activeField={errorField} name="email" message={message?.type === 'error' ? message.text : null} />
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

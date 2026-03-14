'use client'

import { useState, useEffect, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import dynamic from 'next/dynamic'
import Header from '@/components/Header'
import PostcodeLookup, { type AddressData } from '@/components/PostcodeLookup'
import { supabase } from '@/lib/supabase'
import { useJobs } from '@/lib/JobsContext'
import { getTagsByCategory, TAG_CATEGORIES, getTagCategory, type TagCategory } from '@/lib/jobTags'
import { categories } from '@/lib/categories'
import styles from './page.module.css'

const RichTextEditor = dynamic(() => import('@/components/RichTextEditor'), { ssr: false })

const defaultImages = [
  'https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?w=1200&h=627&fit=crop',
  'https://images.unsplash.com/photo-1552566626-52f8b828add9?w=1200&h=627&fit=crop',
  'https://images.unsplash.com/photo-1414235077428-338989a2e8c0?w=1200&h=627&fit=crop',
  'https://images.unsplash.com/photo-1566073771259-6a8506099945?w=1200&h=627&fit=crop',
]

function PostJobContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { jobs, addJob, updateJob, getJobById } = useJobs()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)
  const [checkingAuth, setCheckingAuth] = useState(true)
  const [logoError, setLogoError] = useState('')
  const [logoSuccess, setLogoSuccess] = useState(false)
  const [logoUploading, setLogoUploading] = useState(false)
  const [logoUploadError, setLogoUploadError] = useState('')
  const [logoFileName, setLogoFileName] = useState('')
  const [bannerUploading, setBannerUploading] = useState(false)
  const [bannerUploadError, setBannerUploadError] = useState('')
  const [bannerFileName, setBannerFileName] = useState('')

  const [showPreview, setShowPreview] = useState(false)
  const [enhancing, setEnhancing] = useState(false)
  const [enhanceError, setEnhanceError] = useState('')
  const [showUndo, setShowUndo] = useState(false)
  // Guided description fields
  const [guidedFields, setGuidedFields] = useState({
    whatIsJob: '',
    dayToDay: '',
    experienceNeeded: '',
    whatWeOffer: '',
  })
  // 'guided' = show four fields, 'editor' = show Tiptap editor
  const [descView, setDescView] = useState<'guided' | 'editor'>('guided')
  type UndoState =
    | { source: 'guided'; fields: typeof guidedFields }
    | { source: 'editor'; description: string }
  const [undoState, setUndoState] = useState<UndoState | null>(null)

  const [formData, setFormData] = useState({
    company: '',
    companyWebsite: '',
    companyLogo: '',
    companyBanner: '',
    title: '',
    category: '',
    employmentType: 'Full-time' as 'Full-time' | 'Part-time' | 'Flexible',
    contractType: 'Permanent' as 'Permanent' | 'Temporary' | 'Fixed-term',
    workLocationType: 'In person' as 'In person' | 'Remote' | 'Hybrid',
    salaryMin: '',
    salaryMax: '',
    salaryPeriod: 'hour' as 'hour' | 'year',
    location: '',
    area: '',
    postcode: '',
    city: '',
    description: '',
    // Additional Information fields
    shiftSchedule: '',
    experienceRequired: '',
    jobReference: '',
    expiresAt: '',
    tags: new Set<string>(),
  })

  const [isEmployer, setIsEmployer] = useState(false)
  const [hasSubscription, setHasSubscription] = useState(false)
  const [currentUser, setCurrentUser] = useState<{ id: string; companyName: string } | null>(null)
  // Edit mode state
  const [isEditMode, setIsEditMode] = useState(false)
  const [editJobId, setEditJobId] = useState<string | null>(null)
  const [loadingJobData, setLoadingJobData] = useState(false)

  useEffect(() => {
    const checkAuth = async () => {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) {
        router.push('/login')
        return
      }

      const userRole = session.user.user_metadata?.role
      if (userRole !== 'employer') {
        setIsEmployer(false)
        setCheckingAuth(false)
        return
      }

      setIsEmployer(true)

      const companyName = session.user.user_metadata?.company_name || 'Your Company'
      const employerId = session.user.id
      setCurrentUser({
        id: employerId,
        companyName
      })

      // Check subscription status from employer_subscriptions table
      const { data: subData } = await supabase
        .from('employer_subscriptions')
        .select('subscription_status')
        .eq('user_id', session.user.id)
        .single()

      if (subData && (subData.subscription_status === 'active' || subData.subscription_status === 'trialing')) {
        setHasSubscription(true)
      } else {
        setHasSubscription(false)
      }

      setCheckingAuth(false)
    }
    checkAuth()
  }, [router, jobs])

  // Check for edit mode and load job data
  useEffect(() => {
    const editId = searchParams.get('edit')
    if (editId && jobs.length > 0) {
      setIsEditMode(true)
      setEditJobId(editId)
      setLoadingJobData(true)
      const jobToEdit = getJobById(editId)
      if (jobToEdit) {
        // Determine employment type from array
        const employmentType = Array.isArray(jobToEdit.employmentType) && jobToEdit.employmentType.length > 0
          ? jobToEdit.employmentType[0]
          : 'Full-time'

        // Build tags set from tags array
        const tags = new Set<string>(jobToEdit.tags || [])
        if (jobToEdit.noExperience && !tags.has('No experience required')) tags.add('No experience required')
        if (jobToEdit.urgent && !tags.has('Interviews this week') && !tags.has('Urgent hire')) tags.add('Urgent hire')

        // Build single description from all available fields
        let combinedDescription = jobToEdit.fullDescription || jobToEdit.description || ''
        const oldResponsibilities = Array.isArray(jobToEdit.responsibilities) && jobToEdit.responsibilities.length > 0
          ? jobToEdit.responsibilities : []
        const oldRequirements = Array.isArray(jobToEdit.requirements) && jobToEdit.requirements.length > 0
          ? jobToEdit.requirements : []
        const oldSkills = Array.isArray(jobToEdit.skillsRequired) && jobToEdit.skillsRequired.length > 0
          ? jobToEdit.skillsRequired : []
        const oldBenefits = Array.isArray(jobToEdit.benefits) && jobToEdit.benefits.length > 0
          ? jobToEdit.benefits : []
        if (oldResponsibilities.length > 0) {
          combinedDescription += '\n\nResponsibilities:\n' + oldResponsibilities.join('\n')
        }
        if (oldRequirements.length > 0) {
          combinedDescription += '\n\nRequirements:\n' + oldRequirements.join('\n')
        }
        if (oldSkills.length > 0) {
          combinedDescription += '\n\nSkills Required:\n' + oldSkills.join('\n')
        }
        if (oldBenefits.length > 0) {
          combinedDescription += '\n\nBenefits:\n' + oldBenefits.join('\n')
        }

        // Determine contract type from employmentType array
        const contractTypes = ['Permanent', 'Temporary', 'Fixed-term']
        const foundContract = (jobToEdit.employmentType || []).find((t: string) => contractTypes.includes(t))

        setFormData({
          company: jobToEdit.company || '',
          companyWebsite: jobToEdit.companyWebsite || '',
          companyLogo: jobToEdit.companyLogo || '',
          companyBanner: jobToEdit.companyBanner || '',
          title: jobToEdit.title || '',
          category: jobToEdit.category || '',
          employmentType: employmentType as 'Full-time' | 'Part-time' | 'Flexible',
          contractType: (foundContract || 'Permanent') as 'Permanent' | 'Temporary' | 'Fixed-term',
          workLocationType: (jobToEdit.workLocationType || 'In person') as 'In person' | 'Remote' | 'Hybrid',
          salaryMin: jobToEdit.salaryMin?.toString() || '',
          salaryMax: jobToEdit.salaryMax?.toString() || '',
          salaryPeriod: jobToEdit.salaryPeriod || 'hour',
          location: jobToEdit.location || '',
          area: jobToEdit.area || '',
          postcode: jobToEdit.fullLocation?.postcode || '',
          city: jobToEdit.fullLocation?.city || '',
          description: combinedDescription,
          shiftSchedule: jobToEdit.shiftSchedule || '',
          experienceRequired: jobToEdit.experienceRequired || '',
          jobReference: jobToEdit.jobReference || '',
          expiresAt: jobToEdit.expiresDate || '',
          tags,
        })

        // Set logo success if there's a logo
        if (jobToEdit.companyLogo && !jobToEdit.companyLogo.includes('unsplash.com')) {
          setLogoSuccess(true)
        }
      } else {
        console.error('[PostJob] Job not found for editing:', editId)
        setError('Job not found. It may have been deleted.')
      }

      setLoadingJobData(false)
      // Go straight to editor view when loading an existing job description
      setDescView('editor')
    }
  }, [searchParams, jobs, getJobById])

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>
  ) => {
    const { name, value } = e.target
    setFormData(prev => ({ ...prev, [name]: value }))
  }

  const handlePostcodeFound = (address: AddressData) => {
    setFormData(prev => ({
      ...prev,
      area: `${address.city} ${address.postcode}`.trim(),
      postcode: address.postcode,
      city: address.city,
      location: prev.location || address.city,
    }))
  }

  const handleTagChange = (tagLabel: string) => {
    setFormData(prev => {
      const newTags = new Set(prev.tags)
      if (newTags.has(tagLabel)) {
        newTags.delete(tagLabel)
      } else {
        newTags.add(tagLabel)
      }
      return { ...prev, tags: newTags }
    })
  }

  const tagsByCategory = getTagsByCategory()

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    setLogoUploading(true)
    setLogoUploadError('')
    setLogoError('')
    setLogoSuccess(false)

    try {
      // Resize to 200x200 square on client before storing
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => {
          const img = new window.Image()
          img.onload = () => {
            const canvas = document.createElement('canvas')
            canvas.width = 200
            canvas.height = 200
            const ctx = canvas.getContext('2d')!
            // Draw white background for transparent PNGs
            ctx.fillStyle = '#ffffff'
            ctx.fillRect(0, 0, 200, 200)
            // Fit image inside 200x200 (contain)
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

      setFormData(prev => ({ ...prev, companyLogo: dataUrl }))
      setLogoFileName(file.name)
      setLogoSuccess(true)
    } catch {
      setLogoUploadError('Failed to process logo image.')
    } finally {
      setLogoUploading(false)
      e.target.value = ''
    }
  }

  const handleBannerUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    setBannerUploading(true)
    setBannerUploadError('')

    try {
      const uploadFormData = new FormData()
      uploadFormData.append('image', file)

      const response = await fetch('/api/upload-image', {
        method: 'POST',
        body: uploadFormData,
      })

      const result = await response.json()

      if (!response.ok) {
        setBannerUploadError(result.error || 'Upload failed')
        return
      }

      setFormData(prev => ({ ...prev, companyBanner: result.dataUrl }))
      setBannerFileName(file.name)
    } catch {
      setBannerUploadError('Failed to upload image. Please try again.')
    } finally {
      setBannerUploading(false)
      e.target.value = ''
    }
  }

  // Strip HTML tags and decode basic entities to plain text for the AI
  const htmlToPlainText = (html: string) =>
    html
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/p>/gi, '\n')
      .replace(/<\/li>/gi, '\n')
      .replace(/<[^>]+>/g, '')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/\n{3,}/g, '\n\n')
      .trim()

  // Robust empty check for Tiptap HTML (handles <p></p>, <p><br></p>, whitespace-only)
  const descriptionHasContent = (html: string) =>
    html ? htmlToPlainText(html).length > 0 : false

  const handleEnhanceDescription = async () => {
    setEnhancing(true)
    setEnhanceError('')
    setShowUndo(false)

    // Build the description text to send — from guided fields or existing editor content
    const descriptionText = descView === 'guided'
      ? [
          guidedFields.whatIsJob ? `What is the job: ${guidedFields.whatIsJob}` : '',
          guidedFields.dayToDay ? `Day to day: ${guidedFields.dayToDay}` : '',
          guidedFields.experienceNeeded ? `Experience needed: ${guidedFields.experienceNeeded}` : '',
          guidedFields.whatWeOffer ? `What we offer: ${guidedFields.whatWeOffer}` : '',
        ].filter(Boolean).join('\n')
      : htmlToPlainText(formData.description)

    // Store undo snapshot
    const snap: UndoState = descView === 'guided'
      ? { source: 'guided', fields: { ...guidedFields } }
      : { source: 'editor', description: formData.description }

    try {
      const res = await fetch('/api/ai-assist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'job-ad-enhance',
          data: {
            title: formData.title,
            category: formData.category,
            location: formData.location,
            salaryMin: formData.salaryMin,
            salaryMax: formData.salaryMax,
            salaryPeriod: formData.salaryPeriod,
            employmentType: formData.employmentType,
            workLocationType: formData.workLocationType,
            description: descriptionText,
          },
        }),
      })
      const json = await res.json()
      if (!res.ok || json.error) {
        setEnhanceError(json.error || 'Enhancement failed. Please try again.')
        return
      }
      const enhanced = json.jobAd?.description
      if (enhanced) {
        const htmlOut = /^<(p|ul|ol|h[1-6]|div)/i.test(enhanced.trimStart())
          ? enhanced
          : `<p>${enhanced}</p>`
        setFormData(prev => ({ ...prev, description: htmlOut }))
        setUndoState(snap)
        setDescView('editor')
        setShowUndo(true)
        setTimeout(() => setShowUndo(false), 10000)
      }
    } catch {
      setEnhanceError('Failed to connect to AI service.')
    } finally {
      setEnhancing(false)
    }
  }

  const handleUndo = () => {
    if (!undoState) return
    if (undoState.source === 'guided') {
      setGuidedFields(undoState.fields)
      setFormData(prev => ({ ...prev, description: '' }))
      setDescView('guided')
    } else {
      setFormData(prev => ({ ...prev, description: undoState.description }))
      setDescView('editor')
    }
    setUndoState(null)
    setShowUndo(false)
  }

  const guidedHasContent = Object.values(guidedFields).some(v => v.trim().length > 0)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    // Validation
    if (!formData.company || !formData.title || !formData.category || !formData.location) {
      setError('Please fill in all required fields')
      setLoading(false)
      return
    }

    if (!formData.salaryMin || !formData.salaryMax) {
      setError('Please enter a salary range')
      setLoading(false)
      return
    }

    try {
      // Build tags array from Set
      const tags: string[] = Array.from(formData.tags)

      // Logo: use provided or empty (CompanyLogo component handles fallback)
      const companyLogo = formData.companyLogo || ''
      // Banner: use provided or empty (detail panel hides if empty)
      const companyBanner = formData.companyBanner || ''

      // Auto-generate short description from first 150 characters (strip HTML tags)
      const plainText = formData.description.replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').replace(/\n+/g, ' ').trim()
      const shortDescription = plainText.slice(0, 150) + (plainText.length > 150 ? '...' : '')

      // Build employment type array: e.g. ["Full-time", "Permanent"]
      const employmentType: string[] = [formData.employmentType]
      if (formData.contractType) {
        employmentType.push(formData.contractType)
      }

      const jobReference = formData.jobReference || `JOB-${Date.now().toString(36).toUpperCase()}`
      const employerId = currentUser?.id || 'unknown'

      const descriptionFallback = `Join ${formData.company} as a ${formData.title}. Apply now on Hex.`

      const jobPayload = {
        company: formData.company,
        companyLogo,
        companyWebsite: formData.companyWebsite || '',
        employerId,
        companyBanner,
        title: formData.title,
        jobReference,
        salaryMin: parseInt(formData.salaryMin),
        salaryMax: parseInt(formData.salaryMax),
        salaryPeriod: formData.salaryPeriod,
        employmentType: employmentType as ('Full-time' | 'Part-time' | 'Permanent' | 'Contract' | 'Temporary' | 'Flexible')[],
        location: formData.location,
        area: formData.area || 'London',
        fullLocation: {
          addressLine1: formData.location,
          city: formData.city || formData.area?.split(' ')[0] || 'London',
          postcode: formData.postcode || '',
        },
        description: shortDescription || descriptionFallback,
        fullDescription: formData.description || descriptionFallback,
        tags,
        urgent: formData.tags.has('Urgent hire') || formData.tags.has('Immediate start') || formData.tags.has('Interviews this week'),
        noExperience: formData.tags.has('No experience required'),
        category: formData.category,
        shiftSchedule: formData.shiftSchedule || '',
        experienceRequired: formData.experienceRequired || '',
        requirements: [],
        benefits: [],
        responsibilities: [],
        skillsRequired: [],
        workAuthorization: ['UK work authorization required'],
        workLocationType: formData.workLocationType,
        postedDate: new Date().toISOString().split('T')[0],
        expiresDate: formData.expiresAt || undefined,
        viewCount: 0,
        applicationCount: 0,
        status: 'active' as const,
      }

      let newJob: any = null
      if (isEditMode && editJobId) {
        await updateJob(editJobId, jobPayload)
      } else {
        newJob = await addJob(jobPayload, employerId)
      }

      // Trigger job alert matching for new jobs (non-blocking)
      if (!isEditMode && newJob?.id) {
        fetch('/api/job-alerts/match', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ jobId: newJob.id }),
        }).catch(err => {
          console.error('[PostJob] Alert matching failed (non-blocking):', err)
        })
      }

      setSuccess(true)

      // Redirect after short delay
      setTimeout(() => {
        router.push('/my-jobs')
      }, 1500)

    } catch (err: any) {
      setError(err.message || 'Something went wrong')
    } finally {
      setLoading(false)
    }
  }

  if (checkingAuth) {
    return (
      <main>
        <Header />
        <div className={styles.container}>
          <p>Loading...</p>
        </div>
      </main>
    )
  }

  if (!isEmployer) {
    return (
      <main>
        <Header />
        <div className={styles.container}>
          <div className={styles.formCard} style={{ textAlign: 'center', padding: '3rem' }}>
            <div style={{ fontSize: '4rem', marginBottom: '1rem' }}>🔒</div>
            <h2 style={{ marginBottom: '1rem' }}>Employer Account Required</h2>
            <p style={{ color: '#666', marginBottom: '2rem' }}>
              You need an employer subscription to post jobs on Hex.
            </p>
            <a href="/subscribe" className="btn btn-primary">
              Start Free 14-Day Trial
            </a>
          </div>
        </div>
      </main>
    )
  }

  if (!hasSubscription) {
    router.push('/dashboard/subscription')
    return (
      <main>
        <Header />
        <div className={styles.container}>
          <p>Redirecting...</p>
        </div>
      </main>
    )
  }

  return (
    <main>
      <Header />

      <div className={styles.hero}>
        <h1 className={styles.heroTitle}>{isEditMode ? 'Edit Job' : 'Post a Job'}</h1>
        <p className={styles.heroSubtitle}>
          {isEditMode
            ? 'Update your job listing details'
            : 'Reach thousands of professionals across the UK'}
        </p>
      </div>

      {/* Form */}
      <div className={styles.container}>
        <form className={styles.formCard} onSubmit={handleSubmit}>
          {error && <div className={styles.error}>{error}</div>}
          {success && (
            <div className={styles.success}>
              <span>✓</span> {isEditMode ? 'Job updated successfully! Redirecting...' : 'Job posted successfully! Redirecting to jobs page...'}
            </div>
          )}
          {loadingJobData && (
            <div className={styles.loading}>
              Loading job data...
            </div>
          )}

          {/* Company Information */}
          <div className={styles.section}>
            <div className={styles.sectionHeader}>
              <h2 className={styles.sectionTitle}>
                <span className={styles.sectionIcon}>🏢</span>
                Company Information
              </h2>
            </div>

            <div className={styles.formGroup}>
              <label className={styles.label} htmlFor="company">
                Company Name <span className={styles.required}>*</span>
              </label>
              <input
                type="text"
                id="company"
                name="company"
                value={formData.company}
                onChange={handleChange}
                placeholder="e.g., The Ivy Collection"
                className={styles.input}
                autoComplete="organization"
                required
              />
            </div>

            <div className={styles.formGroup}>
              <label className={styles.label} htmlFor="companyWebsite">Company Website</label>
              <input
                type="text"
                id="companyWebsite"
                name="companyWebsite"
                value={formData.companyWebsite}
                onChange={handleChange}
                placeholder="e.g., marriott.com or https://marriott.com"
                className={styles.input}
                autoComplete="url"
              />
              <p className={styles.helperText}>
                Your company website will be shown as a clickable link on the job listing.
              </p>
            </div>

            {/* Logo Upload */}
            <div className={styles.formGroup}>
              <label className={styles.label}>
                Upload Company Logo
                {logoSuccess && <span className={styles.autoFilledBadge}>Auto-filled</span>}
              </label>
              <p className={styles.helperText} style={{ marginBottom: '0.5rem' }}>
                Upload your company logo (PNG or JPG, recommended 200x200px, square format). This will appear on job listings.
              </p>
              <div className={styles.uploadArea}>
                <input
                  type="file"
                  id="logoUpload"
                  accept="image/jpeg,image/png,image/webp,image/gif"
                  onChange={handleLogoUpload}
                  disabled={logoUploading}
                  className={styles.fileInput}
                />
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
              </div>
              {logoFileName && !logoUploadError && (
                <p className={styles.logoSuccess}>Uploaded: {logoFileName}</p>
              )}
              {logoUploadError && (
                <p className={styles.uploadError}>{logoUploadError}</p>
              )}
            </div>

            <div className={styles.logoDivider}>
              <span>or</span>
            </div>

            <div className={styles.formGroup}>
              <label className={styles.label} htmlFor="companyLogo">
                Company Logo URL
              </label>
              <input
                type="url"
                id="companyLogo"
                name="companyLogo"
                value={formData.companyLogo}
                onChange={handleChange}
                placeholder="https://example.com/logo.png"
                className={styles.input}
                autoComplete="off"
              />
              <p className={styles.helperText}>
                Leave blank to use a letter placeholder on job cards.
              </p>
            </div>

            {/* Square Logo Preview */}
            {formData.companyLogo && (
              <div className={styles.logoPreviewContainer}>
                <div className={styles.logoPreview} style={{ width: '80px', height: '80px', borderRadius: '8px', overflow: 'hidden', background: '#f3f4f6', border: '1px solid #e5e7eb' }}>
                  <img
                    src={formData.companyLogo}
                    alt="Company logo preview"
                    className={styles.logoPreviewImage}
                    style={{ width: '100%', height: '100%', objectFit: 'contain' }}
                    onError={(e) => {
                      (e.target as HTMLImageElement).style.display = 'none'
                      setLogoError('Preview unavailable. A letter placeholder will be used instead.')
                    }}
                    onLoad={(e) => {
                      (e.target as HTMLImageElement).style.display = 'block'
                    }}
                  />
                </div>
                <div className={styles.logoPreviewActions}>
                  <button
                    type="button"
                    onClick={() => { setFormData(prev => ({ ...prev, companyLogo: '' })); setLogoSuccess(false); setLogoFileName('') }}
                    className={styles.clearLogoBtn}
                  >
                    ✕ Remove Logo
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Job Banner Image */}
          <div className={styles.section}>
            <h2 className={styles.sectionTitle}>
              <span className={styles.sectionIcon}>🖼️</span>
              Job Banner Image
            </h2>
            <p className={styles.helperText} style={{ marginBottom: '0.75rem' }}>
              Landscape image shown at the top of the job detail view. Optional — if not provided, no banner is displayed.
            </p>

            <div className={styles.formGroup}>
              <div className={styles.uploadArea}>
                <input
                  type="file"
                  id="bannerUpload"
                  accept="image/jpeg,image/png,image/webp,image/gif"
                  onChange={handleBannerUpload}
                  disabled={bannerUploading}
                  className={styles.fileInput}
                />
                <label htmlFor="bannerUpload" className={styles.uploadLabel}>
                  {bannerUploading ? (
                    <span>Processing image...</span>
                  ) : (
                    <>
                      <span className={styles.uploadIcon}>📁</span>
                      <span>Choose a banner image</span>
                      <span className={styles.uploadHint}>JPEG, PNG, WebP or GIF — recommended 1200x627px (1.91:1 landscape)</span>
                    </>
                  )}
                </label>
              </div>
              {bannerFileName && !bannerUploadError && (
                <p className={styles.logoSuccess}>Uploaded: {bannerFileName}</p>
              )}
              {bannerUploadError && (
                <p className={styles.uploadError}>{bannerUploadError}</p>
              )}
            </div>

            {formData.companyBanner && (
              <div className={styles.logoPreviewContainer}>
                <div className={styles.logoPreview} style={{ width: '100%', maxWidth: '400px', aspectRatio: '1.91 / 1' }}>
                  <img
                    src={formData.companyBanner}
                    alt="Banner preview"
                    className={styles.logoPreviewImage}
                    style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                  />
                </div>
                <div className={styles.logoPreviewActions}>
                  <button
                    type="button"
                    onClick={() => { setFormData(prev => ({ ...prev, companyBanner: '' })); setBannerFileName('') }}
                    className={styles.clearLogoBtn}
                  >
                    ✕ Remove Banner
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Job Details */}
          <div className={styles.section}>
            <h2 className={styles.sectionTitle}>
              <span className={styles.sectionIcon}>💼</span>
              Job Details
            </h2>

            <div className={styles.formGroup}>
              <label className={styles.label} htmlFor="title">
                Job Title <span className={styles.required}>*</span>
              </label>
              <input
                type="text"
                id="title"
                name="title"
                value={formData.title}
                onChange={handleChange}
                placeholder="e.g., Waiter / Waitress, Kitchen Porter, Head Chef"
                className={styles.input}
                autoComplete="off"
                required
              />
            </div>

            <div className={styles.formRow}>
              <div className={styles.formGroup}>
                <label className={styles.label} htmlFor="category">
                  Category <span className={styles.required}>*</span>
                </label>
                <select
                  id="category"
                  name="category"
                  value={formData.category}
                  onChange={handleChange}
                  className={styles.select}
                  required
                >
                  <option value="">Select a category</option>
                  {categories.map(cat => (
                    <option key={cat.id} value={cat.id}>
                      {cat.label}
                    </option>
                  ))}
                </select>
              </div>

              <div className={styles.formGroup}>
                <label className={styles.label} htmlFor="location">
                  Location <span className={styles.required}>*</span>
                </label>
                <input
                  type="text"
                  id="location"
                  name="location"
                  value={formData.location}
                  onChange={handleChange}
                  placeholder="e.g. London, Manchester, Edinburgh"
                  className={styles.input}
                  autoComplete="off"
                  required
                />
              </div>
            </div>

            <div className={styles.formGroup}>
              <label className={styles.label}>Area / Postcode</label>
              <PostcodeLookup
                onAddressFound={handlePostcodeFound}
                initialPostcode={formData.postcode}
              />
              {formData.area && (
                <p style={{ fontSize: '0.85rem', color: '#22c55e', marginTop: '0.375rem', fontWeight: 500 }}>
                  Area set to: {formData.area}
                </p>
              )}
            </div>

            <div className={styles.formRow}>
              <div className={styles.formGroup}>
                <label className={styles.label} htmlFor="employmentType">Employment Type</label>
                <select
                  id="employmentType"
                  name="employmentType"
                  value={formData.employmentType}
                  onChange={handleChange}
                  className={styles.select}
                >
                  <option value="">Select employment type</option>
                  <option value="Full-time">Full-time</option>
                  <option value="Part-time">Part-time</option>
                  <option value="Flexible">Flexible</option>
                </select>
              </div>

              <div className={styles.formGroup}>
                <label className={styles.label} htmlFor="contractType">Contract Type</label>
                <select
                  id="contractType"
                  name="contractType"
                  value={formData.contractType}
                  onChange={handleChange}
                  className={styles.select}
                >
                  <option value="">Select contract type</option>
                  <option value="Permanent">Permanent</option>
                  <option value="Temporary">Temporary</option>
                  <option value="Fixed-term">Fixed-term</option>
                </select>
              </div>
            </div>

            <div className={styles.formGroup}>
              <label className={styles.label} htmlFor="workLocationType">Work Location</label>
              <select
                id="workLocationType"
                name="workLocationType"
                value={formData.workLocationType}
                onChange={handleChange}
                className={styles.select}
              >
                <option value="">Select work location</option>
                <option value="In person">In person</option>
                <option value="Remote">Remote</option>
                <option value="Hybrid">Hybrid</option>
              </select>
            </div>

            <div className={styles.formGroup}>
              <label className={styles.label} htmlFor="salaryMin">
                Salary Range <span className={styles.required}>*</span>
              </label>
              <div className={styles.salaryGroup}>
                <div className={styles.salaryInputs}>
                  <input
                    type="number"
                    id="salaryMin"
                    name="salaryMin"
                    value={formData.salaryMin}
                    onChange={handleChange}
                    placeholder="e.g. 12"
                    className={styles.salaryInput}
                    autoComplete="off"
                    required
                  />
                  <span className={styles.salaryDivider}>to</span>
                  <input
                    type="number"
                    id="salaryMax"
                    name="salaryMax"
                    value={formData.salaryMax}
                    onChange={handleChange}
                    placeholder="e.g. 18"
                    className={styles.salaryInput}
                    autoComplete="off"
                    required
                  />
                </div>
                <select
                  id="salaryPeriod"
                  name="salaryPeriod"
                  value={formData.salaryPeriod}
                  onChange={handleChange}
                  className={`${styles.select} ${styles.salaryPeriodSelect}`}
                >
                  <option value="hour">Per hour (£)</option>
                  <option value="year">Per year (£)</option>
                </select>
              </div>
            </div>
          </div>

          {/* Description */}
          <div className={styles.section}>
            <h2 className={styles.sectionTitle}>
              <span className={styles.sectionIcon}>📄</span>
              Job Description
            </h2>

            {descView === 'guided' ? (
              <div>
                <div className={styles.formGroup}>
                  <label className={styles.label} htmlFor="desc_whatIsJob">
                    What is the job? <span className={styles.required}>*</span>
                  </label>
                  <input
                    type="text"
                    id="desc_whatIsJob"
                    className={styles.input}
                    placeholder="e.g. Head Chef, Senior Developer, Marketing Manager"
                    value={guidedFields.whatIsJob}
                    onChange={e => setGuidedFields(prev => ({ ...prev, whatIsJob: e.target.value }))}
                  />
                </div>

                <div className={styles.formGroup}>
                  <label className={styles.label} htmlFor="desc_dayToDay">
                    What will they be doing day to day?
                  </label>
                  <textarea
                    id="desc_dayToDay"
                    className={styles.textarea}
                    rows={3}
                    placeholder="e.g. Leading the kitchen team, managing suppliers, creating seasonal menus..."
                    value={guidedFields.dayToDay}
                    onChange={e => setGuidedFields(prev => ({ ...prev, dayToDay: e.target.value }))}
                  />
                </div>

                <div className={styles.formGroup}>
                  <label className={styles.label} htmlFor="desc_experienceNeeded">
                    Experience or skills needed?
                  </label>
                  <textarea
                    id="desc_experienceNeeded"
                    className={styles.textarea}
                    rows={3}
                    placeholder="e.g. 3+ years in a similar role, strong leadership skills, food hygiene certificate..."
                    value={guidedFields.experienceNeeded}
                    onChange={e => setGuidedFields(prev => ({ ...prev, experienceNeeded: e.target.value }))}
                  />
                </div>

                <div className={styles.formGroup}>
                  <label className={styles.label} htmlFor="desc_whatWeOffer">
                    What do you offer?
                  </label>
                  <textarea
                    id="desc_whatWeOffer"
                    className={styles.textarea}
                    rows={3}
                    placeholder="e.g. £35,000 salary, 28 days holiday, staff meals, flexible hours, great team..."
                    value={guidedFields.whatWeOffer}
                    onChange={e => setGuidedFields(prev => ({ ...prev, whatWeOffer: e.target.value }))}
                  />
                </div>

                {guidedHasContent && (
                  <div className={styles.enhanceRow}>
                    <button
                      type="button"
                      className={styles.enhanceBtn}
                      onClick={handleEnhanceDescription}
                      disabled={enhancing}
                    >
                      {enhancing ? (
                        <><span className={styles.enhanceSpinner} />Enhancing...</>
                      ) : (
                        <>✨ Enhance with AI</>
                      )}
                    </button>
                  </div>
                )}

                {enhanceError && <p className={styles.enhanceError}>{enhanceError}</p>}

                <button
                  type="button"
                  className={styles.manualEditLink}
                  onClick={() => setDescView('editor')}
                >
                  Edit manually instead
                </button>
              </div>
            ) : (
              <div className={styles.formGroup}>
                <div className={styles.editorViewHeader}>
                  <label className={styles.label}>
                    Job Description <span className={styles.required}>*</span>
                  </label>
                  <div className={styles.editorViewActions}>
                    {showUndo && (
                      <button type="button" className={styles.undoBtn} onClick={handleUndo}>
                        Undo
                      </button>
                    )}
                    {!isEditMode && (
                      <button
                        type="button"
                        className={styles.manualEditLink}
                        onClick={() => { setDescView('guided'); setFormData(prev => ({ ...prev, description: '' })) }}
                      >
                        Back to guided view
                      </button>
                    )}
                  </div>
                </div>
                <RichTextEditor
                  value={formData.description}
                  onChange={(html) => setFormData(prev => ({ ...prev, description: html }))}
                  placeholder="Describe the role, day-to-day responsibilities, the team, and what success looks like in this position..."
                />
                {descriptionHasContent(formData.description) && (
                  <div className={styles.enhanceRow}>
                    <button
                      type="button"
                      className={styles.enhanceBtn}
                      onClick={handleEnhanceDescription}
                      disabled={enhancing}
                    >
                      {enhancing ? (
                        <><span className={styles.enhanceSpinner} />Enhancing...</>
                      ) : (
                        <>✨ Enhance with AI</>
                      )}
                    </button>
                  </div>
                )}
                {enhanceError && <p className={styles.enhanceError}>{enhanceError}</p>}
                <p className={styles.helperText}>
                  A short summary will be auto-generated for job cards from the first 150 characters
                </p>
              </div>
            )}
          </div>

          {/* Requirements & Details */}
          <div className={styles.section}>
            <h2 className={styles.sectionTitle}>
              <span className={styles.sectionIcon}>ℹ️</span>
              Requirements & Details
            </h2>

            <div className={styles.formRow}>
              <div className={styles.formGroup}>
                <label className={styles.label} htmlFor="experienceRequired">Experience Required</label>
                <select
                  id="experienceRequired"
                  name="experienceRequired"
                  value={formData.experienceRequired}
                  onChange={handleChange}
                  className={styles.select}
                >
                  <option value="">Select experience level</option>
                  <option value="No experience needed">No experience needed</option>
                  <option value="Entry level (0-1 years)">Entry level (0-1 years)</option>
                  <option value="1-2 years">1-2 years</option>
                  <option value="2-3 years">2-3 years</option>
                  <option value="3-5 years">3-5 years</option>
                  <option value="5+ years">5+ years</option>
                </select>
              </div>

              <div className={styles.formGroup}>
                <label className={styles.label} htmlFor="shiftSchedule">Shift & Schedule</label>
                <input
                  type="text"
                  id="shiftSchedule"
                  name="shiftSchedule"
                  value={formData.shiftSchedule}
                  onChange={handleChange}
                  placeholder="e.g., Rotating shifts including weekends"
                  className={styles.input}
                  autoComplete="off"
                />
              </div>
            </div>

            <div className={styles.formRow}>
              <div className={styles.formGroup}>
                <label className={styles.label} htmlFor="jobReference">Job Reference</label>
                <input
                  type="text"
                  id="jobReference"
                  name="jobReference"
                  value={formData.jobReference}
                  onChange={handleChange}
                  placeholder="Auto-generated if left blank"
                  className={styles.input}
                  autoComplete="off"
                />
              </div>

              <div className={styles.formGroup}>
                <label className={styles.label} htmlFor="expiresAt">Expiry Date</label>
                <input
                  type="date"
                  id="expiresAt"
                  name="expiresAt"
                  value={formData.expiresAt}
                  onChange={handleChange}
                  className={styles.input}
                />
              </div>
            </div>
          </div>

          {/* Tags */}
          <div className={styles.section}>
            <h2 className={styles.sectionTitle}>
              <span className={styles.sectionIcon}>🏷️</span>
              Job Tags
            </h2>
            <p className={styles.helperText} style={{ marginBottom: '1rem' }}>
              Select tags that apply to this role. These help candidates find your job.
            </p>

            {(Object.keys(TAG_CATEGORIES) as TagCategory[]).map(catKey => (
              <div key={catKey} className={styles.tagCategoryGroup}>
                <h4 className={styles.tagCategoryTitle}>
                  {TAG_CATEGORIES[catKey].icon} {TAG_CATEGORIES[catKey].title}
                </h4>
                <div className={styles.checkboxGroup}>
                  {tagsByCategory[catKey].map(tagDef => (
                    <div key={tagDef.label}>
                      <input
                        type="checkbox"
                        id={`tag-${tagDef.label}`}
                        checked={formData.tags.has(tagDef.label)}
                        onChange={() => handleTagChange(tagDef.label)}
                        className={styles.checkboxInput}
                      />
                      <label htmlFor={`tag-${tagDef.label}`} className={styles.checkboxLabel}>
                        <span className={styles.checkboxBox}></span>
                        {tagDef.label}
                      </label>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>

          {/* Preview Section */}
          {showPreview && (
            <div className={styles.previewSection}>
              <div className={styles.previewSectionHeader}>
                <h2 className={styles.sectionTitle}>
                  <span className={styles.sectionIcon}>👁️</span>
                  Job Preview
                </h2>
                <button
                  type="button"
                  onClick={() => setShowPreview(false)}
                  className={styles.closePreviewBtn}
                >
                  ✕ Close Preview
                </button>
              </div>

              <div className={styles.previewCard}>
                <div className={styles.previewCompanyRow}>
                  {formData.companyLogo && (
                    <img
                      src={formData.companyLogo}
                      alt={formData.company}
                      className={styles.previewLogo}
                      onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }}
                    />
                  )}
                  <div>
                    <h3 className={styles.previewJobTitle}>{formData.title || 'Job Title'}</h3>
                    <p className={styles.previewCompany}>{formData.company || 'Company Name'}</p>
                  </div>
                </div>

                <div className={styles.previewDetails}>
                  <span className={styles.previewDetail}>📍 {formData.location || 'Location'}{formData.area ? `, ${formData.area}` : ''}</span>
                  <span className={styles.previewDetail}>💰 £{formData.salaryMin || '0'} - £{formData.salaryMax || '0'} / {formData.salaryPeriod}</span>
                  <span className={styles.previewDetail}>📋 {formData.employmentType} · {formData.contractType}</span>
                  <span className={styles.previewDetail}>🏢 {formData.workLocationType}</span>
                </div>

                {formData.tags.size > 0 && (
                  <div className={styles.previewTags}>
                    {Array.from(formData.tags).map(tag => {
                      const cat = getTagCategory(tag)
                      const colorClass = cat ? styles[`previewTag_${cat}`] || '' : ''
                      return (
                        <span key={tag} className={`${styles.previewTag} ${colorClass}`}>
                          {tag}
                        </span>
                      )
                    })}
                  </div>
                )}

                {formData.description && (
                  <div className={styles.previewBlock}>
                    <h4>Job Description</h4>
                    <p style={{ whiteSpace: 'pre-line' }}>{formData.description}</p>
                  </div>
                )}

                <div className={styles.previewMeta}>
                  {formData.experienceRequired && <span>Experience: {formData.experienceRequired}</span>}
                  {formData.shiftSchedule && <span>Schedule: {formData.shiftSchedule}</span>}
                  {formData.jobReference && <span>Reference: {formData.jobReference}</span>}
                  {formData.expiresAt && <span>Expires: {formData.expiresAt}</span>}
                  {formData.category && <span>Category: {categories.find(c => c.id === formData.category)?.label || formData.category}</span>}
                </div>
              </div>
            </div>
          )}

          {/* Submit */}
          <div className={styles.submitGroup}>
            <button
              type="button"
              onClick={() => setShowPreview(!showPreview)}
              className={styles.previewBtn}
            >
              {showPreview ? '✏️ Back to Edit' : '👁️ Preview Job'}
            </button>
            <button type="submit" className={styles.submitBtn} disabled={loading || success || loadingJobData}>
              {loading
                ? (isEditMode ? 'Updating...' : 'Posting...')
                : success
                  ? (isEditMode ? 'Updated!' : 'Posted!')
                  : (isEditMode ? '⬡ Update Job' : '⬡ Post Job')}
            </button>
          </div>
        </form>
      </div>
    </main>
  )
}

// Wrap in Suspense for useSearchParams
export default function PostJobPage() {
  return (
    <Suspense fallback={
      <main>
        <Header />
        <div style={{ textAlign: 'center', padding: '4rem' }}>
          Loading...
        </div>
      </main>
    }>
      <PostJobContent />
    </Suspense>
  )
}

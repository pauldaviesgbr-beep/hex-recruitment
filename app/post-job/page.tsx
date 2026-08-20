'use client'

import { useState, useEffect, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { markJustPosted } from '@/lib/justPosted'
import { trimDeep } from '@/lib/trimDeep'
import Link from 'next/link'
import dynamic from 'next/dynamic'
import Header from '@/components/Header'
import PostcodeLookup, { type AddressData } from '@/components/PostcodeLookup'
import { supabase } from '@/lib/supabase'
import { useJobs } from '@/lib/JobsContext'
import { getTagsByCategory, TAG_CATEGORIES, getTagCategory, ALL_TAGS, type TagCategory } from '@/lib/jobTags'
import { categories } from '@/lib/categories'
import { isEmployerEntitled } from '@/lib/foundingEntitlement'
import { PHOTO_TIPS } from '@/lib/photoTips'
import type { WorkType } from '@/lib/workTypes'
import type { Job as JobType } from '@/lib/mockJobs'
import { employerLoginPath } from '@/lib/loginRedirect'
import { focusField, type FieldProblem } from '@/lib/focusField'
import FormError from '@/components/FormError'
import FieldError from '@/components/FieldError'
import { EMPLOYMENT_TYPES, CONTRACT_TYPES } from '@/lib/workTypes'
import JobCard from '@/components/JobCard'
import RemoveAdModal from '@/components/RemoveAdModal'
import { getEmployerCapabilities, getCurrentEmployerOwnerId } from '@/lib/employer'
import { FlowAppBar, Stepper, StepProgress } from './FlowChrome'
import styles from './page.module.css'
import flow from './flow.module.css'
import { Ico, type IconName } from '@/components/icons'

const RichTextEditor = dynamic(() => import('@/components/RichTextEditor'), { ssr: false })

/** The four tags shown before "+N more". See the long note at the render site
 *  for why these four and why it is openly a guess. */
const FEATURED_TAGS = [
  'Immediate start',
  'No experience required',
  'Training provided',
  'Career progression',
] as const
const ALL_TAG_COUNT = ALL_TAGS.length

const defaultImages = [
  'https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?w=1200&h=627&fit=crop',
  'https://images.unsplash.com/photo-1552566626-52f8b828add9?w=1200&h=627&fit=crop',
  'https://images.unsplash.com/photo-1414235077428-338989a2e8c0?w=1200&h=627&fit=crop',
  'https://images.unsplash.com/photo-1566073771259-6a8506099945?w=1200&h=627&fit=crop',
]

type GuidedFields = { whatIsJob: string; dayToDay: string; experienceNeeded: string; whatWeOffer: string }
type UndoState =
  | { source: 'guided'; fields: GuidedFields }
  | { source: 'editor'; description: string }

function PostJobContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { jobs, addJob, updateJob, getJobById, refreshJobs } = useJobs()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  // WHICH field the current error is about, so the message can be rendered
  // beside it as well as in the banner. Every error goes through showError so
  // this can never be stale — a message sitting next to the wrong field is
  // worse than one at the top of the page.
  const [errorField, setErrorField] = useState<string | null>(null)
  const showError = (message: string, field?: string) => {
    setError(message)
    setErrorField(field ?? null)
    if (field) focusField(field)
  }
  const [success, setSuccess] = useState(false)
  const [checkingAuth, setCheckingAuth] = useState(true)
  const [logoError, setLogoError] = useState('')
  const [logoSuccess, setLogoSuccess] = useState(false)
  const [logoUploading, setLogoUploading] = useState(false)
  const [logoUploadError, setLogoUploadError] = useState('')
  const [logoFileName, setLogoFileName] = useState('')
  const [bannerUploading, setBannerUploading] = useState(false)
  // Generated-artwork state. Kept beside the upload state because the two are
  // the same decision from the employer's side — "what picture goes on this?"
  const [artworkLoading, setArtworkLoading] = useState(false)
  const [artworkError, setArtworkError] = useState('')
  /** What we drew, in words, so it can be said rather than left to be noticed. */
  const [artworkSubject, setArtworkSubject] = useState('')
  const [bannerUploadError, setBannerUploadError] = useState('')
  const [bannerFileName, setBannerFileName] = useState('')

  const [showPreview, setShowPreview] = useState(false)
  const [enhancing, setEnhancing] = useState(false)
  const [enhanceError, setEnhanceError] = useState('')
  const [showUndo, setShowUndo] = useState(false)
  // Guided description fields
  const [guidedFields, setGuidedFields] = useState<GuidedFields>({
    whatIsJob: '',
    dayToDay: '',
    experienceNeeded: '',
    whatWeOffer: '',
  })
  // 'guided' = show four fields, 'editor' = show Tiptap editor
  const [descView, setDescView] = useState<'guided' | 'editor'>('guided')

  // "Draft my advert" — the generator, above the guided fields.
  const [aiPanelOpen, setAiPanelOpen] = useState(true)
  const [aiSentence, setAiSentence] = useState('')
  const [drafting, setDrafting] = useState(false)
  const [draftError, setDraftError] = useState('')
  const [drafted, setDrafted] = useState(false)
  const [undoState, setUndoState] = useState<UndoState | null>(null)

  const [formData, setFormData] = useState({
    company: '',
    companyWebsite: '',
    companyLogo: '',
    companyBanner: '',
    title: '',
    category: '',
    // NOTHING PRE-SELECTED. These two used to default to Full-time and
    // Permanent, so an employer who never touched them published an advert
    // asserting a permanent full-time job — and since the AI generator repeats
    // what the form tells it, that assertion started appearing as a SENTENCE in
    // the advert, in her voice.
    //
    // The next real employer to use this form runs a temp agency. Ongoing
    // agency work is neither permanent nor necessarily full-time. She would have
    // filled in a title, a rate and a sentence, never thought to touch two chips
    // that already looked answered, and published the opposite of what she was
    // advertising.
    //
    // Fixing this in the prompt would have treated the symptom: the wrong value
    // still lands in the row, still shows on the card, still drives matching.
    employmentType: '' as '' | 'Full-time' | 'Part-time' | 'Flexible',
    contractType: '' as '' | 'Permanent' | 'Temporary' | 'Fixed-term',
    workLocationType: 'In person' as 'In person' | 'Remote' | 'Hybrid',
    salaryMin: '',
    salaryMax: '',
    // NOT DEFAULTED EITHER, and this one is the most dangerous of the three.
    //
    // A figure without a period is meaningless, so defaulting looks harmless —
    // but two of the three boxes on that row start empty, which makes the third
    // look answered. Type 32000 for an annual salary, don't notice the
    // selector, and the ad reads £32,000 PER HOUR.
    //
    // "Absurd, so someone would spot it" is only true ON THE PAGE. SIX code
    // paths multiply hourly pay to an annual figure before comparing —
    // jobAlerts, recommendations, rolesRoundup, two analytics charts and the
    // salary filter on /jobs — so the row enters matching at about £66m a year
    // and misfires silently long before a human reads the advert.
    salaryPeriod: '' as '' | 'hour' | 'year',
    location: '',
    area: '',
    venue: '',
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

  const [screeningQuestions, setScreeningQuestions] = useState<{ id: string; question: string; required: boolean }[]>([])

  const [isEmployer, setIsEmployer] = useState(false)
  const [hasSubscription, setHasSubscription] = useState(false)
  const [isOwnCompany, setIsOwnCompany] = useState(true)
  const [employerProfile, setEmployerProfile] = useState<any>(null)
  const [hideSalary, setHideSalary] = useState(false)
  const [salaryNegotiable, setSalaryNegotiable] = useState(false)
  const [currentUser, setCurrentUser] = useState<{ id: string; companyName: string } | null>(null)
  // Edit mode state
  const [isEditMode, setIsEditMode] = useState(false)
  const [editJobId, setEditJobId] = useState<string | null>(null)
  const [loadingJobData, setLoadingJobData] = useState(false)
  // Remove-ad control, the second surface for the /my-jobs kebab item. Edit
  // mode only. `canRemove` defaults false and is set from the same capability
  // the endpoint is enforced against, so a member who would be refused is not
  // offered the control — NOTE this page has no capability gate of its own, so
  // that member can still reach the form and press Update; gating only what
  // this branch adds rather than quietly widening scope to the whole page.
  const [canRemove, setCanRemove] = useState(false)
  const [removeOpen, setRemoveOpen] = useState(false)
  // null = not read yet / read failed. Deliberately distinct from 0.
  const [removeAppCount, setRemoveAppCount] = useState<number | null>(null)

  // Capability for the Remove control. Only asked for in edit mode — the
  // control does not exist on a new post, so neither should the round-trip.
  useEffect(() => {
    if (!isEditMode) return
    let cancelled = false
    ;(async () => {
      const caps = await getEmployerCapabilities(supabase)
      if (!cancelled) setCanRemove(caps.manage_jobs)
    })()
    return () => { cancelled = true }
  }, [isEditMode])

  // How many people have applied, for the Remove dialog. This page held no
  // application data at all, so unlike /my-jobs it needs its own read.
  //
  // NO NEW ENDPOINT, and none is needed: job_applications is already scoped by
  // RLS to the employer who owns the job ("Employers view job applications" on
  // jobs.employer_id = auth.uid(), plus a members policy), so the browser
  // client asking with the employer's own session is the owner-authenticated
  // path. A public count route would be a way to ask how many people applied to
  // anyone's advert.
  //
  // head + exact returns the count without shipping a single application row —
  // the dialog needs the number and has no business holding candidate data.
  //
  // Stays NULL on failure rather than falling back to 0: null prints nothing,
  // 0 would be a claim that nobody has applied.
  useEffect(() => {
    if (!isEditMode || !editJobId) return
    let cancelled = false
    ;(async () => {
      const { count, error } = await supabase
        .from('job_applications')
        .select('id', { count: 'exact', head: true })
        .eq('job_id', editJobId)
      if (cancelled) return
      setRemoveAppCount(error ? null : (count ?? null))
    })()
    return () => { cancelled = true }
  }, [isEditMode, editJobId])

  // Same endpoint and the same contract as /my-jobs. Throws on failure so the
  // modal can hold itself open and say what went wrong; on success this page
  // leaves for /my-jobs, because staying on an edit form for an advert that is
  // no longer live invites an Update that would then fail.
  const handleRemoveAd = async () => {
    if (!editJobId) throw new Error('No advert selected.')
    const res = await fetch(`/api/jobs/${editJobId}/remove`, { method: 'POST' })
    let body: { ok?: boolean; status?: string; error?: string } | null = null
    try { body = await res.json() } catch { /* non-JSON body handled below */ }

    if (!res.ok) {
      throw new Error(
        body?.error === 'not_active' ? 'This advert is not live, so there is nothing to remove.'
        : body?.error === 'forbidden' ? 'You do not have permission to remove adverts on this account.'
        : body?.error === 'unauthenticated' ? 'Your session has expired. Please sign in again.'
        : body?.error === 'not_found' ? 'That advert could not be found on your account.'
        : 'Could not remove the advert. Please try again.',
      )
    }
    if (body?.status !== 'archived') throw new Error('The advert was not removed. Please try again.')

    await refreshJobs()
    router.push('/my-jobs')
  }

  // ── THREE-STEP FLOW ────────────────────────────────────────────────────
  //
  // Re-sequencing, not a rewrite. Every field on the old form survives; what
  // changes is the order and what has to be answered before publishing.
  //
  // Step 3 runs against a LIVE ad, which is the point of it: photo, tags and
  // screening questions read as improvements to something that already exists
  // rather than as work standing between her and being live. So `adStatus`
  // flips at the end of step 2 and the transition happens IN PLACE — no
  // navigate-away-and-back, because leaving the page is where people stop.
  //
  // Edit mode keeps the single long form. Someone editing a live ad is looking
  // for one field, not being walked through three steps.
  const [step, setStep] = useState<1 | 2 | 3>(1)
  const [adStatus, setAdStatus] = useState<'draft' | 'live'>('draft')
  const [publishedJobId, setPublishedJobId] = useState<string | null>(null)
  const [publishedAt, setPublishedAt] = useState<Date | null>(null)
  const [editingCompany, setEditingCompany] = useState(false)
  const [showPhotoTips, setShowPhotoTips] = useState(false)
  const [tagsExpanded, setTagsExpanded] = useState(false)

  // "Not now" is a DECISION, not an empty field. Recording it is what lets
  // Manage Job Ads offer the block back later instead of silently forgetting
  // it, and it's why this isn't just `!formData.companyBanner`.
  const [dismissed, setDismissed] = useState<Set<'photo' | 'tags' | 'screening'>>(new Set())
  const dismiss = (block: 'photo' | 'tags' | 'screening') =>
    setDismissed(prev => new Set(prev).add(block))

  const stepped = !isEditMode

  // ── AUTOSAVE ───────────────────────────────────────────────────────────
  //
  // CLIENT-SIDE ONLY, deliberately. A drafts table would need a status, RLS,
  // a cleanup story for rows nobody ever finishes, and a decision about what
  // an abandoned draft means to the rest of the product — for a problem whose
  // whole shape is "she was interrupted and came back on the same machine".
  // localStorage answers that, and answers it without touching the database.
  //
  // What it does NOT survive: a different device, or a cleared browser. That's
  // the honest limit of it and it's the right trade for now.
  //
  // Restored ONCE, before the employer has typed anything — restoring later
  // would overwrite live keystrokes with an older snapshot.
  const DRAFT_KEY = 'thrive:post-job:draft:v1'
  const [restored, setRestored] = useState(false)
  const [savedAt, setSavedAt] = useState<Date | null>(null)

  useEffect(() => {
    if (!stepped || restored) return
    setRestored(true)
    try {
      const raw = window.localStorage.getItem(DRAFT_KEY)
      if (!raw) return
      const d = JSON.parse(raw)
      // A draft that has already been published is finished, not abandoned.
      if (!d || d.adStatus === 'live') { window.localStorage.removeItem(DRAFT_KEY); return }
      if (d.formData) {
        setFormData(prev => ({
          ...prev,
          ...d.formData,
          // Sets don't survive JSON. Rebuilt rather than spread, or tags
          // becomes a plain array and every .has() on it throws.
          tags: new Set<string>(Array.isArray(d.formData.tags) ? d.formData.tags : []),
          // The company block is filled from the account on load; a stale
          // snapshot must not overwrite it with an older company name.
          company: prev.company || d.formData.company || '',
          companyLogo: prev.companyLogo || d.formData.companyLogo || '',
          companyWebsite: prev.companyWebsite || d.formData.companyWebsite || '',
        }))
      }
      if (d.guidedFields) setGuidedFields(d.guidedFields)
      if (d.screeningQuestions) setScreeningQuestions(d.screeningQuestions)
      if (typeof d.hideSalary === 'boolean') setHideSalary(d.hideSalary)
      if (typeof d.salaryNegotiable === 'boolean') setSalaryNegotiable(d.salaryNegotiable)
      if (d.step === 1 || d.step === 2) setStep(d.step)
      if (d.savedAt) setSavedAt(new Date(d.savedAt))
    } catch {
      // A corrupt draft must never block posting a job. Drop it and carry on.
      try { window.localStorage.removeItem(DRAFT_KEY) } catch {}
    }
  }, [stepped, restored])

  useEffect(() => {
    if (!stepped || !restored || adStatus === 'live') return
    // Nothing typed yet — don't write an empty draft over a real one.
    if (!formData.title && !formData.location && !formData.salaryMin) return
    const t = setTimeout(() => {
      try {
        const when = new Date()
        window.localStorage.setItem(DRAFT_KEY, JSON.stringify({
          savedAt: when.toISOString(),
          step,
          adStatus,
          hideSalary,
          salaryNegotiable,
          guidedFields,
          screeningQuestions,
          formData: { ...formData, tags: Array.from(formData.tags) },
        }))
        setSavedAt(when)
      } catch {
        // Quota, private mode, or a disabled store. Autosave is a convenience;
        // it may not become a reason the form stops working.
      }
    }, 600)
    return () => clearTimeout(t)
  }, [stepped, restored, adStatus, step, formData, guidedFields, screeningQuestions, hideSalary, salaryNegotiable])

  const clearDraft = () => { try { window.localStorage.removeItem(DRAFT_KEY) } catch {} }

  /**
   * The draft as a Job, so step 3 can render THE REAL CARD rather than a
   * placeholder.
   *
   * This is the point of the photo block: she is choosing an image for a card,
   * and the only honest way to show what that buys her is the card itself,
   * updating as she picks. A striped rectangle demonstrates nothing — and it is
   * the easiest thing in the world to leave as a placeholder forever, which is
   * why the handoff calls it out explicitly.
   *
   * Built through the same fields the payload uses, so what she sees here is
   * what the board will show, including the pay formatter collapsing a single
   * figure and falling back to "Competitive salary".
   */
  const draftJob: JobType = {
    id: publishedJobId || 'draft',
    company: formData.company,
    companyLogo: formData.companyLogo || '',
    companyBanner: formData.companyBanner || '',
    companyWebsite: formData.companyWebsite || '',
    employerId: currentUser?.id,
    title: formData.title || 'Your job title',
    jobReference: formData.jobReference || '',
    salaryMin: hideSalary ? 0 : parseInt(formData.salaryMin || '0'),
    salaryMax: hideSalary ? 0 : parseInt(formData.salaryMax || '0'),
    // NOT `|| 'year'`. See formatJobSalary — an unchosen period now shows the
    // figure without claiming a period, rather than asserting one she never picked.
    salaryPeriod: formData.salaryPeriod as 'hour' | 'year',
    employmentType: [formData.employmentType, formData.contractType].filter(Boolean) as WorkType[],
    location: formData.location || 'Location',
    area: formData.area || '',
    venue: formData.venue || undefined,
    // Matches what the submit payload now writes, so the preview shows the ad
    // that will exist rather than one with the town in the street line.
    fullLocation: { addressLine1: '', city: formData.city || '', postcode: formData.postcode || '' },
    shiftSchedule: formData.shiftSchedule || '',
    description: '',
    fullDescription: '',
    responsibilities: [], requirements: [], benefits: [], skillsRequired: [],
    experienceRequired: formData.experienceRequired || '',
    workAuthorization: [],
    workLocationType: formData.workLocationType,
    tags: Array.from(formData.tags),
    urgent: formData.tags.has('Urgent hire') || formData.tags.has('Immediate start'),
    noExperience: formData.tags.has('No experience required'),
    postedAt: (publishedAt ?? new Date()).toISOString(),
    postedDate: (publishedAt ?? new Date()).toISOString(),
    category: formData.category,
    viewCount: 0,
    applicationCount: 0,
    status: 'active',
  }

  useEffect(() => {
    const checkAuth = async () => {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) {
        router.push(employerLoginPath())
        return
      }

      // Entitlement is paying-sub OR in-window founding cohort —
      // see lib/foundingEntitlement.ts. approval_status MUST be fetched
      // alongside the subscription fields so isEmployerEntitled can see
      // it; without it the helper fails closed (was previously a
      // silent-pass back-compat hole — pending freemail users wrongly
      // reached this page).
      const [subRes, profileRes] = await Promise.all([
        supabase
          .from('employer_subscriptions')
          .select('subscription_status, subscription_tier, founding_period_ends_at')
          .eq('user_id', session.user.id)
          .maybeSingle(),
        supabase
          .from('employer_profiles')
          .select('approval_status')
          .eq('user_id', session.user.id)
          .maybeSingle(),
      ])
      const approvalStatus: string | null | undefined = (profileRes.data as { approval_status?: string | null } | null)?.approval_status ?? null
      const subWithApproval = subRes.data ? { ...subRes.data, approval_status: approvalStatus } : null

      // Pending / rejected / waitlisted employers belong on the
      // under-review screen, not on /post-job.
      if (approvalStatus === 'pending' || approvalStatus === 'rejected' || approvalStatus === 'waitlisted') {
        router.push('/account-under-review')
        return
      }

      const userRole = session.user.user_metadata?.role
      const hasActiveSub = isEmployerEntitled(subWithApproval)

      // Accept as employer if: metadata says employer, OR they have an
      // active employer subscription (covers stale session metadata)
      if (userRole !== 'employer' && !hasActiveSub) {
        setIsEmployer(false)
        setCheckingAuth(false)
        return
      }

      setIsEmployer(true)
      setHasSubscription(!!hasActiveSub)

      const companyName = session.user.user_metadata?.company_name || 'Your Company'
      setCurrentUser({
        id: session.user.id,
        companyName
      })

      // Fetch employer profile for auto-fill
      const { data: empProfile } = await supabase
        .from('employer_profiles')
        .select('company_name, logo_url, description, website, business_address, location')
        .eq('user_id', session.user.id)
        .maybeSingle()

      if (empProfile) {
        setEmployerProfile(empProfile)
        // Auto-fill company fields if not in edit mode (location left blank — varies per job)
        if (!searchParams.get('edit')) {
          setFormData(prev => ({
            ...prev,
            company: empProfile.company_name || prev.company,
            companyLogo: empProfile.logo_url || prev.companyLogo,
            companyWebsite: empProfile.website || prev.companyWebsite,
          }))
        }
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
        // Empty, not 'Full-time'. Editing a row whose array is missing would
        // otherwise re-assert Full-time on save — the same default this change
        // removes, arriving through the back door.
        const employmentType = Array.isArray(jobToEdit.employmentType) && jobToEdit.employmentType.length > 0
          ? jobToEdit.employmentType[0]
          : ''

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
          // Same reasoning as employmentType above: no contract word in the
          // row means the employer must pick one, not inherit 'Permanent'.
          contractType: (foundContract || '') as '' | 'Permanent' | 'Temporary' | 'Fixed-term',
          workLocationType: (jobToEdit.workLocationType || 'In person') as 'In person' | 'Remote' | 'Hybrid',
          salaryMin: jobToEdit.salaryMin?.toString() || '',
          salaryMax: jobToEdit.salaryMax?.toString() || '',
          salaryPeriod: jobToEdit.salaryPeriod || 'hour',
          location: jobToEdit.location || '',
          area: jobToEdit.area || '',
          venue: jobToEdit.venue || '',
          postcode: jobToEdit.fullLocation?.postcode || '',
          city: jobToEdit.fullLocation?.city || '',
          description: combinedDescription,
          shiftSchedule: jobToEdit.shiftSchedule || '',
          experienceRequired: jobToEdit.experienceRequired || '',
          jobReference: jobToEdit.jobReference || '',
          expiresAt: jobToEdit.expiresDate || '',
          tags,
        })

        // Load screening questions
        if (jobToEdit.screeningQuestions && jobToEdit.screeningQuestions.length > 0) {
          setScreeningQuestions(jobToEdit.screeningQuestions)
        }

        // Set logo success if there's a logo
        if (jobToEdit.companyLogo && !jobToEdit.companyLogo.includes('unsplash.com')) {
          setLogoSuccess(true)
        }
      } else {
        console.error('[PostJob] Job not found for editing:', editId)
        showError('Job not found. It may have been deleted.')
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
      // THE CITY USED TO GO IN TWICE. This wrote
      //   area = `${address.city} ${address.postcode}`
      // while `location` below takes the city as well, and every card renders
      // `location, area` — so Ricci's first advert read "London, London E9 5EN"
      // and every employer using the address finder got their town twice.
      //
      // `area` is now left alone, which is not a gap: lib/jobAreaSync fills it
      // server-side with the COUNTY LABEL ("Somerset", "Greater London") when it
      // is empty, and refuses to overwrite one the employer set themselves. That
      // is the same value the 243 imported listings carry, so a form-posted
      // advert now reads like the rest of the board instead of like an exception.
      //
      // The postcode is not lost — it is kept in `postcode` and in fullLocation,
      // which is what the map link and the address block use.
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

      // The route now requires a caller and checks manage_jobs before it writes
      // anything, so the session token has to travel with the upload.
      const { data: { session } } = await supabase.auth.getSession()
      const response = await fetch('/api/upload-image', {
        method: 'POST',
        headers: session ? { Authorization: `Bearer ${session.access_token}` } : undefined,
        body: uploadFormData,
      })

      const result = await response.json()

      if (!response.ok) {
        setBannerUploadError(result.error || 'Upload failed')
        return
      }

      setFormData(prev => ({ ...prev, companyBanner: result.url || result.dataUrl }))
      setBannerFileName(file.name)
    } catch {
      setBannerUploadError('Failed to upload image. Please try again.')
    } finally {
      setBannerUploading(false)
      e.target.value = ''
    }
  }

  /**
   * "Draw one for me" — house-style artwork for an advert with no photograph.
   *
   * NOTHING IS ATTACHED TO ANYTHING. /api/jobs/artwork generates, stores the
   * file and returns a URL; it lands in this form's own state and reaches the
   * database only if the employer goes on to publish. Generate it, dislike it,
   * close the tab, and nothing has changed.
   *
   * It is also always a choice, never a default. An image on a job advert is
   * read as evidence of the workplace, so it is not something to do to someone
   * quietly — the picture is drawn because they asked and they can see it in
   * the preview beside this button before it is anyone's advert.
   */
  const handleDrawArtwork = async () => {
    setArtworkError('')
    setArtworkLoading(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const res = await fetch('/api/jobs/artwork', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(session ? { Authorization: `Bearer ${session.access_token}` } : {}),
        },
        body: JSON.stringify({ jobTitle: formData.title }),
      })
      const json = await res.json()
      if (!res.ok) {
        setArtworkError(json.error || 'Could not create an image just now.')
        return
      }
      setFormData(prev => ({ ...prev, companyBanner: json.url }))
      setArtworkSubject(json.subject || '')
    } catch {
      setArtworkError('Could not create an image just now. You can publish without one.')
    } finally {
      setArtworkLoading(false)
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

  /**
   * One sentence in, three drafted fields out.
   *
   * Calls the EXISTING 'job-ad' branch of /api/ai-assist — the generate mode
   * has been there since March and simply lost its caller when the old
   * assistant panel was replaced by the inline enhance button.
   *
   * THE TITLE SHE TYPED IS NEVER TOUCHED. It goes IN as context so the copy
   * knows what the role is, and the prompt is explicitly forbidden from
   * returning one. Overwriting a decision she already made, on the screen where
   * she is trusting us with the words, is the kind of small betrayal that stops
   * someone using a feature twice.
   *
   * The result lands as ordinary editable text in the three textareas — never
   * read-only, never a preview she has to accept.
   */
  /**
   * The client-side deadline, in ms.
   *
   * THE SERVER ALREADY CAPS THIS AT 30s — app/api/ai-assist/route.ts sets
   * `maxDuration = 30`, so a generation that overruns comes back as an error
   * response and the catch below renders it. That path works.
   *
   * What has no cap is a request that never answers at all: a dropped
   * connection, a proxy holding the socket, a device going to sleep mid-call.
   * There was no AbortController, so `drafting` stayed true forever — the
   * button and the input both stay disabled while drafting, so a hung request
   * left her looking at "Drafting…" with no way to retry and no way to reach
   * "I'll write it myself" either. That is the actual silent failure.
   *
   * Set just PAST the server's own limit rather than under it. Cutting the
   * client off at 20s would kill generations that were about to succeed, and
   * the server's error is a better message than ours because it knows what
   * went wrong.
   */
  const DRAFT_TIMEOUT_MS = 35_000

  const handleDraftAdvert = async () => {
    const sentence = aiSentence.trim()
    if (!sentence || drafting) return
    setDrafting(true)
    setDraftError('')

    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), DRAFT_TIMEOUT_MS)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const res = await fetch('/api/ai-assist', {
        method: 'POST',
        signal: controller.signal,
        headers: {
          'Content-Type': 'application/json',
          ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
        },
        body: JSON.stringify({
          type: 'job-ad',
          data: {
            sentence,
            title: formData.title,
            company: formData.company,
            location: formData.location,
            salaryMin: hideSalary ? '' : formData.salaryMin,
            salaryMax: hideSalary ? '' : formData.salaryMax,
            salaryPeriod: formData.salaryPeriod,
            employmentType: formData.employmentType,
            contractType: formData.contractType,
            category: formData.category,
            companyDescription: employerProfile?.description || '',
          },
        }),
      })

      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Could not draft the advert')

      const ad = json.jobAd || {}
      // Defensive: if the model ever returns a title despite the prompt, it is
      // dropped here as well. Two locks on the same door, because this is the
      // one field we promised not to touch.
      const next = {
        dayToDay: typeof ad.dayToDay === 'string' ? ad.dayToDay.trim() : '',
        experienceNeeded: typeof ad.experienceNeeded === 'string' ? ad.experienceNeeded.trim() : '',
        whatWeOffer: typeof ad.whatWeOffer === 'string' ? ad.whatWeOffer.trim() : '',
      }
      if (!next.dayToDay && !next.experienceNeeded && !next.whatWeOffer) {
        throw new Error('The draft came back empty — try describing the role in a bit more detail.')
      }

      setGuidedFields(prev => ({ ...prev, ...next }))
      setDrafted(true)
      setAiPanelOpen(false)
    } catch (err: unknown) {
      // A TIMEOUT AND A FAILURE GET THE SAME TREATMENT, because she does not
      // care which it was — she cares that it didn't happen and what to do now.
      // The only difference is the wording, and only because "took longer than
      // expected" is true and useful where a generic failure line isn't.
      const aborted = err instanceof DOMException && err.name === 'AbortError'
      setDraftError(
        aborted
          ? 'That took longer than expected — the draft didn’t come back.'
          : err instanceof Error ? err.message : 'The draft didn’t come back.',
      )
    } finally {
      clearTimeout(timer)
      // Cleared in every case, including the abort. This is what re-enables the
      // input, "Draft my advert" and "I'll write it myself" — all three are
      // disabled while drafting, so leaving it true is what stranded her.
      setDrafting(false)
    }
  }

  const handleEnhanceDescription = async () => {
    setEnhancing(true)
    setEnhanceError('')
    setShowUndo(false)

    // Build the description text to send — from guided fields or existing editor content
    const descriptionText = descView === 'guided'
      ? [
          formData.title ? `What is the job: ${formData.title}` : '',
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
      const { data: { session } } = await supabase.auth.getSession()
      const res = await fetch('/api/ai-assist', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
        },
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
        setTimeout(() => setShowUndo(false), 30000)
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

  /**
   * Everything step 1 asks for, as one message naming what's missing.
   *
   * Returned rather than set, so "Next" and "Post this job" cannot disagree
   * about what a publishable ad needs — the old form had one validation path
   * because it had one button, and splitting the screen without splitting this
   * is how a step starts letting through what the next one rejects.
   */
  // IT RETURNS THE FIELD AS WELL AS THE MESSAGE. It always knew which field had
  // failed — it tests them in order and returns at the first one — and then
  // threw that away by returning a bare string, one line before it became
  // useful. Carrying it is what lets the offending input take focus, which is
  // what moves the page to the problem instead of leaving the error 189px above
  // the window with the button looking dead. Every id below is on a real
  // focusable element; the two chip groups put one on their first chip.
  const stepOneProblem = (): FieldProblem | null => {
    if (!formData.company) return { field: 'company', message: 'Please add the company name' }
    if (!formData.title) return { field: 'title', message: 'Please add a job title' }
    if (!formData.category) return { field: 'category', message: 'Please choose a category' }
    if (!formData.location) return { field: 'location', message: 'Please add a town or city' }

    // Named separately from a generic "required fields" because these are two
    // chips that previously looked answered — see the initial-state comment.
    if (!formData.employmentType || !formData.contractType) {
      return !formData.employmentType && !formData.contractType
        ? { field: 'employmentType', message: 'Please choose the employment type and the contract type' }
        : !formData.employmentType
          ? { field: 'employmentType', message: 'Please choose an employment type — full-time, part-time or flexible' }
          : { field: 'contractType', message: 'Please choose a contract type — permanent, temporary or fixed-term' }
    }

    if (!hideSalary) {
      // A SINGLE FIGURE IS A VALID ANSWER, and until recently it wasn't allowed.
      // Validation required BOTH boxes, so an employer paying a flat £32,000 had
      // no way to say so — the only route past was typing the same number twice.
      if (!formData.salaryMin) return { field: 'salaryMin', message: 'Please enter a pay figure, or choose "Pay on application"' }
      // The period is a claim about the job, not a formatting preference.
      if (!formData.salaryPeriod) return { field: 'salaryPeriod', message: 'Please choose whether the pay is per hour or per year' }
      if (formData.salaryMax && parseInt(formData.salaryMin) > parseInt(formData.salaryMax)) {
        return { field: 'salaryMin', message: 'The bottom of the range is higher than the top — please swap them' }
      }
    }
    return null
  }

  const goToStep = (next: 1 | 2 | 3) => {
    // Back NEVER discards and never validates — the only reason someone goes
    // back is to change something, and refusing to let them is how a form
    // traps people.
    if (next < step) { showError(''); setStep(next); window.scrollTo({ top: 0, behavior: 'smooth' }); return }

    if (step === 1) {
      const problem = stepOneProblem()
      if (problem) {
        showError(problem.message, problem.field)
        // The scroll four lines below is on the SUCCESS path and this return
        // never reaches it — which is why the page used to move only when there
        // was nothing to see. Focusing the field moves it to the problem.
          return
      }
    }
    showError('')
    setStep(next)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    showError('')
    setLoading(true)

    // NAMES THE FIELD. This said "Please fill in all required fields", which is
    // the one kind of message that is no help even once you have found it — it
    // tells you something is wrong and leaves you to hunt for which. The four
    // are already tested in order elsewhere; testing them in order here too
    // gives both the sentence and the field to send the person to.
    const missing: FieldProblem | null =
      !formData.company ? { field: 'company', message: 'Please add the company name' }
      : !formData.title ? { field: 'title', message: 'Please add a job title' }
      : !formData.category ? { field: 'category', message: 'Please choose a category' }
      : !formData.location ? { field: 'location', message: 'Please add a town or city' }
      : null
    if (missing) {
      showError(missing.message, missing.field)
      setLoading(false)
      return
    }

    // BOTH ARE A CHOICE NOW, NOT A DEFAULT. Named separately from the generic
    // message above so the employer is told WHICH answer is missing — these are
    // two chips that previously looked answered, so "required fields" alone
    // would send someone hunting.
    if (!formData.employmentType || !formData.contractType) {
      showError(
        !formData.employmentType && !formData.contractType
          ? 'Please choose the employment type and the contract type'
          : !formData.employmentType
            ? 'Please choose an employment type — full-time, part-time or flexible'
            : 'Please choose a contract type — permanent, temporary or fixed-term',
        !formData.employmentType ? 'employmentType' : 'contractType',
      )
      setLoading(false)
      return
    }

    if (!hideSalary) {
      // A SINGLE FIGURE IS A VALID ANSWER, and until now it wasn't allowed.
      // This required BOTH boxes, so an employer paying a flat £32,000 had no
      // way to say so — the only way past the validation was to type the same
      // number twice. 210 of the 247 live rows have salary_min equal to
      // salary_max, which is what that looks like at scale. The renderers all
      // already collapse min == max to one figure; the form was the thing
      // manufacturing the ranges.
      if (!formData.salaryMin) {
        showError('Please enter a salary, or tick "Competitive salary" to hide it', 'salaryMin')
        setLoading(false)
        return
      }
      // The period is a claim about the job, not a formatting preference — see
      // the comment on salaryPeriod in the initial state. Named separately so
      // the employer is told exactly which box is unanswered.
      if (!formData.salaryPeriod) {
        showError('Please choose whether the pay is per hour or per year', 'salaryPeriod')
        setLoading(false)
        return
      }
      if (formData.salaryMax && parseInt(formData.salaryMin) > parseInt(formData.salaryMax)) {
        showError('Minimum salary cannot be higher than maximum salary', 'salaryMin')
        setLoading(false)
        return
      }
    }

    if (descView === 'guided' && !guidedHasContent) {
      showError('Please add a job description before posting')
      setLoading(false)
      return
    }

    if (descView === 'editor' && !descriptionHasContent(formData.description)) {
      showError('Please add a job description before posting')
      setLoading(false)
      return
    }

    // A MISSING SESSION IS A SIGNED-OUT EMPLOYER, NOT A JOB WHOSE EMPLOYER IS
    // CALLED 'unknown'. The old fallback put that literal into a uuid column,
    // so the insert died on a parse error and both the message and the log
    // pointed at the database instead of at the session. Checked here with the
    // other validations, in the form's own treatment, so it says what is wrong.
    // The draft is in localStorage and survives signing back in.
    if (!currentUser?.id) {
      showError('You appear to be signed out. Sign in again and your draft will still be here.')
      setLoading(false)
      return
    }
    // THE OWNER'S id, not the session user's.
    //
    // Every employer-scoped table keys employer_id to the OWNER's auth user id
    // — /my-jobs has always resolved it this way and this page did not. With
    // currentUser.id a team member's advert was created under THEIR OWN id, so
    // it went live on the public board while the owner's /my-jobs (which
    // filters on the owner id) could never see or manage it. Nobody hit it
    // only because there are no team members yet.
    //
    // It is also what makes the insert policy work after the migration in this
    // branch. A member has no employer profile of their own, so
    // "Employers insert own jobs" now refuses them — correctly. They are
    // authorised instead by "members insert jobs (manage_jobs)", which checks
    // has_employer_permission against the employer_id ON THE ROW. That policy
    // can only match if the row carries the OWNER's id, i.e. this line.
    //
    // Falls back to the session id for single-user accounts, which have no
    // membership row — same fallback /my-jobs uses, so their behaviour is
    // unchanged.
    const employerId = (await getCurrentEmployerOwnerId(supabase)) ?? currentUser.id

    try {
      // Build tags array from Set
      const tags: string[] = Array.from(formData.tags)

      // Logo: use provided or empty (CompanyLogo component handles fallback)
      const companyLogo = formData.companyLogo || ''
      // Banner: use provided or empty (detail panel hides if empty)
      const companyBanner = formData.companyBanner || ''

      // THE GUIDED FIELDS NEVER REACHED THE ROW. This is not part of the
      // re-sequencing — it is a live fault on main, found by reading the
      // published row instead of the screen.
      //
      // The payload has always been built from formData.description, and
      // NOTHING has ever written guidedFields into it. The three boxes feed the
      // AI-enhance request and the render, and stop there. descView defaults to
      // 'guided', so the default path publishes an ad with an EMPTY
      // description — including everything "Draft my advert" writes.
      //
      // Invisible until now because all 247 live rows were imported: nobody has
      // ever posted through this form. The first person to would have been
      // Cristina, and she would have published three blank adverts.
      //
      // Composed as HTML because the editor path stores HTML in the same
      // column, and the detail page renders it as such.
      const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      const para = (s: string) => s.trim().split(/\n{2,}/).map(b => `<p>${esc(b.trim()).replace(/\n/g, '<br />')}</p>`).join('')
      const composedDescription = descView === 'guided'
        ? [
            guidedFields.dayToDay && `<h3>What you’ll be doing</h3>${para(guidedFields.dayToDay)}`,
            guidedFields.experienceNeeded && `<h3>Experience or skills needed</h3>${para(guidedFields.experienceNeeded)}`,
            guidedFields.whatWeOffer && `<h3>What we offer</h3>${para(guidedFields.whatWeOffer)}`,
          ].filter(Boolean).join('')
        : formData.description

      // Auto-generate short description from first 150 characters.
      //
      // Tags become a SPACE, not nothing. Stripping them outright ran the
      // blocks together — the card summary read "What you'll be doingCovering
      // chef de partie shifts", because </h3><p> collapsed to no separator.
      // Caught by reading the published row, not the form.
      //
      // Entities are decoded rather than left raw for the same reason: this
      // string is plain text on a card, so "you&rsquo;ll" would be printed
      // literally. &nbsp; was already handled; the rest were not.
      const plainText = composedDescription
        .replace(/<[^>]*>/g, ' ')
        .replace(/&nbsp;/g, ' ')
        .replace(/&rsquo;/g, '’').replace(/&lsquo;/g, '‘')
        .replace(/&rdquo;/g, '”').replace(/&ldquo;/g, '“')
        .replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'")
        .replace(/&lt;/g, '<').replace(/&gt;/g, '>')
        .replace(/&amp;/g, '&')   // last, so it can't re-create another entity
        .replace(/\s+/g, ' ')
        .trim()
      const shortDescription = plainText.slice(0, 150) + (plainText.length > 150 ? '...' : '')

      // Build employment type array: e.g. ["Full-time", "Permanent"]
      // Filtered rather than assumed: validation above guarantees both are set,
      // but this array is what lands in the row and drives the card, the filters
      // and matching. An empty string reaching it would be a silent bad value in
      // the one field this whole change exists to keep honest.
      const employmentType: string[] = [formData.employmentType, formData.contractType]
        .filter(v => Boolean(v))

      const jobReference = formData.jobReference || `JOB-${Date.now().toString(36).toUpperCase()}`

      const jobPayload = {
        company: formData.company,
        companyLogo,
        companyWebsite: formData.companyWebsite || '',
        employerId,
        companyBanner,
        title: formData.title,
        jobReference,
        salaryMin: hideSalary ? 0 : parseInt(formData.salaryMin || '0'),
        salaryMax: hideSalary ? 0 : parseInt(formData.salaryMax || '0'),
        // Validation above guarantees this is set; narrowed here so an empty
        // string can never reach the column that six code paths do arithmetic on.
        salaryPeriod: (formData.salaryPeriod || undefined) as 'hour' | 'year' | undefined,
        employmentType: employmentType as WorkType[],
        location: formData.location,
        // NOTHING HERE MAY NAME A PLACE THE EMPLOYER DID NOT. `area` and `city`
        // are only ever filled by the address picker; typing the town by hand
        // and skipping it — the fastest way through this form — used to fall
        // through to a hard-coded 'London'. A job in Bath was then filed as
        // London on the card, in the location filter, on /jobs/london, and in
        // the JobPosting schema Google reads. Left empty, `area` is resolved
        // server-side from the town by /api/jobs/resolve-area, the same way
        // area_region and area_county already are.
        area: formData.area || undefined,
        venue: formData.venue.trim() || undefined,
        fullLocation: {
          // This form never collects a street address — the picker sets city,
          // postcode and area, and no field sets addressLine1 — so putting the
          // TOWN here made the job page read "Bath, London" and the schema emit
          // streetAddress "Bath". Both omit themselves when it is empty.
          addressLine1: '',
          city: formData.city || '',
          postcode: formData.postcode || '',
        },
        description: shortDescription,
        fullDescription: composedDescription || '',
        tags: [...tags, ...(salaryNegotiable ? ['Salary negotiable'] : []), ...(hideSalary ? ['Competitive salary'] : [])],
        urgent: formData.tags.has('Urgent hire') || formData.tags.has('Immediate start') || formData.tags.has('Interviews this week'),
        noExperience: formData.tags.has('No experience required'),
        category: formData.category,
        shiftSchedule: formData.shiftSchedule || '',
        experienceRequired: formData.experienceRequired || '',
        requirements: [],
        benefits: [],
        responsibilities: [],
        skillsRequired: [],
        // A right-to-work requirement is the employer's statement to make, and
        // this form never asks. Five rows carry this sentence because the form
        // wrote it for them. It is rendered nowhere, which is the only reason
        // it never reached a candidate — an unasked claim sitting in the data.
        workAuthorization: [],
        workLocationType: formData.workLocationType,
        postedDate: new Date().toISOString().split('T')[0],
        expiresDate: formData.expiresAt || undefined,
        viewCount: 0,
        applicationCount: 0,
        status: 'active' as const,
        screeningQuestions: screeningQuestions.filter(q => q.question.trim()),
        isRecruiterPosting: !isOwnCompany,
      }

      // EVERY STRING TRIMMED, ONCE, ON THE WAY OUT — see lib/trimDeep.
      //
      // `venue` above was the only field that trimmed itself, which is how the
      // other dozen went unnoticed. Thrive's own first advert stored "Head of
      // Sales " and "London ", and the board rendered "London , London".
      // Applied to the whole payload rather than per field so the next field
      // added here is covered without anyone remembering to.
      //
      // BOTH BRANCHES, deliberately. Editing an advert writes the same payload,
      // so trimming only the insert would leave an employer able to reintroduce
      // the space by correcting a typo.
      const cleanPayload = trimDeep(jobPayload)

      let newJob: any = null
      if (isEditMode && editJobId) {
        await updateJob(editJobId, cleanPayload)
      } else {
        newJob = await addJob(cleanPayload, employerId)

        // Mark employer as recruiter if posting for another company
        if (!isOwnCompany) {
          supabase.from('employer_profiles')
            .update({ is_recruiter: true })
            .eq('user_id', employerId)
            .then()
        }
      }

      // Trigger job alert matching for new jobs (non-blocking).
      // The endpoint requires a Bearer token — either CRON_SECRET or a
      // user session — so without one we silently 401 and alerts never
      // fire. Resolve the session here and pass its access token.
      if (!isEditMode && newJob?.id) {
        ;(async () => {
          try {
            const { data: { session } } = await supabase.auth.getSession()
            const token = session?.access_token
            if (!token) return
            await fetch('/api/job-alerts/match', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${token}`,
              },
              body: JSON.stringify({ jobId: newJob.id }),
            })
            // Resolve the new job's location to a canonical area (region +
            // county) for preferred-areas matching (non-blocking; a null area is
            // fine and never hides the job).
            await fetch('/api/jobs/resolve-area', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${token}`,
              },
              body: JSON.stringify({ jobId: newJob.id }),
            })
          } catch (err) {
            console.error('[PostJob] Alert matching / area resolve failed (non-blocking):', err)
          }
        })()
      }

      // PUBLISHING MOVES TO STEP 3 IN PLACE. It does not navigate away and come
      // back, because the whole premise of step 3 is that the ad is already
      // live and the rest is optional — a redirect to /my-jobs ends the session
      // and the photo, the tags and the screening question never get added.
      // The old flow redirected here, which is why those three were the fields
      // nobody filled in.
      if (stepped && !isEditMode && newJob?.id) {
        // The draft is finished, not abandoned. Leaving it would offer her the
        // ad she just published back as unfinished work the next time she
        // opens the form.
        clearDraft()
        setPublishedJobId(newJob.id)
        setPublishedAt(new Date())
        setAdStatus('live')
        setStep(3)
        setLoading(false)
        window.scrollTo({ top: 0, behavior: 'smooth' })
        return
      }

      setSuccess(true)

      // Redirect after short delay
      setTimeout(() => {
        router.push('/my-jobs')
      }, 1500)

    } catch (err: any) {
      showError(err.message || 'Something went wrong')
    } finally {
      setLoading(false)
    }
  }

  /**
   * Step 3 edits an ad that is ALREADY LIVE, so each extra is an update to an
   * existing row rather than part of the thing being created. Saved on Done
   * rather than per-block: three separate writes to a live row for what the
   * employer experiences as one sitting is three chances to half-apply.
   */
  const handleFinishExtras = async () => {
    if (!publishedJobId) { router.push('/my-jobs'); return }
    setLoading(true)
    showError('')
    try {
      // Everything step 3 can change. A field that only APPEARS here is a field
      // that only SAVES here — venue and work location moved into this step, so
      // leaving them out would have made them silently uneditable rather than
      // optional.
      await updateJob(publishedJobId, {
        companyBanner: formData.companyBanner || undefined,
        tags: Array.from(formData.tags),
        screeningQuestions: screeningQuestions.filter(q => q.question.trim()),
        shiftSchedule: formData.shiftSchedule || undefined,
        experienceRequired: formData.experienceRequired || undefined,
        jobReference: formData.jobReference || undefined,
        venue: formData.venue.trim() || undefined,
        workLocationType: formData.workLocationType,
      } as any)
      // SINGULAR. /jobs/<uuid> matched the /jobs/[city] segment, cityInfo came
      // back undefined for a uuid, and app/jobs/[city]/page.tsx called
      // notFound() — so the last click of posting a job landed the employer on
      // a page titled "City Not Found".
      //
      // THE ADVERT WAS ALREADY LIVE by then: publishing happens at the step 1→2
      // boundary, so this handler only saves the extras. That is what made it
      // dangerous rather than merely broken — the employer sees a 404, concludes
      // the post failed, and posts again. Across a batch of roles that is a
      // board full of duplicates, which is the first thing an agency notices.
      //
      // Reported 19 Aug 2026 after posting a real advert on production.
      //
      // AND NOT TO THE ADVERT EITHER, as of 20 Aug 2026. /job/<id> is the
      // PUBLIC page — the one with the Apply button — so the last thing an
      // employer saw after publishing was a page inviting them to apply for
      // their own vacancy, with nothing confirming the post had worked.
      // Reported after posting a real advert on production.
      //
      // The dashboard is where they can act next, and the confirmation rides
      // in the answer line already at the top of it rather than as a panel of
      // its own — see justPostedAnswerLine.
      markJustPosted(publishedJobId, formData.title)
      router.push('/employer/dashboard')
    } catch (err: any) {
      // The ad is already live, so a failure here loses the extras, not the ad.
      // Say that, rather than letting it read as "the post failed".
      showError(`Your ad is live, but these extras didn't save: ${err.message || 'unknown error'}`)
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
            <div style={{ fontSize: '4rem', marginBottom: '1rem' }}><Ico name="lock" size={20} /></div>
            {/* Only reachable by someone already signed in — a visitor with no
                session is redirected to the employer login above. So this is a
                job seeker, and "Sign up for free" sent them straight into the
                one-email-one-side wall. See app/candidates/page.tsx for the
                worked example that cost us a week with a real employer. */}
            <h2 style={{ marginBottom: '1rem' }}>You&rsquo;re signed in as a job seeker</h2>
            <p style={{ color: '#666', marginBottom: '1rem', lineHeight: 1.6 }}>
              Posting jobs needs an employer account, and employer accounts are
              separate from job-seeker ones &mdash; a single email address can
              only be one or the other.
            </p>
            <p style={{ color: '#666', marginBottom: '2rem', fontSize: '0.9rem', lineHeight: 1.6 }}>
              To hire on Thrive, create an employer account with a different
              email address, or email{' '}
              <a href="mailto:support@thrivecareer.co.uk" style={{ color: '#0f172a', fontWeight: 600 }}>
                support@thrivecareer.co.uk
              </a>{' '}
              and we&rsquo;ll switch this one over for you.
            </p>
            <a href="/jobs" className="btn btn-primary">
              Back to jobs
            </a>
          </div>
        </div>
      </main>
    )
  }

  if (!hasSubscription) {
    // ?from=post-job triggers a contextual banner on /dashboard/subscription
    // explaining why the user landed there (audit U5).
    router.push('/dashboard/subscription?from=post-job')
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
      {/* ONE NAVY BAR, NOT TWO. The flow carries its own app bar with the back
          arrow, the draft status and the live indicator — none of which the
          site header can show — so rendering both stacked two navy bars on top
          of each other and read as a bug rather than a choice.

          The site header is what normally provides the way out, so the flow's
          back arrow has to do that job from every step. It does not just call
          router.back(): after publishing, the previous entry is step 2 of a
          form for an ad that is already live, which is a confusing place to
          land. See onBack below. */}
      {!stepped && <Header />}

      {!stepped && (
        <div className={styles.hero}>
          <button className={styles.backBtn} onClick={() => router.push('/employer/dashboard')}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6" /></svg>
            Back to Dashboard
          </button>
          <h1 className={styles.heroTitle}>{isEditMode ? 'Edit Job' : 'Post a Job'}</h1>
          <p className={styles.heroSubtitle}>
            {isEditMode
              ? 'Update your job listing details'
              : 'Reach thousands of professionals across the UK'}
          </p>
        </div>
      )}

      {/* Form */}
      <div className={stepped ? '' : styles.container}>
        <form className={stepped ? flow.shell : styles.formCard} onSubmit={handleSubmit}>
          {stepped && (
            <>
              <FlowAppBar
                // Where "back" goes depends on what exists. Once the ad is
                // live, the useful destination is the ad itself — she has just
                // published it and the thing she'd want is to see it. Before
                // that there is nothing to look at, so it's the dashboard.
                //
                // SINGULAR. THE THIRD INSTANCE OF THE SAME 404, found 20 Aug
                // 2026 — a day AFTER the other two were fixed and reported as
                // done. /jobs/<uuid> matches the /jobs/[city] segment, cityInfo
                // is undefined for a uuid, and the employer lands on "City Not
                // Found" having just published successfully.
                //
                // prove-redirect-targets.mjs PASSED ON THIS, and that is the
                // more important half. Its regex required the path literal to
                // be the first token after router.push( — here the first token
                // is `adStatus`, because the path is inside a ternary — so the
                // call was never scanned. Not reported as unparseable: simply
                // invisible. 33 of the app's 190 push/replace calls were in
                // that blind spot. The check now counts what it cannot parse
                // and fails rather than printing a clean bill.
                onBack={() => router.push(
                  adStatus === 'live' && publishedJobId ? `/job/${publishedJobId}` : '/employer/dashboard',
                )}
                // The ONLY place she is told her work is safe. She will be
                // interrupted mid-form — this is what makes that survivable,
                // so it says "Draft saved" once something has actually been
                // written, not before.
                status={
                  adStatus === 'live'
                    ? {
                        kind: 'live',
                        text: `Live since ${(publishedAt ?? new Date()).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}${formData.title ? ` · ${formData.title}` : ''}${formData.location ? `, ${formData.location}` : ''}`,
                      }
                    : savedAt
                      ? { kind: 'saved', text: `Draft saved${[formData.title, formData.location].filter(Boolean).length ? ` · ${[formData.title, formData.location].filter(Boolean).join(', ')}` : ''}` }
                      : { kind: 'saving', text: 'Saving as you go · draft' }
                }
              />
            </>
          )}
          <div className={stepped ? flow.body : ''}>
          {stepped && (
            <>
              <Stepper current={step} furthest={adStatus === 'live' ? 3 : 2} onGo={goToStep} />
              <StepProgress current={step} />
            </>
          )}
          <FormError message={error} className={styles.error} />
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

          {/* STEP 1 TITLE BLOCK. The company line replaces the whole Company
              Information section as the FIRST thing on the form.

              Company name, website and logo belong to the account, not to the
              job — they were being asked for on every single post, prefilled
              from the profile, and then re-confirmed by hand. Prefill them,
              expose one editable line, never ask twice. Nothing is deleted:
              "change" opens the identical block below. */}
          {stepped && step === 1 && (
            <div>
              <h3 className={flow.screenTitle}>What&apos;s the role?</h3>
              <p className={flow.postingAs}>
                Posting as <span className={flow.postingAsName}>{formData.company || 'your company'}</span>
                {!isOwnCompany && ' (client)'}
                <button type="button" className={flow.postingAsChange} onClick={() => setEditingCompany(v => !v)}>
                  {editingCompany ? 'done' : 'change'}
                </button>
              </p>
            </div>
          )}

          {/* Company Information */}
          <div className={styles.section} style={stepped && !(step === 1 && editingCompany) ? { display: 'none' } : undefined}>
            <div className={styles.sectionHeader}>
              <h2 className={styles.sectionTitle}>
                <span className={styles.sectionIcon}><Ico name="building" size={20} /></span>
                Company Information
              </h2>
            </div>

            {!isEditMode && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.75rem 1rem', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8, marginBottom: '1rem' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', fontSize: '0.9rem', fontWeight: 500, flex: 1 }}>
                  <input
                    type="checkbox"
                    checked={isOwnCompany}
                    onChange={(e) => {
                      const checked = e.target.checked
                      setIsOwnCompany(checked)
                      if (checked && employerProfile) {
                        // Auto-fill from profile (location left blank — varies per job)
                        setFormData(prev => ({
                          ...prev,
                          company: employerProfile.company_name || '',
                          companyLogo: employerProfile.logo_url || '',
                          companyWebsite: employerProfile.website || '',
                        }))
                      } else {
                        // Clear for third-party posting
                        setFormData(prev => ({
                          ...prev,
                          company: '', companyLogo: '', companyWebsite: '',
                          location: '', city: '', postcode: '',
                        }))
                      }
                    }}
                    style={{ accentColor: '#16a34a', width: 18, height: 18 }}
                  />
                  Posting for my own company
                </label>
                {!isOwnCompany && (
                  <span style={{ fontSize: '0.7rem', color: '#d97706', background: '#fffbeb', padding: '0.15rem 0.5rem', borderRadius: 99, fontWeight: 600, whiteSpace: 'nowrap' }}>
                    Recruiter posting
                  </span>
                )}
              </div>
            )}

            <div className={styles.formGroup}>
              <label className={styles.label} htmlFor="company">
                {isOwnCompany ? 'Company Name' : 'Client Company Name'} <span className={styles.required}>*</span>
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
                /* validated by stepOneProblem(), not the browser — this field is
                   display:none on steps 2 and 3, and a hidden required control
                   blocks submit with an unfocusable-element error */
              />
              <FieldError activeField={errorField} name="company" message={error} />
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
                  ) : formData.companyLogo ? (
                    <>
                      <span className={styles.uploadIcon}><Ico name="refresh-cw" size={20} /></span>
                      <span>Replace logo image</span>
                      <span className={styles.uploadHint}>A logo is already set — choose a new image to replace it</span>
                    </>
                  ) : (
                    <>
                      <span className={styles.uploadIcon}><Ico name="folder" size={20} /></span>
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

          {(!stepped || step === 1) && (<>
          {/* Job Details */}
          <div className={stepped ? flow.formCard : styles.section}>
            {!stepped && (
            <h2 className={styles.sectionTitle}>
              <span className={styles.sectionIcon}><Ico name="briefcase" size={20} /></span>
              Job Details
            </h2>
            )}

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
                /* validated by stepOneProblem(), not the browser — this field is
                   display:none on steps 2 and 3, and a hidden required control
                   blocks submit with an unfocusable-element error */
              />
              <FieldError activeField={errorField} name="title" message={error} />
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
                  /* validated by stepOneProblem(), not the browser — this field is
                     display:none on steps 2 and 3, and a hidden required control
                     blocks submit with an unfocusable-element error */
                >
                  <option value="">Select a category</option>
                  {categories.map(cat => (
                    <option key={cat.id} value={cat.id}>
                      {cat.label}
                    </option>
                  ))}
                </select>
                <FieldError activeField={errorField} name="category" message={error} />
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
                  /* validated by stepOneProblem(), not the browser — this field is
                     display:none on steps 2 and 3, and a hidden required control
                     blocks submit with an unfocusable-element error */
                />
                <FieldError activeField={errorField} name="location" message={error} />
              </div>
            </div>

            <div className={styles.formGroup}>
              <label className={styles.label}>Area / Postcode</label>
              <PostcodeLookup
                onAddressFound={handlePostcodeFound}
                initialPostcode={formData.postcode}
              />
              {/* SAYS WHAT THE FIELD BUYS HER, because it isn't required and
                  without this it reads as equally fine to skip.
                  The area filter is the ONE hard filter in candidate matching —
                  the only thing that can empty a candidate's list — and it runs
                  on a resolved area. There is an escape hatch that never hides
                  an unplaceable job, but all 247 live rows currently resolve, so
                  a postcodeless ad would be the first row ever to depend on it. */}
              {!formData.area && (
                <p style={{ fontSize: '0.8rem', color: '#64748b', marginTop: '0.375rem' }}>
                  Optional, but it&apos;s what lets us show this role to chefs who can
                  actually get there — we match on travel, not just the town name.
                </p>
              )}
              {formData.area && (
                <p style={{ fontSize: '0.85rem', color: '#22c55e', marginTop: '0.375rem', fontWeight: 500 }}>
                  Area set to: {formData.area}
                </p>
              )}
            </div>

            {/* CHIPS, NOT SELECTS — cosmetic only. Both still write into the
                same single employment_type array exactly as before; no schema,
                no migration, no work-type restructure in this ticket.

                Rendering all six options at once is the actual reason for the
                change: a closed select shows one value and hides the rest, and
                a select whose first option reads "Select employment type" is
                indistinguishable at a glance from one that has been answered.
                That is precisely the fault that let Full-time and Permanent be
                published by employers who never chose them. Chips cannot look
                answered when they aren't.

                Values come from lib/workTypes so the six here can never drift
                from the six the rest of the product filters on. */}
            <div className={styles.formRow}>
              <div className={styles.formGroup}>
                <label className={styles.label} id="employmentTypeLabel">Employment Type <span className={styles.required}>*</span></label>
                <div className={flow.chipRow} role="group" aria-labelledby="employmentTypeLabel">
                  {EMPLOYMENT_TYPES.map(t => (
                    <button
                      key={t}
                      type="button"
                      id={t === EMPLOYMENT_TYPES[0] ? 'employmentType' : undefined}
                      aria-pressed={formData.employmentType === t}
                      className={`${flow.chip} ${formData.employmentType === t ? flow.chipSelected : ''}`}
                      onClick={() => setFormData(prev => ({
                        ...prev,
                        employmentType: prev.employmentType === t ? '' : t,
                      }))}
                    >
                      {t}
                    </button>
                  ))}
                </div>
                <FieldError activeField={errorField} name="employmentType" message={error} />
              </div>

              <div className={styles.formGroup}>
                <label className={styles.label} id="contractTypeLabel">Contract Type <span className={styles.required}>*</span></label>
                <div className={flow.chipRow} role="group" aria-labelledby="contractTypeLabel">
                  {CONTRACT_TYPES.map(t => (
                    <button
                      key={t}
                      type="button"
                      id={t === CONTRACT_TYPES[0] ? 'contractType' : undefined}
                      aria-pressed={formData.contractType === t}
                      className={`${flow.chip} ${formData.contractType === t ? flow.chipSelected : ''}`}
                      onClick={() => setFormData(prev => ({
                        ...prev,
                        contractType: prev.contractType === t ? '' : t,
                      }))}
                    >
                      {t}
                    </button>
                  ))}
                </div>
                <FieldError activeField={errorField} name="contractType" message={error} />
              </div>
            </div>


            <div className={styles.formGroup}>
              <label className={styles.label} htmlFor="salaryMin">
                Salary Range {!hideSalary && <span className={styles.required}>*</span>}
              </label>

              {/* "Pay on application" is the handoff's name for what this form
                  called "Competitive salary (don't show)". Same flag, same
                  column, different words — the old label asserted the pay was
                  competitive, which is a claim the employer never made, and it
                  is the label a candidate never sees anyway. Rendered as a chip
                  so it sits in the pay row as one of the answers rather than as
                  a checkbox below it. */}
              <div className={flow.chipRow} style={{ marginBottom: '0.6rem' }}>
                <button
                  type="button"
                  id="payOnApplication"
                  aria-pressed={hideSalary}
                  className={`${flow.chip} ${hideSalary ? flow.chipSelected : ''}`}
                  onClick={() => { const v = !hideSalary; setHideSalary(v); if (v) setSalaryNegotiable(false) }}
                >
                  Pay on application
                </button>
                {!hideSalary && (
                  <button
                    type="button"
                    aria-pressed={salaryNegotiable}
                    className={`${flow.chip} ${salaryNegotiable ? flow.chipSelected : ''}`}
                    onClick={() => setSalaryNegotiable(v => !v)}
                  >
                    Negotiable
                  </button>
                )}
              </div>

              {!hideSalary && (
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
                  />
                  <FieldError activeField={errorField} name="salaryMin" message={error} />
                  <span className={styles.salaryDivider}>to</span>
                  <input
                    type="number"
                    id="salaryMax"
                    name="salaryMax"
                    value={formData.salaryMax}
                    onChange={handleChange}
                    placeholder="optional"
                    className={styles.salaryInput}
                    autoComplete="off"
                  />
                </div>
                <select
                  id="salaryPeriod"
                  name="salaryPeriod"
                  value={formData.salaryPeriod}
                  onChange={handleChange}
                  className={`${styles.select} ${styles.salaryPeriodSelect}`}
                >
                  {/* The other two selects already had a placeholder; this one
                      never did, because it was never unanswered. */}
                  <option value="">Per hour or per year?</option>
                  <option value="hour">Per hour (£)</option>
                  <option value="year">Per year (£)</option>
                </select>
                <FieldError activeField={errorField} name="salaryPeriod" message={error} />
              </div>
              )}

              {/* Says what the now-optional second box does, at the moment the
                  decision is made. Without this the empty box reads as an
                  unfinished field rather than a deliberate single figure. */}
              {!hideSalary && (
                <p style={{ fontSize: '0.8rem', color: '#64748b', margin: '0.4rem 0 0' }}>
                  Leave the second box empty for a single figure — the ad will read{' '}
                  <strong style={{ color: '#334155' }}>
                    {/* Grouped, because this line exists to demonstrate what the
                        ad will read — "£32000/yr" undercuts its own point. */}
                    {/* Does not guess the period either. Saying "/hr" before
                        she has chosen would be the same assertion the default
                        used to make, just one layer down. */}
                    £{formData.salaryMin
                      ? Number(formData.salaryMin).toLocaleString('en-GB')
                      : '32,000'}{formData.salaryPeriod === 'year' ? '/yr' : formData.salaryPeriod === 'hour' ? '/hr' : ''}
                  </strong>
                  , not a range.
                </p>
              )}

              {hideSalary && (
                <p style={{ fontSize: '0.8rem', color: '#64748b', fontStyle: 'italic', margin: '0.25rem 0 0' }}>
                  Salary will show as &quot;Competitive&quot; on the job listing.
                </p>
              )}
            </div>
          </div>
          </>)}
          {stepped && step === 1 && (
            <div className={flow.stepFooter}>
              <p className={flow.stepFooterNote}>Everything here can be edited after the ad is live.</p>
              <button type="button" className={flow.textBtn} onClick={() => router.push('/my-jobs')}>Save &amp; finish later</button>
              <button type="button" className={flow.primaryBtn} onClick={() => goToStep(2)}>Next — the advert →</button>
            </div>
          )}

          {(!stepped || step === 2) && (<>
          {stepped && (
            <div>
              <h3 className={flow.screenTitle}>Now the words</h3>
            </div>
          )}
          {/* Description */}
          <div className={styles.section}>
            <h2 className={styles.sectionTitle}>
              <span className={styles.sectionIcon}><Ico name="file" size={20} /></span>
              Job Description
            </h2>

            {descView === 'guided' ? (
              <div>
                {/* THE AI GOES FIRST. It used to sit BELOW these three boxes,
                    disabled until they had content — an enhancer of work
                    already done, which is after the work it was meant to save.
                    This is the primary path: one sentence in, three drafted
                    fields out, with writing it yourself as the alternative
                    beside it rather than the default.
                    "Enhance with AI" below is kept deliberately — different
                    job, for tidying a draft rather than starting one. */}
                {aiPanelOpen ? (
                  <div className={styles.aiPanel}>
                    <div className={styles.aiPanelHead}>
                      <span className={styles.aiPanelBadge}>FASTEST</span>
                      <h3 className={styles.aiPanelTitle}>
                        Tell us about it in a sentence and we&apos;ll draft the ad
                      </h3>
                    </div>
                    <input
                      type="text"
                      className={styles.aiPanelInput}
                      value={aiSentence}
                      onChange={e => setAiSentence(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleDraftAdvert() } }}
                      placeholder="e.g. Sous chef for a 60-cover country pub, four days, no late finishes, £32k"
                      disabled={drafting}
                    />
                    <div className={styles.aiPanelActions}>
                      <button
                        type="button"
                        className={styles.aiPanelPrimary}
                        onClick={handleDraftAdvert}
                        disabled={!aiSentence.trim() || drafting}
                        style={!aiSentence.trim() || drafting ? { opacity: 0.55, cursor: 'not-allowed' } : undefined}
                      >
                        {drafting ? 'Drafting…' : 'Draft my advert'}
                      </button>
                      <button
                        type="button"
                        className={styles.aiPanelQuiet}
                        onClick={() => setAiPanelOpen(false)}
                        disabled={drafting}
                      >
                        I&apos;ll write it myself
                      </button>
                    </div>
                    {/* THE FALLBACK EXISTS; SHE JUST CAN'T SEE IT AT THE MOMENT
                        SHE NEEDS IT. "I'll write it myself" is sitting right
                        there, but nothing connects it to what just happened, so
                        the honest read of a bare error line is "this is broken"
                        rather than "use the other door".

                        So the message names both ways forward. The sentence she
                        typed is untouched — the input keeps its value through
                        the failure, because she is not retyping it — and the
                        three guided fields stay empty and editable rather than
                        half-filled or locked. */}
                    {draftError && (
                      <div className={styles.aiPanelError} role="status">
                        <p style={{ margin: 0 }}>{draftError}</p>
                        <p style={{ margin: '0.35rem 0 0', opacity: 0.9 }}>
                          Your sentence is still here — press{' '}
                          <strong>Draft my advert</strong> to try again, or write it
                          yourself and keep going.
                        </p>
                      </div>
                    )}
                  </div>
                ) : (
                  <button
                    type="button"
                    className={styles.aiPanelReopen}
                    onClick={() => setAiPanelOpen(true)}
                  >
                    <Ico name="sparkles" size={16} /> Draft it for me instead
                  </button>
                )}

                {drafted && (
                  <p className={styles.aiDraftedLabel}>DRAFTED — EDIT ANYTHING</p>
                )}

                <div className={styles.formGroup}>
                  <label className={styles.label} htmlFor="desc_dayToDay">
                    What will they be doing day to day?
                  </label>
                  <textarea
                    id="desc_dayToDay"
                    className={`${styles.textarea} ${drafting ? styles.aiSkeleton : ''}`}
                    disabled={drafting}
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
                    className={`${styles.textarea} ${drafting ? styles.aiSkeleton : ''}`}
                    disabled={drafting}
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
                    className={`${styles.textarea} ${drafting ? styles.aiSkeleton : ''}`}
                    disabled={drafting}
                    rows={3}
                    placeholder="e.g. £35,000 salary, 28 days holiday, staff meals, flexible hours, great team..."
                    value={guidedFields.whatWeOffer}
                    onChange={e => setGuidedFields(prev => ({ ...prev, whatWeOffer: e.target.value }))}
                  />
                </div>

                <div className={styles.enhanceRow}>
                  <button
                    type="button"
                    className={styles.enhanceBtn}
                    onClick={handleEnhanceDescription}
                    disabled={!guidedHasContent || enhancing}
                    style={!guidedHasContent ? { opacity: 0.5, cursor: 'not-allowed' } : undefined}
                  >
                    {enhancing ? (
                      <><span className={styles.enhanceSpinner} />Enhancing...</>
                    ) : (
                      <><Ico name="sparkles" size={16} /> Enhance with AI</>
                    )}
                  </button>
                </div>

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
                <div className={styles.enhanceRow}>
                  <button
                    type="button"
                    className={styles.enhanceBtn}
                    onClick={handleEnhanceDescription}
                    disabled={!descriptionHasContent(formData.description) || enhancing}
                    style={!descriptionHasContent(formData.description) ? { opacity: 0.5, cursor: 'not-allowed' } : undefined}
                  >
                    {enhancing ? (
                      <><span className={styles.enhanceSpinner} />Enhancing...</>
                    ) : (
                      <><Ico name="sparkles" size={16} /> Enhance with AI</>
                    )}
                  </button>
                </div>
                {enhanceError && <p className={styles.enhanceError}>{enhanceError}</p>}
                <p className={styles.helperText}>
                  A short summary will be auto-generated for job cards from the first 150 characters
                </p>
              </div>
            )}
          </div>
          </>)}
          {/* ── THE PICTURE, BEFORE PUBLISHING ──────────────────────────────
              This used to live at step 3, AFTER the advert went live, under
              "Your ad is live. Three things that make it work harder." with a
              "Not now" beside it. The reasoning was sound — don't put work
              between someone and being live — but the result was that almost
              nobody added a photo, and the cards looked homemade next to the
              imported listings that all carry one.

              It sits here now because this is the last moment the decision is
              still part of making the advert rather than an improvement to
              something already finished. It is still entirely optional and
              still one click to skip; what has changed is that skipping is now
              a choice someone makes, rather than a screen they never reach.

              And it is two options, not one, because "upload a photo" is a task
              and "draw me something" is a button. Most employers have no
              photograph of the kitchen to hand. */}
          {stepped && step === 2 && (
            <div className={flow.extrasCard} style={{ marginBottom: '1rem' }}>
              <h3 className={flow.extrasHeading}>A picture for the card</h3>
              <p className={flow.extrasBody}>
                Optional, and it makes more difference than anything else here. A real
                photo of the kitchen or the room tells a chef more than a logo does —
                or we can draw something in the Thrive style.
              </p>

              {formData.companyBanner ? (
                <div style={{ marginTop: '0.75rem' }}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={formData.companyBanner}
                    alt="The image that will appear on your advert"
                    style={{ width: '100%', maxWidth: 420, borderRadius: 10, display: 'block' }}
                  />
                  {artworkSubject && (
                    <p className={flow.extrasBody} style={{ marginTop: '0.5rem' }}>
                      We&apos;ve drawn {artworkSubject}. Draw it again for a different take,
                      or upload your own photo instead.
                    </p>
                  )}
                  <button
                    type="button"
                    className={flow.notNow}
                    style={{ marginTop: '0.5rem' }}
                    onClick={() => {
                      setFormData(prev => ({ ...prev, companyBanner: '' }))
                      setArtworkSubject('')
                      setArtworkError('')
                    }}
                  >
                    Remove this image
                  </button>
                </div>
              ) : (
                <div className={flow.extrasActions} style={{ marginTop: '0.75rem', gap: '0.5rem', flexWrap: 'wrap' }}>
                  <label className={flow.outlineBtn} style={{ cursor: 'pointer', margin: 0 }}>
                    {bannerUploading ? 'Uploading…' : 'Upload a photo'}
                    <input
                      type="file"
                      accept="image/jpeg,image/png,image/webp,image/gif"
                      onChange={handleBannerUpload}
                      style={{ display: 'none' }}
                    />
                  </label>
                  {/* DISABLED WITHOUT A TITLE, because the picture is chosen from
                      the role and nothing else — the description is never
                      consulted, since that is where "Michelin Star" and "Luxury
                      5 Star Hotel" live and those are claims about a venue we
                      have never seen. */}
                  <button
                    type="button"
                    className={flow.outlineBtn}
                    onClick={handleDrawArtwork}
                    disabled={artworkLoading || !formData.title.trim()}
                  >
                    {artworkLoading ? 'Drawing…' : 'Draw one for me'}
                  </button>
                </div>
              )}

              {bannerUploadError && (
                <p className={flow.extrasBody} role="alert" style={{ color: '#b91c1c', marginTop: '0.5rem' }}>
                  {bannerUploadError}
                </p>
              )}
              {artworkError && (
                <p className={flow.extrasBody} role="alert" style={{ color: '#b91c1c', marginTop: '0.5rem' }}>
                  {artworkError}
                </p>
              )}
            </div>
          )}

          {stepped && step === 2 && (
            <div className={flow.publishRow}>
              <div className={flow.publishCopy}>
                <p className={flow.publishLead}>That&apos;s enough to go live.</p>
                {/* Photos are no longer on that list — they are the block above. */}
                <p className={flow.publishSub}>Tags and screening questions can be added while it&apos;s running.</p>
              </div>
              <button type="button" className={flow.outlineBtn} onClick={() => goToStep(1)}>← Back</button>
              <button type="submit" className={flow.primaryBtn} disabled={loading || loadingJobData}>
                {loading ? 'Posting…' : 'Post this job'}
              </button>
            </div>
          )}

          {(!stepped || step === 3) && (<>
          {stepped && (
            <div>
              <h3 className={flow.screenTitle}>Your ad is live. Three things that make it work harder.</h3>
              <p className={flow.screenSub}>All optional. You can close this and come back from Manage Job Ads whenever.</p>
            </div>
          )}
          {/* Job Banner Image */}
          <div className={stepped ? flow.extrasCard : styles.section}>
            <div className={stepped ? flow.extrasSplit : ''}>
            <div>
            {stepped ? (
              <>
                <h3 className={flow.extrasHeading}>
                  Add a photo of the place
                  <span className={flow.badgeEffect}>BIGGEST EFFECT</span>
                </h3>
                <p className={flow.extrasBody}>
                  Chefs judge a job by the room. A real photo of the kitchen tells a
                  chef more than a logo does.{' '}
                  <button type="button" className={flow.extrasLink} onClick={() => setShowPhotoTips(v => !v)}>
                    {showPhotoTips ? 'Hide the guidance' : 'What makes a good photo →'}
                  </button>
                </p>
              </>
            ) : (
              <h2 className={styles.sectionTitle}>
                <span className={styles.sectionIcon}><Ico name="image" size={20} /></span>
                Job Banner Image
              </h2>
            )}
            {stepped && step === 3 && dismissed.has('photo') && (
              <p className={flow.dismissedNote}>
                A photo — not now.
                <button type="button" className={flow.undoLink} onClick={() => setDismissed(prev => { const n = new Set(prev); n.delete('photo'); return n })}>Change my mind</button>
              </p>
            )}
            {!stepped && (
              <p className={styles.helperText} style={{ marginBottom: '0.75rem' }}>
                Landscape cover photo shown on your job card and detail page. Optional — if you skip it, we show a branded Thrive cover instead.
              </p>
            )}

            {/* The five-bullet brief moves BEHIND a link. It is good guidance and
                too long to sit in front of someone who has already published —
                the handoff puts it behind "What makes a good photo", where it
                can be as long as it likes. */}
            {(!stepped || showPhotoTips) && (
            <div style={{ background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 10, padding: '0.75rem 0.9rem', marginBottom: '0.9rem' }}>
              <div style={{ fontSize: '0.85rem', fontWeight: 700, color: '#92400e', marginBottom: '0.4rem' }}>
                <Ico name="camera" size={16} /> A great photo gets more applicants
              </div>
              <ul style={{ margin: 0, paddingLeft: '1.1rem', display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
                {PHOTO_TIPS.map((tip, i) => (
                  <li key={i} style={{ fontSize: '0.8rem', lineHeight: 1.45, color: '#78350f' }}>{tip}</li>
                ))}
              </ul>
            </div>
            )}

            {stepped && !dismissed.has('photo') && (
              <div className={flow.extrasActions} style={{ marginBottom: '0.9rem' }}>
                <button type="button" className={flow.notNow} onClick={() => dismiss('photo')}>Not now</button>
              </div>
            )}

            <div className={styles.formGroup} style={stepped && dismissed.has('photo') ? { display: 'none' } : undefined}>
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
                      <span className={styles.uploadIcon}><Ico name="folder" size={20} /></span>
                      <span>Choose a banner image</span>
                      <span className={styles.uploadHint}>JPEG, PNG, WebP or GIF — landscape, ideally 1200×825px. We crop to fit.</span>
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

            {formData.companyBanner && !stepped && (
              <div className={styles.logoPreviewContainer}>
                <div className={styles.logoPreview} style={{ width: '100%', maxWidth: '400px', aspectRatio: '16 / 11' }}>
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
            {!formData.companyBanner && !stepped && (
              <p style={{ fontSize: '0.82rem', color: '#6b7280', margin: '0.5rem 0 0', lineHeight: 1.5 }}>
                <Ico name="lightbulb" size={16} /> A cover photo and a few lines of description make your job stand out — candidates see them first. Both are optional (we&apos;ll use a tasteful default image if you skip the photo), but they really help.
              </p>
            )}
            </div>

            {/* THE REAL CARD, NOT A PLACEHOLDER. She is choosing an image for
                this card, so this is the only honest way to show what the
                choice buys her — it redraws as she picks, and it is the same
                component the board renders, so the pay formatter and the
                fallback cover are the real ones. */}
            {stepped && (
              <div>
                <p className={flow.sectionLabel}>How it looks on the board</p>
                <div className={flow.cardPreviewFrame}>
                  <JobCard job={draftJob} />
                </div>
                {formData.companyBanner && (
                  <button
                    type="button"
                    className={flow.notNow}
                    style={{ marginTop: '0.6rem' }}
                    onClick={() => { setFormData(prev => ({ ...prev, companyBanner: '' })); setBannerFileName('') }}
                  >
                    Remove this photo
                  </button>
                )}
              </div>
            )}
            </div>
          </div>

          {/* Requirements & Details */}
          <div className={stepped ? flow.extrasCard : styles.section}>
            {!stepped && (
            <h2 className={styles.sectionTitle}>
              <span className={styles.sectionIcon}><Ico name="info" size={20} /></span>
              Requirements & Details
            </h2>
            )}
            {/* These four had their emoji heading hidden with the rest, which
                left them floating in step 3 with no card and no label — worse
                than the heading was. The footer already says reference and
                expiry are set automatically if left, so this says the same
                thing where the fields are rather than only underneath them. */}
            {stepped && (
              <>
                <h3 className={flow.extrasHeading}>Details, if you want them</h3>
                <p className={flow.extrasBody} style={{ marginBottom: 18 }}>
                  All four are optional. Leave the reference and the expiry date
                  and we set them for you.
                </p>
              </>
            )}

            {/* VENUE AND WORK LOCATION LIVE HERE NOW, not in step 1.
                Neither is a decision that gates publishing. Work location is
                "In person" for essentially every role this board will carry —
                a genuine convenience, which is exactly why it does not belong
                on the screen that decides whether the ad can go live. Venue is
                detail rather than decision.

                Moving work location out of step 1 breaks nothing: it is not in
                stepOneProblem(), it keeps its default, and the payload reads
                formData.workLocationType either way. The one thing it DID need
                was adding to handleFinishExtras — step 3 saves against a live
                row, so a field that only appears here is a field that only
                saves here. Same for venue. */}

            <div className={styles.formGroup}>
              <label className={styles.label} htmlFor="venue">Venue (optional)</label>
              <input
                type="text"
                id="venue"
                name="venue"
                value={formData.venue}
                onChange={handleChange}
                placeholder="e.g. Shoreditch House, LSEG, Ham Yard Hotel"
                className={styles.input}
                autoComplete="off"
                maxLength={80}
              />
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

          <div className={stepped ? flow.extrasPair : ""}>
          {/* Pre-screening Questions */}
          <div className={stepped ? flow.extrasCard : styles.section}>
            {stepped ? (
              <h3 className={flow.extrasHeading}>Ask one screening question</h3>
            ) : (
            <h2 className={styles.sectionTitle}>
              <span className={styles.sectionIcon}><Ico name="help-circle" size={20} /></span>
              Pre-screening Questions (optional)
            </h2>
            )}
            {stepped && step === 3 && (
              dismissed.has('screening') ? (
                <p className={flow.dismissedNote}>
                  A screening question — not now.
                  <button type="button" className={flow.undoLink} onClick={() => setDismissed(prev => { const n = new Set(prev); n.delete('screening'); return n })}>Change my mind</button>
                </p>
              ) : (
                <button type="button" className={flow.notNow} style={{ marginBottom: '0.75rem' }} onClick={() => dismiss('screening')}>Not now</button>
              )
            )}
            {/* THE EXAMPLE IS ABOUT THE CRAFT, DELIBERATELY. The form had no
                suggested question at all, and the obvious one to reach for is
                right-to-work — which is the line we drew when those tags came
                out of the alert filters: Thrive is a recruitment product, not
                HR and compliance software. Naming a good question here is
                cheaper than removing a bad one later. */}
            <p className={styles.helperText} style={{ marginBottom: '1rem' }}>
              One question filters out most of the applications you&apos;d reject anyway.
              Something about the craft works best — &quot;Do you have experience running
              a section?&quot;
            </p>
            {screeningQuestions.map((q, i) => (
              <div key={q.id} style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', marginBottom: '0.75rem' }}>
                <input
                  type="text"
                  value={q.question}
                  onChange={e => {
                    const updated = [...screeningQuestions]
                    updated[i] = { ...q, question: e.target.value }
                    setScreeningQuestions(updated)
                  }}
                  placeholder={i === 0 ? "e.g. Do you have experience running a section?" : `Question ${i + 1}`}
                  className={styles.input}
                  style={{ flex: 1 }}
                />
                <label style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', fontSize: '0.8rem', color: '#64748b', whiteSpace: 'nowrap', cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={q.required}
                    onChange={e => {
                      const updated = [...screeningQuestions]
                      updated[i] = { ...q, required: e.target.checked }
                      setScreeningQuestions(updated)
                    }}
                  />
                  Required
                </label>
                <button
                  type="button"
                  onClick={() => setScreeningQuestions(prev => prev.filter((_, j) => j !== i))}
                  style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: '1.1rem', padding: '0.25rem' }}
                  title="Remove question"
                >
                  ✕
                </button>
              </div>
            ))}
            {screeningQuestions.length < 5 && (
              <button
                type="button"
                onClick={() => setScreeningQuestions(prev => [...prev, { id: crypto.randomUUID(), question: '', required: false }])}
                className={styles.uploadLabel}
                style={{ fontSize: '0.85rem' }}
              >
                + Add question
              </button>
            )}
            {screeningQuestions.length >= 5 && (
              <p style={{ fontSize: '0.8rem', color: '#94a3b8', marginTop: '0.5rem' }}>Maximum 5 questions reached</p>
            )}
          </div>

          {/* Tags */}
          <div className={stepped ? flow.extrasCard : styles.section}>
            {stepped ? (
              <h3 className={flow.extrasHeading}>Tag the role</h3>
            ) : (
            <h2 className={styles.sectionTitle}>
              <span className={styles.sectionIcon}><Ico name="tag" size={20} /></span>
              Job Tags
            </h2>
            )}
            {stepped && step === 3 && (
              dismissed.has('tags') ? (
                <p className={flow.dismissedNote}>
                  Tags — not now.
                  <button type="button" className={flow.undoLink} onClick={() => setDismissed(prev => { const n = new Set(prev); n.delete('tags'); return n })}>Change my mind</button>
                </p>
              ) : (
                <button type="button" className={flow.notNow} style={{ marginBottom: '0.75rem' }} onClick={() => dismiss('tags')}>Not now</button>
              )
            )}
            {stepped ? (
              <p className={flow.extrasBody}>
                Tags are how candidates filter. Immediate start and no experience
                required are the two that move applications most.
              </p>
            ) : (
              <p className={styles.helperText} style={{ marginBottom: '1rem' }}>
                Select tags that apply to this role. These help candidates find your job.
              </p>
            )}

            {/* FOUR CHIPS AND A "+N MORE", not the whole wall. All nineteen
                across five categories made this column about four times the
                height of the screening block beside it, and a wall of checkboxes
                is a worse invitation than four things worth ticking.

                WHICH FOUR IS A GUESS, and openly so — no employer has ever set a
                tag on this platform, because every live row was imported. So the
                usage data to pick on does not exist yet and these get revisited
                once real posts say something.

                The reasoning behind the guess:
                  Immediate start / No experience required — named in the design
                    handoff as the two that move applications most, and the
                    second is one of the few tags with a real filter behind it
                    (job.noExperience on the board).
                  Training provided / Career progression — the two benefits a
                    kitchen actually competes on when the rate is the same. The
                    rest of that category (pension, health insurance, bonus) is
                    admin a chef assumes rather than chooses on.
                Deliberately NOT a second urgency tag: "Urgent hire" and
                "Interviews this week" set the same `urgent` flag Immediate start
                already sets, so featuring them adds a chip and no new meaning.

                Nothing is cut — all nineteen are one click away. The taxonomy is
                fine; it is the imported board that is empty, not the feature. */}
            {stepped && !tagsExpanded ? (
              <div className={flow.chipRow}>
                {FEATURED_TAGS.map(label => (
                  <button
                    key={label}
                    type="button"
                    aria-pressed={formData.tags.has(label)}
                    className={`${flow.chip} ${formData.tags.has(label) ? flow.chipSelected : ''}`}
                    onClick={() => handleTagChange(label)}
                  >
                    {label}
                  </button>
                ))}
                <button
                  type="button"
                  className={flow.chip}
                  onClick={() => setTagsExpanded(true)}
                >
                  + {ALL_TAG_COUNT - FEATURED_TAGS.length} more
                </button>
              </div>
            ) : (
            <>
            {stepped && (
              <button type="button" className={flow.notNow} style={{ marginBottom: '0.9rem' }} onClick={() => setTagsExpanded(false)}>
                Show fewer
              </button>
            )}
            {(Object.keys(TAG_CATEGORIES) as TagCategory[]).map(catKey => (
              <div key={catKey} className={styles.tagCategoryGroup}>
                <h4 className={styles.tagCategoryTitle}>
                  <Ico name={TAG_CATEGORIES[catKey].icon as IconName} size={16} /> {TAG_CATEGORIES[catKey].title}
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
            </>
            )}
          </div>

          </div>
          {/* Preview Section */}
          {!stepped && showPreview && (
            <div className={styles.previewSection}>
              <div className={styles.previewSectionHeader}>
                <h2 className={styles.sectionTitle}>
                  <span className={styles.sectionIcon}><Ico name="eye" size={20} /></span>
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
                  <span className={styles.previewDetail}><Ico name="map-pin" size={16} /> {formData.location || 'Location'}{formData.area ? `, ${formData.area}` : ''}</span>
                  {/* Collapses to one figure exactly as the board and the detail
                      page do. It printed "£0 - £0" before either box was
                      touched, and would have contradicted the helper text
                      underneath the field it previews. */}
                  <span className={styles.previewDetail}><Ico name="banknote" size={16} /> {hideSalary
                    ? 'Competitive salary'
                    : !formData.salaryMin
                      ? 'Pay not set yet'
                      : (!formData.salaryMax || formData.salaryMax === formData.salaryMin)
                        ? `£${formData.salaryMin}${formData.salaryPeriod ? ` / ${formData.salaryPeriod}` : ''}`
                        : `£${formData.salaryMin} - £${formData.salaryMax}${formData.salaryPeriod ? ` / ${formData.salaryPeriod}` : ''}`
                  }{salaryNegotiable ? ' (negotiable)' : ''}</span>
                  <span className={styles.previewDetail}><Ico name="file-text" size={16} /> {formData.employmentType} · {formData.contractType}</span>
                  <span className={styles.previewDetail}><Ico name="building" size={16} /> {formData.workLocationType}</span>
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
          {stepped && step === 3 && (
            <div className={flow.stepFooter}>
              {/* THE EXPIRY HALF OF THIS WAS A FALSE CLAIM. It read "Reference
                  and expiry date ... set automatically if you leave them". The
                  reference genuinely is — `JOB-${Date.now()}` in the payload.
                  The expiry is not: jobs.expires_at is null on all 284 rows and
                  nothing in the codebase writes it. The only expires_at writers
                  are boosts and team invites, different tables.

                  So the form promised an automatic expiry that does not exist.
                  Employer-posted ads never expire at all — see CLAUDE.md. */}
              <p className={flow.stepFooterNote}>The reference is on the ad&apos;s settings — generated for you if you leave it blank.</p>
              <button type="button" className={flow.navyBtn} onClick={handleFinishExtras} disabled={loading}>
                {loading ? 'Saving…' : 'Done — view my ad'}
              </button>
            </div>
          )}
          </>)}

          {/* Submit — the single-button path, kept for EDIT MODE. The three-step
              flow publishes from the end of step 2 instead. */}
          {!stepped && (
          <div className={styles.submitGroup}>
            <button
              type="button"
              onClick={() => setShowPreview(!showPreview)}
              className={styles.previewBtn}
            >
              {showPreview ? 'Back to Edit' : 'Preview Job'}
            </button>
            <button type="submit" className={styles.submitBtn} disabled={loading || success || loadingJobData}>
              {loading
                ? (isEditMode ? 'Updating...' : 'Posting...')
                : success
                  ? (isEditMode ? 'Updated!' : 'Posted!')
                  : (isEditMode ? '⬡ Update Job' : '⬡ Post Job')}
            </button>
          </div>
          )}

          {/* Remove ad — second surface for the /my-jobs kebab item.
              Only ever reachable for a LIVE advert: this page loads the row
              through JobsContext, which selects status='active' and nothing
              else, so an archived one never gets here (it lands in the "Job not
              found for editing" branch). Outside submitGroup and type="button"
              so it can neither look like nor act as the form's submit. */}
          {isEditMode && editJobId && canRemove && (
            <div className={styles.removeAdRow}>
              <button type="button" className={styles.removeAdBtn} onClick={() => setRemoveOpen(true)}>
                Remove this advert from the job board
              </button>
            </div>
          )}

          {removeOpen && (
            <RemoveAdModal
              jobTitle={formData.title || 'This advert'}
              applicationCount={removeAppCount}
              onCancel={() => setRemoveOpen(false)}
              onConfirm={handleRemoveAd}
            />
          )}
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

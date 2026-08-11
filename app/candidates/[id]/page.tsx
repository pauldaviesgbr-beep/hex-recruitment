'use client'
import { PAID_SURFACES_ENABLED } from '@/lib/paidSurfaces'

import { useState, useEffect } from 'react'
import { useRouter, useParams, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import Header from '@/components/Header'
import SignedImage from '@/components/SignedImage'
import SignedLink from '@/components/SignedLink'
import { supabase } from '@/lib/supabase'
import { getSessionWithRetry } from '@/lib/getSessionWithRetry'
import { Candidate, devMockCandidates } from '@/lib/mockCandidates'
import { DEV_MODE } from '@/lib/mockAuth'
import { supabaseProfileToCandidate } from '@/lib/types'
import { FaLinkedinIn, FaInstagram, FaFacebookF } from 'react-icons/fa'
import {
  MapPin, Clock, Briefcase, GraduationCap, User, Wrench,
  Award, Heart, Globe, MessageSquare, FileDown, Mail,
  ChevronLeft, Sliders
} from 'lucide-react'
import styles from './page.module.css'

import { VisibilitySettings, DEFAULT_VISIBILITY } from '@/lib/profileVisibility'
import CandidateDetail from '@/components/CandidateDetail'

import { getCategoryLabel } from '@/lib/categories'
const JOB_SECTOR_LABELS: Record<string, string> = new Proxy({} as Record<string, string>, {
  get: (_target, key: string) => getCategoryLabel(key),
})

function normalizeUrl(url: string | undefined): string {
  if (!url || url.trim() === '') return ''
  let normalized = url.trim()
  if (!normalized.match(/^https?:\/\//i)) {
    normalized = 'https://' + normalized
  }
  return normalized
}

function getAvailabilityStyle(availability: string | undefined) {
  if (!availability) return 'Grey'
  const lower = availability.toLowerCase()
  if (lower.includes('immediately') || lower.includes('available') || lower.includes('now')) return 'Green'
  if (lower.includes('open') || lower.includes('considering') || lower.includes('notice')) return 'Yellow'
  return 'Grey'
}

export default function CandidateDetailPage() {
  const router = useRouter()
  const params = useParams()
  const searchParams = useSearchParams()
  const fromPipeline = searchParams.get('from') === 'pipeline'
  const candidateId = params.id as string

  const handleBack = () => {
    // Prefer browser history so the user returns to wherever they came from
    // (pipeline, candidates list, search results, etc.). Fall back to a sensible
    // default if there's no history — e.g. opened from an external link.
    if (typeof window !== 'undefined' && window.history.length > 1) {
      router.back()
    } else {
      router.push(fromPipeline ? '/pipeline' : '/candidates')
    }
  }

  const [candidate, setCandidate] = useState<Candidate | null>(null)
  const [visibility, setVisibility] = useState<VisibilitySettings>(DEFAULT_VISIBILITY)
  const [checkingAuth, setCheckingAuth] = useState(true)
  const [isEmployer, setIsEmployer] = useState(false)
  const [showContact, setShowContact] = useState(false)
  const [lastActive, setLastActive] = useState<string | null>(null)
  const [isOwnProfile, setIsOwnProfile] = useState(false)
  const [completionPct, setCompletionPct] = useState(0)
  useEffect(() => {
    const checkAuth = async () => {
      // DEV MODE — bypass auth, load from dev mock fixture
      if (DEV_MODE) {
        setIsEmployer(true)
        const mock = devMockCandidates.find(c => c.id === candidateId) || devMockCandidates[0]
        if (mock) {
          setCandidate(mock)
          setLastActive('Active today')
        }
        setCheckingAuth(false)
        return
      }

      const session = await getSessionWithRetry()

      if (!session) {
        router.push('/login/employer')
        return
      }

      const userRole = session.user.user_metadata?.role
      if (userRole !== 'employer') {
        setIsEmployer(false)
        setCheckingAuth(false)
        return
      }

      setIsEmployer(true)

      const { data, error } = await supabase
        .from('candidate_profiles')
        .select('*')
        .eq('user_id', candidateId)
        .maybeSingle()

      if (!error && data) {
        const candidateData = supabaseProfileToCandidate(data)
        setCandidate(candidateData)
        if (data.visibility_settings) {
          setVisibility({ ...DEFAULT_VISIBILITY, ...data.visibility_settings })
        }

        // Last active timestamp from profile updated_at
        if (data.updated_at) {
          const date = new Date(data.updated_at)
          const now = new Date()
          const diffDays = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24))
          if (diffDays === 0) setLastActive('Active today')
          else if (diffDays <= 7) setLastActive('Active this week')
          else if (diffDays <= 30) setLastActive('Active this month')
          else setLastActive(null)
        }

        // Record profile view (only when an employer views someone else's profile)
        if (session.user.id !== candidateId) {
          supabase.from('profile_views').insert({
            profile_id: candidateId,
            viewer_id: session.user.id,
          }).then()
        }

        // Profile completeness (visible only to the candidate themselves)
        if (session.user.id === candidateId) {
          setIsOwnProfile(true)
          const fields = [
            candidateData.profilePictureUrl,
            candidateData.jobTitle,
            candidateData.bio,
            candidateData.location,
            candidateData.skills && candidateData.skills.length > 0,
            candidateData.yearsExperience != null,
            candidateData.availability,
          ]
          setCompletionPct(Math.round((fields.filter(Boolean).length / fields.length) * 100))
        }
      }

      setCheckingAuth(false)
    }
    checkAuth()
  }, [router, candidateId])

  // Loading
  if (checkingAuth) {
    return (
      <main className={styles.page}>
        <Header />
        <div className={styles.loadingState}>
          <div className={styles.spinner} />
          <p>Loading profile...</p>
        </div>
      </main>
    )
  }

  // Access denied
  if (!isEmployer) {
    return (
      <main className={styles.page}>
        <Header />
        <div className={styles.accessDenied}>
          <div className={styles.accessIcon}>🔒</div>
          <h2>Employer Access Only</h2>
          <p>Only employers with a subscription can view candidate profiles.</p>
          {PAID_SURFACES_ENABLED && (<Link href="/subscribe" className={styles.backBtnPrimary}>
            View Subscription Plans
          </Link>)}
        </div>
      </main>
    )
  }

  // Not found
  if (!candidate) {
    return (
      <main className={styles.page}>
        <Header />
        <div className={styles.notFound}>
          <h2>Candidate Not Found</h2>
          <p>The candidate you&apos;re looking for doesn&apos;t exist or has been removed.</p>
          <Link href={fromPipeline ? '/pipeline' : '/candidates'} className={styles.backBtnPrimary}>
            {fromPipeline ? 'Back to Pipeline' : 'Back to Candidates'}
          </Link>
        </div>
      </main>
    )
  }

  const hasVisibleEmail = visibility.show_email && candidate.email
  const hasVisiblePhone = visibility.show_phone && candidate.phone
  const hasAnyContact = hasVisibleEmail || hasVisiblePhone
  const availStyle = getAvailabilityStyle(candidate.availability)

  const hasSalary = visibility.show_desired_salary && (candidate.salaryMin || candidate.salaryMax || candidate.desiredSalary)
  const hasPreferencesContent = Boolean(
    hasSalary ||
    (candidate.preferredLocations && candidate.preferredLocations.length > 0)
  )

  return (
    <main className={styles.page}>
      <Header />

      <div className={styles.container}>
        {/* Breadcrumb */}
        <div className={styles.breadcrumb}>
          <button onClick={handleBack} className={styles.breadcrumbLink} type="button">
            <ChevronLeft size={16} />
            Back
          </button>
        </div>

        {/* Profile completeness (own profile only) */}
        {isOwnProfile && completionPct < 100 && (
          <div className={styles.completionBar}>
            <div className={styles.completionBarFill} style={{ width: `${completionPct}%` }} />
            <span className={styles.completionBarText}>
              Profile {completionPct}% complete — <Link href="/dashboard" className={styles.completionBarLink}>complete your profile</Link>
            </span>
          </div>
        )}

        {/* Shared, privacy-aware profile (same component as the /candidates modal) */}
        <div className={styles.detailPanel}>
          <CandidateDetail candidate={candidate} visibility={visibility} lastActive={lastActive} />
        </div>
      </div>
    </main>
  )
}

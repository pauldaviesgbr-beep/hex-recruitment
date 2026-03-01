'use client'

import { useState, useEffect } from 'react'
import { useRouter, useParams } from 'next/navigation'
import Link from 'next/link'
import Header from '@/components/Header'
import { supabase } from '@/lib/supabase'
import { Candidate } from '@/lib/mockCandidates'
import { supabaseProfileToCandidate } from '@/lib/types'
import { FaLinkedinIn, FaInstagram, FaFacebookF } from 'react-icons/fa'
import {
  MapPin, Clock, Briefcase, GraduationCap, User, Wrench,
  Award, Heart, Globe, MessageSquare, FileDown, Mail, Phone,
  Shield, ChevronLeft, Sliders
} from 'lucide-react'
import styles from './page.module.css'

type ConnectionStatus = 'none' | 'pending' | 'accepted' | 'declined'

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

const JOB_SECTOR_LABELS: Record<string, string> = {
  hospitality: 'Hospitality Tourism & Sport',
  accountancy: 'Accountancy Banking & Finance',
  business: 'Business Consulting & Management',
  charity: 'Charity & Voluntary Work',
  creative: 'Creative Arts & Design',
  digital: 'Digital & Information Technology',
  energy: 'Energy & Utilities',
  engineering: 'Engineering & Manufacturing',
  environment: 'Environment & Agriculture',
  healthcare: 'Healthcare & Social Care',
  law: 'Law & Legal Services',
  marketing: 'Marketing Advertising & PR',
  media: 'Media & Internet',
  property: 'Property & Construction',
  public: 'Public Services & Administration',
  recruitment: 'Recruitment & HR',
  retail: 'Retail & Sales',
  science: 'Science & Pharmaceuticals',
  teaching: 'Teaching & Education',
  transport: 'Transport & Logistics',
}

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
  const candidateId = params.id as string

  const [candidate, setCandidate] = useState<Candidate | null>(null)
  const [visibility, setVisibility] = useState<VisibilitySettings>(DEFAULT_VISIBILITY)
  const [checkingAuth, setCheckingAuth] = useState(true)
  const [isEmployer, setIsEmployer] = useState(false)
  const [showContact, setShowContact] = useState(false)
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>('none')
  const [showConnectionModal, setShowConnectionModal] = useState(false)
  const [connectionMessage, setConnectionMessage] = useState('')
  const [sendingRequest, setSendingRequest] = useState(false)

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

      const { data, error } = await supabase
        .from('candidate_profiles')
        .select('*')
        .eq('user_id', candidateId)
        .maybeSingle()

      if (!error && data) {
        setCandidate(supabaseProfileToCandidate(data))
        if (data.visibility_settings) {
          setVisibility({ ...DEFAULT_VISIBILITY, ...data.visibility_settings })
        }
      }

      setCheckingAuth(false)
    }
    checkAuth()
  }, [router, candidateId])

  const handleSendConnectionRequest = () => {
    setSendingRequest(true)
    setTimeout(() => {
      setConnectionStatus('pending')
      setShowConnectionModal(false)
      setConnectionMessage('')
      setSendingRequest(false)
      const sentRequests = JSON.parse(localStorage.getItem('sentConnectionRequests') || '[]')
      sentRequests.push({
        candidateId,
        candidateName: candidate?.fullName,
        message: connectionMessage,
        sentAt: new Date().toISOString()
      })
      localStorage.setItem('sentConnectionRequests', JSON.stringify(sentRequests))
    }, 1000)
  }

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
          <Link href="/subscribe" className={styles.backBtnPrimary}>
            View Subscription Plans
          </Link>
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
          <Link href="/candidates" className={styles.backBtnPrimary}>
            Back to Candidates
          </Link>
        </div>
      </main>
    )
  }

  const hasVisibleEmail = visibility.show_email && candidate.email
  const hasVisiblePhone = visibility.show_phone && candidate.phone
  const hasAnyContact = hasVisibleEmail || hasVisiblePhone
  const availStyle = getAvailabilityStyle(candidate.availability)

  return (
    <main className={styles.page}>
      <Header />

      <div className={styles.container}>
        {/* Breadcrumb */}
        <div className={styles.breadcrumb}>
          <Link href="/candidates" className={styles.breadcrumbLink}>
            <ChevronLeft size={16} />
            Back to Candidates
          </Link>
        </div>

        {/* ===== PROFILE HEADER ===== */}
        <div className={styles.profileHeader}>
          <div className={styles.headerContent}>
            <div className={styles.avatar}>
              {candidate.profilePictureUrl ? (
                <img src={candidate.profilePictureUrl} alt={candidate.fullName} />
              ) : (
                <span className={styles.avatarPlaceholder}>
                  {candidate.fullName.split(' ').map(n => n[0]).join('')}
                </span>
              )}
            </div>
            <div className={styles.headerInfo}>
              <h1 className={styles.candidateName}>{candidate.fullName}</h1>
              <p className={styles.candidateTitle}>{candidate.jobTitle}</p>

              <div className={styles.headerMeta}>
                {candidate.location && (
                  <span className={styles.metaItem}>
                    <MapPin size={15} className={styles.metaItemIcon} />
                    {candidate.location}
                  </span>
                )}
                {candidate.yearsExperience != null && (
                  <span className={styles.metaItem}>
                    <Clock size={15} className={styles.metaItemIcon} />
                    {candidate.yearsExperience} years experience
                  </span>
                )}
                {visibility.show_availability && candidate.availability && (
                  <span className={`${styles.availabilityBadge} ${styles[`availability${availStyle}`]}`}>
                    <span className={styles.availabilityDot} />
                    {candidate.availability}
                  </span>
                )}
              </div>

              {/* Quick Stats */}
              <div className={styles.quickStats}>
                {candidate.jobSector && (
                  <div className={styles.quickStat}>
                    <span className={styles.quickStatLabel}>Sector</span>
                    <span className={styles.quickStatValue}>{JOB_SECTOR_LABELS[candidate.jobSector] || candidate.jobSector}</span>
                  </div>
                )}
                {candidate.preferredJobTypes && candidate.preferredJobTypes.length > 0 && (
                  <div className={styles.quickStat}>
                    <span className={styles.quickStatLabel}>Work Type</span>
                    <span className={styles.quickStatValue}>{candidate.preferredJobTypes.join(', ')}</span>
                  </div>
                )}
                {candidate.workLocationPreferences && candidate.workLocationPreferences.length > 0 && (
                  <div className={styles.quickStat}>
                    <span className={styles.quickStatLabel}>Work Location</span>
                    <span className={styles.quickStatValue}>{candidate.workLocationPreferences.join(', ')}</span>
                  </div>
                )}
                {visibility.show_nationality && candidate.nationality && (
                  <div className={styles.quickStat}>
                    <span className={styles.quickStatLabel}>Nationality</span>
                    <span className={styles.quickStatValue}>{candidate.nationality}</span>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* ===== CONTENT GRID ===== */}
        <div className={styles.contentGrid}>
          {/* === Main Content === */}
          <div className={styles.mainContent}>
            {/* About Me */}
            {candidate.bio && (
              <div className={styles.card}>
                <div className={styles.cardHeader}>
                  <User size={20} className={styles.cardIcon} />
                  <h2 className={styles.cardTitle}>About Me</h2>
                </div>
                <p className={styles.bio}>{candidate.bio}</p>
              </div>
            )}

            {/* Work Experience */}
            {candidate.workHistory && candidate.workHistory.length > 0 && (
              <div className={styles.card}>
                <div className={styles.cardHeader}>
                  <Briefcase size={20} className={styles.cardIcon} />
                  <h2 className={styles.cardTitle}>Work Experience</h2>
                </div>
                <div className={styles.timeline}>
                  {candidate.workHistory.map((job, index) => (
                    <div key={index} className={styles.timelineItem}>
                      <div className={styles.timelineTrack}>
                        <div className={styles.timelineDot} />
                        {index < candidate.workHistory.length - 1 && <div className={styles.timelineLine} />}
                      </div>
                      <div className={styles.timelineBody}>
                        <h3 className={styles.timelineRole}>{job.title}</h3>
                        <p className={styles.timelineCompany}>{job.company} • {job.location}</p>
                        <p className={styles.timelineDates}>{job.startDate} — {job.endDate || 'Present'}</p>
                        {job.description && <p className={styles.timelineDesc}>{job.description}</p>}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Skills */}
            {candidate.skills && candidate.skills.length > 0 && (
              <div className={styles.card}>
                <div className={styles.cardHeader}>
                  <Wrench size={20} className={styles.cardIcon} />
                  <h2 className={styles.cardTitle}>Skills</h2>
                </div>
                <div className={styles.skillsGrid}>
                  {candidate.skills.map((skill, index) => (
                    <span key={index} className={styles.skillPill}>{skill}</span>
                  ))}
                </div>
              </div>
            )}

            {/* Education */}
            {candidate.education && candidate.education.length > 0 && candidate.education.some(edu => edu.institution || edu.qualification) && (
              <div className={styles.card}>
                <div className={styles.cardHeader}>
                  <GraduationCap size={20} className={styles.cardIcon} />
                  <h2 className={styles.cardTitle}>Education & Qualifications</h2>
                </div>
                <div className={styles.timeline}>
                  {candidate.education.filter(edu => edu.institution || edu.qualification).map((edu, index, arr) => (
                    <div key={index} className={styles.timelineItem}>
                      <div className={styles.timelineTrack}>
                        <div className={styles.timelineDot} />
                        {index < arr.length - 1 && <div className={styles.timelineLine} />}
                      </div>
                      <div className={styles.timelineBody}>
                        <h3 className={styles.timelineRole}>{edu.qualification}{edu.fieldOfStudy ? ` in ${edu.fieldOfStudy}` : ''}</h3>
                        <p className={styles.timelineCompany}>{edu.institution}{edu.grade ? ` • ${edu.grade}` : ''}</p>
                        <p className={styles.timelineDates}>{edu.startDate} — {edu.inProgress ? 'In Progress' : (edu.endDate || 'N/A')}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Languages */}
            {candidate.languages && candidate.languages.length > 0 && candidate.languages.some(lang => lang.name) && (
              <div className={styles.card}>
                <div className={styles.cardHeader}>
                  <Globe size={20} className={styles.cardIcon} />
                  <h2 className={styles.cardTitle}>Languages</h2>
                </div>
                <div className={styles.skillsGrid}>
                  {candidate.languages.filter(lang => lang.name).map((lang, index) => (
                    <span key={index} className={styles.langPill}>
                      {lang.name} <span className={styles.langLevel}>({lang.proficiency})</span>
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Certifications */}
            {candidate.certifications && candidate.certifications.length > 0 && (
              <div className={styles.card}>
                <div className={styles.cardHeader}>
                  <Award size={20} className={styles.cardIcon} />
                  <h2 className={styles.cardTitle}>Certifications</h2>
                </div>
                <ul className={styles.certList}>
                  {candidate.certifications.map((cert, index) => (
                    <li key={index} className={styles.certItem}>
                      <span className={styles.certCheck}>✓</span>
                      {cert}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Preferences */}
            {(visibility.show_desired_salary || candidate.preferredLocations || candidate.preferredJobTypes) && (
              <div className={styles.card}>
                <div className={styles.cardHeader}>
                  <Sliders size={20} className={styles.cardIcon} />
                  <h2 className={styles.cardTitle}>Preferences</h2>
                </div>
                <div className={styles.prefGrid}>
                  {visibility.show_desired_salary && (candidate.salaryMin || candidate.salaryMax || candidate.desiredSalary) && (
                    <div className={styles.prefRow}>
                      <span className={styles.prefLabel}>Desired Salary</span>
                      <span className={styles.prefValue}>
                        {candidate.salaryMin && candidate.salaryMax ? (
                          <>£{Number(candidate.salaryMin).toLocaleString()} – £{Number(candidate.salaryMax).toLocaleString()}{candidate.salaryPeriod === 'hour' ? '/hour' : '/year'}</>
                        ) : candidate.desiredSalary ? (
                          <>£{Number(candidate.desiredSalary).toLocaleString()}{candidate.salaryPeriod === 'hour' ? '/hour' : '/year'}</>
                        ) : candidate.salaryMin ? (
                          <>From £{Number(candidate.salaryMin).toLocaleString()}{candidate.salaryPeriod === 'hour' ? '/hour' : '/year'}</>
                        ) : (
                          <>Up to £{Number(candidate.salaryMax).toLocaleString()}{candidate.salaryPeriod === 'hour' ? '/hour' : '/year'}</>
                        )}
                      </span>
                    </div>
                  )}
                  {candidate.preferredJobTypes && candidate.preferredJobTypes.length > 0 && (
                    <div className={styles.prefRow}>
                      <span className={styles.prefLabel}>Work Type</span>
                      <span className={styles.prefValue}>{candidate.preferredJobTypes.join(', ')}</span>
                    </div>
                  )}
                  {candidate.workLocationPreferences && candidate.workLocationPreferences.length > 0 && (
                    <div className={styles.prefRow}>
                      <span className={styles.prefLabel}>Work Location</span>
                      <span className={styles.prefValue}>{candidate.workLocationPreferences.join(', ')}</span>
                    </div>
                  )}
                  {candidate.preferredLocations && (
                    <div className={styles.prefRow}>
                      <span className={styles.prefLabel}>Preferred Areas</span>
                      <span className={styles.prefValue}>{candidate.preferredLocations}</span>
                    </div>
                  )}
                  {visibility.show_availability && candidate.availability && (
                    <div className={styles.prefRow}>
                      <span className={styles.prefLabel}>Availability</span>
                      <span className={styles.prefValue}>{candidate.availability}</span>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Interests & Hobbies */}
            {(candidate.personalBio || (candidate.interests && candidate.interests.length > 0)) && (
              <div className={styles.card}>
                <div className={styles.cardHeader}>
                  <Heart size={20} className={styles.cardIcon} />
                  <h2 className={styles.cardTitle}>Interests & Hobbies</h2>
                </div>
                {candidate.personalBio && <p className={styles.bio}>{candidate.personalBio}</p>}
                {candidate.interests && candidate.interests.length > 0 && (
                  <div className={styles.interestsTags} style={candidate.personalBio ? { marginTop: '1rem' } : undefined}>
                    {candidate.interests.map((interest, index) => (
                      <span key={index} className={styles.interestTag}>{interest}</span>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* === Sidebar === */}
          <div className={styles.sidebar}>
            <div className={styles.sidebarSticky}>
              {/* Actions Card */}
              <div className={styles.actionsCard}>
                <h3 className={styles.actionsTitle}>Connect with {candidate.fullName.split(' ')[0]}</h3>

                {connectionStatus === 'none' && (
                  <button className={styles.connectBtn} onClick={() => setShowConnectionModal(true)}>
                    <MessageSquare size={18} />
                    Send Connection Request
                  </button>
                )}
                {connectionStatus === 'pending' && (
                  <div className={styles.connectionPending}>
                    ⏳ Connection Request Pending
                  </div>
                )}
                {connectionStatus === 'accepted' && (
                  <Link href="/messages" className={styles.messageBtn}>
                    <MessageSquare size={18} />
                    Send Message
                  </Link>
                )}

                <div className={styles.actionRow}>
                  {hasAnyContact ? (
                    !showContact ? (
                      <button className={styles.actionBtn} onClick={() => setShowContact(true)}>
                        <Mail size={15} />
                        View Contact
                      </button>
                    ) : (
                      <button className={styles.actionBtn} onClick={() => setShowContact(false)}>
                        <Mail size={15} />
                        Hide Contact
                      </button>
                    )
                  ) : (
                    <button className={styles.actionBtn} disabled style={{ opacity: 0.5 }}>
                      <Mail size={15} />
                      Contact Private
                    </button>
                  )}
                  {visibility.show_cv && candidate.cvUrl ? (
                    <a href={candidate.cvUrl} target="_blank" rel="noopener noreferrer" download className={styles.actionBtn}>
                      <FileDown size={15} />
                      Download CV
                    </a>
                  ) : (
                    <button className={styles.actionBtn} disabled style={{ opacity: 0.5 }}>
                      <FileDown size={15} />
                      No CV
                    </button>
                  )}
                </div>

                {showContact && hasAnyContact && (
                  <div className={styles.contactDetails}>
                    {hasVisibleEmail && (
                      <div className={styles.contactItem}>
                        <span className={styles.contactLabel}>Email</span>
                        <a href={`mailto:${candidate.email}`} className={styles.contactValue}>{candidate.email}</a>
                      </div>
                    )}
                    {hasVisiblePhone && (
                      <div className={styles.contactItem}>
                        <span className={styles.contactLabel}>Phone</span>
                        <a href={`tel:${candidate.phone}`} className={styles.contactValue}>{candidate.phone}</a>
                      </div>
                    )}
                  </div>
                )}

              </div>

              {/* Quick Info */}
              <div className={styles.quickInfo}>
                <h3 className={styles.quickInfoTitle}>Quick Info</h3>
                {candidate.jobSector && (
                  <div className={styles.quickInfoItem}>
                    <span className={styles.quickInfoLabel}>Sector</span>
                    <span className={styles.quickInfoValue}>{JOB_SECTOR_LABELS[candidate.jobSector] || candidate.jobSector}</span>
                  </div>
                )}
                <div className={styles.quickInfoItem}>
                  <span className={styles.quickInfoLabel}>Position</span>
                  <span className={styles.quickInfoValue}>{candidate.jobTitle}</span>
                </div>
                <div className={styles.quickInfoItem}>
                  <span className={styles.quickInfoLabel}>Location</span>
                  <span className={styles.quickInfoValue}>{candidate.location}</span>
                </div>
                <div className={styles.quickInfoItem}>
                  <span className={styles.quickInfoLabel}>Experience</span>
                  <span className={styles.quickInfoValue}>{candidate.yearsExperience} years</span>
                </div>
                {visibility.show_date_of_birth && candidate.age && (
                  <div className={styles.quickInfoItem}>
                    <span className={styles.quickInfoLabel}>Age</span>
                    <span className={styles.quickInfoValue}>{candidate.age} years old</span>
                  </div>
                )}
              </div>

              {/* Social Links */}
              {visibility.show_social_links && (candidate.linkedinUrl || candidate.instagramUrl || candidate.facebookUrl) && (
                <div className={styles.quickInfo}>
                  <h3 className={styles.quickInfoTitle}>Social Links</h3>
                  <div className={styles.socialLinks}>
                    {candidate.linkedinUrl && (
                      <a href={normalizeUrl(candidate.linkedinUrl)} target="_blank" rel="noopener noreferrer" className={styles.socialLink}>
                        <span className={`${styles.socialIcon} ${styles.linkedinIcon}`}><FaLinkedinIn /></span>
                        LinkedIn Profile
                      </a>
                    )}
                    {candidate.facebookUrl && (
                      <a href={normalizeUrl(candidate.facebookUrl)} target="_blank" rel="noopener noreferrer" className={styles.socialLink}>
                        <span className={`${styles.socialIcon} ${styles.facebookIcon}`}><FaFacebookF /></span>
                        Facebook Profile
                      </a>
                    )}
                    {candidate.instagramUrl && (
                      <a href={normalizeUrl(candidate.instagramUrl)} target="_blank" rel="noopener noreferrer" className={styles.socialLink}>
                        <span className={`${styles.socialIcon} ${styles.instagramIcon}`}><FaInstagram /></span>
                        Instagram Profile
                      </a>
                    )}
                  </div>
                </div>
              )}

              {/* Verification Badges */}
              {visibility.show_verification_badges && (candidate.hasNiNumber || candidate.hasBankAccount || candidate.hasRightToWork || candidate.hasP45) && (
                <div className={styles.quickInfo}>
                  <h3 className={styles.quickInfoTitle}>Verified Documents</h3>
                  <div className={styles.verificationBadges}>
                    {candidate.hasNiNumber && (
                      <div className={styles.verificationBadge}>
                        <span className={styles.badgeCheck}>✓</span>
                        NI Number
                      </div>
                    )}
                    {candidate.hasBankAccount && (
                      <div className={styles.verificationBadge}>
                        <span className={styles.badgeCheck}>✓</span>
                        UK Bank Account
                      </div>
                    )}
                    {candidate.hasRightToWork && (
                      <div className={styles.verificationBadge}>
                        <span className={styles.badgeCheck}>✓</span>
                        Right to Work
                      </div>
                    )}
                    {candidate.hasP45 && (
                      <div className={styles.verificationBadge}>
                        <span className={styles.badgeCheck}>✓</span>
                        P45 Available
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Mobile Action Bar */}
      <div className={styles.mobileActionBar}>
        <button
          className={styles.mobileActionBtn}
          onClick={() => connectionStatus === 'none' ? setShowConnectionModal(true) : undefined}
        >
          {connectionStatus === 'pending' ? 'Request Pending' : 'Connect'}
        </button>
        {visibility.show_cv && candidate.cvUrl && (
          <a href={candidate.cvUrl} target="_blank" rel="noopener noreferrer" download>
            <button className={styles.mobileActionBtnOutline}>Download CV</button>
          </a>
        )}
      </div>

      {/* Connection Request Modal */}
      {showConnectionModal && (
        <div className={styles.modalOverlay} onClick={() => setShowConnectionModal(false)}>
          <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <h2 className={styles.modalTitle}>Connect with {candidate.fullName}</h2>
              <button className={styles.modalClose} onClick={() => setShowConnectionModal(false)}>×</button>
            </div>
            <div className={styles.modalBody}>
              <p className={styles.modalDescription}>
                Send a connection request to start a conversation. Include a personalized message to improve your chances of getting a response.
              </p>
              <div className={styles.modalField}>
                <label className={styles.modalLabel}>Message (optional)</label>
                <textarea
                  className={styles.modalTextarea}
                  placeholder={`Hi ${candidate.fullName.split(' ')[0]}, I came across your profile and would love to discuss an opportunity...`}
                  value={connectionMessage}
                  onChange={(e) => setConnectionMessage(e.target.value)}
                  rows={4}
                  maxLength={500}
                />
                <span className={styles.charCount}>{connectionMessage.length}/500</span>
              </div>
            </div>
            <div className={styles.modalFooter}>
              <button className={styles.modalCancelBtn} onClick={() => setShowConnectionModal(false)}>Cancel</button>
              <button
                className={styles.modalSendBtn}
                onClick={handleSendConnectionRequest}
                disabled={sendingRequest}
              >
                {sendingRequest ? 'Sending...' : 'Send Request'}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  )
}

'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import Header from '@/components/Header'
import JobSeekerProfileForm from '@/components/JobSeekerProfileForm'
import { supabase } from '@/lib/supabase'
import { DEV_MODE, getMockUser } from '@/lib/mockAuth'
import { FaLinkedinIn, FaInstagram, FaFacebookF } from 'react-icons/fa'
import styles from './page.module.css'

// Normalize URL to ensure it has https:// prefix
function normalizeUrl(url: string): string {
  if (!url || url.trim() === '') return ''
  let normalized = url.trim()
  if (!normalized.match(/^https?:\/\//i)) {
    normalized = 'https://' + normalized
  }
  return normalized
}

// Job sector labels lookup
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

export default function ProfilePage() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [userId, setUserId] = useState<string | null>(null)
  const [profileData, setProfileData] = useState<any>(null)
  const [editMode, setEditMode] = useState(false)

  const loadProfile = async () => {
    try {
      if (DEV_MODE) {
        const savedProfile = localStorage.getItem('currentTestProfile')

        if (savedProfile) {
          const profile = JSON.parse(savedProfile)
          setUserId(profile.id)
          setProfileData({
            photoPreview: profile.photoPreview || '',
            firstName: profile.firstName || '',
            lastName: profile.lastName || '',
            dateOfBirth: profile.dateOfBirth || '',
            nationality: profile.nationality || '',
            addressLine1: profile.addressLine1 || '',
            addressLine2: profile.addressLine2 || '',
            city: profile.city || '',
            county: profile.county || '',
            postcode: profile.postcode || '',
            phone: profile.phone || '',
            email: profile.email || '',
            jobSector: profile.jobSector || 'hospitality',
            currentPosition: profile.currentPosition || '',
            aboutMe: profile.aboutMe || '',
            personalBio: profile.personalBio || '',
            professionalSkills: profile.professionalSkills || [],
            workExperience: profile.workExperience || [],
            education: profile.education || [],
            languages: profile.languages || [],
            yearsExperience: profile.yearsExperience || 1,
            desiredSalary: profile.desiredSalary || '',
            salaryMin: profile.salaryMin || '',
            salaryMax: profile.salaryMax || '',
            salaryPeriod: profile.salaryPeriod || 'year',
            preferredJobTypes: profile.preferredJobTypes || [],
            workLocationPreferences: profile.workLocationPreferences || [],
            preferredLocations: profile.preferredLocations || '',
            availability: profile.availability || 'Available immediately',
            linkedinUrl: profile.linkedinUrl || '',
            instagramUrl: profile.instagramUrl || '',
            facebookUrl: profile.facebookUrl || '',
            cvFileName: profile.cvFileName || '',
            cvUrl: profile.cvUrl || '',
            hasNiNumber: profile.hasNiNumber || false,
            hasBankAccount: profile.hasBankAccount || false,
            hasRightToWork: profile.hasRightToWork || false,
            hasP45: profile.hasP45 || false,
            bankName: profile.bankName || '',
            sortCode: profile.sortCode || '',
            accountNumber: profile.accountNumber || '',
            accountHolderName: profile.accountHolderName || '',
          })
        } else {
          router.push('/register/employee')
          return
        }
        setLoading(false)
        return
      }

      const { data: { session } } = await supabase.auth.getSession()
      if (!session) {
        router.push('/login/employee')
        return
      }

      if (session.user.user_metadata?.role === 'employer') {
        router.push('/dashboard')
        return
      }

      setUserId(session.user.id)

      const { data: profile, error } = await supabase
        .from('candidate_profiles')
        .select('*')
        .eq('user_id', session.user.id)
        .single()

      if (error && error.code !== 'PGRST116') {
        console.error('Error loading profile:', error)
      }

      if (profile) {
        const nameParts = (profile.full_name || '').split(' ')
        const firstName = nameParts[0] || ''
        const lastName = nameParts.slice(1).join(' ') || ''

        const locationParts = (profile.location || '').split(', ')
        const city = locationParts[0] || ''
        const postcode = locationParts[1] || ''

        const workExperience = (profile.work_history || []).map((exp: any) => ({
          company: exp.company || '',
          role: exp.role || '',
          startDate: exp.start_date || '',
          endDate: exp.end_date || '',
          description: exp.description || '',
        }))

        setProfileData({
          photoPreview: profile.profile_picture_url || '',
          firstName,
          lastName,
          dateOfBirth: profile.date_of_birth || '',
          nationality: profile.nationality || '',
          addressLine1: profile.address_line_1 || '',
          addressLine2: profile.address_line_2 || '',
          city: profile.city || city,
          county: profile.county || '',
          postcode: profile.postcode || postcode,
          phone: profile.phone || '',
          email: profile.email || session.user.email || '',
          jobSector: profile.job_sector || 'hospitality',
          currentPosition: profile.job_title || '',
          aboutMe: profile.bio || '',
          personalBio: profile.personal_bio || '',
          professionalSkills: profile.skills || [],
          workExperience: workExperience.length > 0 ? workExperience : [{ company: '', role: '', startDate: '', endDate: '', description: '' }],
          education: (profile.education || []).map((edu: any) => ({
            institution: edu.institution || '', qualification: edu.qualification || '',
            fieldOfStudy: edu.field_of_study || edu.fieldOfStudy || '',
            startDate: edu.start_date || edu.startDate || '', endDate: edu.end_date || edu.endDate || '',
            inProgress: edu.in_progress ?? edu.inProgress ?? false, grade: edu.grade || '',
          })),
          languages: (profile.languages || []).map((lang: any) => ({
            name: lang.name || '', proficiency: lang.proficiency || 'Conversational',
          })),
          yearsExperience: profile.years_experience || 1,
          desiredSalary: profile.desired_salary || '',
          salaryMin: profile.salary_min ? String(profile.salary_min) : '',
          salaryMax: profile.salary_max ? String(profile.salary_max) : '',
          salaryPeriod: profile.salary_period || 'year',
          preferredJobTypes: profile.preferred_job_types || [],
          workLocationPreferences: profile.work_location_preferences || [],
          preferredLocations: profile.preferred_locations || '',
          availability: profile.availability || 'Available immediately',
          linkedinUrl: profile.linkedin_url || '',
          instagramUrl: profile.instagram_url || '',
          facebookUrl: profile.facebook_url || '',
          cvFileName: profile.cv_file_name || (profile.cv_url ? 'CV uploaded' : ''),
          cvUrl: profile.cv_url || '',
          hasNiNumber: profile.has_ni_number || false,
          hasBankAccount: profile.has_bank_account || false,
          hasRightToWork: profile.has_right_to_work || false,
          hasP45: profile.has_p45 || false,
          bankName: '',
          sortCode: '',
          accountNumber: '',
          accountHolderName: '',
        })
      }
    } catch (err) {
      console.error('Error loading profile:', err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadProfile()
  }, [router])

  const handleExitEdit = () => {
    setEditMode(false)
    setLoading(true)
    loadProfile()
  }

  if (loading) {
    return (
      <main className={styles.main}>
        <Header />
        <div className={styles.loadingContainer}>
          <div className={styles.loadingSpinner}></div>
          <p>Loading your profile...</p>
        </div>
      </main>
    )
  }

  // Edit mode - use the existing multi-step form
  if (editMode) {
    return (
      <main className={styles.main}>
        <Header />
        <div className={styles.container}>
          <div className={styles.header}>
            <div className={styles.headerRow}>
              <div>
                <h1 className={styles.title}>Edit Your Profile</h1>
                <p className={styles.subtitle}>
                  Keep your profile up to date to improve your chances with employers
                </p>
              </div>
              <button
                className={styles.viewBtn}
                onClick={handleExitEdit}
              >
                View Profile
              </button>
            </div>
          </div>

          {userId && (
            <JobSeekerProfileForm
              mode="edit"
              existingData={profileData}
              userId={userId}
            />
          )}
        </div>
      </main>
    )
  }

  // View mode - clean read-only profile display
  const fullName = `${profileData?.firstName || ''} ${profileData?.lastName || ''}`.trim()
  const initials = fullName.split(' ').map((n: string) => n[0]).join('').toUpperCase()
  const workExperience = (profileData?.workExperience || []).filter(
    (exp: any) => exp.company || exp.role
  )

  return (
    <main className={styles.main}>
      <Header />
      <div className={styles.container}>
        {/* Profile Header Card */}
        <div className={styles.profileCard}>
          <div className={styles.profileHeader}>
            <div className={styles.avatar}>
              {profileData?.photoPreview ? (
                <img src={profileData.photoPreview} alt={fullName} className={styles.avatarImg} />
              ) : (
                <span className={styles.avatarInitials}>{initials || '?'}</span>
              )}
            </div>
            <div className={styles.profileInfo}>
              <h1 className={styles.profileName}>{fullName || 'Your Name'}</h1>
              <p className={styles.profileTitle}>{profileData?.currentPosition || 'Add your job title'}</p>
              <div className={styles.profileMeta}>
                {profileData?.city && (
                  <span className={styles.metaItem}>
                    <span className={styles.metaIcon}>📍</span>
                    {profileData.city}{profileData.postcode ? `, ${profileData.postcode}` : ''}
                  </span>
                )}
                {profileData?.yearsExperience > 0 && (
                  <span className={styles.metaItem}>
                    <span className={styles.metaIcon}>⏱️</span>
                    {profileData.yearsExperience} {profileData.yearsExperience === 1 ? 'year' : 'years'} experience
                  </span>
                )}
                {profileData?.availability && (
                  <span className={styles.availBadge}>
                    {profileData.availability}
                  </span>
                )}
              </div>
            </div>
            <button
              className={styles.editBtn}
              onClick={() => setEditMode(true)}
            >
              Edit Profile
            </button>
          </div>
        </div>

        <div className={styles.profileGrid}>
          {/* Left Column */}
          <div className={styles.mainCol}>
            {/* About */}
            {profileData?.aboutMe && (
              <div className={styles.section}>
                <h2 className={styles.sectionTitle}>About</h2>
                <p className={styles.sectionText}>{profileData.aboutMe}</p>
              </div>
            )}

            {/* Professional Info */}
            <div className={styles.section}>
              <h2 className={styles.sectionTitle}>Professional Information</h2>
              <div className={styles.infoGrid}>
                {profileData?.jobSector && (
                  <div className={styles.infoItem}>
                    <span className={styles.infoLabel}>Job Sector</span>
                    <span className={styles.infoValue}>{JOB_SECTOR_LABELS[profileData.jobSector] || profileData.jobSector}</span>
                  </div>
                )}
                {profileData?.desiredSalary && (
                  <div className={styles.infoItem}>
                    <span className={styles.infoLabel}>Desired Salary</span>
                    <span className={styles.infoValue}>
                      £{profileData.desiredSalary}{profileData.salaryPeriod === 'hour' ? '/hour' : '/year'}
                    </span>
                  </div>
                )}
                {profileData?.availability && (
                  <div className={styles.infoItem}>
                    <span className={styles.infoLabel}>Availability</span>
                    <span className={styles.infoValue}>{profileData.availability}</span>
                  </div>
                )}
                {profileData?.yearsExperience > 0 && (
                  <div className={styles.infoItem}>
                    <span className={styles.infoLabel}>Experience</span>
                    <span className={styles.infoValue}>{profileData.yearsExperience} {profileData.yearsExperience === 1 ? 'year' : 'years'}</span>
                  </div>
                )}
              </div>
            </div>

            {/* Skills */}
            {profileData?.professionalSkills?.length > 0 && (
              <div className={styles.section}>
                <h2 className={styles.sectionTitle}>Skills</h2>
                <div className={styles.skillsGrid}>
                  {profileData.professionalSkills.map((skill: string, i: number) => (
                    <span key={i} className={styles.skillBadge}>{skill}</span>
                  ))}
                </div>
              </div>
            )}

            {/* Work Experience */}
            {workExperience.length > 0 && (
              <div className={styles.section}>
                <h2 className={styles.sectionTitle}>Work Experience</h2>
                <div className={styles.workHistory}>
                  {workExperience.map((exp: any, index: number) => (
                    <div key={index} className={styles.workItem}>
                      <div className={styles.workTimeline}>
                        <div className={styles.workDot}></div>
                        {index < workExperience.length - 1 && <div className={styles.workLine}></div>}
                      </div>
                      <div className={styles.workContent}>
                        <h3 className={styles.workRole}>{exp.role || 'Role not specified'}</h3>
                        <p className={styles.workCompany}>{exp.company}</p>
                        {(exp.startDate || exp.endDate) && (
                          <p className={styles.workDates}>
                            {exp.startDate || '?'} - {exp.endDate || 'Present'}
                          </p>
                        )}
                        {exp.description && (
                          <p className={styles.workDesc}>{exp.description}</p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Right Column */}
          <div className={styles.sideCol}>
            {/* Contact Information */}
            <div className={styles.sideCard}>
              <h3 className={styles.sideCardTitle}>Contact Information</h3>
              <div className={styles.contactList}>
                {profileData?.email && (
                  <div className={styles.contactItem}>
                    <span className={styles.contactIcon}>📧</span>
                    <div>
                      <span className={styles.contactLabel}>Email</span>
                      <span className={styles.contactValue}>{profileData.email}</span>
                    </div>
                  </div>
                )}
                {profileData?.phone && (
                  <div className={styles.contactItem}>
                    <span className={styles.contactIcon}>📱</span>
                    <div>
                      <span className={styles.contactLabel}>Phone</span>
                      <span className={styles.contactValue}>{profileData.phone}</span>
                    </div>
                  </div>
                )}
                {profileData?.addressLine1 && (
                  <div className={styles.contactItem}>
                    <span className={styles.contactIcon}>🏠</span>
                    <div>
                      <span className={styles.contactLabel}>Address</span>
                      <span className={styles.contactValue}>
                        {profileData.addressLine1}
                        {profileData.addressLine2 ? `, ${profileData.addressLine2}` : ''}
                        {profileData.city ? `, ${profileData.city}` : ''}
                        {profileData.postcode ? ` ${profileData.postcode}` : ''}
                      </span>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Personal Details */}
            <div className={styles.sideCard}>
              <h3 className={styles.sideCardTitle}>Personal Details</h3>
              <div className={styles.detailsList}>
                {profileData?.dateOfBirth && (
                  <div className={styles.detailItem}>
                    <span className={styles.detailLabel}>Date of Birth</span>
                    <span className={styles.detailValue}>
                      {new Date(profileData.dateOfBirth).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}
                    </span>
                  </div>
                )}
                {profileData?.nationality && (
                  <div className={styles.detailItem}>
                    <span className={styles.detailLabel}>Nationality</span>
                    <span className={styles.detailValue}>{profileData.nationality}</span>
                  </div>
                )}
              </div>
            </div>

            {/* Social Links */}
            {(profileData?.linkedinUrl || profileData?.instagramUrl || profileData?.facebookUrl) && (
              <div className={styles.sideCard}>
                <h3 className={styles.sideCardTitle}>Social Links</h3>
                <div className={styles.socialLinks}>
                  {profileData.linkedinUrl && (
                    <a
                      href={normalizeUrl(profileData.linkedinUrl)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={styles.socialLink}
                    >
                      <span className={`${styles.socialIcon} ${styles.linkedinIcon}`}><FaLinkedinIn /></span>
                      LinkedIn Profile
                    </a>
                  )}
                  {profileData.facebookUrl && (
                    <a
                      href={normalizeUrl(profileData.facebookUrl)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={styles.socialLink}
                    >
                      <span className={`${styles.socialIcon} ${styles.facebookIcon}`}><FaFacebookF /></span>
                      Facebook Profile
                    </a>
                  )}
                  {profileData.instagramUrl && (
                    <a
                      href={normalizeUrl(profileData.instagramUrl)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={styles.socialLink}
                    >
                      <span className={`${styles.socialIcon} ${styles.instagramIcon}`}><FaInstagram /></span>
                      Instagram Profile
                    </a>
                  )}
                </div>
              </div>
            )}

            {/* CV */}
            {profileData?.cvFileName && (
              <div className={styles.sideCard}>
                <h3 className={styles.sideCardTitle}>CV / Resume</h3>
                {profileData.cvUrl ? (
                  <a
                    href={profileData.cvUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={styles.cvLink}
                  >
                    <span className={styles.cvIcon}>
                      {profileData.cvFileName?.toLowerCase().endsWith('.pdf') ? (
                        <span className={styles.cvTypeIcon} style={{ background: '#ef4444' }}>PDF</span>
                      ) : (
                        <span className={styles.cvTypeIcon} style={{ background: '#2b5797' }}>W</span>
                      )}
                    </span>
                    <span className={styles.cvName}>{profileData.cvFileName}</span>
                    <span className={styles.cvDownload}>↗</span>
                  </a>
                ) : (
                  <div className={styles.cvInfo}>
                    <span className={styles.cvIcon}>
                      {profileData.cvFileName?.toLowerCase().endsWith('.pdf') ? (
                        <span className={styles.cvTypeIcon} style={{ background: '#ef4444' }}>PDF</span>
                      ) : (
                        <span className={styles.cvTypeIcon} style={{ background: '#2b5797' }}>W</span>
                      )}
                    </span>
                    <span className={styles.cvName}>{profileData.cvFileName}</span>
                  </div>
                )}
              </div>
            )}

            {/* Verification Badges */}
            {(profileData?.hasNiNumber || profileData?.hasBankAccount || profileData?.hasRightToWork || profileData?.hasP45) && (
              <div className={styles.sideCard}>
                <h3 className={styles.sideCardTitle}>Verified Documents</h3>
                <div className={styles.verifyList}>
                  {profileData.hasNiNumber && (
                    <div className={styles.verifyItem}>
                      <span className={styles.verifyCheck}>✓</span>
                      <span>NI Number</span>
                    </div>
                  )}
                  {profileData.hasBankAccount && (
                    <div className={styles.verifyItem}>
                      <span className={styles.verifyCheck}>✓</span>
                      <span>UK Bank Account</span>
                    </div>
                  )}
                  {profileData.hasRightToWork && (
                    <div className={styles.verifyItem}>
                      <span className={styles.verifyCheck}>✓</span>
                      <span>Right to Work</span>
                    </div>
                  )}
                  {profileData.hasP45 && (
                    <div className={styles.verifyItem}>
                      <span className={styles.verifyCheck}>✓</span>
                      <span>P45 Available</span>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Bank Details (private) */}
            {(profileData?.bankName || profileData?.sortCode || profileData?.accountNumber) && (
              <div className={styles.sideCard}>
                <h3 className={styles.sideCardTitle}>Bank Details</h3>
                <div className={styles.bankPrivateNote}>
                  <span>🔒</span>
                  <span>Bank details are private and never shown to employers</span>
                </div>
                <div className={styles.detailsList}>
                  {profileData.bankName && (
                    <div className={styles.detailItem}>
                      <span className={styles.detailLabel}>Bank</span>
                      <span className={styles.detailValue}>{profileData.bankName}</span>
                    </div>
                  )}
                  {profileData.accountHolderName && (
                    <div className={styles.detailItem}>
                      <span className={styles.detailLabel}>Account Holder</span>
                      <span className={styles.detailValue}>{profileData.accountHolderName}</span>
                    </div>
                  )}
                  {profileData.sortCode && (
                    <div className={styles.detailItem}>
                      <span className={styles.detailLabel}>Sort Code</span>
                      <span className={styles.detailValue}>{profileData.sortCode}</span>
                    </div>
                  )}
                  {profileData.accountNumber && (
                    <div className={styles.detailItem}>
                      <span className={styles.detailLabel}>Account Number</span>
                      <span className={styles.detailValue}>****{profileData.accountNumber.slice(-4)}</span>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Settings Link */}
            <div className={styles.sideCard}>
              <h3 className={styles.sideCardTitle}>Profile Settings</h3>
              <p className={styles.settingsNote}>Control what employers can see on your profile</p>
              <Link href="/settings/profile" className={styles.settingsLink}>
                Manage Profile Settings
              </Link>
            </div>
          </div>
        </div>
      </div>
    </main>
  )
}

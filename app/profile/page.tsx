'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import Header from '@/components/Header'
import SignedImage from '@/components/SignedImage'
import SignedLink from '@/components/SignedLink'
import JobSeekerProfileForm from '@/components/JobSeekerProfileForm'
import { supabase } from '@/lib/supabase'
import { DEV_MODE, getMockUser } from '@/lib/mockAuth'
import { describePreferredAreas } from '@/lib/areas'
import { FaLinkedinIn } from 'react-icons/fa'
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
import { getCategoryLabel } from '@/lib/categories'
import { Ico } from '@/components/icons'
const JOB_SECTOR_LABELS: Record<string, string> = new Proxy({} as Record<string, string>, {
  get: (_target, key: string) => getCategoryLabel(key),
})

export default function ProfilePage() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [userId, setUserId] = useState<string | null>(null)
  const [profileData, setProfileData] = useState<any>(null)
  const [editMode, setEditMode] = useState(false)

  // Auto-enter edit mode when arriving via a "Profile Completion" deep-link
  // (e.g. /profile?section=cv) or the legacy #job-preferences hash, so the
  // user lands straight in the editable form at the right field.
  useEffect(() => {
    if (typeof window === 'undefined') return
    const hasSection = new URLSearchParams(window.location.search).get('section')
    if (hasSection || window.location.hash === '#job-preferences') setEditMode(true)
  }, [])
  const [employerPreview, setEmployerPreview] = useState(false)

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
            jobSector: profile.jobSector || '',
            currentPosition: profile.currentPosition || '',
            personalBio: profile.personalBio || '',
            professionalSkills: profile.professionalSkills || [],
            headline: profile.headline || '',
            specialties: profile.specialties || [],
            notableVenues: profile.notableVenues || [],
            certifications: profile.certifications || [],
            interests: profile.interests || [],
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
            preferredAreas: profile.preferredAreas || [],
            availability: profile.availability || 'Available immediately',
            linkedinUrl: profile.linkedinUrl || '',
            cvFileName: profile.cvFileName || '',
            cvUrl: profile.cvUrl || '',
            hasNiNumber: profile.hasNiNumber || false,
            hasRightToWork: profile.hasRightToWork || false,
            hasP45: profile.hasP45 || false,
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
          // No default here. Defaulting to 'hospitality' made the form and the
          // profile card display a sector the database had never stored, so the
          // dashboard kept prompting "+ Job sector" for a field that looked
          // filled in — and saving didn't help, because job_sector was missing
          // from the edit payload entirely. Show the true stored value.
          jobSector: profile.job_sector || '',
          currentPosition: profile.job_title || '',
          personalBio: profile.personal_bio || '',
          professionalSkills: profile.skills || [],
          headline: profile.headline || '',
          specialties: profile.specialties || [],
          notableVenues: profile.notable_venues || [],
          certifications: profile.certifications || [],
          interests: profile.interests || [],
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
          preferredAreas: profile.preferred_areas || [],
          availability: profile.availability || 'Available immediately',
          linkedinUrl: profile.linkedin_url || '',
          cvFileName: profile.cv_file_name || (profile.cv_url ? 'CV uploaded' : ''),
          cvUrl: profile.cv_url || '',
          hasNiNumber: profile.has_ni_number || false,
          hasRightToWork: profile.has_right_to_work || false,
          hasP45: profile.has_p45 || false,
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
        <button className={styles.backBtn} onClick={() => router.push('/dashboard')}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6" /></svg>
          Back to Dashboard
        </button>

        {/* Profile Header Card */}
        <div className={styles.profileCard}>
          <div className={styles.profileHeader}>
            <div className={styles.avatar}>
              {profileData?.photoPreview ? (
                <SignedImage src={profileData.photoPreview} alt={fullName} className={styles.avatarImg} />
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
                    <span className={styles.metaIcon}><Ico name="map-pin" size={20} /></span>
                    {profileData.city}{profileData.postcode ? `, ${profileData.postcode}` : ''}
                  </span>
                )}
                {profileData?.yearsExperience > 0 && (
                  <span className={styles.metaItem}>
                    <span className={styles.metaIcon}><Ico name="timer" size={20} /></span>
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
              className={`${styles.previewBtn} ${employerPreview ? styles.previewBtnActive : ''}`}
              onClick={() => setEmployerPreview(p => !p)}
            >
              {employerPreview ? 'Viewing as employer' : 'Preview as employer'}
            </button>
            <button
              className={styles.editBtn}
              onClick={() => setEditMode(true)}
            >
              Edit Profile
            </button>
          </div>
        </div>

        {employerPreview && (
          <div className={styles.previewBanner}>
            <Ico name="eye" size={16} /> Employer preview — this is what recruiters see on your profile. Private fields are hidden.
            <button className={styles.previewBannerClose} onClick={() => setEmployerPreview(false)}>Exit preview</button>
          </div>
        )}

        <div className={styles.profileGrid}>
          {/* Left Column */}
          <div className={styles.mainCol}>
            {/* About — reads personalBio, the one box that actually exists in
                the editor. Was reading aboutMe, which had no input anywhere. */}
            {profileData?.personalBio && (
              <div className={styles.section}>
                <h2 className={styles.sectionTitle}>About</h2>
                <p className={styles.sectionText}>{profileData.personalBio}</p>
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

            {/* WHAT WE MATCH YOU ON.

                Both of these were already collected, already stored and already
                driving matching — and neither was ever shown back. They were
                loaded into this component's state and never rendered.

                preferred_areas is the one that matters. It is the ONLY HARD
                filter in candidate matching: the single field that can empty a
                candidate's list entirely. A chef could not see the thing
                deciding whether they hear about any job at all.

                Rendered TOGETHER and named for what they do, rather than
                scattered among the other facts, because the useful thing is not
                "here are two more fields" — it is "this is what we use".

                An empty one is a PROMPT, not a missing row. 26 of 40 candidates
                have no preferred areas set; a blank tells them nothing, and an
                absent section tells them less. */}
            <div className={styles.section}>
              <h2 className={styles.sectionTitle}>What we match you on</h2>
              <div className={styles.infoGrid}>
                <div className={styles.infoItem}>
                  <span className={styles.infoLabel}>Where you&apos;ll work</span>
                  <span className={styles.infoValue}>
                    {describePreferredAreas(profileData?.preferredAreas).length > 0
                      ? describePreferredAreas(profileData?.preferredAreas).join(' · ')
                      : <button type="button" className={styles.matchPrompt} onClick={() => setEditMode(true)}>
                          Not set — you&apos;ll be shown jobs anywhere. Choose your areas →
                        </button>}
                  </span>
                </div>
                <div className={styles.infoItem}>
                  <span className={styles.infoLabel}>Type of work</span>
                  <span className={styles.infoValue}>
                    {profileData?.preferredJobTypes?.length > 0
                      ? profileData.preferredJobTypes.join(' · ')
                      : <button type="button" className={styles.matchPrompt} onClick={() => setEditMode(true)}>
                          Not set — add full-time, part-time or flexible →
                        </button>}
                  </span>
                </div>
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

            {/* Education */}
            {profileData?.education?.filter((edu: any) => edu.institution || edu.qualification).length > 0 && (
              <div className={styles.section}>
                <h2 className={styles.sectionTitle}>Education</h2>
                <div className={styles.workHistory}>
                  {profileData.education.filter((edu: any) => edu.institution || edu.qualification).map((edu: any, index: number) => (
                    <div key={index} className={styles.workItem}>
                      <div className={styles.workTimeline}>
                        <div className={styles.workDot}></div>
                        {index < profileData.education.filter((e: any) => e.institution || e.qualification).length - 1 && <div className={styles.workLine}></div>}
                      </div>
                      <div className={styles.workContent}>
                        <h3 className={styles.workRole}>{edu.qualification}{edu.fieldOfStudy ? ` in ${edu.fieldOfStudy}` : ''}</h3>
                        <p className={styles.workCompany}>{edu.institution}</p>
                        {(edu.startDate || edu.endDate) && (
                          <p className={styles.workDates}>
                            {edu.startDate || '?'} — {edu.inProgress ? 'In Progress' : (edu.endDate || 'Present')}
                          </p>
                        )}
                        {edu.grade && <p className={styles.workDesc}>Grade: {edu.grade}</p>}
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
            {!employerPreview && (
            <div className={styles.sideCard}>
              <h3 className={styles.sideCardTitle}>Contact Information</h3>
              <div className={styles.contactList}>
                {profileData?.email && (
                  <div className={styles.contactItem}>
                    <span className={styles.contactIcon}><Ico name="mail" size={20} /></span>
                    <div>
                      <span className={styles.contactLabel}>Email</span>
                      <span className={styles.contactValue}>{profileData.email}</span>
                    </div>
                  </div>
                )}
                {profileData?.phone && (
                  <div className={styles.contactItem}>
                    <span className={styles.contactIcon}><Ico name="smartphone" size={20} /></span>
                    <div>
                      <span className={styles.contactLabel}>Phone</span>
                      <span className={styles.contactValue}>{profileData.phone}</span>
                    </div>
                  </div>
                )}
                {profileData?.addressLine1 && (
                  <div className={styles.contactItem}>
                    <span className={styles.contactIcon}><Ico name="home" size={20} /></span>
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
            )}

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

            {/* LinkedIn only. Facebook and Instagram were removed from the
                candidate profile — they're personal accounts that tell an
                employer nothing about someone's work, and inviting them
                encourages sharing more than a job application needs.
                LinkedIn stays because it's professional and lines up with
                Continue-with-LinkedIn. */}
            {profileData?.linkedinUrl && (
              <div className={styles.sideCard}>
                <h3 className={styles.sideCardTitle}>LinkedIn</h3>
                <div className={styles.socialLinks}>
                  <a
                    href={normalizeUrl(profileData.linkedinUrl)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={styles.socialLink}
                  >
                    <span className={`${styles.socialIcon} ${styles.linkedinIcon}`}><FaLinkedinIn /></span>
                    LinkedIn Profile
                  </a>
                </div>
              </div>
            )}

            {/* CV */}
            {profileData?.cvFileName && (
              <div className={styles.sideCard}>
                <h3 className={styles.sideCardTitle}>CV / Resume</h3>
                {profileData.cvUrl ? (
                  <SignedLink
                    src={profileData.cvUrl}
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
                  </SignedLink>
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
            {(profileData?.hasNiNumber || profileData?.hasRightToWork || profileData?.hasP45) && (
              <div className={styles.sideCard}>
                <h3 className={styles.sideCardTitle}>Verified Documents</h3>
                <div className={styles.verifyList}>
                  {profileData.hasNiNumber && (
                    <div className={styles.verifyItem}>
                      <span className={styles.verifyCheck}>✓</span>
                      <span>NI Number</span>
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

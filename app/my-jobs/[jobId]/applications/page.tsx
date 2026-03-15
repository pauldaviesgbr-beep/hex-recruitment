'use client'

import { useState, useEffect } from 'react'
import { useRouter, useParams } from 'next/navigation'
import Link from 'next/link'
import Header from '@/components/Header'
import ScheduleInterviewModal from '@/components/ScheduleInterviewModal'
import MakeOfferModal from '@/components/MakeOfferModal'
import { supabase } from '@/lib/supabase'
import { useJobs } from '@/lib/JobsContext'
import { Interview, Offer } from '@/lib/types'
import styles from './page.module.css'

interface Application {
  id: string
  jobId: string
  jobTitle: string
  company: string
  coverLetter: string
  appliedAt: string
  status: 'pending' | 'reviewing' | 'interviewing' | 'hired' | 'rejected' | 'offered' | 'shortlisted'
  candidateId: string
  candidateName: string
  candidateEmail: string
  candidatePhone: string
  candidatePhoto: string | null
  candidatePosition: string
  candidateCity: string
  candidateCv: string | null
  interview?: Interview
  offer?: Offer
}

export default function JobApplicationsPage() {
  const router = useRouter()
  const params = useParams()
  const jobId = params.jobId as string
  const { jobs, refreshJobs } = useJobs()

  const [loading, setLoading] = useState(true)
  const [applications, setApplications] = useState<Application[]>([])
  const [job, setJob] = useState<any>(null)
  const [isEmployer, setIsEmployer] = useState(false)
  const [scheduleModalOpen, setScheduleModalOpen] = useState(false)
  const [selectedApplication, setSelectedApplication] = useState<Application | null>(null)
  const [offerModalOpen, setOfferModalOpen] = useState(false)
  const [offerApplication, setOfferApplication] = useState<Application | null>(null)
  const [activeTab, setActiveTab] = useState<'all' | 'pending' | 'shortlisted' | 'interviewing' | 'offers' | 'hired'>('all')

  useEffect(() => {
    const checkAuthAndLoadData = async () => {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session || session.user.user_metadata?.role !== 'employer') {
        router.push('/login')
        return
      }
      setIsEmployer(true)

      // Find the job
      const foundJob = jobs.find(j => j.id === jobId)
      setJob(foundJob)

      // Load applications from Supabase (no JOIN — fetch candidates separately)
      const { data, error } = await supabase
        .from('job_applications')
        .select('*')
        .eq('job_id', jobId)
        .order('applied_at', { ascending: false })

      if (!error && data && data.length > 0) {
        // Auto-set viewed_at for unviewed applications and send notifications
        const unviewedRows = data.filter((row: any) => !row.viewed_at)
        if (unviewedRows.length > 0) {
          const unviewedIds = unviewedRows.map((row: any) => row.id)
          await supabase
            .from('job_applications')
            .update({ viewed_at: new Date().toISOString() })
            .in('id', unviewedIds)

          // Send "Application Viewed" notifications to candidates
          for (const row of unviewedRows) {
            await supabase.from('notifications').insert({
              user_id: row.candidate_id,
              type: 'application_update',
              title: 'Application Viewed',
              message: `Your application for ${foundJob?.title || 'a position'} at ${foundJob?.company || 'a company'} has been viewed by the employer.`,
              read: false,
              related_id: row.id,
              related_type: 'application',
            })
          }
        }

        // Fetch candidate profiles for all applicants
        const candidateIds = data.map((row: any) => row.candidate_id)
        const { data: profiles, error: profileError } = await supabase
          .from('candidate_profiles')
          .select('*')
          .in('user_id', candidateIds)

        if (profileError) {
          console.error('Failed to fetch candidate profiles:', profileError.message)
        }

        const profileMap: Record<string, any> = {}
        if (profiles) {
          profiles.forEach((p: any) => { profileMap[p.user_id] = p })
        }

        // Fetch interviews for these applications
        const applicationIds = data.map((row: any) => row.id)
        const { data: interviews } = await supabase
          .from('interviews')
          .select('*')
          .in('application_id', applicationIds)
          .in('status', ['scheduled', 'confirmed', 'completed'])

        const interviewMap: Record<string, any> = {}
        if (interviews) {
          interviews.forEach((i: any) => { interviewMap[i.application_id] = i })
        }

        // Fetch offers for these applications
        const { data: offers } = await supabase
          .from('job_offers')
          .select('*')
          .in('application_id', applicationIds)

        const offerMap: Record<string, any> = {}
        if (offers) {
          offers.forEach((o: any) => { offerMap[o.application_id] = o })
        }

        const mapped: Application[] = data.map((row: any) => {
          const profile = profileMap[row.candidate_id]
          const interview = interviewMap[row.id]
          const offer = offerMap[row.id]
          return {
            id: row.id,
            jobId: row.job_id,
            jobTitle: foundJob?.title || row.job_title || 'Unknown',
            company: foundJob?.company || row.company || 'Unknown',
            coverLetter: row.cover_letter || '',
            appliedAt: row.applied_at,
            status: row.status === 'pending' ? 'pending' : row.status,
            candidateId: row.candidate_id,
            candidateName: profile?.full_name || row.candidate_name || 'Applicant',
            candidateEmail: profile?.email || '',
            candidatePhone: profile?.phone || '',
            candidatePhoto: profile?.profile_picture_url || null,
            candidatePosition: profile?.job_title || 'Job Seeker',
            candidateCity: profile?.location || profile?.city || '',
            candidateCv: profile?.cv_url || null,
            interview: interview ? {
              id: interview.id,
              applicationId: interview.application_id,
              jobId: interview.job_id,
              employerId: interview.employer_id,
              candidateId: interview.candidate_id,
              interviewDate: interview.interview_date,
              interviewTime: interview.interview_time,
              durationMinutes: interview.duration_minutes,
              interviewType: interview.interview_type,
              locationOrLink: interview.location_or_link,
              notes: interview.notes,
              status: interview.status,
              createdAt: interview.created_at,
              updatedAt: interview.updated_at,
            } : undefined,
            offer: offer ? {
              id: offer.id,
              applicationId: offer.application_id,
              jobId: offer.job_id,
              employerId: offer.employer_id,
              candidateId: offer.candidate_id,
              salary: offer.salary,
              startDate: offer.start_date,
              contractType: offer.contract_type,
              additionalTerms: offer.additional_terms,
              offerLetterUrl: offer.offer_letter_url,
              status: offer.status,
              signatureName: offer.signature_name,
              signatureTimestamp: offer.signature_timestamp,
              declineReason: offer.decline_reason,
              createdAt: offer.created_at,
              updatedAt: offer.updated_at,
            } : undefined,
          }
        })
        setApplications(mapped)
      }

      setLoading(false)
    }

    checkAuthAndLoadData()
  }, [jobId, jobs, router])

  const loadApplications = async () => {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) return

    const foundJob = jobs.find(j => j.id === jobId)
    setJob(foundJob)

    const { data, error } = await supabase
      .from('job_applications')
      .select('*')
      .eq('job_id', jobId)
      .order('applied_at', { ascending: false })

    if (!error && data && data.length > 0) {
      const candidateIds = data.map((row: any) => row.candidate_id)
      const { data: profiles } = await supabase
        .from('candidate_profiles')
        .select('*')
        .in('user_id', candidateIds)

      const profileMap: Record<string, any> = {}
      if (profiles) {
        profiles.forEach((p: any) => { profileMap[p.user_id] = p })
      }

      const applicationIds = data.map((row: any) => row.id)
      const { data: interviews } = await supabase
        .from('interviews')
        .select('*')
        .in('application_id', applicationIds)
        .in('status', ['scheduled', 'confirmed', 'completed'])

      const interviewMap: Record<string, any> = {}
      if (interviews) {
        interviews.forEach((i: any) => { interviewMap[i.application_id] = i })
      }

      // Fetch offers for these applications
      const { data: offers } = await supabase
        .from('job_offers')
        .select('*')
        .in('application_id', applicationIds)

      const offerMap: Record<string, any> = {}
      if (offers) {
        offers.forEach((o: any) => { offerMap[o.application_id] = o })
      }

      const mapped: Application[] = data.map((row: any) => {
        const profile = profileMap[row.candidate_id]
        const interview = interviewMap[row.id]
        const offer = offerMap[row.id]
        return {
          id: row.id,
          jobId: row.job_id,
          jobTitle: foundJob?.title || row.job_title || 'Unknown',
          company: foundJob?.company || row.company || 'Unknown',
          coverLetter: row.cover_letter || '',
          appliedAt: row.applied_at,
          status: row.status === 'pending' ? 'pending' : row.status,
          candidateId: row.candidate_id,
          candidateName: profile?.full_name || row.candidate_name || 'Applicant',
          candidateEmail: profile?.email || '',
          candidatePhone: profile?.phone || '',
          candidatePhoto: profile?.profile_picture_url || null,
          candidatePosition: profile?.job_title || 'Job Seeker',
          candidateCity: profile?.location || profile?.city || '',
          candidateCv: profile?.cv_url || null,
          interview: interview ? {
            id: interview.id,
            applicationId: interview.application_id,
            jobId: interview.job_id,
            employerId: interview.employer_id,
            candidateId: interview.candidate_id,
            interviewDate: interview.interview_date,
            interviewTime: interview.interview_time,
            durationMinutes: interview.duration_minutes,
            interviewType: interview.interview_type,
            locationOrLink: interview.location_or_link,
            notes: interview.notes,
            status: interview.status,
            createdAt: interview.created_at,
            updatedAt: interview.updated_at,
          } : undefined,
          offer: offer ? {
            id: offer.id,
            applicationId: offer.application_id,
            jobId: offer.job_id,
            employerId: offer.employer_id,
            candidateId: offer.candidate_id,
            salary: offer.salary,
            startDate: offer.start_date,
            contractType: offer.contract_type,
            additionalTerms: offer.additional_terms,
            offerLetterUrl: offer.offer_letter_url,
            status: offer.status,
            signatureName: offer.signature_name,
            signatureTimestamp: offer.signature_timestamp,
            declineReason: offer.decline_reason,
            createdAt: offer.created_at,
            updatedAt: offer.updated_at,
          } : undefined,
        }
      })
      setApplications(mapped)
    }
  }

  const updateApplicationStatus = async (applicationId: string, newStatus: Application['status']) => {
    const application = applications.find(a => a.id === applicationId)

    await supabase
      .from('job_applications')
      .update({ status: newStatus, status_updated_at: new Date().toISOString() })
      .eq('id', applicationId)

    // Send explicit notification for rejection (no generic trigger)
    if (newStatus === 'rejected' && application) {
      await supabase.from('notifications').insert({
        user_id: application.candidateId,
        type: 'application_update',
        title: 'Application Update',
        message: `Your application for ${application.jobTitle} at ${application.company} was not selected to move forward.`,
        read: false,
        related_id: applicationId,
        related_type: 'application',
      })

      // Send email notification
      fetch('/api/email/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to: application.candidateEmail,
          type: 'application_status',
          data: { status: 'rejected', companyName: application.company, jobTitle: application.jobTitle },
        }),
      }).catch(() => {})
    }

    setApplications(prev =>
      prev.map(app => app.id === applicationId ? { ...app, status: newStatus } : app)
    )
  }

  const handleShortlist = async (application: Application) => {
    await supabase
      .from('job_applications')
      .update({
        status: 'shortlisted',
        shortlisted_at: new Date().toISOString(),
        status_updated_at: new Date().toISOString(),
      })
      .eq('id', application.id)

    // Send notification to candidate
    await supabase.from('notifications').insert({
      user_id: application.candidateId,
      type: 'application_update',
      title: 'Application Shortlisted',
      message: `Great news! Your application for ${application.jobTitle} at ${application.company} has been shortlisted.`,
      read: false,
      related_id: application.id,
      related_type: 'application',
    })

    // Send email notification
    fetch('/api/email/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        to: application.candidateEmail,
        type: 'application_status',
        data: { status: 'shortlisted', companyName: application.company, jobTitle: application.jobTitle },
      }),
    }).catch(() => {})

    setApplications(prev =>
      prev.map(a => a.id === application.id ? { ...a, status: 'shortlisted' as const } : a)
    )
  }

  const handleScheduleInterview = (application: Application) => {
    setSelectedApplication(application)
    setScheduleModalOpen(true)
  }

  const handleConfirmHire = async (application: Application) => {
    const confirmed = confirm(`Confirm hire for ${application.candidateName}?`)
    if (!confirmed) return

    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) return

      // Update application status to 'hired'
      await supabase
        .from('job_applications')
        .update({ status: 'hired' })
        .eq('id', application.id)

      // Update job status to 'filled'
      await supabase
        .from('jobs')
        .update({ status: 'filled' })
        .eq('id', application.jobId)

      // Send notification to candidate
      await supabase.from('notifications').insert({
        user_id: application.candidateId,
        title: 'Hire Confirmed!',
        message: `Congratulations! Your hire has been confirmed for ${application.jobTitle} at ${application.company}.`,
        type: 'application_update',
        read: false,
        related_id: application.id,
        related_type: 'application',
      })

      // Send email notification
      fetch('/api/email/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to: application.candidateEmail,
          type: 'application_status',
          data: { status: 'hired', companyName: application.company, jobTitle: application.jobTitle },
        }),
      }).catch(() => {})

      // Send message via conversation
      const messageContent = [
        `Hello ${application.candidateName},`,
        '',
        `Congratulations! Your hire for the ${application.jobTitle} position at ${application.company} has been officially confirmed.`,
        '',
        'We look forward to welcoming you to the team!',
        '',
        'Best regards,',
        application.company,
      ].join('\n')

      let conversationId: string | null = null
      const { data: existingConv } = await supabase
        .from('conversations')
        .select('id')
        .or(`and(participant_1.eq.${session.user.id},participant_2.eq.${application.candidateId}),and(participant_1.eq.${application.candidateId},participant_2.eq.${session.user.id})`)
        .eq('related_job_id', application.jobId)
        .maybeSingle()

      if (existingConv) {
        conversationId = existingConv.id
      } else {
        const { data: newConv } = await supabase
          .from('conversations')
          .insert({
            participant_1: session.user.id,
            participant_2: application.candidateId,
            participant_1_name: application.company,
            participant_1_role: 'employer',
            participant_1_company: application.company,
            participant_2_name: application.candidateName,
            participant_2_role: 'candidate',
            related_job_id: application.jobId,
            related_job_title: application.jobTitle,
            last_message: messageContent,
            last_message_at: new Date().toISOString(),
          })
          .select()
          .single()

        conversationId = newConv?.id || null
      }

      if (conversationId) {
        await supabase.from('messages').insert({
          conversation_id: conversationId,
          sender_id: session.user.id,
          sender_name: application.company,
          sender_role: 'employer',
          content: messageContent,
          is_read: false,
        })

        if (existingConv) {
          await supabase.from('conversations').update({
            last_message: messageContent,
            last_message_at: new Date().toISOString(),
          }).eq('id', conversationId)
        }
      }

      loadApplications()
      refreshJobs()
    } catch (err) {
      console.error('Error confirming hire:', err)
    }
  }

  const handleCancelInterview = async (interviewId: string, applicationId: string) => {
    const confirmed = confirm('Are you sure you want to cancel this interview?')
    if (!confirmed) return

    await supabase
      .from('interviews')
      .update({ status: 'cancelled' })
      .eq('id', interviewId)

    // Reload applications to refresh interview data
    loadApplications()
  }

  const formatDate = (dateString: string) => {
    const date = new Date(dateString)
    return date.toLocaleDateString('en-GB', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    })
  }

  const getInitials = (name: string) => {
    return name
      .split(' ')
      .map(n => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2)
  }

  if (loading) {
    return (
      <main>
        <Header />
        <div className={styles.container}>
          <p className={styles.loading}>Loading applications...</p>
        </div>
      </main>
    )
  }

  if (!isEmployer) {
    return null
  }

  return (
    <main>
      <Header />

      <div className={styles.container}>
        {/* Back Link & Header */}
        <div className={styles.header}>
          <button className={styles.backLink} style={{ border: 'none', background: 'none', padding: 0, cursor: 'pointer' }} onClick={() => router.push('/my-jobs')}>
            <span className={styles.backArrow}>←</span>
            Back to My Jobs
          </button>

          <div className={styles.jobInfo}>
            <h1 className={styles.title}>
              Applications for {job?.title || 'Job'}
            </h1>
            <p className={styles.subtitle}>
              {job?.company} • {job?.location}
            </p>
          </div>

          <div className={styles.statsRow}>
            <div className={styles.stat}>
              <span className={styles.statNumber}>{applications.length}</span>
              <span className={styles.statLabel}>Total Applications</span>
            </div>
            <div className={styles.stat}>
              <span className={styles.statNumber}>
                {applications.filter(a => a.status === 'pending').length}
              </span>
              <span className={styles.statLabel}>Pending Review</span>
            </div>
            <div className={styles.stat}>
              <span className={styles.statNumber}>
                {applications.filter(a => a.status === 'interviewing').length}
              </span>
              <span className={styles.statLabel}>Interviewing</span>
            </div>
          </div>
        </div>

        {/* Filter Tabs */}
        {applications.length > 0 && (
          <div className={styles.tabBar}>
            {([
              { key: 'all', label: 'All', count: applications.length },
              { key: 'pending', label: 'Pending Review', count: applications.filter(a => ['pending', 'reviewing'].includes(a.status)).length },
              { key: 'shortlisted', label: 'Shortlisted', count: applications.filter(a => a.status === 'shortlisted').length },
              { key: 'interviewing', label: 'Interviewing', count: applications.filter(a => a.status === 'interviewing').length },
              { key: 'offers', label: 'Offers', count: applications.filter(a => a.status === 'offered').length },
              { key: 'hired', label: 'Hired', count: applications.filter(a => a.status === 'hired').length },
            ] as const).map(tab => (
              <button
                key={tab.key}
                className={`${styles.tab} ${activeTab === tab.key ? styles.tabActive : ''}`}
                onClick={() => setActiveTab(tab.key)}
              >
                {tab.label}
                <span className={`${styles.tabCount} ${activeTab === tab.key ? styles.tabCountActive : ''}`}>
                  {tab.count}
                </span>
              </button>
            ))}
          </div>
        )}

        {/* Applications List */}
        {applications.length === 0 ? (
          <div className={styles.emptyState}>
            <span className={styles.emptyIcon}>📭</span>
            <h2 className={styles.emptyTitle}>No applications yet</h2>
            <p className={styles.emptyText}>
              No candidates have applied to this position yet.
              Share this job to get more applications!
            </p>
            <div className={styles.emptyActions}>
              <button
                className={styles.shareBtn}
                onClick={() => {
                  navigator.clipboard.writeText(window.location.origin + '/jobs?id=' + jobId)
                  alert('Job link copied to clipboard!')
                }}
              >
                📋 Copy Job Link
              </button>
              <button className={styles.backBtn} onClick={() => router.push('/my-jobs')}>
                Back to My Jobs
              </button>
            </div>
          </div>
        ) : (
          <div className={styles.applicationsList}>
            {applications
              .filter(a => {
                if (activeTab === 'all') return true
                if (activeTab === 'pending') return ['pending', 'reviewing'].includes(a.status)
                if (activeTab === 'shortlisted') return a.status === 'shortlisted'
                if (activeTab === 'interviewing') return a.status === 'interviewing'
                if (activeTab === 'offers') return a.status === 'offered'
                if (activeTab === 'hired') return a.status === 'hired'
                return true
              })
              .map(application => {
              return (
                <div key={application.id} className={styles.applicationCard}>
                  <div className={styles.cardMain}>
                    {/* Candidate Photo */}
                    <div className={styles.candidatePhoto}>
                      {application.candidatePhoto ? (
                        <img
                          src={application.candidatePhoto}
                          alt={application.candidateName}
                          className={styles.photoImage}
                        />
                      ) : (
                        <div className={styles.photoPlaceholder}>
                          {getInitials(application.candidateName)}
                        </div>
                      )}
                    </div>

                    {/* Candidate Info */}
                    <div className={styles.candidateInfo}>
                      <h3 className={styles.candidateName}>{application.candidateName}</h3>
                      <p className={styles.candidatePosition}>{application.candidatePosition}</p>
                      {application.candidateCity && (
                        <p className={styles.candidateLocation}>
                          <span className={styles.locationIcon}>📍</span>
                          {application.candidateCity}
                        </p>
                      )}
                      <p className={styles.appliedDate}>
                        Applied {formatDate(application.appliedAt)}
                      </p>
                    </div>

                    {/* View Profile (top right) */}
                    <div className={styles.profileLinkSection}>
                      <Link
                        href={`/candidates/${application.candidateId}`}
                        className={styles.viewProfileLink}
                      >
                        View Profile
                      </Link>
                    </div>
                  </div>

                  {/* Interview Details */}
                  {application.interview && (
                    <div className={styles.interviewSection}>
                      <h4 className={styles.interviewTitle}>
                        {application.interview.status === 'completed'
                          ? '✅ Interview Completed'
                          : '📅 Scheduled Interview'}
                      </h4>
                      <div className={styles.interviewDetails}>
                        <p className={styles.interviewDate}>
                          <strong>Date:</strong>{' '}
                          {new Date(application.interview.interviewDate).toLocaleDateString('en-GB', {
                            weekday: 'long',
                            day: 'numeric',
                            month: 'long',
                            year: 'numeric',
                          })}{' '}
                          at {application.interview.interviewTime}
                        </p>
                        <p className={styles.interviewType}>
                          <strong>Type:</strong>{' '}
                          {application.interview.interviewType === 'in-person'
                            ? 'In-Person'
                            : application.interview.interviewType === 'video'
                            ? 'Video Call'
                            : 'Phone Call'}
                        </p>
                        {application.interview.locationOrLink && (
                          <p className={styles.interviewLocation}>
                            <strong>
                              {application.interview.locationOrLink.startsWith('http')
                                ? 'Calendar Link:'
                                : 'Location:'}
                            </strong>{' '}
                            {application.interview.locationOrLink.startsWith('http') ? (
                              <a href={application.interview.locationOrLink} target="_blank" rel="noopener noreferrer" style={{ color: '#2563eb', textDecoration: 'underline' }}>
                                View Calendar Event
                              </a>
                            ) : (
                              application.interview.locationOrLink
                            )}
                          </p>
                        )}
                        {application.interview.status === 'confirmed' && (
                          <p className={styles.interviewConfirmed}>Confirmed by candidate</p>
                        )}
                      </div>
                      {application.interview.status !== 'completed' && !(application.offer?.status === 'accepted' || application.status === 'hired') && (
                        <div className={styles.interviewActions}>
                          <button
                            className={styles.rescheduleBtn}
                            onClick={() => handleScheduleInterview(application)}
                          >
                            Reschedule
                          </button>
                          <button
                            className={styles.cancelInterviewBtn}
                            onClick={() => handleCancelInterview(application.interview!.id, application.id)}
                          >
                            Cancel Interview
                          </button>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Offer Details */}
                  {application.offer && (
                    <div className={styles.offerSection}>
                      <h4 className={styles.offerTitle}>
                        {application.status === 'hired'
                          ? '✅ Hired'
                          : application.offer.status === 'accepted'
                          ? '🤝 Offer Accepted — Awaiting Confirmation'
                          : application.offer.status === 'declined'
                          ? '❌ Offer Declined'
                          : '📋 Job Offer Sent'}
                      </h4>
                      <div className={styles.offerDetails}>
                        <p><strong>Salary:</strong> {application.offer.salary}</p>
                        <p>
                          <strong>Start Date:</strong>{' '}
                          {new Date(application.offer.startDate).toLocaleDateString('en-GB', {
                            day: 'numeric',
                            month: 'long',
                            year: 'numeric',
                          })}
                        </p>
                        <p>
                          <strong>Contract:</strong>{' '}
                          {application.offer.contractType.charAt(0).toUpperCase() +
                            application.offer.contractType.slice(1)}
                        </p>
                        {application.offer.signatureName && (
                          <div className={styles.signatureDisplay}>
                            <p className={styles.signatureLabel}>Candidate Signature:</p>
                            <div className={styles.signatureBox}>
                              <span className={styles.signatureText}>{application.offer.signatureName}</span>
                            </div>
                            <p className={styles.signatureDate}>
                              Signed on {new Date(application.offer.signatureTimestamp!).toLocaleDateString('en-GB', {
                                day: 'numeric',
                                month: 'long',
                                year: 'numeric',
                              })}
                            </p>
                          </div>
                        )}
                        {application.offer.declineReason && (
                          <p><strong>Decline reason:</strong> {application.offer.declineReason}</p>
                        )}
                        {application.offer.offerLetterUrl && (
                          <p>
                            <a
                              href={application.offer.offerLetterUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className={styles.offerLetterLink}
                            >
                              View Offer Letter
                            </a>
                          </p>
                        )}
                      </div>
                      {application.offer.status === 'accepted' && application.status !== 'hired' && (
                        <div className={styles.interviewActions}>
                          <button
                            className={styles.barBtnHire}
                            onClick={() => handleConfirmHire(application)}
                          >
                            Confirm Hire
                          </button>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Cover Letter Preview */}
                  {application.coverLetter && (
                    <div className={styles.coverLetterSection}>
                      <h4 className={styles.coverLetterTitle}>Cover Letter</h4>
                      <p className={styles.coverLetterText}>
                        {application.coverLetter.length > 200
                          ? application.coverLetter.slice(0, 200) + '...'
                          : application.coverLetter}
                      </p>
                    </div>
                  )}

                  {/* Action Bar */}
                  <div className={styles.actionBar}>
                    {application.candidateEmail && (
                      <a
                        href={`mailto:${application.candidateEmail}`}
                        className={styles.barBtn}
                      >
                        Email
                      </a>
                    )}
                    {application.candidateCv && (
                      <a
                        href={application.candidateCv}
                        target="_blank"
                        rel="noopener noreferrer"
                        className={styles.barBtn}
                      >
                        View CV
                      </a>
                    )}
                    <button
                      className={styles.barBtnCalendar}
                      onClick={() => handleScheduleInterview(application)}
                    >
                      {application.interview ? 'Reschedule' : 'Schedule Interview'}
                    </button>
                    {['interviewing', 'offered'].includes(application.status) && !application.offer && (
                      <button
                        className={styles.barBtnOffer}
                        onClick={() => {
                          setOfferApplication(application)
                          setOfferModalOpen(true)
                        }}
                      >
                        Make Offer
                      </button>
                    )}
                    {['pending', 'reviewing'].includes(application.status) && (
                      <button
                        className={styles.barBtnShortlist}
                        onClick={() => handleShortlist(application)}
                      >
                        Shortlist
                      </button>
                    )}
                    {!['hired', 'rejected'].includes(application.status) && (
                      <button
                        className={styles.barBtnReject}
                        onClick={() => updateApplicationStatus(application.id, 'rejected')}
                      >
                        Reject
                      </button>
                    )}
                    {(application.status === 'hired' || application.status === 'rejected') && (
                      <button
                        className={styles.barBtnReset}
                        onClick={() => updateApplicationStatus(application.id, 'pending')}
                      >
                        Reset Status
                      </button>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Schedule Interview Modal */}
      {selectedApplication && (
        <ScheduleInterviewModal
          isOpen={scheduleModalOpen}
          onClose={() => {
            setScheduleModalOpen(false)
            setSelectedApplication(null)
          }}
          applicationId={selectedApplication.id}
          jobId={selectedApplication.jobId}
          jobTitle={selectedApplication.jobTitle}
          company={selectedApplication.company}
          candidateId={selectedApplication.candidateId}
          candidateName={selectedApplication.candidateName}
          candidateEmail={selectedApplication.candidateEmail}
          jobLocation={job?.location}
          existingInterviewId={selectedApplication.interview?.id}
          onSuccess={() => {
            loadApplications()
          }}
        />
      )}

      {/* Make Offer Modal */}
      {offerApplication && (
        <MakeOfferModal
          isOpen={offerModalOpen}
          onClose={() => {
            setOfferModalOpen(false)
            setOfferApplication(null)
          }}
          applicationId={offerApplication.id}
          jobId={offerApplication.jobId}
          jobTitle={offerApplication.jobTitle}
          company={offerApplication.company}
          candidateId={offerApplication.candidateId}
          candidateName={offerApplication.candidateName}
          candidateEmail={offerApplication.candidateEmail}
          onSuccess={() => {
            loadApplications()
          }}
        />
      )}
    </main>
  )
}

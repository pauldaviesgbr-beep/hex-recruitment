'use client'

import { useState, useEffect, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import Header from '@/components/Header'
import SignedImage from '@/components/SignedImage'
import EmptyState from '@/components/EmptyState'
import { Inbox } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { notify } from '@/lib/notify'
import styles from './page.module.css'
import { Ico } from '@/components/icons'

interface Applicant {
  id: string
  candidateId: string
  candidateName: string
  candidatePhoto: string | null
  candidateLocation: string
  jobTitle: string
  jobId: string
  appliedAt: string
  hasCv: boolean
  hasCoverLetter: boolean
}

export default function AppliedPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [applicants, setApplicants] = useState<Applicant[]>([])
  const [search, setSearch] = useState('')
  const [filterJob, setFilterJob] = useState('all')
  const [jobs, setJobs] = useState<{ id: string; title: string }[]>([])
  const [processing, setProcessing] = useState<Set<string>>(new Set())

  useEffect(() => {
    const load = async () => {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session || session.user.user_metadata?.role !== 'employer') {
        router.push('/login/employer'); return
      }

      const employerId = session.user.id

      const { data: jobData } = await supabase
        .from('jobs').select('id, title').eq('employer_id', employerId)

      setJobs(jobData || [])
      const jobIds = (jobData || []).map(j => j.id)
      if (jobIds.length === 0) { setLoading(false); return }

      const { data: appData } = await supabase
        .from('job_applications')
        .select('id, candidate_id, job_id, job_title, cover_letter, created_at')
        .in('job_id', jobIds)
        .eq('status', 'pending')
        .order('created_at', { ascending: false })

      if (!appData) { setLoading(false); return }

      const candidateIds = Array.from(new Set(appData.map(a => a.candidate_id).filter(Boolean)))
      let profileMap: Record<string, any> = {}
      if (candidateIds.length > 0) {
        const { data: profiles } = await supabase
          .from('candidate_profiles')
          .select('user_id, full_name, profile_picture_url, city, location, cv_url')
          .in('user_id', candidateIds)
        for (const p of profiles || []) profileMap[p.user_id] = p
      }

      setApplicants(appData.map(a => {
        const p = profileMap[a.candidate_id] || {}
        return {
          id: a.id,
          candidateId: a.candidate_id,
          candidateName: p.full_name || 'Candidate',
          candidatePhoto: p.profile_picture_url || null,
          candidateLocation: p.city || p.location || '',
          jobTitle: a.job_title || 'Role',
          jobId: a.job_id,
          appliedAt: a.created_at,
          hasCv: !!p.cv_url,
          hasCoverLetter: !!a.cover_letter,
        }
      }))
      setLoading(false)
    }
    load()
  }, [router])

  const filtered = useMemo(() => {
    let result = applicants
    if (filterJob !== 'all') result = result.filter(a => a.jobId === filterJob)
    if (search.trim()) {
      const q = search.toLowerCase()
      result = result.filter(a =>
        a.candidateName.toLowerCase().includes(q) ||
        a.jobTitle.toLowerCase().includes(q) ||
        a.candidateLocation.toLowerCase().includes(q)
      )
    }
    return result
  }, [applicants, filterJob, search])

  const handleReview = async (applicant: Applicant) => {
    setProcessing(prev => new Set(prev).add(applicant.id))
    await supabase.from('job_applications')
      .update({ status: 'reviewing', status_updated_at: new Date().toISOString(), stage_entered_at: new Date().toISOString() })
      .eq('id', applicant.id)

    await notify('status_changed', { applicationId: applicant.id, extra: { status: 'reviewing' } })

    setApplicants(prev => prev.filter(a => a.id !== applicant.id))
    setProcessing(prev => { const n = new Set(prev); n.delete(applicant.id); return n })
  }

  const handleReject = async (applicant: Applicant) => {
    setProcessing(prev => new Set(prev).add(applicant.id))
    await supabase.from('job_applications')
      .update({ status: 'rejected', status_updated_at: new Date().toISOString(), stage_entered_at: new Date().toISOString() })
      .eq('id', applicant.id)

    await notify('status_changed', { applicationId: applicant.id, extra: { status: 'rejected' } })

    setApplicants(prev => prev.filter(a => a.id !== applicant.id))
    setProcessing(prev => { const n = new Set(prev); n.delete(applicant.id); return n })
  }

  const formatTime = (dateStr: string) => {
    const diff = Date.now() - new Date(dateStr).getTime()
    const mins = Math.floor(diff / 60000)
    if (mins < 60) return `${mins}m ago`
    const hrs = Math.floor(diff / 3600000)
    if (hrs < 24) return `${hrs}h ago`
    const days = Math.floor(diff / 86400000)
    if (days === 1) return 'Yesterday'
    if (days < 7) return `${days}d ago`
    return new Date(dateStr).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
  }

  if (loading) {
    return <main><Header /><div className={styles.loading}><div className={styles.spinner} /><p>Loading applications...</p></div></main>
  }

  return (
    <main>
      <Header />
      <div className={styles.container}>
        <div className={styles.header}>
          <div>
            <h1 className={styles.title}>New Applications</h1>
            <p className={styles.subtitle}>{filtered.length} awaiting review</p>
          </div>
        </div>

        <div className={styles.controls}>
          <input
            type="text"
            placeholder="Search candidates..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className={styles.searchInput}
          />
          <select value={filterJob} onChange={e => setFilterJob(e.target.value)} className={styles.filterSelect}>
            <option value="all">All jobs ({applicants.length})</option>
            {jobs.map(j => {
              const count = applicants.filter(a => a.jobId === j.id).length
              return <option key={j.id} value={j.id}>{j.title} ({count})</option>
            })}
          </select>
        </div>

        {filtered.length === 0 ? (
          <EmptyState
            icon={Inbox}
            title="Nothing new to review"
            description={filterJob !== 'all'
              ? 'No pending applications for this job right now. Check back later or browse all jobs.'
              : 'When candidates apply to your jobs, they\'ll land here for you to review.'}
            action={jobs.length === 0 ? { label: 'Post a job', href: '/post-job' } : undefined}
          />
        ) : (
          <div className={styles.list}>
            {/* Table header */}
            <div className={styles.rowHeader}>
              <span className={styles.colCandidate}>Candidate</span>
              <span className={styles.colJob}>Position</span>
              <span className={styles.colDocs}>Docs</span>
              <span className={styles.colTime}>Applied</span>
              <span className={styles.colActions}>Actions</span>
            </div>

            {filtered.map(a => (
              <div key={a.id} className={styles.row}>
                <div className={styles.colCandidate}>
                  <div className={styles.avatar}>
                    {a.candidatePhoto ? (
                      <SignedImage src={a.candidatePhoto} alt={a.candidateName} className={styles.avatarImg} />
                    ) : (
                      <span className={styles.avatarInitial}>{a.candidateName.split(' ').map(n => n[0]).join('').slice(0, 2)}</span>
                    )}
                  </div>
                  <div>
                    <Link href={`/candidates/${a.candidateId}`} className={styles.candidateName}>{a.candidateName}</Link>
                    {a.candidateLocation && <span className={styles.candidateLocation}>{a.candidateLocation}</span>}
                  </div>
                </div>
                <span className={styles.colJob}>{a.jobTitle}</span>
                <span className={styles.colDocs}>
                  {a.hasCv && <span className={styles.docBadge} title="CV attached"><Ico name="file" size={20} /></span>}
                  {a.hasCoverLetter && <span className={styles.docBadge} title="Cover letter"><Ico name="mail" size={20} /></span>}
                  {!a.hasCv && !a.hasCoverLetter && <span style={{ color: '#cbd5e1' }}>—</span>}
                </span>
                <span className={styles.colTime}>{formatTime(a.appliedAt)}</span>
                <div className={styles.colActions}>
                  <button
                    className={styles.reviewBtn}
                    onClick={() => handleReview(a)}
                    disabled={processing.has(a.id)}
                  >
                    Move to Review
                  </button>
                  <button
                    className={styles.rejectBtn}
                    onClick={() => handleReject(a)}
                    disabled={processing.has(a.id)}
                  >
                    ✕
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </main>
  )
}

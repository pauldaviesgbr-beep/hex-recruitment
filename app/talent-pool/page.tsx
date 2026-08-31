'use client'

import { useState, useEffect, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import Header from '@/components/Header'
import SignedImage from '@/components/SignedImage'
import EmptyState from '@/components/EmptyState'
import { Users } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { notify } from '@/lib/notify'
import { getCategoryLabel } from '@/lib/categories'
import styles from './page.module.css'
import { Ico } from '@/components/icons'

interface PoolCandidate {
  applicationId: string
  candidateId: string
  candidateName: string
  candidatePhoto: string | null
  candidateEmail: string
  jobTitle: string
  jobId: string
  jobCategory: string
  skills: string[]
  location: string
  experience: number
  appliedAt: string
  rejectedAt: string | null
  status: string
}

export default function TalentPoolPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [candidates, setCandidates] = useState<PoolCandidate[]>([])
  const [search, setSearch] = useState('')
  const [filterJob, setFilterJob] = useState('all')
  const [jobs, setJobs] = useState<{ id: string; title: string }[]>([])
  const [view, setView] = useState<'past' | 'all'>('past')

  useEffect(() => {
    const load = async () => {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session || session.user.user_metadata?.role !== 'employer') {
        router.push('/login/employer')
        return
      }

      const employerId = session.user.id

      // Fetch employer's jobs
      const { data: jobData } = await supabase
        .from('jobs')
        .select('id, title, category')
        .eq('employer_id', employerId)

      setJobs(jobData || [])
      const jobIds = (jobData || []).map(j => j.id)
      if (jobIds.length === 0) { setLoading(false); return }
      const jobMap: Record<string, { title: string; category: string }> = {}
      for (const j of jobData || []) jobMap[j.id] = { title: j.title, category: j.category }

      // Fetch applications (rejected for 'past', all for 'all')
      const query = supabase
        .from('job_applications')
        .select('id, candidate_id, job_id, job_title, status, created_at, status_updated_at')
        .in('job_id', jobIds)
        .order('created_at', { ascending: false })

      if (view === 'past') {
        query.eq('status', 'rejected')
      }

      const { data: appData } = await query

      if (!appData || appData.length === 0) { setCandidates([]); setLoading(false); return }

      // Fetch candidate profiles
      const candidateIds = Array.from(new Set(appData.map(a => a.candidate_id).filter(Boolean)))
      let profileMap: Record<string, any> = {}
      if (candidateIds.length > 0) {
        const { data: profiles } = await supabase
          .from('candidate_profiles')
          .select('user_id, full_name, profile_picture_url, email, skills, location, city, years_experience, job_sector')
          .in('user_id', candidateIds)
        for (const p of profiles || []) profileMap[p.user_id] = p
      }

      const mapped: PoolCandidate[] = appData.map(a => {
        const profile = profileMap[a.candidate_id] || {}
        const jobInfo = jobMap[a.job_id] || { title: a.job_title, category: '' }
        return {
          applicationId: a.id,
          candidateId: a.candidate_id,
          candidateName: profile.full_name || 'Candidate',
          candidatePhoto: profile.profile_picture_url || null,
          candidateEmail: profile.email || '',
          jobTitle: jobInfo.title || a.job_title || 'Role',
          jobId: a.job_id,
          jobCategory: jobInfo.category || '',
          skills: profile.skills || [],
          location: profile.city || profile.location || '',
          experience: profile.years_experience || 0,
          appliedAt: a.created_at,
          rejectedAt: a.status_updated_at,
          status: a.status,
        }
      })

      setCandidates(mapped)
      setLoading(false)
    }

    setLoading(true)
    load()
  }, [router, view])

  const filtered = useMemo(() => {
    let result = candidates
    if (filterJob !== 'all') result = result.filter(c => c.jobId === filterJob)
    if (search.trim()) {
      const q = search.toLowerCase()
      result = result.filter(c =>
        c.candidateName.toLowerCase().includes(q) ||
        c.skills.some(s => s.toLowerCase().includes(q)) ||
        c.location.toLowerCase().includes(q) ||
        c.jobTitle.toLowerCase().includes(q)
      )
    }
    return result
  }, [candidates, filterJob, search])

  const handleReinvite = async (candidate: PoolCandidate) => {
    // Reset status back to pending so they re-enter the pipeline
    await supabase
      .from('job_applications')
      .update({ status: 'pending', status_updated_at: new Date().toISOString(), stage_entered_at: new Date().toISOString() })
      .eq('id', candidate.applicationId)

    // Notify the candidate
    await notify('reconsidered', { applicationId: candidate.applicationId })

    setCandidates(prev => prev.filter(c => c.applicationId !== candidate.applicationId))
  }

  if (loading) {
    return (
      <main><Header />
        <div className={styles.loadingState}><div className={styles.spinner} /><p>Loading talent pool...</p></div>
      </main>
    )
  }

  return (
    <main>
      <Header />
      <div className={styles.container}>
        <div className={styles.header}>
          <div>
            <h1 className={styles.title}>Talent Pool</h1>
            <p className={styles.subtitle}>{filtered.length} candidate{filtered.length !== 1 ? 's' : ''} from past applications</p>
          </div>
          <Link href="/candidates" className={styles.browseLink}>Browse all candidates →</Link>
        </div>

        {/* Controls */}
        <div className={styles.controls}>
          <div className={styles.viewToggle}>
            <button className={`${styles.viewBtn} ${view === 'past' ? styles.viewBtnActive : ''}`} onClick={() => setView('past')}>Past Candidates</button>
            <button className={`${styles.viewBtn} ${view === 'all' ? styles.viewBtnActive : ''}`} onClick={() => setView('all')}>All Applicants</button>
          </div>
          <input
            type="text"
            placeholder="Search by name, skills, location..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className={styles.searchInput}
          />
          <select value={filterJob} onChange={e => setFilterJob(e.target.value)} className={styles.filterSelect}>
            <option value="all">All jobs</option>
            {jobs.map(j => <option key={j.id} value={j.id}>{j.title}</option>)}
          </select>
        </div>

        {/* Candidate list */}
        {filtered.length === 0 ? (
          <EmptyState
            icon={Users}
            title={view === 'past' ? 'No past candidates yet' : 'No applicants found'}
            description={view === 'past'
              ? 'Rejected applicants will appear here for future reference — helpful when a similar role opens up.'
              : 'Try clearing the filters, or browse all candidates to find talent outside your current applicant pool.'}
            action={{ label: 'Browse all candidates', href: '/candidates' }}
          />
        ) : (
          <div className={styles.list}>
            {filtered.map(c => (
              <div key={c.applicationId} className={styles.card}>
                <div className={styles.cardLeft}>
                  <div className={styles.avatar}>
                    <SignedImage
                      src={c.candidatePhoto}
                      alt={c.candidateName}
                      className={styles.avatarImg}
                      fallback={<span className={styles.avatarInitial}>{c.candidateName.split(' ').map(n => n[0]).join('').slice(0, 2)}</span>}
                    />
                  </div>
                  <div className={styles.cardInfo}>
                    <div className={styles.cardName}>{c.candidateName}</div>
                    <div className={styles.cardMeta}>
                      {c.location && <span><Ico name="map-pin" size={16} /> {c.location}</span>}
                      {c.experience > 0 && <span><Ico name="briefcase" size={16} /> {c.experience}yr{c.experience !== 1 ? 's' : ''} exp</span>}
                    </div>
                    {c.skills.length > 0 && (
                      <div className={styles.cardSkills}>
                        {c.skills.slice(0, 4).map(s => <span key={s} className={styles.skillTag}>{s}</span>)}
                        {c.skills.length > 4 && <span className={styles.skillMore}>+{c.skills.length - 4}</span>}
                      </div>
                    )}
                  </div>
                </div>
                <div className={styles.cardRight}>
                  <div className={styles.cardJob}>
                    <span className={styles.jobLabel}>Applied for:</span>
                    <span className={styles.jobTitle}>{c.jobTitle}</span>
                  </div>
                  <div className={styles.cardDate}>
                    {new Date(c.appliedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                  </div>
                  <div className={styles.cardActions}>
                    <Link href={`/candidates/${c.candidateId}`} className={styles.actionBtn}>View Profile</Link>
                    {c.status === 'rejected' && (
                      <button className={styles.actionBtnPrimary} onClick={() => handleReinvite(c)}>Reconsider</button>
                    )}
                    {c.candidateEmail && (
                      <button className={styles.actionBtnSmall} onClick={() => { window.location.href = `mailto:${c.candidateEmail}` }}>Email</button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </main>
  )
}

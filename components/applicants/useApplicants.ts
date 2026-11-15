'use client'

// The Applicants list's data: the employer's adverts, every application on
// them, and the candidates behind those applications. One loader for the list
// and the applicant page so the two cannot disagree about who is where.

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { getCurrentEmployerOwnerId } from '@/lib/employer'
import { effectiveStage, type ApplicantStage } from '@/lib/applicantStages'

export type ApplicantJob = { id: string; title: string; status: string; company: string | null }

export type ApplicantRow = {
  id: string
  candidateId: string
  jobId: string
  jobTitle: string
  status: string
  stage: ApplicantStage
  stageEnteredAt: string | null
  appliedAt: string | null
  /** NULL, never a stand-in like "Candidate": the page says the name is missing. */
  name: string | null
  email: string | null
  photo: string | null
  headline: string | null
  location: string | null
  availability: string | null
  bio: string | null
  skills: string[]
  workHistory: { role?: string; company?: string; start_date?: string; end_date?: string; current?: boolean }[]
  /** The CV they applied with, the profile's as a fallback (as /my-jobs does). */
  cvUrl: string | null
  coverLetter: string | null
  screeningAnswers: { questionId?: string; question: string; answer: string }[]
  /** Not a fit, and the polite update is owed but not yet sent. */
  noticeOwed: boolean
  noticeSent: boolean
}

export type ApplicantsData = {
  loading: boolean
  ownerId: string | null
  companyName: string
  reviewRejection: boolean
  jobs: ApplicantJob[]
  rows: ApplicantRow[]
  reload: () => Promise<void>
  setRows: React.Dispatch<React.SetStateAction<ApplicantRow[]>>
}

export function useApplicants(): ApplicantsData {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [ownerId, setOwnerId] = useState<string | null>(null)
  const [companyName, setCompanyName] = useState('')
  const [reviewRejection, setReviewRejection] = useState(false)
  const [jobs, setJobs] = useState<ApplicantJob[]>([])
  const [rows, setRows] = useState<ApplicantRow[]>([])

  const reload = useCallback(async () => {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) { router.push('/login'); return }
    if (session.user.user_metadata?.role !== 'employer') { router.push('/dashboard'); return }
    // The OWNER's id: a team member's own id matches no job (lib/employer).
    const owner = (await getCurrentEmployerOwnerId(supabase)) ?? session.user.id
    setOwnerId(owner)

    const [{ data: ep }, { data: jobData }] = await Promise.all([
      supabase.from('employer_profiles').select('company_name, review_rejection_messages').eq('user_id', owner).maybeSingle(),
      supabase.from('jobs').select('id, title, status, company').eq('employer_id', owner),
    ])
    setCompanyName(ep?.company_name || session.user.user_metadata?.company_name || '')
    setReviewRejection(!!ep?.review_rejection_messages)
    const js: ApplicantJob[] = (jobData || []).map((j: any) => ({ id: j.id, title: j.title, status: j.status, company: j.company }))
    setJobs(js)
    if (js.length === 0) { setRows([]); setLoading(false); return }

    const { data: apps } = await supabase
      .from('job_applications')
      .select('id, candidate_id, job_id, job_title, status, stage_entered_at, applied_at, created_at, cv_url, cover_letter, screening_answers, decline_notice_due_at, decline_notice_sent_at')
      .in('job_id', js.map(j => j.id))
    const list = apps || []

    const ids = Array.from(new Set(list.map((a: any) => a.candidate_id).filter(Boolean)))
    const profiles: Record<string, any> = {}
    if (ids.length) {
      const { data: ps } = await supabase
        .from('candidate_profiles')
        .select('user_id, full_name, email, profile_picture_url, headline, job_title, location, city, availability, bio, skills, work_history, cv_url')
        .in('user_id', ids)
      for (const p of ps || []) profiles[p.user_id] = p
    }

    const titleOf = Object.fromEntries(js.map(j => [j.id, j.title]))
    setRows(list.map((a: any) => {
      const p = profiles[a.candidate_id] || {}
      return {
        id: a.id,
        candidateId: a.candidate_id,
        jobId: a.job_id,
        jobTitle: titleOf[a.job_id] || a.job_title || '',
        status: a.status,
        stage: effectiveStage(a.status, a.decline_notice_due_at, a.decline_notice_sent_at),
        stageEnteredAt: a.stage_entered_at || a.applied_at || a.created_at || null,
        appliedAt: a.applied_at || a.created_at || null,
        name: (p.full_name || '').trim() || null,
        email: p.email || null,
        photo: p.profile_picture_url || null,
        headline: p.headline || p.job_title || null,
        location: p.location || p.city || null,
        availability: p.availability || null,
        bio: p.bio || null,
        skills: Array.isArray(p.skills) ? p.skills : [],
        workHistory: Array.isArray(p.work_history) ? p.work_history : [],
        cvUrl: a.cv_url || p.cv_url || null,
        coverLetter: a.cover_letter || null,
        screeningAnswers: Array.isArray(a.screening_answers) ? a.screening_answers : [],
        noticeOwed: !!a.decline_notice_due_at && !a.decline_notice_sent_at,
        noticeSent: !!a.decline_notice_sent_at,
      }
    }))
    setLoading(false)
  }, [router])

  useEffect(() => { reload() }, [reload])

  return { loading, ownerId, companyName, reviewRejection, jobs, rows, reload, setRows }
}

export const initialsOf = (name: string | null) => {
  if (!name) return '?'
  const parts = name.split(/\s+/).filter(Boolean)
  return ((parts[0]?.[0] || '') + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase() || '?'
}

export const firstNameOf = (name: string | null) => (name ? name.split(/\s+/)[0] : null)

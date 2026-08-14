import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { rateLimit } from '@/lib/rateLimit'

/*
  WHO MAY PUT WORDS ON WHOSE LOCK SCREEN.

  Until this existed, every in-app notification was inserted from the BROWSER,
  under a policy that let any signed-in account create a notification for any
  user, with any text — and the table's trigger sends a Web Push to the user
  named in the row. Twenty-two call sites, each one the client asserting who
  it was and what had happened.

  This route replaces all of them. The request names an EVENT and the
  application it is about; everything else — the recipient, the title, the
  message, the link — is derived HERE from rows the caller is entitled to act
  on. Free text from the request never reaches another person's device; the
  one bounded exception is a decline reason, length-capped and visible only to
  the counterparty of that application.

  Authorisation is by RELATIONSHIP, per event:
    candidate -> employer   the caller IS the candidate on the application
    employer  -> candidate  the caller is the employer who owns the job, or a
                            member holding manage_jobs for that employer —
                            resolved through has_employer_permission, the same
                            function the database policies use, asked AS THE
                            CALLER (it reads auth.uid() internally; asked as
                            the service role it refuses everybody).

  The database INSERT policy for authenticated users is dropped in the same
  change, so this route's service-role client is the only remaining writer.
  Same shape as /api/upload-image: the request names an intent, a table in
  the route maps intent to entitlement, and the entitlement check is the
  database's own.
*/

type Ctx = {
  jobTitle: string
  company: string
  candidateName: string
  jobId: string | null
  extra: Record<string, string>
}

type EventDef = {
  direction: 'candidate_to_employer' | 'employer_to_candidate'
  type: string
  // Which extra fields may pass through, with a hard length cap each.
  extras?: Record<string, number>
  title: (c: Ctx) => string
  message: (c: Ctx) => string
  link: (c: Ctx) => string
}

const EVENTS: Record<string, EventDef> = {
  // ── candidate -> employer ────────────────────────────────────────────────
  applied: {
    direction: 'candidate_to_employer',
    type: 'new_application',
    title: () => 'New application received',
    message: c => `${c.candidateName} applied for ${c.jobTitle}`,
    link: () => '/my-jobs',
  },
  interest_accepted: {
    direction: 'candidate_to_employer',
    type: 'application_status_change',
    title: () => 'Candidate Interested',
    message: c => `${c.candidateName} is interested in interviewing for ${c.jobTitle}`,
    link: c => `/my-jobs/${c.jobId}/applications`,
  },
  interest_declined: {
    direction: 'candidate_to_employer',
    type: 'application_status_change',
    title: () => 'Interview Invitation Declined',
    message: c => `${c.candidateName} has declined the interview invitation for ${c.jobTitle}`,
    link: c => `/my-jobs/${c.jobId}/applications`,
  },
  interview_confirmed: {
    direction: 'candidate_to_employer',
    type: 'application_status_change',
    extras: { date: 60, time: 20 },
    title: () => 'Interview Confirmed',
    message: c => c.extra.date
      ? `${c.candidateName} has confirmed their interview for ${c.jobTitle} on ${c.extra.date} at ${c.extra.time || 'TBC'}`
      : `${c.candidateName} has confirmed the interview for ${c.jobTitle}`,
    link: c => `/my-jobs/${c.jobId}/applications`,
  },
  interview_slot_selected: {
    direction: 'candidate_to_employer',
    type: 'application_update',
    extras: { date: 60, time: 20 },
    title: () => 'Interview Time Confirmed',
    message: c => `${c.candidateName} has selected ${c.extra.date || 'a time'}${c.extra.time ? ` at ${c.extra.time}` : ''} for the ${c.jobTitle} interview.`,
    link: () => '/my-jobs',
  },
  reschedule_requested: {
    direction: 'candidate_to_employer',
    type: 'application_status_change',
    title: () => 'Reschedule Requested',
    message: c => `${c.candidateName} has requested to reschedule the interview for ${c.jobTitle}`,
    link: c => `/my-jobs/${c.jobId}/applications`,
  },
  offer_declined: {
    direction: 'candidate_to_employer',
    type: 'application_status_change',
    extras: { reason: 300 },
    title: () => 'Offer Declined',
    message: c => c.extra.reason
      ? `${c.candidateName} has declined the offer for ${c.jobTitle}. Reason: ${c.extra.reason}`
      : `${c.candidateName} has declined the offer for ${c.jobTitle}.`,
    link: () => '/my-jobs',
  },

  // ── employer -> candidate ────────────────────────────────────────────────
  status_changed: {
    direction: 'employer_to_candidate',
    type: 'application_update',
    extras: { status: 20 },
    title: c => STATUS_COPY[c.extra.status]?.title || 'Application Update',
    message: c => (STATUS_COPY[c.extra.status]?.message || (() => `There is an update to your application for ${c.jobTitle}.`))(c),
    link: () => '/applications',
  },
  reconsidered: {
    direction: 'employer_to_candidate',
    type: 'application_update',
    title: () => 'Application Reconsidered',
    message: c => `Great news! Your application for ${c.jobTitle} is being reconsidered.`,
    link: () => '/applications',
  },
  marked_withdrawn: {
    direction: 'employer_to_candidate',
    type: 'application_update',
    title: () => 'Application Withdrawn',
    message: c => `Your application for ${c.jobTitle} at ${c.company} has been marked as withdrawn.`,
    link: () => '/applications',
  },
  interview_invite_interest: {
    direction: 'employer_to_candidate',
    type: 'interview_interest',
    title: () => 'Interview Invitation',
    message: c => `${c.company} would like to invite you to interview for ${c.jobTitle}. Are you interested?`,
    link: () => '/applications',
  },
  interview_self_schedule: {
    direction: 'employer_to_candidate',
    type: 'interview_interest',
    // link is derived from the interview row (scheduling token), never the request
    title: () => 'Interview Invitation',
    message: c => `${c.company} has invited you to schedule an interview for ${c.jobTitle}. Pick a time that works for you.`,
    link: c => c.extra.schedulingToken ? `/interview/schedule/${c.extra.schedulingToken}` : '/applications',
  },
  interview_scheduled: {
    direction: 'employer_to_candidate',
    type: 'application_update',
    extras: { date: 60, time: 20, multiSlot: 5, isReschedule: 5 },
    title: c => c.extra.isReschedule === 'true' ? 'Interview Rescheduled' : 'Interview Invitation',
    message: c => {
      if (c.extra.isReschedule === 'true') {
        return c.extra.multiSlot === 'true'
          ? `${c.company} has rescheduled your interview for ${c.jobTitle}. Please select a time that works for you.`
          : `${c.company} has rescheduled your interview for ${c.jobTitle}. New date: ${c.extra.date} at ${c.extra.time}.`
      }
      return c.extra.multiSlot === 'true'
        ? `${c.company} has invited you to interview for ${c.jobTitle}. Please select a time that works for you.`
        : `${c.company} has invited you for an interview for the ${c.jobTitle} position on ${c.extra.date} at ${c.extra.time}.`
    },
    link: () => '/applications',
  },
  interview_cancelled: {
    direction: 'employer_to_candidate',
    type: 'application_update',
    title: () => 'Interview Cancelled',
    message: c => `Your interview for ${c.jobTitle} has been cancelled.`,
    link: () => '/applications',
  },
  offer_made: {
    direction: 'employer_to_candidate',
    type: 'application_update',
    extras: { startDate: 60 },
    title: () => 'Job Offer Received',
    message: c => c.extra.startDate
      ? `${c.company} has sent you a job offer for the ${c.jobTitle} position starting ${c.extra.startDate}`
      : `${c.company} has sent you a job offer for the ${c.jobTitle} position`,
    link: () => '/applications',
  },
  hire_confirmed: {
    direction: 'employer_to_candidate',
    type: 'application_update',
    title: () => 'Hire Confirmed!',
    message: c => `Congratulations! Your hire has been confirmed for ${c.jobTitle} at ${c.company}.`,
    link: () => '/applications',
  },
}

const STATUS_COPY: Record<string, { title: string; message: (c: Ctx) => string }> = {
  reviewing: { title: 'Application Under Review', message: c => `Your application for ${c.jobTitle} is being reviewed.` },
  shortlisted: { title: 'Application Shortlisted', message: c => `Great news! Your application for ${c.jobTitle} at ${c.company} has been shortlisted.` },
  interview: { title: 'Moved to Interview Stage', message: c => `You've been moved to the interview stage for ${c.jobTitle}. The employer will be in touch to schedule.` },
  rejected: { title: 'Application Update', message: c => `Your application for ${c.jobTitle} at ${c.company} was not selected to move forward.` },
  offered: { title: 'Job Offer Received', message: c => `You have received a job offer for ${c.jobTitle} at ${c.company}! Check your messages for details.` },
  hired: { title: 'Congratulations!', message: c => `Congratulations! You've been hired for ${c.jobTitle} at ${c.company}.` },
}

export async function POST(request: NextRequest) {
  try {
    const ip = request.headers.get('x-forwarded-for') || 'unknown'
    if (!rateLimit(`notify:${ip}`, 60, 60000)) {
      return NextResponse.json({ error: 'Too many requests' }, { status: 429 })
    }

    // ── Who is asking? ──────────────────────────────────
    const token = (request.headers.get('authorization') || '').replace(/^Bearer /, '')
    if (!token) {
      return NextResponse.json({ error: 'Not signed in.', reason: 'not_signed_in' }, { status: 401 })
    }
    const admin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { persistSession: false } }
    )
    const { data: { user }, error: authError } = await admin.auth.getUser(token)
    if (authError || !user) {
      return NextResponse.json({ error: 'Session expired.', reason: 'not_signed_in' }, { status: 401 })
    }

    const body = await request.json().catch(() => null)
    if (!body || typeof body !== 'object') {
      return NextResponse.json({ error: 'Bad request.' }, { status: 400 })
    }
    const eventKey = String(body.event || '')
    const def = EVENTS[eventKey]
    // 'application_viewed' is the one batch event and is handled separately below.
    if (!def && eventKey !== 'application_viewed') {
      return NextResponse.json({ error: 'Unknown event.', reason: 'unknown_event' }, { status: 400 })
    }

    // ── The batch event: employer opened the applicant list ─────────────────
    if (eventKey === 'application_viewed') {
      const ids = Array.isArray(body.applicationIds) ? body.applicationIds.slice(0, 100).map(String) : []
      if (!ids.length) return NextResponse.json({ error: 'No applications named.' }, { status: 400 })
      const { data: rows } = await admin
        .from('job_applications')
        .select('id, candidate_id, job_id, job_title, company, jobs!inner(employer_id)')
        .in('id', ids)
      if (!rows?.length) return NextResponse.json({ error: 'Applications not found.' }, { status: 404 })
      // Every named application must belong to an employer this caller may act for.
      const employerIds = Array.from(new Set<string>(rows.map((r: any) => r.jobs.employer_id)))
      for (const employerId of employerIds) {
        if (!(await mayActForEmployer(token, user.id, employerId))) {
          return NextResponse.json(
            { error: 'You do not manage one of these applications.', reason: 'not_entitled' },
            { status: 403 }
          )
        }
      }
      const { error: insErr } = await admin.from('notifications').insert(
        rows.map((r: any) => ({
          user_id: r.candidate_id,
          type: 'application_update',
          title: 'Application Viewed',
          message: `Your application for ${r.job_title || 'a position'} at ${r.company || 'a company'} has been viewed by the employer.`,
          read: false,
          related_id: r.id,
          related_type: 'application',
        }))
      )
      if (insErr) throw insErr
      return NextResponse.json({ ok: true, sent: rows.length })
    }

    // ── Single events: resolve the application ─────────────────────────────
    let applicationId: string | null = body.applicationId ? String(body.applicationId) : null
    let interviewRow: any = null

    if (eventKey === 'interview_self_schedule') {
      // The link carries the interview's scheduling token, so the interview row
      // is loaded and must agree with the application named.
      const interviewId = String(body.interviewId || '')
      if (!interviewId) return NextResponse.json({ error: 'No interview named.' }, { status: 400 })
      const { data } = await admin
        .from('interviews')
        .select('id, application_id, scheduling_token')
        .eq('id', interviewId)
        .maybeSingle()
      if (!data) return NextResponse.json({ error: 'Interview not found.' }, { status: 404 })
      interviewRow = data
      applicationId = applicationId || data.application_id
      if (applicationId !== data.application_id) {
        return NextResponse.json({ error: 'Interview and application disagree.' }, { status: 400 })
      }
    }

    if (eventKey === 'applied' && !applicationId) {
      // The application was inserted moments ago by this same caller; find it
      // by the relationship rather than trusting an id from the request.
      const jobId = String(body.jobId || '')
      if (!jobId) return NextResponse.json({ error: 'No job named.' }, { status: 400 })
      const { data } = await admin
        .from('job_applications')
        .select('id')
        .eq('job_id', jobId)
        .eq('candidate_id', user.id)
        .order('applied_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      if (!data) return NextResponse.json({ error: 'Application not found.', reason: 'no_application' }, { status: 404 })
      applicationId = data.id
    }

    if (!applicationId) {
      return NextResponse.json({ error: 'No application named.' }, { status: 400 })
    }

    const { data: app } = await admin
      .from('job_applications')
      .select('id, candidate_id, job_id, job_title, company, jobs!inner(employer_id, title, company)')
      .eq('id', applicationId)
      .maybeSingle()
    if (!app) return NextResponse.json({ error: 'Application not found.' }, { status: 404 })
    const job: any = (app as any).jobs
    const employerId: string = job.employer_id

    // ── May THIS caller send THIS event about THIS application? ────────────
    let recipient: string
    if (def.direction === 'candidate_to_employer') {
      if (app.candidate_id !== user.id) {
        return NextResponse.json(
          { error: 'This is not your application.', reason: 'not_entitled' },
          { status: 403 }
        )
      }
      recipient = employerId
    } else {
      if (!(await mayActForEmployer(token, user.id, employerId))) {
        return NextResponse.json(
          { error: 'You do not manage this application.', reason: 'not_entitled' },
          { status: 403 }
        )
      }
      recipient = app.candidate_id
    }

    // status_changed must name a status the copy table knows.
    if (eventKey === 'status_changed' && !STATUS_COPY[String(body.extra?.status || '')]) {
      return NextResponse.json({ error: 'Unknown status.', reason: 'unknown_status' }, { status: 400 })
    }

    // ── Compose from OUR rows, pass through only whitelisted extras ────────
    const extra: Record<string, string> = {}
    for (const [key, cap] of Object.entries(def.extras || {})) {
      const v = body.extra?.[key]
      if (v !== undefined && v !== null) extra[key] = String(v).slice(0, cap)
    }
    if (interviewRow?.scheduling_token) extra.schedulingToken = String(interviewRow.scheduling_token)

    let candidateName = 'A candidate'
    if (def.direction === 'candidate_to_employer') {
      const { data: prof } = await admin
        .from('candidate_profiles')
        .select('full_name')
        .eq('user_id', app.candidate_id)
        .maybeSingle()
      candidateName = prof?.full_name || user.user_metadata?.full_name || 'A candidate'
    }

    const ctx: Ctx = {
      jobTitle: app.job_title || job.title || 'a position',
      company: app.company || job.company || 'the company',
      candidateName,
      jobId: app.job_id,
      extra,
    }

    const { error: insErr } = await admin.from('notifications').insert({
      user_id: recipient,
      type: def.type,
      title: def.title(ctx),
      message: def.message(ctx),
      read: false,
      related_id: app.id,
      related_type: 'application',
      link: def.link(ctx),
    })
    if (insErr) throw insErr

    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('[notifications/notify] error:', error)
    return NextResponse.json({ error: 'Failed to send notification.' }, { status: 500 })
  }
}

/**
 * The employer-side entitlement, shared with /api/upload-image's approach:
 * owning the job outright counts, and so does holding manage_jobs for the
 * employer that does — asked through has_employer_permission AS THE CALLER,
 * because that function reads auth.uid() internally.
 */
async function mayActForEmployer(
  token: string,
  callerId: string,
  employerId: string
): Promise<boolean> {
  if (callerId === employerId) return true
  const asCaller = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false }, global: { headers: { Authorization: `Bearer ${token}` } } }
  )
  const { data: allowed } = await asCaller.rpc('has_employer_permission', {
    target: employerId,
    cap: 'manage_jobs',
  })
  return allowed === true
}

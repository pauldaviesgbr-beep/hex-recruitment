import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { sendEmail } from '@/lib/email'
import { rateLimit } from '@/lib/rateLimit'
import { getCustomTemplate, applyVariables } from '@/lib/customEmailTemplate'

// Template imports
import { welcomeEmail } from '@/emails/welcome'
import { newApplicationEmail } from '@/emails/new-application'
import { applicationStatusEmail } from '@/emails/application-status'
import { interviewScheduledEmail } from '@/emails/interview-scheduled'
import { interviewRescheduledEmail } from '@/emails/interview-rescheduled'
import { interviewConfirmedEmail } from '@/emails/interview-confirmed'
import { interviewConfirmedEmployerEmail } from '@/emails/interview-confirmed-employer'
import { interviewCancelledEmail } from '@/emails/interview-cancelled'
import { newMessageEmail } from '@/emails/new-message'
import { passwordResetEmail } from '@/emails/password-reset'
import { emailVerificationEmail } from '@/emails/email-verification'
import { candidateWelcomeEmail } from '@/emails/candidate-welcome'
// The five activation templates are DELIBERATELY not imported here — see the
// note where their `case` branches used to be, below.

export async function POST(req: Request) {
  try {
    // Auth check: allow authenticated users, cron jobs, and internal server calls
    const authHeader = req.headers.get('authorization')
    const internalSecret = req.headers.get('x-internal-secret')
    const cronSecret = process.env.CRON_SECRET

    const isCronCall = cronSecret && authHeader === `Bearer ${cronSecret}`
    const isInternalCall = cronSecret && internalSecret === cronSecret

    if (!isCronCall && !isInternalCall) {
      const token = authHeader?.replace('Bearer ', '')
      if (token) {
        const supabaseCheck = createClient(
          process.env.NEXT_PUBLIC_SUPABASE_URL!,
          process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
        )
        const { data: { user }, error: authError } = await supabaseCheck.auth.getUser(token)
        if (authError || !user) {
          return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
        }
      }
      // Calls without any auth header are allowed (client-side browser calls)
    }

    // Rate limit: max 5 requests per minute per IP
    const ip = req.headers.get('x-forwarded-for') || 'unknown'
    if (!rateLimit(`email-send:${ip}`, 5, 60000)) {
      return NextResponse.json({ error: 'Too many requests' }, { status: 429 })
    }

    const body = await req.json()
    let { to, type, data } = body

    if (!type) {
      return NextResponse.json({ error: 'Missing required field: type' }, { status: 400 })
    }

    // If no direct email, look up by user ID
    if (!to && data?.recipientUserId) {
      const supabaseAdmin = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
      )
      const { data: userData } = await supabaseAdmin.auth.admin.getUserById(data.recipientUserId)
      to = userData?.user?.email || null

      if (!to) {
        // Fallback: check candidate_profiles or employer_profiles
        const { data: profile } = await supabaseAdmin
          .from('candidate_profiles')
          .select('email')
          .eq('user_id', data.recipientUserId)
          .maybeSingle()
        to = profile?.email || null

        if (!to) {
          const { data: empProfile } = await supabaseAdmin
            .from('employer_profiles')
            .select('email')
            .eq('user_id', data.recipientUserId)
            .maybeSingle()
          to = empProfile?.email || null
        }
      }
    }

    if (!to) {
      return NextResponse.json({ error: 'No recipient email found' }, { status: 400 })
    }

    let email: { subject: string; html: string }

    switch (type) {
      case 'welcome':
        email = welcomeEmail(data.contactName || data.companyName, data.companyName)
        break
      case 'candidate_welcome':
        email = candidateWelcomeEmail(data.candidateName)
        break
      case 'new_application':
        email = newApplicationEmail(data.candidateName, data.jobTitle, data.company)
        break
      case 'application_status': {
        // Check for custom employer template
        let customTpl = null
        if (data.employerId) {
          customTpl = await getCustomTemplate(data.employerId, data.status)
        }
        const vars = { candidateName: data.candidateName || '', jobTitle: data.jobTitle || '', companyName: data.companyName || '' }

        if (data.bodyOverride) {
          // Caller (decline modal) passed an edited body — that's the
          // single source of truth. Subject still comes from the saved
          // template if present, otherwise the default. The body is
          // HTML-escaped before being wrapped in <p> tags so that any
          // angle brackets the employer typed render as text rather than
          // injecting markup.
          const escapeHtml = (s: string) => s
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
          const subject = customTpl
            ? applyVariables(customTpl.subject, vars)
            : applicationStatusEmail(data.status, data.companyName, data.jobTitle, data.candidateName, data.reason, data.applicationId).subject
          email = {
            subject,
            html: `<p>${escapeHtml(String(data.bodyOverride)).replace(/\n/g, '</p><p>')}</p>`,
          }
        } else if (customTpl) {
          email = {
            subject: applyVariables(customTpl.subject, vars),
            html: `<p>${applyVariables(customTpl.body, vars).replace(/\n/g, '</p><p>')}</p>`,
          }
        } else {
          email = applicationStatusEmail(data.status, data.companyName, data.jobTitle, data.candidateName, data.reason, data.applicationId)
        }
        break
      }
      case 'interview_scheduled':
        email = interviewScheduledEmail(data.companyName, data.jobTitle, data.date, data.time, data.notes, data.meetingLink)
        break
      case 'interview_rescheduled':
        email = interviewRescheduledEmail(data.companyName, data.jobTitle, data.candidateName, data.date, data.time, data.interviewType, data.meetingLink)
        break
      case 'interview_confirmed':
        email = interviewConfirmedEmail(data.companyName, data.jobTitle, data.candidateName, data.date, data.time, data.interviewType)
        break
      case 'interview_confirmed_employer':
        email = interviewConfirmedEmployerEmail(data.companyName, data.jobTitle, data.candidateName, data.date, data.time, data.interviewType)
        break
      case 'interview_cancelled':
        email = interviewCancelledEmail(data.companyName, data.jobTitle, data.candidateName, data.date)
        break
      // 'trial_ending' IS GONE — the template is deleted, not disabled. It said
      // "your free trial expires in N days" and quoted £99/month, and Paul may
      // EXTEND the free period depending on signups over the next twelve months.
      // So it described a future nobody has committed to. An email is the worst
      // possible carrier for a claim you may need to withdraw: a page can be
      // edited and a price hidden behind a flag, but a sent email is in
      // somebody's inbox permanently.
      //
      // Nothing ever called it. Requests with this type now fall through to the
      // 400 below, which is the correct answer.
      case 'new_message':
        email = newMessageEmail(data.senderName, data.messagePreview)
        break
      case 'password_reset':
        email = passwordResetEmail(data.resetUrl)
        break
      case 'email_verification':
        email = emailVerificationEmail(data.verifyUrl)
        break
      // 'activation_day1' | 3 | 7 | 14 | 30 ARE NO LONGER ACCEPTED HERE, and
      // fall through to the 400 below. Nothing in the repo ever called them.
      //
      // They took a company name and nothing else, which is precisely the fault
      // the activation rewrite exists to remove: an email that tells an employer
      // how their hiring is going has to know how their hiring is going. Built
      // from a name alone, day 14 would claim nobody had applied to someone
      // sitting on twelve applications. A generic endpoint cannot assemble that
      // state honestly, so it does not get to try — the templates are reachable
      // only from /api/cron/activation-emails, which does the lookups.
      case 'raw':
        // Pre-rendered subject + html passed directly (used by cron jobs)
        email = { subject: data.subject, html: data.html }
        break
      default:
        return NextResponse.json({ error: `Unknown email type: ${type}` }, { status: 400 })
    }

    const result = await sendEmail(to, email.subject, email.html, undefined, undefined, { emailType: type })

    if (!result.success) {
      console.error(`[Email API] Failed to send ${type} to ${to}:`, result.error)
      return NextResponse.json({ success: false, error: result.error }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error('[Email API] Error:', error.message)
    return NextResponse.json({ success: false, error: 'Failed to send email' }, { status: 500 })
  }
}

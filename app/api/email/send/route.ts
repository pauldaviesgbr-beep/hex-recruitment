import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { sendEmail } from '@/lib/email'

// Template imports
import { welcomeEmail } from '@/emails/welcome'
import { newApplicationEmail } from '@/emails/new-application'
import { applicationStatusEmail } from '@/emails/application-status'
import { interviewScheduledEmail } from '@/emails/interview-scheduled'
import { trialEndingEmail } from '@/emails/trial-ending'
import { newMessageEmail } from '@/emails/new-message'
import { passwordResetEmail } from '@/emails/password-reset'
import { emailVerificationEmail } from '@/emails/email-verification'

export async function POST(req: Request) {
  try {
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
        email = welcomeEmail(data.companyName)
        break
      case 'new_application':
        email = newApplicationEmail(data.candidateName, data.jobTitle, data.company)
        break
      case 'application_status':
        email = applicationStatusEmail(data.status, data.companyName, data.jobTitle)
        break
      case 'interview_scheduled':
        email = interviewScheduledEmail(data.companyName, data.jobTitle, data.date, data.time, data.notes)
        break
      case 'trial_ending':
        email = trialEndingEmail(data.companyName, data.daysLeft)
        break
      case 'new_message':
        email = newMessageEmail(data.senderName, data.messagePreview)
        break
      case 'password_reset':
        email = passwordResetEmail(data.resetUrl)
        break
      case 'email_verification':
        email = emailVerificationEmail(data.verifyUrl)
        break
      default:
        return NextResponse.json({ error: `Unknown email type: ${type}` }, { status: 400 })
    }

    const result = await sendEmail(to, email.subject, email.html)

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

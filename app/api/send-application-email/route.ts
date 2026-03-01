import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { sendEmail } from '@/lib/email'
import { newApplicationEmail } from '@/emails/new-application'

export async function POST(req: Request) {
  try {
    const body = await req.json()
    const { jobTitle, company, employerId, candidateName } = body

    // Look up employer email from Supabase
    let employerEmail: string | null = null
    if (employerId) {
      const supabaseAdmin = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
      )
      const { data } = await supabaseAdmin
        .from('employer_profiles')
        .select('email')
        .eq('user_id', employerId)
        .maybeSingle()
      employerEmail = data?.email || null
    }

    if (!employerEmail) {
      console.warn('[Application Email] No employer email found for', employerId)
      return NextResponse.json({ success: true })
    }

    // Send branded email via Resend
    const { subject, html } = newApplicationEmail(candidateName, jobTitle, company)
    const result = await sendEmail(employerEmail, subject, html)

    if (!result.success) {
      console.error('[Application Email] Failed:', result.error)
    }

    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error('[Application Email] Error:', error.message)
    return NextResponse.json({ success: false, error: 'Failed to process email' }, { status: 500 })
  }
}

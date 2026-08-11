import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { sendEmail } from '@/lib/email'
import { EMPLOYER_COHORT_CAP } from '@/lib/constants/cohort'
import { foundingPhraseShort } from '@/lib/trialUtils'
import { emailLayout, ctaButton } from '@/emails/layout'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function buildConfirmationEmail(name: string): string {
  const firstName = name?.trim().split(' ')[0] || 'there'
  const subject = "You're on the Thrive waitlist"
  return emailLayout(subject, `
        <h1 style="margin:0 0 16px;font-size:22px;font-weight:700;color:#0f172a;">Hi ${firstName}, you're on the list &#9989;</h1>
        <p style="margin:0 0 16px;font-size:15px;color:#475569;line-height:1.6;">
          Thanks for joining the Thrive waitlist. We're giving the first <strong style="color:#0f172a;">${EMPLOYER_COHORT_CAP}</strong> employers on Thrive ${foundingPhraseShort()} &mdash; and we'll email you the moment we go live.
        </p>
        ${ctaButton('Explore Thrive', 'https://thrivecareer.co.uk')}
        <p style="margin:0;font-size:14px;color:#94a3b8;line-height:1.6;">
          Hospitality hiring, made simple. Talk soon.
        </p>
  `)
}

export async function POST(request: NextRequest) {
  try {
    const { email, name, company } = await request.json()

    if (!email || !EMAIL_REGEX.test(email)) {
      return NextResponse.json({ error: 'A valid email address is required' }, { status: 400 })
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    const { error } = await supabase.from('waitlist').insert({
      email: email.trim().toLowerCase(),
      name: name?.trim() || null,
      company: company?.trim() || null,
      type: 'employer',
    })

    if (error) {
      // Unique constraint violation — already on the list
      if (error.code === '23505') {
        return NextResponse.json({ success: true, alreadyJoined: true })
      }
      return NextResponse.json({ error: 'Failed to join waitlist' }, { status: 500 })
    }

    // Send confirmation email (fire and forget — don't block response)
    sendEmail(
      email.trim(),
      "You're on the Thrive waitlist — we'll be in touch soon",
      buildConfirmationEmail(name || ''),
      undefined,
      undefined,
      { emailType: 'waitlist_confirmation' },
    ).catch(() => {})

    return NextResponse.json({ success: true })
  } catch {
    return NextResponse.json({ error: 'Unexpected error' }, { status: 500 })
  }
}

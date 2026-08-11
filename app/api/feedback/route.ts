import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { sendEmail } from '@/lib/email'
import { emailLayout } from '@/emails/layout'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

export async function POST(request: NextRequest) {
  try {
    const { rating, comment, pageUrl } = await request.json()

    if (!rating || rating < 1 || rating > 5) {
      return NextResponse.json({ error: 'Invalid rating' }, { status: 400 })
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    const { error } = await supabase.from('platform_feedback').insert({
      page_url: pageUrl ?? null,
      rating,
      comment: typeof comment === 'string' ? comment.trim() || null : JSON.stringify(comment),
    })

    if (error) {
      return NextResponse.json({ error: 'Failed to save' }, { status: 500 })
    }

    // Send email notification for questionnaire feedback
    if (typeof comment === 'string' && comment.startsWith('{')) {
      try {
        const parsed = JSON.parse(comment)
        if (parsed.type === 'employer-questionnaire' || parsed.type === 'candidate-questionnaire') {
          const roleLabel = parsed.type === 'employer-questionnaire' ? 'Employer' : 'Candidate'
          const subject = `New ${roleLabel.toLowerCase()} feedback — ${rating} stars`
          const row = (label: string, value: string) =>
            `<tr><td style="padding:7px 12px 7px 0;color:#94a3b8;white-space:nowrap;vertical-align:top;">${label}</td><td style="padding:7px 0;color:#334155;">${value}</td></tr>`
          const rows = [
            row('Rating', `${'★'.repeat(rating)}${'☆'.repeat(5 - rating)} (${rating}/5)`),
            row('Page', pageUrl || 'Unknown'),
            parsed.q2 ? row('Q2', String(parsed.q2)) : '',
            parsed.q3 ? row('Q3', String(parsed.q3)) : '',
            parsed.q4 ? row('Q4', String(parsed.q4)) : '',
            parsed.q5 ? row('Q5', String(parsed.q5)) : '',
            parsed.notes ? row('Notes', String(parsed.notes)) : '',
          ].filter(Boolean).join('')

          await sendEmail(
            'pauldavies.gbr@gmail.com',
            subject,
            emailLayout(subject, `
        <h1 style="margin:0 0 16px;font-size:21px;font-weight:700;color:#0f172a;">${roleLabel} feedback received</h1>
        <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse;font-size:14px;">
          ${rows}
        </table>
      `),
            undefined,
            undefined,
            { emailType: 'feedback_received' },
          )
        }
      } catch {
        // Parsing failed — not a questionnaire, skip email
      }
    }

    return NextResponse.json({ success: true })
  } catch {
    return NextResponse.json({ error: 'Unexpected error' }, { status: 500 })
  }
}

import { NextResponse } from 'next/server'
import { verifyAdmin } from '@/lib/admin'

export async function GET(req: Request) {
  const { authorized } = await verifyAdmin(req)
  if (!authorized) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
  }

  const resendKey = process.env.RESEND_API_KEY
  if (!resendKey) {
    return NextResponse.json({
      emails: [],
      total: 0,
      error: 'Resend API key not configured',
    })
  }

  try {
    // Fetch recent emails from Resend API
    const res = await fetch('https://api.resend.com/emails', {
      headers: { Authorization: `Bearer ${resendKey}` },
    })

    if (!res.ok) {
      const errorText = await res.text()
      console.error('[Admin Emails] Resend API error:', errorText)
      return NextResponse.json({
        emails: [],
        total: 0,
        error: 'Failed to fetch from Resend',
      })
    }

    const data = await res.json()
    const emails = (data.data || []).map((e: any) => ({
      id: e.id,
      to: Array.isArray(e.to) ? e.to.join(', ') : e.to,
      subject: e.subject || '',
      created_at: e.created_at,
      last_event: e.last_event || 'sent',
    }))

    return NextResponse.json({
      emails,
      total: emails.length,
    })
  } catch (error: any) {
    console.error('[Admin Emails]', error.message)
    return NextResponse.json({
      emails: [],
      total: 0,
      error: error.message || 'Failed to fetch email logs',
    })
  }
}

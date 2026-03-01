import 'server-only'
import { Resend } from 'resend'

if (!process.env.RESEND_API_KEY) {
  console.warn('RESEND_API_KEY is not set — emails will not be sent')
}

const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null

const FROM_ADDRESS = 'Hex <notifications@hexrecruitment.co.uk>'
const FALLBACK_FROM = 'Hex <onboarding@resend.dev>'

export async function sendEmail(
  to: string,
  subject: string,
  html: string
): Promise<{ success: boolean; error?: string }> {
  if (!resend) {
    console.warn(`[Email] Would send to ${to}: ${subject} (Resend not configured)`)
    return { success: false, error: 'Resend not configured' }
  }

  try {
    const { error } = await resend.emails.send({
      from: FROM_ADDRESS,
      to,
      subject,
      html,
    })

    if (error) {
      // If domain not verified, retry with fallback
      if (error.message?.includes('not verified') || error.message?.includes('not allowed')) {
        const { error: fallbackError } = await resend.emails.send({
          from: FALLBACK_FROM,
          to,
          subject,
          html,
        })

        if (fallbackError) {
          console.error('[Email] Fallback send failed:', fallbackError.message)
          return { success: false, error: fallbackError.message }
        }

        return { success: true }
      }

      console.error('[Email] Send failed:', error.message)
      return { success: false, error: error.message }
    }

    return { success: true }
  } catch (err: any) {
    console.error('[Email] Unexpected error:', err.message)
    return { success: false, error: err.message }
  }
}

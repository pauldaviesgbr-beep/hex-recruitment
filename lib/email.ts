import 'server-only'
import { Resend } from 'resend'
import { supabaseAdmin } from '@/lib/supabase-admin'

if (!process.env.RESEND_API_KEY) {
  console.warn('RESEND_API_KEY is not set — emails will not be sent')
}

const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null

const FROM_ADDRESS = 'Thrive <noreply@thrivecareer.co.uk>'

/** "p****s@gmail.com" — enough to recognise a recipient without logging one. */
function maskAddress(to: string): string {
  const [local, domain] = String(to).split('@')
  if (!domain) return '***'
  const head = local.slice(0, 1)
  const tail = local.length > 2 ? local.slice(-1) : ''
  return `${head}${'*'.repeat(Math.max(1, local.length - 2))}${tail}@${domain}`
}

/**
 * Record one attempted send in public.email_log.
 *
 * IT CAN NEVER BREAK A SEND. Every failure mode — a missing table, RLS, a dead
 * connection, a malformed value — is swallowed and reported to the console.
 * Instrumentation that can take down the thing it measures is worse than no
 * instrumentation, and this sits directly in the path of every email the
 * product sends.
 *
 * NOT awaited by the caller for the same reason: a slow log write must not
 * delay or fail a send. The promise is fired and its rejection handled here.
 *
 * The FULL address is stored, unlike the console line above it, which masks.
 * That is the point of the table — "which address bounced" was unanswerable
 * this morning precisely because the only record we had was masked.
 */
function recordSend(row: {
  recipient: string
  emailType: string
  subject: string
  success: boolean
  providerMessageId?: string | null
  error?: string | null
}): void {
  try {
    void supabaseAdmin
      .from('email_log')
      .insert({
        recipient: row.recipient,
        email_type: row.emailType,
        subject: row.subject,
        success: row.success,
        provider_message_id: row.providerMessageId ?? null,
        error: row.error ?? null,
      })
      .then(({ error }) => {
        if (error) console.error('[Email] send-log insert failed:', error.message)
      })
  } catch (err: any) {
    console.error('[Email] send-log insert threw:', err?.message)
  }
}

/**
 * Derive a readable plain-text alternative from the HTML body so every email
 * ships with a text/plain part (better deliverability + accessibility). This
 * is a fallback only — it changes nothing about who/when/what links are sent.
 * Strips the document chrome, turns links into "text (url)", and collapses
 * whitespace. Callers may still pass an explicit `text` to override it.
 */
function htmlToText(html: string): string {
  return html
    .replace(/<head[\s\S]*?<\/head>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<a [^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi, (_m, href, txt) => {
      const label = txt.replace(/<[^>]+>/g, '').trim()
      return label && !href.includes(label) ? `${label} (${href})` : href
    })
    .replace(/<\/(p|div|tr|h[1-6]|li)>/gi, '\n')
    .replace(/<br\s*\/?>(?:\s*)/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&middot;/gi, '·')
    .replace(/&amp;/gi, '&')
    .replace(/&copy;/gi, '©')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .split('\n').map(l => l.trim()).join('\n')
    .trim()
}

export interface SendEmailOptions {
  /**
   * A working, per-recipient one-click unsubscribe URL. Supplying it adds the
   * List-Unsubscribe and List-Unsubscribe-Post headers.
   *
   * Google and Yahoo have required these of bulk senders since February 2024,
   * and their absence is a placement signal — it is weighed exactly when a
   * filter decides Primary versus Promotions for a sender the recipient has no
   * history with. We already put an unsubscribe link in the footer of every
   * roundup, so we were doing the work of an unsubscribe and getting none of
   * the credit for it.
   *
   * MUST be a URL that actually works. A List-Unsubscribe-Post header pointing
   * at a dead URL is worse than no header at all, because the provider will
   * POST it and record the failure against us. Callers that render a preview or
   * a test should either omit this or pass a URL that is genuinely valid and
   * genuinely harmless — see the roundup route, which signs a real token for an
   * all-zero user id.
   */
  unsubscribeUrl?: string
  /**
   * What KIND of email this is — 'roundup', 'activation_day7', 'team_invite'.
   *
   * Passed explicitly by every caller rather than derived from the subject.
   * Subjects are copy: they interpolate a company name, they get rewritten,
   * and two different emails can share one. A type inferred from a subject
   * would be a guess that looks like data, and the whole point of this log is
   * to stop guessing about what we sent.
   *
   * Defaults to 'unknown' so a new call site logs SOMETHING rather than
   * nothing — a row with an unhelpful type is still evidence a send happened.
   */
  emailType?: string
}

/**
 * Where a reply goes when a caller does not name one.
 *
 * IT USED TO BE hello@thrivecareer.co.uk. THIS COMMENT SAID THAT MAILBOX WAS
 * DEAD AND THAT WAS WRONG — corrected 31 Aug 2026. hello@ is one of three
 * aliases, with contact@ and support@, and all three land in the paul@ inbox.
 *
 * The 11 Aug 2026 test looked negative because NONE OF THE ALIASES FORWARDS TO
 * GMAIL, so searching Gmail for mail sent to one of them returns nothing
 * whether it works or not. A found inbound proves delivery; an empty search
 * proves only that Gmail never saw it. The check was run in the one direction
 * it cannot answer.
 *
 * THE CHANGE ITSELF STAYS, on its own merits and not on the dead-mailbox story:
 *
 * support@ is the address /terms, /privacy-policy and the chatbot already give
 * out, so it is the one that has to work.
 *
 * A DEFAULT IS A CLAIM HERE, NOT A CONVENIENCE. Every one of the 29 email types
 * that omits this argument is telling its recipient "you can reply to this".
 * Same shape as the form defaults in CLAUDE.md: the value nobody chose is still
 * the value that reaches the person.
 */
const DEFAULT_REPLY_TO = 'support@thrivecareer.co.uk'

export async function sendEmail(
  to: string,
  subject: string,
  html: string,
  replyTo: string = DEFAULT_REPLY_TO,
  text?: string,
  options: SendEmailOptions = {},
): Promise<{ success: boolean; error?: string }> {
  const emailType = options.emailType || 'unknown'

  if (!resend) {
    console.warn(`[Email] Would send to ${to}: ${subject} (Resend not configured)`)
    // Logged as an ATTEMPT that failed. This is the exact shape of the fault
    // that hid for four and a half months: nothing sent, nothing recorded, and
    // silence indistinguishable from success.
    recordSend({ recipient: to, emailType, subject, success: false, error: 'Resend not configured' })
    return { success: false, error: 'Resend not configured' }
  }

  try {
    const headers = options.unsubscribeUrl
      ? {
          'List-Unsubscribe': `<${options.unsubscribeUrl}>`,
          'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
        }
      : undefined

    const result = await resend.emails.send({
      from: FROM_ADDRESS,
      to,
      subject,
      html,
      text: text || htmlToText(html),
      replyTo,
      ...(headers ? { headers } : {}),
    })

    if (result.error) {
      // Resend's error has more than just .message — capture name + statusCode
      // so callers (and the foundingSignup error-surfacing logging in particular)
      // can tell apart validation errors, domain-unverified, rate limits, etc.
      const detail = {
        name: (result.error as any).name,
        message: result.error.message,
        statusCode: (result.error as any).statusCode,
      }
      console.error('[Email] Send failed:', JSON.stringify(detail))
      recordSend({ recipient: to, emailType, subject, success: false, error: JSON.stringify(detail) })
      return { success: false, error: JSON.stringify(detail) }
    }

    // Log the successes too, not just the failures.
    //
    // Until now only failures were logged, which made silence ambiguous: an
    // empty log could mean "everything sent" or "nothing was even attempted",
    // and there was no way to tell them apart after the fact. That ambiguity is
    // most of the reason a broken API key could have sat unnoticed — "no errors
    // in the logs" was reassuring and meant nothing.
    //
    // The recipient is masked. These logs are for answering "did it go out and
    // when", which the subject and domain do; the full address adds little and
    // puts candidate email addresses in a log we scroll through casually.
    console.log('[Email] Sent:', JSON.stringify({ to: maskAddress(to), subject }))
    // Resend's id, captured so a row here matches a row there without guessing
    // — which is what "which of these bounced?" needed this morning and could
    // not have.
    recordSend({
      recipient: to, emailType, subject, success: true,
      providerMessageId: (result as any)?.data?.id ?? null,
    })
    return { success: true }
  } catch (err: any) {
    console.error('[Email] Unexpected error:', err?.message, err?.stack?.slice(0, 300))
    recordSend({ recipient: to, emailType, subject, success: false, error: err?.message || 'unknown error' })
    return { success: false, error: err?.message || 'unknown error' }
  }
}

import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { loadServiceAccount, sendToToken } from '@/lib/fcm'
import { sendWebPush } from '@/lib/webpush'
import { normalisePrefs, pushAllowed, type Role } from '@/lib/notificationPrefs'

/**
 * Called by the database trigger on INSERT INTO public.notifications.
 *
 * It receives ONLY a notification id. Everything else is read here with the
 * service role — the trigger deliberately posts no content, so a leaked
 * dispatcher URL cannot be used to learn what anyone was notified about.
 *
 * AUTHENTICATED BY A SHARED SECRET held in Supabase Vault, which the trigger
 * reads at fire time. It is never in the migration file, because a migration is
 * committed and its ledger row is readable.
 *
 * EVERY PATH WRITES A push_log ROW, including the ones where nothing is sent.
 * "No tokens", "opted out" and "no credentials" are each recorded with their
 * own outcome, so a zero in this table is readable rather than ambiguous —
 * which is the entire lesson of the three dead jobs found on 11 Aug 2026.
 */
export const dynamic = 'force-dynamic'
export const maxDuration = 30

type Outcome = 'sent' | 'no_tokens' | 'opted_out' | 'provider_error' | 'no_credentials' | 'not_found'

async function log(row: {
  user_id?: string | null
  notification_id?: string | null
  notification_type?: string
  title?: string | null
  success: boolean
  outcome: Outcome
  provider_message_id?: string | null
  error?: string | null
}) {
  try {
    await supabaseAdmin.from('push_log').insert({
      user_id: row.user_id ?? null,
      notification_id: row.notification_id ?? null,
      notification_type: row.notification_type ?? 'unknown',
      title: row.title ?? null,
      success: row.success,
      outcome: row.outcome,
      provider_message_id: row.provider_message_id ?? null,
      error: row.error ?? null,
    })
  } catch (err: any) {
    // Same rule as the email log: instrumentation must never take down the
    // thing it measures.
    console.error('[push/dispatch] push_log insert failed:', err?.message)
  }
}

export async function POST(req: NextRequest) {
  const secret = process.env.PUSH_DISPATCH_SECRET
  if (!secret || req.headers.get('x-push-dispatch-secret') !== secret) {
    return new Response('Unauthorized', { status: 401 })
  }

  let body: { notification_id?: string }
  try { body = await req.json() } catch { return NextResponse.json({ error: 'invalid_json' }, { status: 400 }) }
  const id = (body.notification_id || '').toString()
  if (!id) return NextResponse.json({ error: 'missing_notification_id' }, { status: 400 })

  const { data: n } = await supabaseAdmin
    .from('notifications')
    .select('id, user_id, type, title, message, link')
    .eq('id', id)
    .maybeSingle()

  if (!n) {
    await log({ notification_id: id, success: false, outcome: 'not_found', error: 'no such notification' })
    return NextResponse.json({ ok: false, outcome: 'not_found' })
  }
  const base = { user_id: n.user_id, notification_id: n.id, notification_type: n.type, title: n.title }

  // Credentials before anything else, so "misconfigured" never masquerades as
  // "nobody to send to".
  // NOT FATAL ANY MORE, and that change matters. FCM credentials are needed
  // only by the native path; a browser subscription is sent with VAPID keys and
  // never touches Firebase. Returning early here would have meant that a
  // missing FIREBASE_* silently killed WEB push too — a coupling between two
  // transports that have nothing to do with each other. The failure is now
  // raised per row, by the branch that actually needs it.
  let sa: ReturnType<typeof loadServiceAccount> | null = null
  let saError: string | null = null
  try {
    sa = loadServiceAccount()
    if (!sa) saError = 'FIREBASE_* not configured'
  } catch (err: any) {
    // The project-id guard lands here — a service account for the wrong project.
    saError = err?.message?.slice(0, 400) || 'service account load failed'
  }

  // Preferences. Read from whichever profile the user has; a missing profile
  // falls back to defaults rather than to silence.
  let prefsRaw: unknown = null
  let role: Role = 'employee'
  const { data: cand } = await supabaseAdmin
    .from('candidate_profiles').select('notification_preferences').eq('user_id', n.user_id).maybeSingle()
  if (cand) { prefsRaw = (cand as any).notification_preferences }
  else {
    const { data: emp } = await supabaseAdmin
      .from('employer_profiles').select('notification_preferences').eq('user_id', n.user_id).maybeSingle()
    if (emp) { prefsRaw = (emp as any).notification_preferences; role = 'employer' }
  }
  if (!pushAllowed(normalisePrefs(role, prefsRaw), n.type)) {
    await log({ ...base, success: false, outcome: 'opted_out', error: null })
    return NextResponse.json({ ok: true, outcome: 'opted_out' })
  }

  const { data: tokens } = await supabaseAdmin
    .from('device_tokens')
    .select('id, token, platform, endpoint, p256dh, auth')
    .eq('user_id', n.user_id)
    .is('revoked_at', null)

  if (!tokens || tokens.length === 0) {
    await log({ ...base, success: false, outcome: 'no_tokens', error: null })
    return NextResponse.json({ ok: true, outcome: 'no_tokens' })
  }

  let sent = 0
  for (const t of tokens) {
    // TWO TRANSPORTS, CHOSEN BY WHAT THE ROW ACTUALLY HOLDS rather than by the
    // platform string. `platform` is a label the client supplied; endpoint vs
    // token is the thing that determines what can physically be sent, and the
    // table's CHECK guarantees exactly one of them is present. Trusting the
    // data over the label means a mislabelled row still goes the right way.
    if (t.endpoint) {
      const r = await sendWebPush(
        { endpoint: t.endpoint, p256dh: t.p256dh as string, auth: t.auth as string },
        {
          title: n.title,
          body: n.message || '',
          url: n.link || '/',
          tag: n.type || 'thrive',
        },
      )
      if (r.ok) {
        sent++
        await log({ ...base, success: true, outcome: 'sent', provider_message_id: `webpush:${r.status}` })
      } else {
        await log({ ...base, success: false, outcome: 'provider_error', error: r.error })
        // ONLY a subscription the push service calls permanently dead (404/410)
        // or one we can never encrypt for. A 5xx or a network blip must not
        // revoke, or one bad afternoon unsubscribes everybody.
        if (r.gone) {
          await supabaseAdmin.from('device_tokens')
            .update({ revoked_at: new Date().toISOString() }).eq('id', t.id)
        }
      }
      continue
    }

    // FCM path — native handsets. Unchanged from phase 1, except that missing
    // credentials are now reported here, against the row that needed them.
    if (!sa) {
      await log({ ...base, success: false, outcome: 'no_credentials', error: saError })
      continue
    }
    if (t.platform !== 'android' && t.platform !== 'web') {
      await log({ ...base, success: false, outcome: 'provider_error', error: `no transport for platform ${t.platform}` })
      continue
    }
    const r = await sendToToken(sa, t.token as string, n.title, n.message || '', n.link)
    if (r.ok) {
      sent++
      await log({ ...base, success: true, outcome: 'sent', provider_message_id: r.messageId })
    } else {
      await log({ ...base, success: false, outcome: 'provider_error', error: r.error })
      // A token FCM says is dead is revoked rather than retried forever. Kept,
      // not deleted — see the migration's note.
      if (r.tokenIsDead) {
        await supabaseAdmin.from('device_tokens')
          .update({ revoked_at: new Date().toISOString() }).eq('id', t.id)
      }
    }
  }

  return NextResponse.json({ ok: true, outcome: sent > 0 ? 'sent' : 'provider_error', tokens: tokens.length, sent })
}

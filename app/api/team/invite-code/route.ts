import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { sendEmail } from '@/lib/email'
import { inviteCode, formatInviteCode, verifyInviteCode, maskEmail } from '@/lib/inviteCode'

/**
 * THE WAY THROUGH AN email_mismatch, WITHOUT LOOSENING WHO MAY ACCEPT.
 *
 * accept_employer_invite compares the signed-in address to the invited one as
 * strings. That is a proxy for "does this person hold the invited mailbox",
 * and the proxy fails for real people — most permanently for Sign in with
 * Apple, whose private relay address can never equal what was typed into the
 * invite form. See lib/inviteCode.ts for the full argument.
 *
 * So: prove the mailbox instead. A code goes to the INVITED address and the
 * signed-in user types it back. That is strictly stronger evidence than a
 * string match, because a string can be typed by anyone and the code can only
 * be READ by whoever holds the inbox.
 *
 * THE RPC REMAINS THE ONLY THING THAT ACCEPTS AN INVITE, and that is the most
 * important line in this file. Expiry, single use, status = 'invited' and the
 * one-active-employer rule all live inside it, atomically. Re-implementing
 * those here with a service-role UPDATE would be a second copy of the gate —
 * the exact fault this codebase has been paying down all week — and the copy
 * would be the one nobody reads when the rule changes.
 *
 * WHAT THIS ROUTE DOES INSTEAD is narrow: having proved the mailbox, it points
 * `invited_email` at the accepting user and calls the RPC as that user, so the
 * RPC's own comparison passes for a reason we have established rather than
 * assumed. IT PUTS THE OLD VALUE BACK IF THE RPC REFUSES for any other reason
 * — otherwise a failed accept (already_in_account, say) would silently leave
 * the invite re-pointed at somebody who never joined, and they could then walk
 * in later with no code at all.
 *
 * KNOWN TRADE, AND IT IS PAUL'S TO ACCEPT OR NOT: re-pointing the column
 * overwrites the record of who was originally invited. The alternative is one
 * migration adding `accepted_email` (or a code column), which keeps both
 * addresses. That is the better long-term shape and it is not built here —
 * see the report.
 */

const GENERIC = { ok: false, error: 'invalid' }

async function requireUser(req: NextRequest) {
  const bearer = req.headers.get('authorization')?.replace('Bearer ', '')
  if (!bearer) return null
  const { data: { user }, error } = await supabaseAdmin.auth.getUser(bearer)
  if (error || !user) return null
  return { user, bearer }
}

/**
 * The invite this token names, or null.
 *
 * SAME PRE-CHECKS AS THE RPC, DELIBERATELY DUPLICATED HERE FOR ONE PURPOSE
 * ONLY: deciding whether it is worth sending an email. It never authorises
 * anything — the RPC re-runs every one of them at write time, which is what
 * makes this safe to be a copy. A rule copied for a decision that has no
 * consequences is not the fault; a rule copied for one that does would be.
 */
async function loadInvite(token: string) {
  const { data, error } = await supabaseAdmin
    .from('employer_members')
    .select('id, employer_id, invited_email, status, invite_expires_at')
    .eq('invite_token', token)
    .maybeSingle()
  if (error || !data) return null
  if (data.status !== 'invited') return null
  if (data.invite_expires_at && Date.parse(data.invite_expires_at) < Date.now()) return null
  if (!data.invited_email) return null
  return data
}

export async function POST(req: NextRequest) {
  const auth = await requireUser(req)
  if (!auth) return NextResponse.json({ ok: false, error: 'not_authenticated' }, { status: 401 })

  let body: { token?: string; action?: string; code?: string }
  try { body = await req.json() } catch { return NextResponse.json(GENERIC, { status: 400 }) }

  const token = (body.token || '').toString()
  if (!token) return NextResponse.json(GENERIC, { status: 400 })

  const invite = await loadInvite(token)
  // One shape for "no such invite", "already used" and "expired". The accept
  // page already tells a legitimate holder which of those it is, through the
  // RPC; repeating it here would let somebody without an invite enumerate
  // tokens by reading the difference.
  if (!invite) return NextResponse.json(GENERIC, { status: 400 })

  // ─── send the code ────────────────────────────────────────────────────
  if (body.action === 'send') {
    let code: string
    try {
      code = inviteCode(invite.id, invite.invited_email!)
    } catch {
      // A missing secret means this route cannot run. It must never mean
      // "no code needed" — fail closed and say so.
      return NextResponse.json({ ok: false, error: 'server_error' }, { status: 500 })
    }

    // THE ONLY ADDRESS THIS CAN EVER REACH IS THE ONE ALREADY IN THE ROW.
    // It is never taken from the request, so a caller cannot aim it at a
    // mailbox of their choosing — which would turn an invite link into a way
    // to send our mail to anybody.
    const to = invite.invited_email!
    const shown = formatInviteCode(code)
    const sent = await sendEmail(
      to,
      `Your Thrive team code: ${shown}`,
      `<p style="font-family:system-ui,sans-serif;font-size:15px;color:#0f172a">
         Someone is joining your Thrive team using the invitation sent to this address.
       </p>
       <p style="font-family:system-ui,sans-serif;font-size:15px;color:#0f172a">
         Your code is <strong style="font-size:22px;letter-spacing:2px">${shown}</strong> —
         it lasts about half an hour.
       </p>
       <p style="font-family:system-ui,sans-serif;font-size:14px;color:#475569">
         If you were not expecting this, ignore it. Nobody can join without the code,
         and nothing has changed on your account.
       </p>`,
      undefined,
      `Your Thrive team code is ${shown}. It lasts about half an hour. If you were not expecting this, ignore it — nobody can join without the code.`,
      { emailType: 'team_invite_code' },
    )
    if (!sent.success) return NextResponse.json({ ok: false, error: 'send_failed' }, { status: 502 })

    // Masked, not full. The mismatch screen already shows the whole address,
    // so this discloses nothing new; it is the right habit for the day that
    // screen changes.
    return NextResponse.json({ ok: true, sentTo: maskEmail(to) })
  }

  // ─── verify the code, then let the RPC do the accepting ───────────────
  const supplied = (body.code || '').toString()
  let good = false
  try {
    good = verifyInviteCode(invite.id, invite.invited_email!, supplied)
  } catch {
    return NextResponse.json({ ok: false, error: 'server_error' }, { status: 500 })
  }
  if (!good) return NextResponse.json({ ok: false, error: 'bad_code' }, { status: 400 })

  const accepterEmail = (auth.user.email || '').toLowerCase()
  if (!accepterEmail) return NextResponse.json({ ok: false, error: 'not_authenticated' }, { status: 401 })

  const originalEmail = invite.invited_email!

  // Point the invite at the person who proved they hold the invited mailbox,
  // so the RPC's own comparison passes for an established reason.
  const { error: repointErr } = await supabaseAdmin
    .from('employer_members')
    .update({ invited_email: accepterEmail })
    .eq('id', invite.id)
    .eq('status', 'invited')          // cannot re-point an invite already used
  if (repointErr) return NextResponse.json({ ok: false, error: 'server_error' }, { status: 500 })

  const asUser = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { global: { headers: { Authorization: `Bearer ${auth.bearer}` } }, auth: { persistSession: false, autoRefreshToken: false } },
  )
  const { data, error } = await asUser.rpc('accept_employer_invite', { p_token: token })
  const result = (data || {}) as { ok?: boolean; error?: string; employer_id?: string }

  if (error || !result.ok) {
    // PUT IT BACK. Every other gate still belongs to the RPC, and a refusal
    // from any of them must leave the invite exactly as it was — otherwise a
    // rejected accept quietly hands this person a keyless way in later.
    await supabaseAdmin
      .from('employer_members')
      .update({ invited_email: originalEmail })
      .eq('id', invite.id)
      .eq('status', 'invited')
    return NextResponse.json({ ok: false, error: error ? 'server_error' : (result.error || 'invalid') })
  }

  try {
    await supabaseAdmin.auth.admin.updateUserById(auth.user.id, {
      user_metadata: { ...(auth.user.user_metadata || {}), role: 'employer' },
    })
  } catch { /* non-fatal: membership is set; role re-syncs on next login */ }

  console.log(`[team-invite] ${auth.user.id} accepted invite ${invite.id} via a code sent to ${originalEmail}`)
  return NextResponse.json({ ok: true, employer_id: result.employer_id })
}

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { sendEmail } from '@/lib/email'
import { buildInviteEmail } from '@/lib/teamInviteEmail'
import { inviteOrigin } from '@/lib/inviteOrigin'
import { PERMISSIONS, OWNER_ONLY_KEYS, type Permissions, type PermissionKey } from '@/lib/teamPermissions'

const ALL_KEYS = PERMISSIONS.map(p => p.key)

function sanitizePerms(input: unknown): Permissions {
  const out: Permissions = {}
  if (input && typeof input === 'object') {
    for (const k of ALL_KEYS) {
      if ((input as Record<string, unknown>)[k] === true) out[k as PermissionKey] = true
    }
  }
  return out
}

type Action = 'update' | 'suspend' | 'reactivate' | 'remove' | 'resend' | 'revoke'

/**
 * Team member management. All mutations run AS THE CALLER (Bearer token → the
 * "manage_team can update/remove members" RLS policies, the owner-protection
 * trigger, and the escalation guard all apply). Code checks add friendly errors.
 */
export async function POST(req: NextRequest) {
  const token = req.headers.get('authorization')?.replace('Bearer ', '')
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { data: { user }, error: authErr } = await supabaseAdmin.auth.getUser(token)
  if (authErr || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let body: { action?: Action; memberId?: string; permissions?: unknown }
  try { body = await req.json() } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }) }
  const action = body.action
  const memberId = (body.memberId || '').toString()
  if (!action || !memberId) return NextResponse.json({ error: 'Missing action or member.' }, { status: 400 })

  const asUser = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { global: { headers: { Authorization: `Bearer ${token}` } }, auth: { persistSession: false, autoRefreshToken: false } },
  )

  // Caller's active membership → capability + employer scope.
  const { data: me } = await asUser
    .from('employer_members')
    .select('employer_id, role, permissions')
    .eq('user_id', user.id)
    .eq('status', 'active')
    .limit(1)
    .maybeSingle()
  if (!me) return NextResponse.json({ error: 'You are not part of a team.' }, { status: 403 })
  const isOwner = me.role === 'owner'
  if (!isOwner && (me.permissions as Permissions)?.manage_team !== true) {
    return NextResponse.json({ error: 'You do not have permission to manage the team.' }, { status: 403 })
  }

  // Target row (must belong to the caller's employer).
  const { data: target } = await asUser
    .from('employer_members')
    .select('id, employer_id, user_id, invited_email, role, status, permissions')
    .eq('id', memberId)
    .maybeSingle()
  if (!target || target.employer_id !== me.employer_id) {
    return NextResponse.json({ error: 'Member not found.' }, { status: 404 })
  }
  if (target.role === 'owner') {
    return NextResponse.json({ error: 'The account owner cannot be changed.' }, { status: 403 })
  }

  if (action === 'update') {
    const perms = sanitizePerms(body.permissions)
    if (!isOwner && OWNER_ONLY_KEYS.some(k => perms[k])) {
      return NextResponse.json({ error: 'Only the account owner can grant team, billing or company permissions.' }, { status: 403 })
    }
    const { error } = await asUser.from('employer_members').update({ permissions: perms }).eq('id', memberId)
    if (error) return NextResponse.json({ error: error.message }, { status: 400 })
    return NextResponse.json({ ok: true })
  }

  if (action === 'suspend' || action === 'reactivate') {
    const status = action === 'suspend' ? 'suspended' : 'active'
    const { error } = await asUser.from('employer_members').update({ status }).eq('id', memberId)
    if (error) return NextResponse.json({ error: error.message }, { status: 400 })
    return NextResponse.json({ ok: true })
  }

  if (action === 'remove' || action === 'revoke') {
    const { error } = await asUser.from('employer_members').delete().eq('id', memberId)
    if (error) return NextResponse.json({ error: error.message }, { status: 400 })
    return NextResponse.json({ ok: true })
  }

  if (action === 'resend') {
    if (target.status !== 'invited') {
      return NextResponse.json({ error: 'That invitation has already been accepted.' }, { status: 409 })
    }
    const newToken = crypto.randomUUID()
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
    const { error } = await asUser
      .from('employer_members')
      .update({ invite_token: newToken, invite_expires_at: expiresAt })
      .eq('id', memberId)
    if (error) return NextResponse.json({ error: error.message }, { status: 400 })

    const { data: prof } = await supabaseAdmin
      .from('employer_profiles').select('company_name').eq('id', me.employer_id).maybeSingle()
    const company = prof?.company_name || 'the team'
    const inviterName = user.user_metadata?.full_name || user.email || 'A teammate'
    const link = `${inviteOrigin(req)}/invite/accept?token=${newToken}`
    const { subject, html } = buildInviteEmail({ company, inviterName, email: target.invited_email || '', link })
    const sent = await sendEmail(target.invited_email || '', subject, html, undefined, undefined, { emailType: 'team_member_update' })
    return NextResponse.json({ ok: true, emailSent: sent.success })
  }

  return NextResponse.json({ error: 'Unknown action.' }, { status: 400 })
}

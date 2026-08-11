import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { sendEmail } from '@/lib/email'
import { buildInviteEmail } from '@/lib/teamInviteEmail'
import { inviteOrigin } from '@/lib/inviteOrigin'
import { PERMISSIONS, OWNER_ONLY_KEYS, type Permissions, type PermissionKey } from '@/lib/teamPermissions'

const ALL_KEYS = PERMISSIONS.map(p => p.key)
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/

function sanitizePerms(input: unknown): Permissions {
  const out: Permissions = {}
  if (input && typeof input === 'object') {
    for (const k of ALL_KEYS) {
      if ((input as Record<string, unknown>)[k] === true) out[k as PermissionKey] = true
    }
  }
  return out
}

/**
 * Invite a teammate to the current employer. Runs the DB write AS THE CALLER
 * (Bearer token → per-request client) so the "manage_team can add members" RLS
 * policy and the guard_member_escalation trigger both apply; the code checks
 * below are defence-in-depth + friendly errors.
 */
export async function POST(req: NextRequest) {
  const token = req.headers.get('authorization')?.replace('Bearer ', '')
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { data: { user }, error: authErr } = await supabaseAdmin.auth.getUser(token)
  if (authErr || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let body: { email?: string; permissions?: unknown }
  try { body = await req.json() } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }) }

  const email = (body.email || '').toString().trim().toLowerCase()
  if (!EMAIL_RE.test(email)) return NextResponse.json({ error: 'Enter a valid email address.' }, { status: 400 })
  const perms = sanitizePerms(body.permissions)

  const asUser = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { global: { headers: { Authorization: `Bearer ${token}` } }, auth: { persistSession: false, autoRefreshToken: false } },
  )

  // Caller's active membership → employer profile id + capability.
  const { data: me } = await asUser
    .from('employer_members')
    .select('employer_id, role, permissions')
    .eq('user_id', user.id)
    .eq('status', 'active')
    .limit(1)
    .maybeSingle()
  if (!me) return NextResponse.json({ error: 'You are not part of a team.' }, { status: 403 })

  const isOwner = me.role === 'owner'
  const canManageTeam = isOwner || (me.permissions as Permissions)?.manage_team === true
  if (!canManageTeam) return NextResponse.json({ error: 'You do not have permission to invite teammates.' }, { status: 403 })
  if (!isOwner && OWNER_ONLY_KEYS.some(k => perms[k])) {
    return NextResponse.json({ error: 'Only the account owner can grant team, billing or company permissions.' }, { status: 403 })
  }

  const employerProfileId = me.employer_id as string
  const inviteToken = crypto.randomUUID()
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()

  const { error: insErr } = await asUser.from('employer_members').insert({
    employer_id: employerProfileId,
    invited_email: email,
    role: 'member',
    permissions: perms,
    status: 'invited',
    invited_by: user.id,
    invite_token: inviteToken,
    invite_expires_at: expiresAt,
  })
  if (insErr) {
    if (insErr.code === '23505') {
      return NextResponse.json({ error: 'That email has already been invited to this team.' }, { status: 409 })
    }
    // A guard raise (e.g. escalation) surfaces here.
    return NextResponse.json({ error: insErr.message || 'Could not create the invitation.' }, { status: 400 })
  }

  // Company name for the branded email.
  const { data: prof } = await supabaseAdmin
    .from('employer_profiles')
    .select('company_name')
    .eq('id', employerProfileId)
    .maybeSingle()
  const company = prof?.company_name || 'the team'
  const inviterName = user.user_metadata?.full_name || user.email || 'A teammate'

  const link = `${inviteOrigin(req)}/invite/accept?token=${inviteToken}`
  const { subject, html } = buildInviteEmail({ company, inviterName, email, link })
  const sent = await sendEmail(email, subject, html, undefined, undefined, { emailType: 'team_invite' })

  return NextResponse.json({ ok: true, emailSent: sent.success })
}

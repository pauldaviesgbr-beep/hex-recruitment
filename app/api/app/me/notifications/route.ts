// PUT /api/app/me/notifications — design S2's two switches, "Replies from
// employers" and "Changes to your applications". They write the same push
// preferences the website stores (candidate_profiles.notification_preferences
// .push.new_messages / .application_updates), which /api/push/dispatch already
// reads before sending (lib/notificationPrefs pushAllowed). Nothing else in
// the stored preferences is touched.

import { NextRequest, NextResponse } from 'next/server'
import { userFromRequest } from '@/lib/appApi'
import { normalisePrefs, type CandidatePrefs } from '@/lib/notificationPrefs'

export const dynamic = 'force-dynamic'

export async function PUT(req: NextRequest) {
  const me = await userFromRequest(req)
  if (!me) return NextResponse.json({ error: 'signed_out' }, { status: 401 })

  let body: any
  try { body = await req.json() } catch { body = null }
  const replies = body?.replies, applications = body?.applications
  if ((replies !== undefined && typeof replies !== 'boolean') ||
      (applications !== undefined && typeof applications !== 'boolean') ||
      (replies === undefined && applications === undefined)) {
    return NextResponse.json({ error: 'bad_request' }, { status: 400 })
  }

  const { data: row } = await me.client
    .from('candidate_profiles').select('notification_preferences').eq('user_id', me.userId).maybeSingle()
  if (!row) return NextResponse.json({ error: 'no_profile' }, { status: 404 })

  // Only the push section changes. The rest is written back exactly as stored,
  // not filled with defaults: a push switch has no business writing someone's
  // email preferences into their row (the first drive caught exactly that).
  const stored = (row.notification_preferences && typeof row.notification_preferences === 'object')
    ? row.notification_preferences as Record<string, unknown> : {}
  const push = { ...(normalisePrefs('employee', stored) as CandidatePrefs).push }
  if (replies !== undefined) push.new_messages = replies
  if (applications !== undefined) push.application_updates = applications

  const { error } = await me.client
    .from('candidate_profiles').update({ notification_preferences: { ...stored, push } }).eq('user_id', me.userId)
  if (error) return NextResponse.json({ error: 'not_saved' }, { status: 503 })
  return NextResponse.json(
    { replies: push.new_messages, applications: push.application_updates },
    { headers: { 'Cache-Control': 'no-store' } },
  )
}

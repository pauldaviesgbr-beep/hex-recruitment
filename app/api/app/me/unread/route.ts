// GET /api/app/me/unread — the two counts behind the iOS app's More-tab badge
// (design_handoff_phone_navigation, 1b: "the More badge counts unread messages
// and notifications together"). The app has no web header to carry them, so it
// asks here. Both are counted as the user, so RLS applies exactly as it does on
// the website, and by the same rules the website uses:
//
//   messages       unread messages in the user's conversations that someone
//                  else sent (components/Header, lib/MessagesContext)
//   notifications  the user's notifications not yet read (lib/NotificationsContext)
//
// The app adds them; they are returned apart so a badge can say which.

import { NextRequest, NextResponse } from 'next/server'
import { userFromRequest } from '@/lib/appApi'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const me = await userFromRequest(req)
  if (!me) return NextResponse.json({ error: 'signed_out' }, { status: 401 })

  const { data: convs, error: convErr } = await me.client
    .from('conversations')
    .select('id')
    .or(`participant_1.eq.${me.userId},participant_2.eq.${me.userId}`)
  if (convErr) return NextResponse.json({ error: 'not_counted' }, { status: 503 })

  let messages = 0
  const ids = (convs || []).map(c => c.id as string)
  if (ids.length > 0) {
    const { count, error } = await me.client
      .from('messages')
      .select('id', { count: 'exact', head: true })
      .in('conversation_id', ids)
      .eq('is_read', false)
      .neq('sender_id', me.userId)
    if (error) return NextResponse.json({ error: 'not_counted' }, { status: 503 })
    messages = count || 0
  }

  const { count: notifCount, error: notifErr } = await me.client
    .from('notifications')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', me.userId)
    .eq('read', false)
  if (notifErr) return NextResponse.json({ error: 'not_counted' }, { status: 503 })

  return NextResponse.json(
    { messages, notifications: notifCount || 0 },
    { headers: { 'Cache-Control': 'no-store' } },
  )
}

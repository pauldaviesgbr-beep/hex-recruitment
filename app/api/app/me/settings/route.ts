// GET /api/app/me/settings — what the app's native Settings (design S1–S3)
// shows: the account's email and how it signs in (S1), the two push kinds
// (S2), and for Delete account (S3) the person's real counts with the
// website's own sentence and confirmation word (lib/accountDeletion).
//
// Counts run AS THE USER, so they are exactly the rows this person can see.

import { NextRequest, NextResponse } from 'next/server'
import { userFromRequest } from '@/lib/appApi'
import { normalisePrefs, type CandidatePrefs } from '@/lib/notificationPrefs'
import { providerName } from '@/lib/authProviders'
import { CANDIDATE_DELETE_TEXT, DELETE_CONFIRM_WORD } from '@/lib/accountDeletion'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const me = await userFromRequest(req)
  if (!me) return NextResponse.json({ error: 'signed_out' }, { status: 401 })
  const id = me.userId

  const count = async (q: PromiseLike<{ count: number | null; error: unknown }>) => {
    const { count, error } = await q
    return error ? null : (count ?? 0)
  }
  const [savedJobs, applications, conversations, profile] = await Promise.all([
    count(me.client.from('saved_jobs').select('id', { count: 'exact', head: true }).eq('candidate_id', id)),
    count(me.client.from('job_applications').select('id', { count: 'exact', head: true }).eq('candidate_id', id)),
    count(me.client.from('conversations').select('id', { count: 'exact', head: true })
      .or(`participant_1.eq.${id},participant_2.eq.${id}`)),
    me.client.from('candidate_profiles').select('notification_preferences').eq('user_id', id).maybeSingle(),
  ])

  // "Apple, email": every way this account can sign in, the first capitalised.
  const keys = Array.from(new Set((me.user.identities || []).map(i => i.provider).filter(Boolean)))
  if (keys.length === 0) keys.push(me.user.app_metadata?.provider || 'email')
  const providers = keys
    .map(k => providerName(k))
    .filter((l): l is string => !!l)
    .map((l, i) => (i > 0 && l === 'Email' ? 'email' : l))

  const prefs = normalisePrefs('employee', profile.data?.notification_preferences) as CandidatePrefs

  return NextResponse.json(
    {
      email: me.user.email || null,
      providers,
      hasPassword: keys.includes('email'),
      notifications: { replies: prefs.push.new_messages, applications: prefs.push.application_updates },
      // null, not 0, when a count could not be read: the screen leaves that
      // line out rather than tell someone they have nothing.
      counts: { savedJobs, applications, conversations },
      deleteText: CANDIDATE_DELETE_TEXT,
      confirmWord: DELETE_CONFIRM_WORD,
    },
    { headers: { 'Cache-Control': 'no-store' } },
  )
}

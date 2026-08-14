import { supabase } from './supabase'

/*
  The ONE client path for creating an in-app notification.

  Every notification used to be a browser-side .from('notifications').insert()
  — 22 of them — under a policy that let any signed-in account write any text
  to any user's bell and lock screen. They all now go through
  /api/notifications/notify, which authorises each event against the
  application it is about and composes the text server-side. The database
  INSERT policy is gone, so a direct client insert does not work at all: if a
  new feature needs a notification, it needs an event in the route, not a new
  insert.

  Fire-and-forget by design, matching every call site it replaced: a
  notification failure must never break the action it decorates. Failures are
  logged to the console and swallowed.
*/

type NotifyParams = {
  applicationId?: string
  jobId?: string
  interviewId?: string
  applicationIds?: string[]
  extra?: Record<string, string | boolean>
}

export async function notify(event: string, params: NotifyParams): Promise<void> {
  try {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) return
    const res = await fetch('/api/notifications/notify', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({ event, ...params }),
    })
    if (!res.ok) {
      const body = await res.json().catch(() => ({}))
      console.warn(`[notify] ${event} refused:`, res.status, body?.reason || body?.error || '')
    }
  } catch (e) {
    console.warn(`[notify] ${event} failed:`, e)
  }
}

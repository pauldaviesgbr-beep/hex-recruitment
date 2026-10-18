// GET /api/app/me/profile — what the app needs about the person.
//
// The Jobs home (design H3) reads firstName, jobTitle and sector. The native
// Profile tab (Build 17 review, D6/D7) reads the rest: the band (photo, name,
// title · town), the "Employers can find you" switch, the profile bar while it
// is incomplete, and the CV card. Every rule is the website's own: the
// checklist is lib/profileFields (the dashboard's "x of 14"), the photo
// precedence is the dashboard's, the hold is lib/duplicateHold.

import { NextRequest, NextResponse } from 'next/server'
import { userFromRequest, townOf, shortDate } from '@/lib/appApi'
import { supabaseProfileToCandidate } from '@/lib/types'
import { PROFILE_FIELDS } from '@/lib/profileFields'
import { parseHold, holdState, HOLD_WINDOW_DAYS } from '@/lib/duplicateHold'
import { extractPath } from '@/lib/storagePath'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const me = await userFromRequest(req)
  if (!me) return NextResponse.json({ error: 'signed_out' }, { status: 401 })

  const { data, error } = await me.client
    .from('candidate_profiles')
    .select('*')
    .eq('user_id', me.userId)
    .maybeSingle()
  if (error) return NextResponse.json({ error: 'profile_unavailable' }, { status: 503 })

  // NO NAME IS BETTER THAN AN INVENTED ONE (lib/displayName.ts): with no name
  // the greeting is just "Evening." rather than "Evening, User."
  const fullName = (data?.full_name || '').trim() || null
  const first = (fullName || '').split(/\s+/)[0] || null

  // Photo: an uploaded dashboard photo, then the profile picture, then the
  // sign-in provider's avatar (app/dashboard/page.tsx, effectivePhotoUrl).
  const meta = me.user.user_metadata || {}
  const photoSource: string | null =
    data?.dashboard_photo_url || data?.profile_picture_url ||
    meta.profile_photo || meta.avatar_url || meta.picture || null
  const photoUrl = await signed(me.client, photoSource)

  // The checklist, counted exactly as the dashboard counts it.
  let complete: { done: number; total: number; next: string | null } | null = null
  if (data) {
    const c = supabaseProfileToCandidate(data)
    const missing = PROFILE_FIELDS.filter(f => f.key === 'photo' ? !photoSource : !f.check(c))
    complete = { done: PROFILE_FIELDS.length - missing.length, total: PROFILE_FIELDS.length, next: hint(missing[0]?.key, missing[0]?.label) }
  }

  // The switch is disabled while a duplicate check holds the profile (the
  // dashboard's "Being checked").
  const hold = parseHold(data?.duplicate_hold)
  const heldUntil = holdState(hold) === 'held' && hold.heldAt
    ? new Date(Date.parse(hold.heldAt) + HOLD_WINDOW_DAYS * 86_400_000).toISOString()
    : null

  let cv: { fileName: string; url: string | null; added: string | null } | null = null
  if (data?.cv_url) {
    const path = extractPath(data.cv_url)
    // Every upload path names the file with Date.now(); that is the only
    // record of when it was added.
    const ms = Number((path.match(/(\d{13})/) || [])[1])
    cv = {
      fileName: data.cv_file_name || path.split('/').pop() || 'CV',
      url: await signed(me.client, data.cv_url),
      added: ms ? shortDate(new Date(ms)) : null,
    }
  }

  return NextResponse.json(
    {
      firstName: first,
      jobTitle: data?.job_title?.trim() || null,
      sector: data?.job_sector || null,
      fullName,
      town: data ? (townOf({ location: data.location || [data.city, data.county].filter(Boolean).join(', ') }) || null) : null,
      photoUrl,
      isDiscoverable: !!data?.is_discoverable,
      heldUntil,
      complete,
      cv,
    },
    { headers: { 'Cache-Control': 'no-store' } },
  )
}

/** "add your notice period": the first missing field, in words. */
function hint(key?: string, label?: string): string | null {
  if (!key || !label) return null
  if (key === 'cvUrl') return 'add your CV'
  if (key === 'photo') return 'add a photo'
  // The checklist's label is "About me bio"; "add your about me bio" reads badly.
  if (key === 'bio') return 'add a short bio about you'
  return `add your ${label.replace(/\s*\(.*?\)\s*/g, '').toLowerCase()}`
}

/** A one-hour signed URL for a path in the private profiles bucket; an
 *  outside URL (a Google avatar) is returned as it is. */
async function signed(client: any, src: string | null): Promise<string | null> {
  if (!src) return null
  if (src.startsWith('http') && !src.includes('/storage/v1/object/')) return src
  const { data } = await client.storage.from('profiles').createSignedUrl(extractPath(src), 3600)
  return data?.signedUrl || null
}

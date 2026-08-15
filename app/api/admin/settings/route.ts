import { NextResponse } from 'next/server'
import { verifyAdmin, createAdminClient } from '@/lib/admin'
import { ADMIN_EMAILS } from '@/lib/admin-client'

export async function GET(req: Request) {
  const { authorized, token } = await verifyAdmin(req)
  if (!authorized) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
  }

  const db = createAdminClient(token)

  try {
    const { data: sectors } = await db.from('jobs').select('category').not('category', 'is', null)
    const uniqueSectors = Array.from(new Set((sectors || []).map(s => s.category).filter(Boolean))).sort()

    const { data: tagsData } = await db.from('jobs').select('tags').not('tags', 'is', null)
    const allTags = new Set<string>()
    ;(tagsData || []).forEach(j => {
      if (Array.isArray(j.tags)) {
        j.tags.forEach((t: string) => allTags.add(t))
      }
    })

    const { data: featuredJobs, count: featuredCount } = await db
      .from('jobs')
      .select('id, title, company', { count: 'exact' })
      .eq('urgent', true)
      .eq('status', 'active')

    // THE ANNOUNCEMENT READ IS GONE. It did .select('key, value') on
    // platform_settings, which is a SINGLE-ROW table with named columns and has
    // neither — so PostgREST rejected the whole request, the error was never
    // checked, and the banner was empty forever. Nothing rendered it anyway.
    // See the note on /admin/settings for the full account.
    return NextResponse.json({
      sectors: uniqueSectors,
      tags: Array.from(allTags).sort(),
      featuredJobs: featuredJobs || [],
      featuredCount: featuredCount || 0,
      adminEmails: ADMIN_EMAILS,
    })
  } catch (error: any) {
    console.error('[Admin Settings]', error.message)
    return NextResponse.json({
      sectors: [],
      tags: [],
      featuredJobs: [],
      featuredCount: 0,
      adminEmails: ADMIN_EMAILS,
    })
  }
}

// THE POST HANDLER IS GONE. Its only action was 'update_announcement', which
// upserted { key, value } into a table that has neither column, never checked
// the error, and returned { success: true } — so the page displayed
// "Announcement saved!" while nothing was written and nothing anywhere would
// have rendered it. A write that cannot succeed and reports success is worse
// than no write at all: an admin could post a maintenance notice, be told it
// saved, and it would reach nobody.
//
// This route is now READ-ONLY. If Settings ever needs to write, add a handler
// that checks its error and returns the real outcome.

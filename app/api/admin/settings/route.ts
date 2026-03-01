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

    let announcement = { text: '', active: false }
    const { data: settings } = await db
      .from('platform_settings')
      .select('key, value')
      .in('key', ['announcement_text', 'announcement_active'])

    if (settings && settings.length > 0) {
      settings.forEach(s => {
        if (s.key === 'announcement_text') announcement.text = s.value || ''
        if (s.key === 'announcement_active') announcement.active = s.value === 'true'
      })
    }

    return NextResponse.json({
      sectors: uniqueSectors,
      tags: Array.from(allTags).sort(),
      featuredJobs: featuredJobs || [],
      featuredCount: featuredCount || 0,
      announcement,
      adminEmails: ADMIN_EMAILS,
    })
  } catch (error: any) {
    console.error('[Admin Settings]', error.message)
    return NextResponse.json({
      sectors: [],
      tags: [],
      featuredJobs: [],
      featuredCount: 0,
      announcement: { text: '', active: false },
      adminEmails: ADMIN_EMAILS,
    })
  }
}

export async function POST(req: Request) {
  const { authorized, token } = await verifyAdmin(req)
  if (!authorized) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
  }

  const body = await req.json()
  const { action, data } = body
  const db = createAdminClient(token)

  try {
    switch (action) {
      case 'update_announcement': {
        await db.from('platform_settings').upsert(
          { key: 'announcement_text', value: data.text },
          { onConflict: 'key' }
        )
        await db.from('platform_settings').upsert(
          { key: 'announcement_active', value: String(data.active) },
          { onConflict: 'key' }
        )
        return NextResponse.json({ success: true, message: 'Announcement updated' })
      }
      default:
        return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 })
    }
  } catch (error: any) {
    console.error('[Admin Settings Action]', error.message)
    return NextResponse.json({ error: error.message || 'Action failed' }, { status: 500 })
  }
}

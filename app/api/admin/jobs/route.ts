import { NextResponse } from 'next/server'
import { verifyAdmin, createAdminClient } from '@/lib/admin'

const PAGE_SIZE = 20

export async function GET(req: Request) {
  const { authorized, token } = await verifyAdmin(req)
  if (!authorized) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
  }

  const { searchParams } = new URL(req.url)
  const jobId = searchParams.get('jobId')
  const page = parseInt(searchParams.get('page') || '1')
  const search = searchParams.get('search') || ''
  const status = searchParams.get('status') || ''
  const sector = searchParams.get('sector') || ''
  const sort = searchParams.get('sort') || 'posted_at'
  const dir = (searchParams.get('dir') || 'desc') as 'asc' | 'desc'

  const db = createAdminClient(token)

  // Single job detail
  if (jobId) {
    try {
      const { data: job } = await db
        .from('jobs')
        .select('*')
        .eq('id', jobId)
        .single()

      if (!job) return NextResponse.json({ error: 'Job not found' }, { status: 404 })

      // Get applications for this job
      const { data: applications } = await db
        .from('job_applications')
        .select('id, candidate_id, status, applied_at, cover_letter')
        .eq('job_id', jobId)
        .order('applied_at', { ascending: false })
        .limit(50)

      // Get candidate names for applications
      const candidateIds = (applications || []).map(a => a.candidate_id).filter(Boolean)
      let candidateMap: Record<string, string> = {}
      if (candidateIds.length > 0) {
        const { data: candidates } = await db
          .from('candidate_profiles')
          .select('user_id, full_name, email')
          .in('user_id', candidateIds)
        ;(candidates || []).forEach(c => {
          candidateMap[c.user_id] = c.full_name || c.email || 'Unknown'
        })
      }

      const enrichedApps = (applications || []).map(a => ({
        ...a,
        candidate_name: candidateMap[a.candidate_id] || 'Unknown',
      }))

      return NextResponse.json({ job, applications: enrichedApps })
    } catch (error: any) {
      console.error('[Admin Job Detail]', error.message)
      return NextResponse.json({ error: 'Failed to fetch job' }, { status: 500 })
    }
  }

  // Job list
  const from = (page - 1) * PAGE_SIZE
  const to = from + PAGE_SIZE - 1

  try {
    let query = db
      .from('jobs')
      .select('id, title, company, category, location, status, posted_at, expires_at, application_count, view_count, urgent, employer_id', { count: 'exact' })

    if (search) {
      query = query.or(`title.ilike.%${search}%,company.ilike.%${search}%`)
    }
    if (status) {
      query = query.eq('status', status)
    }
    if (sector) {
      query = query.eq('category', sector)
    }

    const sortField = sort === 'title' ? 'title' : sort === 'company' ? 'company' : sort === 'application_count' ? 'application_count' : sort === 'view_count' ? 'view_count' : 'posted_at'
    query = query.order(sortField, { ascending: dir === 'asc' }).range(from, to)

    const { data, count, error } = await query
    if (error) throw error

    // Get distinct sectors for filter dropdown
    const { data: sectors } = await db.from('jobs').select('category').not('category', 'is', null)
    const uniqueSectors = Array.from(new Set((sectors || []).map(s => s.category).filter(Boolean)))

    // Quick stats
    const [activeCount, filledCount, archivedCount] = await Promise.all([
      db.from('jobs').select('*', { count: 'exact', head: true }).eq('status', 'active').then(r => r.count || 0),
      db.from('jobs').select('*', { count: 'exact', head: true }).eq('status', 'filled').then(r => r.count || 0),
      db.from('jobs').select('*', { count: 'exact', head: true }).eq('status', 'archived').then(r => r.count || 0),
    ])

    return NextResponse.json({
      jobs: data || [],
      total: count || 0,
      page,
      totalPages: Math.ceil((count || 0) / PAGE_SIZE),
      sectors: uniqueSectors,
      stats: { active: activeCount, filled: filledCount, archived: archivedCount },
    })
  } catch (error: any) {
    console.error('[Admin Jobs]', error.message)
    return NextResponse.json({ error: 'Failed to fetch jobs' }, { status: 500 })
  }
}

export async function POST(req: Request) {
  const { authorized, token } = await verifyAdmin(req)
  if (!authorized) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
  }

  const body = await req.json()
  const { action, jobId, jobIds } = body
  const db = createAdminClient(token)

  try {
    switch (action) {
      case 'remove': {
        const { error } = await db.from('jobs').update({ status: 'archived' }).eq('id', jobId)
        if (error) throw error
        return NextResponse.json({ success: true, message: 'Job removed' })
      }
      case 'feature': {
        const { data: job } = await db.from('jobs').select('urgent').eq('id', jobId).single()
        const { error } = await db.from('jobs').update({ urgent: !job?.urgent }).eq('id', jobId)
        if (error) throw error
        return NextResponse.json({ success: true, message: job?.urgent ? 'Job unfeatured' : 'Job featured' })
      }
      case 'expire': {
        const { error } = await db.from('jobs').update({ status: 'filled' }).eq('id', jobId)
        if (error) throw error
        return NextResponse.json({ success: true, message: 'Job marked as filled' })
      }
      case 'reactivate': {
        const { error } = await db.from('jobs').update({ status: 'active' }).eq('id', jobId)
        if (error) throw error
        return NextResponse.json({ success: true, message: 'Job reactivated' })
      }
      case 'bulk_archive': {
        const ids = jobIds || []
        const { error } = await db.from('jobs').update({ status: 'archived' }).in('id', ids)
        if (error) throw error
        return NextResponse.json({ success: true, message: `${ids.length} jobs archived` })
      }
      case 'bulk_feature': {
        const ids = jobIds || []
        const { error } = await db.from('jobs').update({ urgent: true }).in('id', ids)
        if (error) throw error
        return NextResponse.json({ success: true, message: `${ids.length} jobs featured` })
      }
      default:
        return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 })
    }
  } catch (error: any) {
    console.error('[Admin Jobs Action]', error.message)
    return NextResponse.json({ error: error.message || 'Action failed' }, { status: 500 })
  }
}

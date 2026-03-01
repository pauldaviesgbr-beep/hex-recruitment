import { NextResponse } from 'next/server'
import { verifyAdmin, createAdminClient } from '@/lib/admin'

const PAGE_SIZE = 20

export async function GET(req: Request) {
  const { authorized, token } = await verifyAdmin(req)
  if (!authorized) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
  }

  const { searchParams } = new URL(req.url)
  const page = parseInt(searchParams.get('page') || '1')
  const search = searchParams.get('search') || ''
  const status = searchParams.get('status') || ''
  const sort = searchParams.get('sort') || 'applied_at'
  const dir = (searchParams.get('dir') || 'desc') as 'asc' | 'desc'

  const db = createAdminClient(token)
  const from = (page - 1) * PAGE_SIZE
  const to = from + PAGE_SIZE - 1

  try {
    let query = db
      .from('job_applications')
      .select('id, job_id, candidate_id, status, applied_at, cover_letter, job_title, company', { count: 'exact' })

    if (status) {
      query = query.eq('status', status)
    }
    if (search) {
      query = query.or(`job_title.ilike.%${search}%,company.ilike.%${search}%`)
    }

    const sortField = sort === 'job_title' ? 'job_title' : sort === 'company' ? 'company' : sort === 'status' ? 'status' : 'applied_at'
    query = query.order(sortField, { ascending: dir === 'asc' }).range(from, to)

    const { data, count, error } = await query
    if (error) throw error

    // Get candidate names
    const candidateIds = Array.from(new Set((data || []).map(a => a.candidate_id).filter(Boolean)))
    let candidateMap: Record<string, { name: string; email: string }> = {}
    if (candidateIds.length > 0) {
      const { data: candidates } = await db
        .from('candidate_profiles')
        .select('user_id, full_name, email')
        .in('user_id', candidateIds)
      ;(candidates || []).forEach(c => {
        candidateMap[c.user_id] = { name: c.full_name || 'Unknown', email: c.email || '' }
      })
    }

    const applications = (data || []).map(a => ({
      ...a,
      candidate_name: candidateMap[a.candidate_id]?.name || 'Unknown',
      candidate_email: candidateMap[a.candidate_id]?.email || '',
    }))

    // Stats
    const [totalCount2, pendingCount, interviewCount, offeredCount] = await Promise.all([
      db.from('job_applications').select('*', { count: 'exact', head: true }).then(r => r.count || 0),
      db.from('job_applications').select('*', { count: 'exact', head: true }).eq('status', 'pending').then(r => r.count || 0),
      db.from('job_applications').select('*', { count: 'exact', head: true }).eq('status', 'interview').then(r => r.count || 0),
      db.from('job_applications').select('*', { count: 'exact', head: true }).eq('status', 'offered').then(r => r.count || 0),
    ])

    return NextResponse.json({
      applications,
      total: count || 0,
      page,
      totalPages: Math.ceil((count || 0) / PAGE_SIZE),
      stats: {
        total: totalCount2,
        pending: pendingCount,
        interview: interviewCount,
        offered: offeredCount,
      },
    })
  } catch (error: any) {
    console.error('[Admin Applications]', error.message)
    return NextResponse.json({ error: 'Failed to fetch applications' }, { status: 500 })
  }
}

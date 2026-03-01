import { NextResponse } from 'next/server'
import { verifyAdmin, createAdminClient } from '@/lib/admin'

const PAGE_SIZE = 20

export async function GET(req: Request) {
  const { authorized, token } = await verifyAdmin(req)
  if (!authorized) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
  }

  const { searchParams } = new URL(req.url)
  const userId = searchParams.get('userId')
  const page = parseInt(searchParams.get('page') || '1')
  const search = searchParams.get('search') || ''
  const role = searchParams.get('role') || 'all'
  const sort = searchParams.get('sort') || 'created_at'
  const dir = (searchParams.get('dir') || 'desc') as 'asc' | 'desc'

  const db = createAdminClient(token)

  // Single user detail
  if (userId) {
    try {
      // Get auth user first for metadata
      const { data: { user: authUser } } = await db.auth.admin.getUserById(userId)
      if (!authUser) {
        return NextResponse.json({ error: 'User not found' }, { status: 404 })
      }

      const userRole = authUser.user_metadata?.role || 'candidate'

      if (userRole === 'candidate') {
        const { data: candidate } = await db
          .from('candidate_profiles')
          .select('*')
          .eq('user_id', userId)
          .maybeSingle()

        const { count: appCount } = await db
          .from('job_applications')
          .select('*', { count: 'exact', head: true })
          .eq('candidate_id', userId)

        const { count: msgCount } = await db
          .from('messages')
          .select('*', { count: 'exact', head: true })
          .eq('sender_id', userId)

        return NextResponse.json({
          user: {
            user_id: userId,
            email: authUser.email,
            full_name: candidate?.full_name || authUser.user_metadata?.full_name || null,
            phone: candidate?.phone || null,
            location: candidate?.location || null,
            job_title: candidate?.job_title || null,
            skills: candidate?.skills || null,
            cv_url: candidate?.cv_url || null,
            created_at: authUser.created_at,
            ...(candidate || {}),
            role: 'candidate',
            application_count: appCount || 0,
            message_count: msgCount || 0,
          },
        })
      }

      // Employer
      const { data: employer } = await db
        .from('employer_profiles')
        .select('*')
        .eq('user_id', userId)
        .maybeSingle()

      const [subsResult, jobsResult, msgResult, reviewResult] = await Promise.all([
        db.from('employer_subscriptions').select('*').eq('user_id', userId).maybeSingle(),
        db.from('jobs').select('*', { count: 'exact', head: true }).eq('employer_id', userId),
        db.from('messages').select('*', { count: 'exact', head: true }).eq('sender_id', userId),
        db.from('company_reviews').select('*', { count: 'exact', head: true }).eq(
          'company_name',
          employer?.company_name || authUser.user_metadata?.company_name || '__none__'
        ),
      ])

      return NextResponse.json({
        user: {
          user_id: userId,
          email: authUser.email,
          company_name: employer?.company_name || authUser.user_metadata?.company_name || null,
          phone: employer?.phone || null,
          location: employer?.location || null,
          industry: employer?.industry || null,
          website: employer?.website || null,
          description: employer?.description || null,
          logo_url: employer?.logo_url || null,
          created_at: authUser.created_at,
          ...(employer || {}),
          role: 'employer',
          subscription: subsResult?.data || null,
          job_count: jobsResult.count || 0,
          message_count: msgResult.count || 0,
          review_count: reviewResult.count || 0,
        },
      })
    } catch (error: any) {
      console.error('[Admin User Detail]', error.message)
      return NextResponse.json({ error: 'Failed to fetch user' }, { status: 500 })
    }
  }

  // User list — use auth.admin.listUsers to get ALL users including those without profiles
  try {
    // Fetch all auth users (paginated by Supabase in batches of 1000)
    const { data: authResult, error: authError } = await db.auth.admin.listUsers({
      page: 1,
      perPage: 1000,
    })
    if (authError) {
      console.error('[Admin Users] Auth listUsers error:', authError.message)
      return NextResponse.json({ error: 'Failed to list users' }, { status: 500 })
    }

    const authUsers = authResult?.users || []

    // Filter by role
    let filtered = authUsers.filter(u => {
      const userRole = u.user_metadata?.role || 'candidate'
      if (role === 'all') return true
      return userRole === role
    })

    // Filter by search
    if (search) {
      const q = search.toLowerCase()
      filtered = filtered.filter(u => {
        const email = (u.email || '').toLowerCase()
        const name = (u.user_metadata?.full_name || u.user_metadata?.company_name || '').toLowerCase()
        return email.includes(q) || name.includes(q)
      })
    }

    // Fetch profile data for enrichment
    const candidateIds = filtered
      .filter(u => (u.user_metadata?.role || 'candidate') === 'candidate')
      .map(u => u.id)
    const employerIds = filtered
      .filter(u => u.user_metadata?.role === 'employer')
      .map(u => u.id)

    // Parallel profile + subscription lookups
    const [candResult, empResult, subsResult] = await Promise.all([
      candidateIds.length > 0
        ? db.from('candidate_profiles').select('user_id, full_name, email, phone, location, job_title').in('user_id', candidateIds)
        : { data: [] },
      employerIds.length > 0
        ? db.from('employer_profiles').select('user_id, company_name, email, phone, location, industry').in('user_id', employerIds)
        : { data: [] },
      employerIds.length > 0
        ? db.from('employer_subscriptions').select('user_id, subscription_tier, subscription_status').in('user_id', employerIds)
        : { data: [] },
    ])

    // Build lookup maps
    const candidateMap: Record<string, any> = {}
    ;((candResult as any).data || []).forEach((c: any) => { candidateMap[c.user_id] = c })

    const employerMap: Record<string, any> = {}
    ;((empResult as any).data || []).forEach((e: any) => { employerMap[e.user_id] = e })

    const subsMap: Record<string, { tier: string; status: string }> = {}
    ;((subsResult as any).data || []).forEach((s: any) => {
      subsMap[s.user_id] = { tier: s.subscription_tier || 'none', status: s.subscription_status }
    })

    // Build user list
    const users = filtered.map(u => {
      const userRole = u.user_metadata?.role || 'candidate'

      if (userRole === 'candidate') {
        const profile = candidateMap[u.id]
        return {
          id: u.id,
          name: profile?.full_name || u.user_metadata?.full_name || 'N/A',
          email: profile?.email || u.email || '',
          role: 'candidate' as const,
          joined: u.created_at,
          location: profile?.location || '',
          phone: profile?.phone || '',
          job_title: profile?.job_title || '',
          tier: null,
          status: u.banned_until ? 'suspended' : 'active',
        }
      }

      // Employer
      const profile = employerMap[u.id]
      const sub = subsMap[u.id]
      return {
        id: u.id,
        name: profile?.company_name || u.user_metadata?.company_name || 'N/A',
        email: profile?.email || u.email || '',
        role: 'employer' as const,
        joined: u.created_at,
        location: profile?.location || u.user_metadata?.city || '',
        phone: profile?.phone || '',
        industry: profile?.industry || '',
        tier: sub?.tier || null,
        sub_status: sub?.status || 'inactive',
        status: u.banned_until ? 'suspended' : 'active',
      }
    })

    // Sort
    users.sort((a, b) => {
      let aVal: string, bVal: string
      if (sort === 'name') { aVal = a.name; bVal = b.name }
      else if (sort === 'email') { aVal = a.email; bVal = b.email }
      else { aVal = a.joined || ''; bVal = b.joined || '' }
      const cmp = String(aVal || '').localeCompare(String(bVal || ''))
      return dir === 'asc' ? cmp : -cmp
    })

    const totalCount = users.length
    const from = (page - 1) * PAGE_SIZE
    const paginated = users.slice(from, from + PAGE_SIZE)

    return NextResponse.json({
      users: paginated,
      total: totalCount,
      page,
      totalPages: Math.ceil(totalCount / PAGE_SIZE),
    })
  } catch (error: any) {
    console.error('[Admin Users]', error.message)
    return NextResponse.json({ error: 'Failed to fetch users' }, { status: 500 })
  }
}

export async function POST(req: Request) {
  const { authorized, token } = await verifyAdmin(req)
  if (!authorized) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
  }

  const body = await req.json()
  const { action, userId, userIds } = body
  const db = createAdminClient(token)

  try {
    switch (action) {
      case 'suspend': {
        const { error } = await db.auth.admin.updateUserById(userId, {
          ban_duration: '876000h',
        })
        if (error) throw error
        return NextResponse.json({ success: true, message: 'User suspended' })
      }
      case 'unsuspend': {
        const { error } = await db.auth.admin.updateUserById(userId, {
          ban_duration: 'none',
        })
        if (error) throw error
        return NextResponse.json({ success: true, message: 'User unsuspended' })
      }
      case 'delete': {
        const { error } = await db.auth.admin.deleteUser(userId)
        if (error) throw error
        return NextResponse.json({ success: true, message: 'User deleted' })
      }
      case 'bulk_suspend': {
        const ids = userIds || []
        for (const id of ids) {
          await db.auth.admin.updateUserById(id, { ban_duration: '876000h' })
        }
        return NextResponse.json({ success: true, message: `${ids.length} users suspended` })
      }
      case 'bulk_delete': {
        const ids = userIds || []
        for (const id of ids) {
          await db.auth.admin.deleteUser(id)
        }
        return NextResponse.json({ success: true, message: `${ids.length} users deleted` })
      }
      default:
        return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 })
    }
  } catch (error: any) {
    console.error('[Admin Users Action]', error.message)
    return NextResponse.json({ error: error.message || 'Action failed' }, { status: 500 })
  }
}

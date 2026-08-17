import { NextResponse } from 'next/server'
import { verifyAdmin, createAdminClient } from '@/lib/admin'
import { computeCompleteness, signupSource } from '@/lib/profileCompleteness'

const PAGE_SIZE = 20

// The app stores the candidate role in user_metadata as 'employee' (and some
// legacy rows have no role at all). Everything that isn't an employer is a
// candidate — normalise here so the admin role filter and enrichment match.
function normalizeRole(u: { user_metadata?: { role?: string } | null }): 'employer' | 'candidate' {
  return u.user_metadata?.role === 'employer' ? 'employer' : 'candidate'
}

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
  // 'active' (default) hides rejected employers, 'rejected' shows only those,
  // 'all' shows everything. Rejected accounts still EXIST and can still sign
  // in, so they are hidden rather than removed — and there has to be a way
  // back to them, or a rejection could never be undone.
  const approval = searchParams.get('approval') || 'active'
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

      const userRole = normalizeRole(authUser)

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
            // AFTER the spread: a future candidate_profiles column called
            // 'banned' must not be able to overwrite the auth fact.
            banned: Boolean(authUser.banned_until),
            application_count: appCount || 0,
            message_count: msgCount || 0,
            signup_source: signupSource(authUser, candidate),
            completeness: computeCompleteness(candidate, 'candidate'),
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
          banned: Boolean(authUser.banned_until),
          subscription: subsResult?.data || null,
          job_count: jobsResult.count || 0,
          message_count: msgResult.count || 0,
          review_count: reviewResult.count || 0,
          signup_source: signupSource(authUser, employer),
          completeness: computeCompleteness(employer, 'employer'),
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

    // Filter by role (normalised: 'employee'/legacy null both count as candidate)
    // Which accounts have been rejected. Fetched BEFORE the filter, because
    // approval_status lives on employer_profiles and the enrichment below only
    // looks up the users that survive filtering — so it cannot be the source
    // for a filter that runs first.
    const { data: rejectedRows } = await db
      .from('employer_profiles')
      .select('user_id')
      .eq('approval_status', 'rejected')
    const rejectedIds = new Set((rejectedRows || []).map((r: any) => r.user_id))

    let filtered = authUsers.filter(u => role === 'all' || normalizeRole(u) === role)

    // How many the default view is holding back. Reported to the page so it can
    // SAY it is hiding them — a list quietly shorter than the account count is
    // the same fault as a number with no claim behind it.
    const rejectedInScope = filtered.filter(u => rejectedIds.has(u.id)).length

    if (approval === 'active') filtered = filtered.filter(u => !rejectedIds.has(u.id))
    else if (approval === 'rejected') filtered = filtered.filter(u => rejectedIds.has(u.id))

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
      .filter(u => normalizeRole(u) === 'candidate')
      .map(u => u.id)
    const employerIds = filtered
      .filter(u => normalizeRole(u) === 'employer')
      .map(u => u.id)

    // Parallel profile + subscription + activity lookups. The profile selects
    // pull every field the completeness score and the CV/photo flags need.
    const [candResult, empResult, subsResult, appRows, jobRows] = await Promise.all([
      candidateIds.length > 0
        ? db.from('candidate_profiles').select(
            'user_id, full_name, email, phone, location, city, postcode, job_title, headline, ' +
            'bio, personal_bio, years_experience, skills, cv_url, profile_picture_url, ' +
            'dashboard_photo_url, work_history, desired_salary, salary_min, signup_source, utm_source'
          ).in('user_id', candidateIds)
        : { data: [] },
      employerIds.length > 0
        // approval_status and contact_name are the two the list could not see.
        // Without approval_status a REJECTED employer renders identically to an
        // approved one, which is how a rejection can be made and then leave no
        // trace on the page you would go to in order to check it.
        ? db.from('employer_profiles').select(
            'user_id, company_name, contact_name, approval_status, email, phone, location, industry, website, description, logo_url'
          ).in('user_id', employerIds)
        : { data: [] },
      employerIds.length > 0
        ? db.from('employer_subscriptions').select('user_id, subscription_tier, subscription_status').in('user_id', employerIds)
        : { data: [] },
      candidateIds.length > 0
        ? db.from('job_applications').select('candidate_id').in('candidate_id', candidateIds)
        : { data: [] },
      employerIds.length > 0
        ? db.from('jobs').select('employer_id').in('employer_id', employerIds)
        : { data: [] },
    ])

    // Tally activity counts in-memory (avoids one count query per user).
    const appCountMap: Record<string, number> = {}
    ;((appRows as any).data || []).forEach((r: any) => { appCountMap[r.candidate_id] = (appCountMap[r.candidate_id] || 0) + 1 })
    const jobCountMap: Record<string, number> = {}
    ;((jobRows as any).data || []).forEach((r: any) => { jobCountMap[r.employer_id] = (jobCountMap[r.employer_id] || 0) + 1 })

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
      const userRole = normalizeRole(u)

      if (userRole === 'candidate') {
        const profile = candidateMap[u.id]
        const comp = computeCompleteness(profile, 'candidate')
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
          completeness: comp.percent,
          has_cv: comp.signals.find(s => s.key === 'cv')?.filled || false,
          has_photo: comp.signals.find(s => s.key === 'photo')?.filled || false,
          activity_count: appCountMap[u.id] || 0,
          signup_source: signupSource(u, profile),
        }
      }

      // Employer
      const profile = employerMap[u.id]
      const sub = subsMap[u.id]
      const comp = computeCompleteness(profile, 'employer')
      return {
        id: u.id,
        name: profile?.company_name || u.user_metadata?.company_name || 'N/A',
        email: profile?.email || u.email || '',
        role: 'employer' as const,
        joined: u.created_at,
        location: profile?.location || u.user_metadata?.city || '',
        phone: profile?.phone || '',
        industry: profile?.industry || '',
        contact_name: profile?.contact_name || '',
        // NULLABLE ON PURPOSE. null means "no employer row", which is not the
        // same as pending — and the page must be able to tell those apart
        // rather than defaulting one into the other.
        approval_status: (profile?.approval_status as string | null) ?? null,
        tier: sub?.tier || null,
        sub_status: sub?.status || 'inactive',
        status: u.banned_until ? 'suspended' : 'active',
        completeness: comp.percent,
        has_cv: false,
        has_photo: false,
        activity_count: jobCountMap[u.id] || 0,
        signup_source: signupSource(u, profile),
      }
    })

    // Sort — numeric for the completeness / activity columns, string otherwise.
    users.sort((a, b) => {
      let cmp: number
      if (sort === 'completeness') {
        cmp = (a.completeness || 0) - (b.completeness || 0)
      } else if (sort === 'activity_count') {
        cmp = (a.activity_count || 0) - (b.activity_count || 0)
      } else {
        let aVal: string, bVal: string
        if (sort === 'name') { aVal = a.name; bVal = b.name }
        else if (sort === 'email') { aVal = a.email; bVal = b.email }
        else { aVal = a.joined || ''; bVal = b.joined || '' }
        cmp = String(aVal || '').localeCompare(String(bVal || ''))
      }
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
      // So the page can SAY it is holding rows back. A list quietly shorter
      // than the account count is a number with no claim behind it.
      rejectedHidden: approval === 'active' ? rejectedInScope : 0,
      approval,
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
      // DELETE REFUSES, AND SAYS WHY.
      //
      // `deleteUser` removes exactly one row — the auth user. There is not a
      // single foreign key from public to auth.users, so nothing cascades:
      // 43 user-id columns across 40 tables keep pointing at an id that no
      // longer exists. The profile, the CV, applications, messages,
      // interviews and offers all survive the "deletion".
      //
      // And they survive INVISIBLY, because the admin list is built from
      // auth.users — the moment the auth row goes, the orphans drop off every
      // page that could have shown you them.
      //
      // Refusing here rather than only removing the buttons: a live endpoint
      // that quietly orphans a person's data is a trap for whoever wires a
      // button back up. Erasure is a script that enumerates the dependants
      // and counts them before and after, the way the account census did.
      case 'delete':
      case 'bulk_delete': {
        return NextResponse.json({
          error:
            'Deleting from here is disabled. It would remove only the auth user and orphan ' +
            'the profile, CV, applications and messages across 40 tables, invisibly. ' +
            'Use Ban to stop access (reversible), or run a proper erasure script.',
        }, { status: 400 })
      }
      case 'bulk_suspend': {
        const ids = userIds || []
        for (const id of ids) {
          await db.auth.admin.updateUserById(id, { ban_duration: '876000h' })
        }
        return NextResponse.json({ success: true, message: `${ids.length} users suspended` })
      }
      default:
        return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 })
    }
  } catch (error: any) {
    console.error('[Admin Users Action]', error.message)
    return NextResponse.json({ error: error.message || 'Action failed' }, { status: 500 })
  }
}

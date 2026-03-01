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
  const tier = searchParams.get('tier') || ''
  const status = searchParams.get('status') || ''
  const sort = searchParams.get('sort') || 'created_at'
  const dir = (searchParams.get('dir') || 'desc') as 'asc' | 'desc'

  const db = createAdminClient(token)
  const from = (page - 1) * PAGE_SIZE
  const to = from + PAGE_SIZE - 1

  try {
    // Get employer profiles for company name lookup
    const { data: allEmployers, error: empError } = await db
      .from('employer_profiles')
      .select('user_id, company_name, email')

    if (empError) {
      console.error('[Admin Subscriptions] Employer profile lookup error:', empError.message)
    }

    const employerMap: Record<string, { company_name: string; email: string }> = {}
    ;(allEmployers || []).forEach(e => {
      employerMap[e.user_id] = { company_name: e.company_name || '', email: e.email || '' }
    })

    // Fallback: if employer_profiles returned nothing, try getting company names from jobs
    if (!allEmployers || allEmployers.length === 0) {
      const { data: jobData } = await db
        .from('jobs')
        .select('employer_id, company')
      ;(jobData || []).forEach((j: any) => {
        if (j.employer_id && j.company && !employerMap[j.employer_id]) {
          employerMap[j.employer_id] = { company_name: j.company, email: '' }
        }
      })
    }

    let query = db
      .from('employer_subscriptions')
      .select('user_id, stripe_customer_id, stripe_subscription_id, subscription_status, subscription_tier, trial_ends_at, cancel_at, cancel_at_period_end, created_at, updated_at', { count: 'exact' })

    if (tier) {
      query = query.eq('subscription_tier', tier)
    }
    if (status) {
      query = query.eq('subscription_status', status)
    }

    const sortField = sort === 'tier' ? 'subscription_tier' : sort === 'status' ? 'subscription_status' : 'created_at'
    query = query.order(sortField, { ascending: dir === 'asc' }).range(from, to)

    const { data, count, error } = await query
    if (error) throw error

    let subscriptions = (data || []).map(s => ({
      ...s,
      company_name: employerMap[s.user_id]?.company_name || 'Unknown',
      email: employerMap[s.user_id]?.email || '',
    }))

    // Filter by search (company name or email) after enrichment
    if (search) {
      const searchLower = search.toLowerCase()
      subscriptions = subscriptions.filter(s =>
        s.company_name.toLowerCase().includes(searchLower) ||
        s.email.toLowerCase().includes(searchLower)
      )
    }

    // Revenue summary
    const { data: allActive } = await db
      .from('employer_subscriptions')
      .select('subscription_tier, subscription_status')
      .in('subscription_status', ['active', 'trialing'])

    const standardActive = (allActive || []).filter(s => s.subscription_tier === 'standard' && s.subscription_status === 'active').length
    const standardTrialing = (allActive || []).filter(s => s.subscription_tier === 'standard' && s.subscription_status === 'trialing').length
    const proActive = (allActive || []).filter(s => s.subscription_tier === 'professional' && s.subscription_status === 'active').length
    const proTrialing = (allActive || []).filter(s => s.subscription_tier === 'professional' && s.subscription_status === 'trialing').length

    return NextResponse.json({
      subscriptions,
      total: count || 0,
      page,
      totalPages: Math.ceil((count || 0) / PAGE_SIZE),
      revenue: {
        mrr: (standardActive * 29.99) + (proActive * 59.99),
        standard: { active: standardActive, trialing: standardTrialing, revenue: standardActive * 29.99 },
        professional: { active: proActive, trialing: proTrialing, revenue: proActive * 59.99 },
        totalActive: standardActive + proActive,
        totalTrialing: standardTrialing + proTrialing,
      },
    })
  } catch (error: any) {
    console.error('[Admin Subscriptions]', error.message)
    return NextResponse.json({ error: 'Failed to fetch subscriptions' }, { status: 500 })
  }
}

export async function POST(req: Request) {
  const { authorized, token } = await verifyAdmin(req)
  if (!authorized) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
  }

  const body = await req.json()
  const { action, userId } = body
  const db = createAdminClient(token)

  try {
    switch (action) {
      case 'cancel': {
        const { error } = await db
          .from('employer_subscriptions')
          .update({ subscription_status: 'canceled', cancel_at: new Date().toISOString() })
          .eq('user_id', userId)
        if (error) throw error
        return NextResponse.json({ success: true, message: 'Subscription canceled' })
      }
      case 'extend_trial': {
        // Extend trial by 14 days from now
        const newTrialEnd = new Date()
        newTrialEnd.setDate(newTrialEnd.getDate() + 14)
        const { error } = await db
          .from('employer_subscriptions')
          .update({ trial_ends_at: newTrialEnd.toISOString(), subscription_status: 'trialing' })
          .eq('user_id', userId)
        if (error) throw error
        return NextResponse.json({ success: true, message: 'Trial extended by 14 days' })
      }
      case 'reactivate': {
        const { error } = await db
          .from('employer_subscriptions')
          .update({ subscription_status: 'active', cancel_at: null })
          .eq('user_id', userId)
        if (error) throw error
        return NextResponse.json({ success: true, message: 'Subscription reactivated' })
      }
      default:
        return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 })
    }
  } catch (error: any) {
    console.error('[Admin Subscriptions Action]', error.message)
    return NextResponse.json({ error: error.message || 'Action failed' }, { status: 500 })
  }
}

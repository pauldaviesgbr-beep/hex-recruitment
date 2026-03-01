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
  const flagged = searchParams.get('flagged') || ''
  const sort = searchParams.get('sort') || 'created_at'
  const dir = (searchParams.get('dir') || 'desc') as 'asc' | 'desc'

  const db = createAdminClient(token)
  const from = (page - 1) * PAGE_SIZE
  const to = from + PAGE_SIZE - 1

  try {
    let query = db
      .from('company_reviews')
      .select('id, reviewer_id, company_name, overall_rating, review_title, pros, cons, is_flagged, is_verified, created_at', { count: 'exact' })

    if (search) {
      query = query.or(`company_name.ilike.%${search}%,review_title.ilike.%${search}%`)
    }
    if (flagged === 'true') {
      query = query.eq('is_flagged', true)
    } else if (flagged === 'false') {
      query = query.eq('is_flagged', false)
    }

    const sortField = sort === 'company_name' ? 'company_name' : sort === 'overall_rating' ? 'overall_rating' : 'created_at'
    query = query.order(sortField, { ascending: dir === 'asc' }).range(from, to)

    const { data, count, error } = await query
    if (error) throw error

    // Get reviewer names
    const reviewerIds = Array.from(new Set((data || []).map(r => r.reviewer_id).filter(Boolean)))
    let reviewerMap: Record<string, string> = {}
    if (reviewerIds.length > 0) {
      const { data: reviewers } = await db
        .from('candidate_profiles')
        .select('user_id, full_name')
        .in('user_id', reviewerIds)
      ;(reviewers || []).forEach(r => {
        reviewerMap[r.user_id] = r.full_name || 'Anonymous'
      })
    }

    const reviews = (data || []).map(r => ({
      ...r,
      reviewer_name: reviewerMap[r.reviewer_id] || 'Anonymous',
    }))

    // Stats
    const [totalReviews, flaggedCount, avgRating] = await Promise.all([
      db.from('company_reviews').select('*', { count: 'exact', head: true }).then(r => r.count || 0),
      db.from('company_reviews').select('*', { count: 'exact', head: true }).eq('is_flagged', true).then(r => r.count || 0),
      db.from('company_reviews').select('overall_rating').then(r => {
        const ratings = (r.data || []).map(x => x.overall_rating).filter(Boolean)
        return ratings.length > 0 ? (ratings.reduce((a: number, b: number) => a + b, 0) / ratings.length) : 0
      }),
    ])

    return NextResponse.json({
      reviews,
      total: count || 0,
      page,
      totalPages: Math.ceil((count || 0) / PAGE_SIZE),
      stats: {
        total: totalReviews,
        flagged: flaggedCount,
        avgRating: Number(avgRating.toFixed(1)),
      },
    })
  } catch (error: any) {
    console.error('[Admin Reviews]', error.message)
    return NextResponse.json({ error: 'Failed to fetch reviews' }, { status: 500 })
  }
}

export async function POST(req: Request) {
  const { authorized, token } = await verifyAdmin(req)
  if (!authorized) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
  }

  const body = await req.json()
  const { action, reviewId } = body
  const db = createAdminClient(token)

  try {
    switch (action) {
      case 'dismiss': {
        const { error } = await db.from('company_reviews').update({ is_flagged: false }).eq('id', reviewId)
        if (error) throw error
        return NextResponse.json({ success: true, message: 'Flag dismissed' })
      }
      case 'remove': {
        const { error } = await db.from('company_reviews').delete().eq('id', reviewId)
        if (error) throw error
        return NextResponse.json({ success: true, message: 'Review removed' })
      }
      case 'flag': {
        const { error } = await db.from('company_reviews').update({ is_flagged: true }).eq('id', reviewId)
        if (error) throw error
        return NextResponse.json({ success: true, message: 'Review flagged' })
      }
      default:
        return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 })
    }
  } catch (error: any) {
    console.error('[Admin Reviews Action]', error.message)
    return NextResponse.json({ error: error.message || 'Action failed' }, { status: 500 })
  }
}

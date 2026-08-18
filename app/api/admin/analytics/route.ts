import { NextResponse } from 'next/server'
import { verifyAdmin, createAdminClient } from '@/lib/admin'

/**
 * ACQUISITION SOURCES — THE ONE SURVIVING SECTION.
 *
 * This route used to serve eight sections behind /admin/analytics: kpi, users,
 * jobs, applications, revenue, engagement, benchmarks and sources. That page
 * has been retired (15 Aug 2026, Paul's decision) and the reasons are worth
 * keeping, because "add an analytics page" is a suggestion that recurs:
 *
 *   · IT CONTRADICTED OVERVIEW. It applied no is_test / is_house filter
 *     anywhere, so it counted fixtures Overview excludes and reported
 *     different totals for the same facts. A dashboard that disagrees with
 *     itself is worse than one that is merely ugly.
 *   · IT PUBLISHED MONEY THAT DOES NOT EXIST. MRR sat on the LANDING tab
 *     beside churn and ARPE, computed from a price constant, on a product
 *     with no published price and zero settled transactions — the same
 *     confident meaningless figure already deleted from Overview.
 *   · SIX OF THE NINE ENGAGEMENT CARDS COULD NEVER RENDER. Three read from
 *     tables that do not exist (search, page views, errors) and were
 *     hardcoded to null; three more read company_reviews, which holds no
 *     rows.
 *
 * WHAT SURVIVED IS THIS, and only because Overview already consumed it: the
 * "Where candidates came from" card fetches section=sources directly. Deleting
 * the whole route would have taken that card with it.
 *
 * THE FIXTURE FILTER IS NEW AND IS A CORRECTION. The old fetchSources counted
 * every row, so the one card on Overview that came from here was the only
 * number on that page still including test and house accounts. It now excludes
 * them like everything else around it.
 */
export const dynamic = 'force-dynamic'

function getStartDate(range: string): string {
  const now = new Date()
  switch (range) {
    case '7d': return new Date(now.getTime() - 7 * 86400000).toISOString()
    case '90d': return new Date(now.getTime() - 90 * 86400000).toISOString()
    case '12m': return new Date(now.getFullYear(), now.getMonth() - 11, 1).toISOString()
    case 'all': return new Date('2020-01-01').toISOString()
    case '30d':
    default: return new Date(now.getTime() - 30 * 86400000).toISOString()
  }
}

type Basis = 'tag' | 'self-reported' | 'referrer' | 'unknown'

function aggregateSources(rows: any[] | null) {
  const bySource: Record<string, {
    source: string; count: number; refs: Record<string, number>; basis: Record<Basis, number>
  }> = {}
  ;(rows || []).forEach((r: any) => {
    const source = (r.signup_source || 'unknown') as string
    if (!bySource[source]) {
      bySource[source] = {
        source, count: 0, refs: {},
        basis: { tag: 0, 'self-reported': 0, referrer: 0, unknown: 0 },
      }
    }
    bySource[source].count++
    const ref = (r.signup_ref || r.utm_source) as string | null
    if (ref) bySource[source].refs[ref] = (bySource[source].refs[ref] || 0) + 1
    // HOW WE KNOW, CARRIED ALONGSIDE. Null on every row that predates the
    // column, and null is reported as 'unknown' rather than assumed to be a
    // tag — the old rows genuinely were never asked this question.
    const b = (r.signup_source_basis || 'unknown') as Basis
    if (b in bySource[source].basis) bySource[source].basis[b]++
    else bySource[source].basis.unknown++
  })
  return Object.values(bySource)
    .map(s => ({
      source: s.source,
      count: s.count,
      refs: Object.entries(s.refs).map(([ref, count]) => ({ ref, count })).sort((a, b) => b.count - a.count),
      basis: s.basis,
      // The share of this channel's count we were TOLD rather than inferred.
      // A channel that is 100% referrer is a hypothesis, not a result.
      declared: s.basis.tag + s.basis['self-reported'],
    }))
    .sort((a, b) => b.count - a.count)
}

export async function GET(req: Request) {
  const { authorized, token } = await verifyAdmin(req)
  if (!authorized) return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })

  const db = createAdminClient(token)
  const url = new URL(req.url)
  const section = url.searchParams.get('section') || 'sources'
  const startDate = getStartDate(url.searchParams.get('range') || '30d')

  // A caller asking for a retired section gets told so by name rather than a
  // generic 400, because the next person to hit this will be looking at an
  // old link or an old fetch and needs to know the section is gone, not broken.
  if (section !== 'sources') {
    return NextResponse.json(
      { error: `Section "${section}" was retired with /admin/analytics on 15 Aug 2026. Only "sources" remains.` },
      { status: 410 },
    )
  }

  try {
    // Columns taken from information_schema, not from memory: PostgREST rejects
    // the WHOLE request when a select names a column that does not exist, and
    // tsc offers no protection on column names.
    // Widened 18 Aug 2026 with signup_source_basis and referrer_host, both
    // confirmed present on BOTH tables against information_schema.columns
    // first — the company_website incident is why: PostgREST rejects the whole
    // request over one bad name and the route then fails as if there were no
    // data, which reads like an empty page rather than an error.
    const cols = 'signup_source, signup_source_basis, referrer_host, signup_ref, utm_source, created_at'
    const [cands, emps] = await Promise.all([
      db.from('candidate_profiles').select(cols)
        .gte('created_at', startDate).eq('is_test', false).eq('is_house', false),
      db.from('employer_profiles').select(cols)
        .gte('created_at', startDate).eq('is_test', false).eq('is_house', false),
    ])
    if (cands.error) throw cands.error
    if (emps.error) throw emps.error

    return NextResponse.json({
      candidates: aggregateSources(cands.data),
      employers: aggregateSources(emps.data),
    })
  } catch (error: any) {
    console.error('[Admin Analytics] sources:', error.message)
    return NextResponse.json({ error: 'Failed to fetch sources' }, { status: 500 })
  }
}

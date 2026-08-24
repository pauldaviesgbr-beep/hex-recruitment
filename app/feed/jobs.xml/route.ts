import { createClient } from '@supabase/supabase-js'
import { buildJobsFeedXml, type FeedJobRow } from '@/lib/jobsFeed'

// Aggregator jobs feed for Adzuna / Jooble / Jora / Talent.com. Reuses the same
// status='active' jobs query the sitemap uses, so a role leaves the feed exactly
// when it leaves the board — by 'filled' (a genuine Thrive hire) or 'archived'
// (every other reason a role closes). Cached ~1h; aggregators re-pull on their
// own schedule, so a closed role leaves the feed promptly.
//
// THERE IS NO EXPIRY MECHANISM, and this comment used to say there was. It
// claimed roles "drop out automatically" via a 60-day cron. NO ROW HAS EVER
// CARRIED status 'expired' — not one, in the whole table. The cron exists, runs
// daily, and covers 2 of 247 rows because recruiter postings are exempt.
//
// This is NOT a Google for Jobs feed — that's the on-page JobPosting structured
// data, a separate channel that happens to reuse the same job data.
//
// IT IS ALSO A REAL ACQUISITION CHANNEL, which nobody was measuring until
// 24 Aug 2026: 5 of 66 candidates arrived through it, all UTM-tagged — four
// from Jooble and one from Adzuna. Worth remembering before anyone treats this
// route as housekeeping.
//
// revalidate = 3600 is what makes the rolling horizon in lib/jobsFeed.ts work.
// The date is generation-time + 90 days, so it is only ever correct if
// generation actually happens: measured on production, this route serves
// x-vercel-cache: PRERENDER, i.e. ISR is live and regenerates hourly. A route
// frozen at deploy would turn the horizon into the same fault with a longer fuse.
export const revalidate = 3600

const FIELDS =
  'id,title,description,full_description,responsibilities,requirements,benefits,' +
  'company,location,area,full_location,' +
  'salary_min,salary_max,salary_type,employment_type,category,posted_at,' +
  'expires_at,job_reference,source_url'

export async function GET() {
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://thrivecareer.co.uk'
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  let rows: FeedJobRow[] = []
  if (supabaseUrl && supabaseKey) {
    const supabase = createClient(supabaseUrl, supabaseKey)
    const { data } = await supabase
      .from('jobs')
      .select(FIELDS)
      .eq('status', 'active')
      .order('posted_at', { ascending: false })
      .limit(5000)
    rows = (data as unknown as FeedJobRow[]) || []
  }

  const xml = buildJobsFeedXml(rows, siteUrl)
  return new Response(xml, {
    headers: {
      'Content-Type': 'application/xml; charset=utf-8',
      'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400',
    },
  })
}

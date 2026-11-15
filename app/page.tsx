// THE HOME PAGE — a SERVER page around the client one (app/HomeClient.tsx).
//
// It exists for one number: the founding-spots count, which now comes WITH the
// page instead of ~6 seconds after it (design 26, round 2 follow-up). The page
// is rebuilt at most every 5 minutes (revalidate), so the count is cached
// rather than queried per visit, and a visitor never waits on a cold
// /api/check-spots. If the server cannot count, it passes null and the client
// falls back to fetching; the strip's reserved height holds the space either way.

import HomeClient from './HomeClient'
import { getFoundingSpotsRemaining } from '@/lib/foundingSpots'

export const revalidate = 300

export default async function Home() {
  const spots = await getFoundingSpotsRemaining()
  return <HomeClient initialSpotsRemaining={spots} />
}

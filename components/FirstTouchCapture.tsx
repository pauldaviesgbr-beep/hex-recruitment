'use client'

import { useEffect } from 'react'
import { captureFromSearch } from '@/lib/attribution'
import { storeTimezone } from '@/lib/geo'

// EVERYTHING WE CAN ONLY LEARN FROM THE BROWSER, ON THE FIRST PAGE THEY SEE.
// Renders nothing.
//
//   - ?ref / ?utm_* from the landing URL, first-touch-wins (lib/attribution)
//   - the browser's own IANA timezone (lib/geo)
//
// Was AttributionCapture. Renamed when the timezone joined it, because a
// component called AttributionCapture writing a second, unrelated cookie is
// exactly the sort of thing the next person doesn't find.
//
// THE TIMEZONE HAS TO COME FROM HERE RATHER THAN THE SERVER. The edge gives us
// a country, and a country does not give a timezone: the US spans six zones
// and Australia five, so deriving one would be hours out for precisely the
// markets we are opening. Only the browser knows. It goes into a cookie
// because two of the five signup paths are server routes (the OAuth
// callbacks), which have no browser to ask.
export default function FirstTouchCapture() {
  useEffect(() => {
    captureFromSearch(window.location.search)
    storeTimezone()
  }, [])
  return null
}

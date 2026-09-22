import { captureFromSearch } from './attribution'
import { storeTimezone } from './geo'
import { nonEssentialAllowed } from './cookies'

/**
 * THE TWO BROWSER-ONLY THINGS WE STORE, BEHIND THE ONE CONSENT GATE.
 *
 * This exists so the gate has a single home. It is called from TWO places and
 * they must not drift:
 *
 *   - FirstTouchCapture, on the first page a visitor sees — where it usually
 *     does NOTHING, because an undecided visitor has not consented yet;
 *   - CookieConsent, the moment somebody accepts — which is what actually
 *     captures them, from a URL and a referrer that are still the ones they
 *     arrived on.
 *
 * WITHOUT THE SECOND CALL, ACCEPTING WOULD LOSE THE ATTRIBUTION. The banner
 * appears on the landing page, so `?ref=li` is still in `location.search` and
 * `document.referrer` is still the post they came from at the moment they
 * press Accept. Capture there and first-touch is preserved; capture only on
 * mount and every tagged arrival is thrown away before they can agree to it.
 *
 * `thrive_country` is NOT here. It is set by middleware at the edge and has
 * its own copy of the same gate, reading the same cookie — see
 * nonEssentialAllowedFromHeader.
 */
export function captureFirstTouch(): void {
  if (typeof document === 'undefined') return
  if (!nonEssentialAllowed()) return
  captureFromSearch(window.location.search)
  storeTimezone()
}

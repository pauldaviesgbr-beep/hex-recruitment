// Single source of truth for "is this URL-param value safe to navigate to?".
//
// Every place we read a return path out of a query string (?redirect=, ?next=)
// and then navigate to it MUST run the value through safeInternalPath first,
// AT THE POINT OF NAVIGATION — not just where the param is parsed.
//
// The check this replaces was `raw.startsWith('/') && !raw.startsWith('//')`.
// That looks right and isn't: the WHATWG URL parser treats a backslash as a
// forward slash for http(s) URLs, so `/\evil.com` passes the string check and
// still resolves to https://evil.com. Percent-encoded (`%5C`) and double-encoded
// variants hide the same trick. So we don't reason about prefixes — we parse the
// value against a dummy origin and require the resolved origin to come back
// unchanged, which is the only check that actually tracks what a browser does.

// Opaque, unroutable origin to resolve candidate paths against. If parsing a
// value yields any other origin, the value escapes — reject it.
const PROBE_ORIGIN = 'https://internal.invalid'

// Values that survive one decode pass but not two are how double-encoded
// payloads (%252F%252Fevil.com) sneak through naive checks. Decode a bounded
// number of times and screen every intermediate form, not just the input.
const MAX_DECODE_PASSES = 3

// Every progressively-decoded form of `value`, or null if it contains a
// malformed escape sequence (a legitimate return path never does).
function decodePasses(value: string): string[] | null {
  const seen = [value]
  let current = value
  for (let i = 0; i < MAX_DECODE_PASSES; i++) {
    let decoded: string
    try {
      decoded = decodeURIComponent(current)
    } catch {
      return null
    }
    if (decoded === current) break
    seen.push(decoded)
    current = decoded
  }
  return seen
}

// Tab/newline/CR are stripped by the URL parser before it runs, so `/<tab>evil`
// must be judged on the stripped form. Any control character in a return path
// is bad news regardless. Written as a code-point test rather than a regex so
// no escape sequences are needed.
function hasControlChar(value: string): boolean {
  for (let i = 0; i < value.length; i++) {
    const code = value.charCodeAt(i)
    if (code < 0x20 || code === 0x7f) return true
  }
  return false
}

/**
 * Return `raw` only if it is a same-origin, relative path we can safely navigate
 * to. Returns null for anything else — callers fall back to their own default.
 *
 * Rejects: absolute URLs, protocol-relative (`//host`), backslash variants
 * (`/\host`, `%5C`), `javascript:` / `data:` and friends, embedded credentials,
 * and anything that resolves off-origin once decoded.
 */
export function safeInternalPath(raw: string | null | undefined): string | null {
  if (typeof raw !== 'string') return null

  const candidate = raw.trim()
  if (!candidate) return null

  // Must be rooted. Relative values ("dashboard", "%5C%5Cevil.com") are never
  // something we hand out, and resolving them depends on the current path.
  if (!candidate.startsWith('/')) return null

  // Protocol-relative — `//evil.com` inherits the scheme and changes host.
  if (candidate.startsWith('//')) return null

  const forms = decodePasses(candidate)
  if (!forms) return null

  for (const form of forms) {
    if (hasControlChar(form)) return null

    // Backslashes are slashes to the URL parser for special schemes. There is
    // no legitimate reason for one to appear in a Thrive return path.
    if (form.includes('\\')) return null

    // Any scheme at all, and any protocol-relative form that only appears
    // once decoded.
    if (form.startsWith('//')) return null
    if (/^[a-z][a-z0-9+.-]*:/i.test(form)) return null

    // Credentials-in-URL trick: `/@evil.com` can resolve host to evil.com.
    if (form.startsWith('/@')) return null
  }

  // The authoritative check: resolve it like a browser would and confirm we
  // never left the probe origin.
  let parsed: URL
  try {
    parsed = new URL(candidate, PROBE_ORIGIN)
  } catch {
    return null
  }
  if (parsed.origin !== PROBE_ORIGIN) return null
  if (parsed.protocol !== 'https:') return null
  if (parsed.username || parsed.password) return null

  // Return the normalized path rather than the raw input, so whatever we hand
  // to router.push / NextResponse.redirect is exactly what we validated.
  const normalized = `${parsed.pathname}${parsed.search}${parsed.hash}`
  return normalized.startsWith('//') ? null : normalized
}

/**
 * Same as safeInternalPath, but also accepts an ABSOLUTE url when — and only
 * when — its origin is exactly ours.
 *
 * WHY THIS EXISTS AND WHY IT IS SEPARATE. Supabase's `{{ .RedirectTo }}` is a
 * full URL, not a path, because it is the value handed to `emailRedirectTo`
 * and Supabase validates it against the project's redirect allow list. Their
 * documented template pattern drops it straight into `?next=`. Our confirm
 * route has always required a PATH, so before this the whole value was
 * rejected and every email confirmation fell back to a hardcoded destination.
 *
 * THIS DOES NOT LOOSEN safeInternalPath — that function is unchanged and is
 * still the only thing that decides. All this does is strip a leading origin
 * that we have proved is our own, and hand the remainder to it. An absolute
 * URL pointing anywhere else returns null before any parsing of the path, so
 * `https://evil.com/x` and `https://thrivecareer.co.uk.evil.com/x` are both
 * rejected on the origin comparison, not on a prefix test.
 *
 * `origin` must come from the request, never from a query parameter.
 */
export function safeReturnPath(
  raw: string | null | undefined,
  origin: string
): string | null {
  if (typeof raw !== 'string') return null
  const candidate = raw.trim()
  if (!candidate) return null

  // Already a path (or a trick that looks like one) — the existing check owns
  // every one of those cases, including `//evil.com` and the backslash forms.
  if (candidate.startsWith('/')) return safeInternalPath(candidate)

  let parsed: URL
  let ours: URL
  try {
    parsed = new URL(candidate)
    ours = new URL(origin)
  } catch {
    return null
  }

  // Exact origin equality — scheme, host AND port. Not startsWith, not
  // endsWith, not includes.
  if (parsed.origin !== ours.origin) return null

  return safeInternalPath(`${parsed.pathname}${parsed.search}${parsed.hash}`)
}

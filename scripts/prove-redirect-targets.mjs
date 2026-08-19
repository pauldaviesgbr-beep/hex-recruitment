// EVERY router.push('/…') TARGET MUST BE A ROUTE THAT EXISTS — AND THE RIGHT ONE.
//
// A redirect target is a STRING. tsc cannot see that it is dead, and neither
// can the build. This has now shipped twice:
//
//   /register/employer   404'd after its page was deleted. The push stayed.
//   /jobs/${id}          the last click of posting a job. The job page is
//                        SINGULAR, /job/[id]. The plural matched /jobs/[city],
//                        cityInfo came back undefined for a uuid, and the
//                        employer landed on a page titled "City Not Found"
//                        with their advert already live behind it.
//
// TWO CHECKS, BECAUSE ONE OF THEM WOULD HAVE PASSED ON THE SECOND FAULT.
//
//   A. DOES IT RESOLVE AT ALL? Purely mechanical, no judgement. Catches the
//      deleted-page class outright.
//
//   B. DOES AN ID LAND IN AN ID-SHAPED SEGMENT? Check A passes /jobs/${id}
//      happily — the path resolves, just to [city]. So resolving is not
//      enough, and a check that cannot separate the two states it exists to
//      separate proves nothing whichever way it falls. B is what tells them
//      apart: an interpolated variable whose NAME says identifier
//      (jobId, publishedJobId, job.id, …) must land in a segment whose name
//      also says identifier — [id], [jobId] — never [city], [slug], [sector].
//
// B IS A HEURISTIC AND ITS FALSE POSITIVE IS NAMED. A genuine push of an id
// into a slug-shaped segment — say /company/[slug] receiving a variable called
// companySlug — is fine, because the variable is not id-shaped. One that
// really does pass an id to a slug route would need an ALLOW entry below and a
// reason beside it. Better a heuristic that fires and is argued with than a
// mechanical check that watched this ship.

import { readFileSync, readdirSync, statSync } from 'node:fs'
import path from 'node:path'
import { execSync } from 'node:child_process'

const ROOT = process.cwd()
const APP = path.join(ROOT, 'app')

// ── build the route table from the filesystem ──────────────────────────────
/** Every routable path, as segment arrays. '[id]' stays as-is so the shape of
 *  a dynamic segment is visible to check B. */
function routes(dir = APP, prefix = []) {
  const out = []
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry)
    if (!statSync(full).isDirectory()) continue
    // Route groups (auth) do not appear in the URL. Private folders are not
    // routed at all — an underscore folder is invisible to the App Router,
    // which cost a deploy cycle to learn once already.
    if (entry.startsWith('_')) continue
    const seg = entry.startsWith('(') && entry.endsWith(')') ? null : entry
    const next = seg === null ? prefix : [...prefix, seg]
    const hasPage = readdirSync(full).some(f => /^page\.(tsx|ts|jsx|js)$/.test(f))
    if (hasPage) out.push(next)
    out.push(...routes(full, next))
  }
  return out
}
const ROUTE_TABLE = routes()
// THE ROOT ROUTE. routes() only emits a path when it DESCENDS into a
// directory, so app/page.tsx — the homepage — was never in the table and every
// router.push('/') was reported dead. Two false positives on the first run,
// which is the useful kind: a check that cries wolf on the homepage would have
// been switched off within a week.
if (readdirSync(APP).some(f => /^page\.(tsx|ts|jsx|js)$/.test(f))) ROUTE_TABLE.push([])

// A CONFIGURED REDIRECT IS A LIVE PATH. next.config.js carries eight of them —
// /subscribe, /pricing, /register/employer and the rest of the paid-signup
// surfaces, all 308'd somewhere real. The filesystem knows nothing about them,
// so without this the check reports a working link as dead. It did, on the
// first run, and a check that cries wolf about a URL that plainly works is one
// nobody trusts by the end of the week.
const CONFIG = path.join(ROOT, 'next.config.js')
try {
  const cfg = readFileSync(CONFIG, 'utf8')
  for (const m of cfg.matchAll(/source:\s*'([^']+)'/g)) {
    const segs = m[1].split('?')[0].split('/').filter(Boolean)
    ROUTE_TABLE.push(segs)
  }
} catch { /* no config: the filesystem is the whole answer */ }

/** Does this concrete segment list match a route? Returns the matched route,
 *  or null. A literal segment matches itself or any dynamic segment. */
function resolve(segments) {
  outer: for (const route of ROUTE_TABLE) {
    // catch-all routes swallow the tail
    const catchAll = route.some(s => s.startsWith('[...'))
    if (!catchAll && route.length !== segments.length) continue
    for (let i = 0; i < route.length; i++) {
      const r = route[i]
      if (r.startsWith('[...')) return route
      if (r.startsWith('[')) continue          // dynamic: accepts anything
      if (r !== segments[i]) continue outer    // literal must match exactly
    }
    return route
  }
  return null
}

// ── find every navigation literal ──────────────────────────────────────────
const files = execSync('git ls-files "app/**/*.tsx" "app/**/*.ts" "components/**/*.tsx" "lib/**/*.ts"',
  { encoding: 'utf8' }).trim().split('\n').filter(Boolean)

const NAV = /router\.(?:push|replace)\(\s*(`[^`]*`|'[^']*'|"[^"]*")/g
const ID_VAR = /\b(id|.*Id|.*ID|uuid)\b/

/** Paths deliberately allowed to look wrong. Each needs a reason. */
const ALLOW = new Set([
  // (none today)
])

const findings = []
let scanned = 0

for (const file of files) {
  const src = readFileSync(path.join(ROOT, file), 'utf8')
  for (const m of src.matchAll(NAV)) {
    const raw = m[1].slice(1, -1)
    if (!raw.startsWith('/')) continue          // relative / computed: skip
    scanned++
    const line = src.slice(0, m.index).split('\n').length
    const pathOnly = raw.split('?')[0].split('#')[0]
    if (ALLOW.has(pathOnly)) continue

    // Split into segments, remembering which were interpolated and with what.
    const segs = pathOnly.split('/').filter(Boolean).map(s => {
      const interp = s.match(/^\$\{([^}]+)\}$/)
      return interp ? { dynamic: true, expr: interp[1].trim() } : { dynamic: false, value: s }
    })
    // A segment that mixes text and interpolation cannot be reasoned about.
    if (pathOnly.includes('${') && segs.some(s => !s.dynamic && s.value.includes('${'))) continue

    const concrete = segs.map(s => (s.dynamic ? '__DYN__' : s.value))
    const matched = resolve(concrete)

    // ── A. does it resolve at all?
    if (!matched) {
      findings.push({ file, line, raw, why: 'NO ROUTE — this path does not exist' })
      continue
    }

    // ── B. does an id land somewhere id-shaped?
    segs.forEach((s, i) => {
      if (!s.dynamic) return
      const target = matched[i]
      if (!target || !target.startsWith('[')) return
      const segName = target.replace(/[[\].]/g, '')
      const exprLooksLikeId = ID_VAR.test(s.expr.split('.').pop() || s.expr)
      const segLooksLikeId = /^(id|.*Id|.*ID|uuid)$/i.test(segName)
      if (exprLooksLikeId && !segLooksLikeId) {
        findings.push({
          file, line, raw,
          why: `\${${s.expr}} looks like an identifier but lands in [${segName}] of /${matched.join('/')}`,
        })
      }
    })
  }
}

console.log(`scanned ${scanned} absolute navigation targets against ${ROUTE_TABLE.length} routes`)

// POSITIVE CONTROL. If the resolver cannot fail, every pass above is a claim
// about the instrument. Hand it two paths whose answers must differ.
const controlDead = resolve(['post-job', 'success'])
const controlLive = resolve(['job', '__DYN__'])
if (controlDead !== null || controlLive === null) {
  console.error('CONTROL FAILED — the resolver cannot tell a dead path from a live one.')
  console.error(`  /post-job/success -> ${controlDead ? '/' + controlDead.join('/') : 'null'} (want null)`)
  console.error(`  /job/<id>         -> ${controlLive ? '/' + controlLive.join('/') : 'null'} (want a route)`)
  process.exit(1)
}
console.log('control ok — a dead path resolves to null, a live one resolves\n')

if (!findings.length) {
  console.log('no dead or mis-shaped redirect targets')
  process.exit(0)
}
for (const f of findings) console.log(`  FAIL  ${f.file}:${f.line}\n          ${f.raw}\n          ${f.why}`)
console.log(`\n${findings.length} finding(s)`)
process.exit(1)

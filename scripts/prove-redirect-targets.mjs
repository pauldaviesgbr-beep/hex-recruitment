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
// THE GLOB HAS TO INCLUDE TOP-LEVEL FILES, AND `**/` DOES NOT.
//
// This read git ls-files "components/**/*.tsx", which in git pathspec requires
// an intervening directory -- so components/FeedCard.tsx, and every other file
// sitting directly in components/, was never scanned. 124 files of 204.
//
// That is how a stray-comment check was written, run, and reported clean while
// the exact fault it exists for sat in an unscanned file. A plain listing
// filtered in JS instead: one source of paths, and no pathspec semantics to be
// wrong about.
const files = execSync('git ls-files',
  { encoding: 'utf8' }).trim().split('\n').filter(Boolean)
  .filter(f => /^(app|components|lib)\//.test(f) && /.(tsx|ts)$/.test(f))

// THIS USED TO BE ONE REGEX AND IT HAD A 33-CALL BLIND SPOT.
//
//   /router\.(?:push|replace)\(\s*(`[^`]*`|'[^']*'|"[^"]*")/g
//
// It required the path literal to be the FIRST token after the opening paren.
// app/post-job/page.tsx wrapped its target in a ternary —
//   router.push(adStatus === 'live' && publishedJobId ? `/jobs/${id}` : '/…')
// — so the first token was an identifier, the call was never scanned, and this
// script printed "no dead or mis-shaped redirect targets" while a live 404 sat
// in the file. Found 20 Aug 2026, one day after the same script was written to
// prevent exactly that bug, and reported as fixed on the strength of it.
//
// Of 190 push/replace calls in the app, 157 matched the old regex and 33 did
// not. It did not know the 33 existed.
//
// So: take the WHOLE argument list of each call, and scan every path-shaped
// literal anywhere inside it. Calls with no literal at all are genuinely
// undecidable here (a variable, a helper) — those are COUNTED AND PRINTED
// rather than passed over, because a check that bounds its own coverage and
// says nothing reads as "I looked everywhere".
const CALL = /router\.(?:push|replace)\(/g
const LITERAL = /(`[^`]*`|'[^']*'|"[^"]*")/g
const ID_VAR = /\b(id|.*Id|.*ID|uuid)\b/

/**
 * Blank out comments, preserving length so every offset and line number still
 * points where it did.
 *
 * NEEDED BECAUSE THE SCANNER READ ITS OWN PROSE. The comment above the fixed
 * call in app/post-job/page.tsx contains the words "router.push(" while
 * explaining the bug, and this script's own header does too. Both matched, and
 * one of them was reported as an unparseable call whose argument was a
 * sentence of English. A check that cannot tell code from a comment about code
 * is the same family as the emoji grep that found nothing in a file it had
 * just written.
 */
function stripComments(src) {
  let out = '', i = 0, quote = null
  while (i < src.length) {
    const c = src[i], d = src[i + 1]
    if (quote) {
      if (c === '\\') { out += src.slice(i, i + 2); i += 2; continue }
      if (c === quote) quote = null
      out += c; i++; continue
    }
    if (c === '`' || c === "'" || c === '"') { quote = c; out += c; i++; continue }
    if (c === '/' && d === '/') {
      while (i < src.length && src[i] !== '\n') { out += ' '; i++ }
      continue
    }
    if (c === '/' && d === '*') {
      while (i < src.length && !(src[i] === '*' && src[i + 1] === '/')) { out += src[i] === '\n' ? '\n' : ' '; i++ }
      out += '  '; i += 2; continue
    }
    out += c; i++
  }
  return out
}

/** Text of the call's arguments, by walking to the matching close paren.
 *  Quote- and template-aware so a paren inside a string cannot end it early. */
function argsOf(src, openIdx) {
  let depth = 1, i = openIdx, quote = null
  while (i < src.length && depth > 0) {
    const c = src[i]
    if (quote) {
      if (c === '\\') { i += 2; continue }
      if (c === quote) quote = null
    } else if (c === '`' || c === "'" || c === '"') {
      quote = c
    } else if (c === '(') depth++
    else if (c === ')') depth--
    if (depth === 0) break
    i++
  }
  return depth === 0 ? src.slice(openIdx, i) : null
}

/** Paths deliberately allowed to look wrong. Each needs a reason. */
const ALLOW = new Set([
  // (none today)
])

const findings = []
let scanned = 0
let calls = 0
const undecidable = []   // calls with no path literal at all — printed, not hidden

for (const file of files) {
  const src = stripComments(readFileSync(path.join(ROOT, file), 'utf8'))
  for (const c of src.matchAll(CALL)) {
    calls++
    const args = argsOf(src, c.index + c[0].length)
    const callLine = src.slice(0, c.index).split('\n').length
    if (args === null) {
      undecidable.push({ file, line: callLine, note: 'unbalanced parens — could not read the argument list' })
      continue
    }
    const literals = [...args.matchAll(LITERAL)]
      .map(l => l[1].slice(1, -1))
      .filter(s => s.startsWith('/'))
    if (!literals.length) {
      undecidable.push({ file, line: callLine, note: args.replace(/\s+/g, ' ').trim().slice(0, 70) })
      continue
    }
    for (const raw of literals) {
    scanned++
    const line = callLine
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
}

console.log(`${calls} router.push/replace calls found`)
console.log(`scanned ${scanned} absolute navigation targets against ${ROUTE_TABLE.length} routes`)

// NO SILENT CAPS. The previous version of this script skipped 33 calls and said
// nothing, so "no problems found" was indistinguishable from "did not look".
// Anything this cannot decide is named here, every run.
console.log(`${undecidable.length} calls carry no literal path (variable or helper) — NOT CHECKED:`)
for (const u of undecidable) console.log(`    ${u.file}:${u.line}  ${u.note}`)
console.log('')

// POSITIVE CONTROL FOR THE SCANNER ITSELF, not just the resolver. The bug that
// got through was a path inside a ternary, so the control is a ternary: if this
// fixture yields fewer than two literals, the scanner has regressed to only
// reading the first token and every clean run below is worthless.
{
  const fixture = "router.push(cond ? `/job/${id}` : '/employer/dashboard')"
  const open = fixture.indexOf('(') + 1
  const got = [...(argsOf(fixture, open) || '').matchAll(LITERAL)]
    .map(l => l[1].slice(1, -1)).filter(s => s.startsWith('/'))
  if (got.length !== 2) {
    console.error('CONTROL FAILED — the scanner cannot see a path inside a ternary.')
    console.error(`  found ${got.length} of 2: ${JSON.stringify(got)}`)
    console.error('  This is the exact shape that produced a live 404 while this script passed.')
    process.exit(1)
  }
  console.log('control ok — the scanner reads both arms of a ternary')
}

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

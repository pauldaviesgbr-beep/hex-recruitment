/**
 * Render every branch of the five activation emails to plain text, and PROVE
 * the branching — that each state produces a genuinely different email, and
 * that the states which should send nothing send nothing.
 *
 * Run: npx tsx scripts/render-activation-emails.ts
 *
 * Exits non-zero if any assertion fails. The assertions are the point; the
 * printed text is for reading the copy. It asserts what should be DIFFERENT
 * between two states rather than that some expected string is present, because
 * a substring search cannot distinguish two states that both contain it.
 */
import { activationDay1Email } from '../emails/activation-day1'
import { activationDay3Email } from '../emails/activation-day3'
import { activationDay7Email } from '../emails/activation-day7'
import { activationDay14Email } from '../emails/activation-day14'
import { activationDay30Email } from '../emails/activation-day30'
import type { ActivationContext, ActivationEmail } from '../emails/activation-context'

function text(html: string): string {
  return html
    .replace(/<head[\s\S]*?<\/head>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<a [^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi, (_m, href, txt) => {
      const label = String(txt).replace(/<[^>]+>/g, '').trim()
      return label ? `${label} (${href})` : href
    })
    .replace(/<\/(p|div|tr|h[1-6]|li|ol|ul)>/gi, '\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&mdash;/g, '—').replace(/&ndash;/g, '–')
    .replace(/&ldquo;/g, '“').replace(/&rdquo;/g, '”')
    .replace(/&pound;/g, '£').replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&#39;|&rsquo;/g, '’')
    .replace(/&middot;/g, '·').replace(/&copy;/g, '©')
    // Straight and curly apostrophes are the same word. Normalise to straight so
    // an assertion about WORDING cannot pass or fail on which glyph a template
    // happened to use — that is a rendering difference, not a copy difference.
    .replace(/[’‘]/g, "'")
    .replace(/[ \t]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

const base: ActivationContext = {
  companyName: 'The Bell Inn',
  hasPostedJob: false,
  applicationCount: 0,
  unactionedCount: 0,
  hasHired: false,
  roleTitle: null,
  roleTown: null,
}
const ctx = (over: Partial<ActivationContext>): ActivationContext => ({ ...base, ...over })

const POSTED = ctx({ hasPostedJob: true, roleTitle: 'Head Chef', roleTown: 'Bath' })
const APPS = ctx({ hasPostedJob: true, roleTitle: 'Head Chef', roleTown: 'Bath', applicationCount: 12, unactionedCount: 7 })
const ALL_ACTIONED = ctx({ hasPostedJob: true, roleTitle: 'Head Chef', roleTown: 'Bath', applicationCount: 12, unactionedCount: 0 })
const ONE_APP = ctx({ hasPostedJob: true, roleTitle: 'Head Chef', roleTown: 'Bath', applicationCount: 1, unactionedCount: 1 })
const HIRED = ctx({ hasPostedJob: true, roleTitle: 'Head Chef', roleTown: 'Bath', applicationCount: 12, unactionedCount: 0, hasHired: true })

const CASES: { day: number; state: string; ctx: ActivationContext; build: (c: ActivationContext) => ActivationEmail }[] = [
  { day: 1, state: 'never posted', ctx: base, build: activationDay1Email },
  { day: 1, state: 'posted', ctx: POSTED, build: activationDay1Email },
  { day: 3, state: 'never posted', ctx: base, build: activationDay3Email },
  { day: 3, state: 'posted', ctx: POSTED, build: activationDay3Email },
  { day: 7, state: 'never posted', ctx: base, build: activationDay7Email },
  { day: 7, state: 'posted, no applications', ctx: POSTED, build: activationDay7Email },
  { day: 7, state: 'has applications', ctx: APPS, build: activationDay7Email },
  { day: 14, state: 'never posted', ctx: base, build: activationDay14Email },
  { day: 14, state: 'posted, no applications', ctx: POSTED, build: activationDay14Email },
  { day: 14, state: 'has applications, 7 waiting', ctx: APPS, build: activationDay14Email },
  { day: 14, state: 'has applications, all actioned', ctx: ALL_ACTIONED, build: activationDay14Email },
  { day: 14, state: 'exactly one application', ctx: ONE_APP, build: activationDay14Email },
  { day: 30, state: 'never posted', ctx: base, build: activationDay30Email },
  { day: 30, state: 'posted, no applications', ctx: POSTED, build: activationDay30Email },
  { day: 30, state: 'applications, no hire', ctx: APPS, build: activationDay30Email },
  { day: 30, state: 'hired', ctx: HIRED, build: activationDay30Email },
]

const rendered = new Map<string, ActivationEmail>()
for (const c of CASES) {
  const key = `day${c.day} — ${c.state}`
  const built = c.build(c.ctx)
  rendered.set(key, built)
  console.log('\n' + '═'.repeat(72))
  console.log(key.toUpperCase())
  console.log('═'.repeat(72))
  if (!built) { console.log('(SENDS NOTHING)'); continue }
  console.log(`SUBJECT:   ${built.subject}`)
  console.log(`PREHEADER: ${built.preheader ?? '(none)'}`)
  console.log('-'.repeat(72))
  console.log(text(built.html))
}

// ── Assertions ──────────────────────────────────────────────────────────────
const failures: string[] = []
const check = (name: string, ok: boolean) => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}`)
  if (!ok) failures.push(name)
}

console.log('\n' + '═'.repeat(72))
console.log('ASSERTIONS')
console.log('═'.repeat(72))

const get = (k: string) => rendered.get(k)

// The one state that must send nothing, and its neighbours that must not.
check('day14 never-posted sends nothing', get('day14 — never posted') === null)
check('day14 posted-no-applications DOES send', get('day14 — posted, no applications') !== null)
check('day14 has-applications DOES send', get('day14 — has applications, 7 waiting') !== null)
check('nothing else in the set returns null',
  CASES.filter(c => !(c.day === 14 && c.state === 'never posted')).every(c => rendered.get(`day${c.day} — ${c.state}`) !== null))

// Branching is real: within a day, no two states may produce identical bodies.
for (const day of [1, 3, 7, 14, 30]) {
  const bodies = CASES.filter(c => c.day === day)
    .map(c => rendered.get(`day${c.day} — ${c.state}`))
    .filter(Boolean)
    .map(e => text(e!.html))
  check(`day${day}: all ${bodies.length} variants differ from each other`, new Set(bodies).size === bodies.length)
}

// The counts that are stated must be the counts passed in.
const d14 = text(get('day14 — has applications, 7 waiting')!.html)
check('day14 states 12 applications', d14.includes('12 applications'))
check('day14 states 7 waiting, and says "waiting" not "unopened"',
  /7<\/strong>|7 are still waiting|7 are/.test(d14) && d14.includes('waiting') && !/unopened|unread|not opened/i.test(d14))
check('day14 all-actioned drops the waiting sentence entirely',
  !text(get('day14 — has applications, all actioned')!.html).includes('still waiting'))
check('day14 singular: "1 application" and "is still waiting", never "1 applications"',
  text(get('day14 — exactly one application')!.html).includes('1 application') &&
  !text(get('day14 — exactly one application')!.html).includes('1 applications') &&
  text(get('day14 — exactly one application')!.html).includes('is still waiting'))

// Day 14 variant B names the role and the town.
const d14b = text(get('day14 — posted, no applications')!.html)
check('day14 posted-no-applications names the role and the town', d14b.includes('Head Chef') && d14b.includes('Bath'))
check('day14 posted-no-applications keeps "we might not have your people yet" unsoftened',
  /if we don't, I'd rather say so/.test(d14b))

// Day 30 variant D is a pause, not an exit.
const d30d = text(get('day30 — never posted')!.html)
check('day30 never-posted does NOT offer to close the account',
  !/close (your )?account|keep your account open|delete your account|unsubscribe you/i.test(d30d))
check('day30 never-posted says the account stays as it is', /stays exactly as it is/.test(d30d))

// Day 30 variant C is Paul's line, unchanged.
const d30c = text(get('day30 — posted, no applications')!.html)
check('day30 posted-no-applications keeps "isn\'t good enough"', d30c.includes("isn't good enough"))

// Money: the founding offer is permitted on day 1 and nowhere else; no other
// figure, rate, or trial length may appear anywhere in the set.
const day1Bodies = CASES.filter(c => c.day === 1).map(c => text(rendered.get(`day1 — ${c.state}`)!.html))
const nonDay1Bodies = CASES.filter(c => c.day !== 1).map(c => rendered.get(`day${c.day} — ${c.state}`)).filter(Boolean).map(e => text(e!.html))
check('day1 carries the founding offer', day1Bodies.every(b => /12 months free/i.test(b)))
check('no £ figure anywhere in the set',
  [...day1Bodies, ...nonDay1Bodies].every(b => !/£\s*\d/.test(b)))
check('no trial language anywhere in the set',
  [...day1Bodies, ...nonDay1Bodies].every(b => !/\btrial\b/i.test(b)))
check('no "per month" / monthly rate anywhere in the set',
  [...day1Bodies, ...nonDay1Bodies].every(b => !/per month|\/month|a month for|monthly (fee|rate|cost|price)/i.test(b)))
check('the founding offer appears ONLY on day 1',
  nonDay1Bodies.every(b => !/12 months free|founding/i.test(b)))

// The old day 3 told hospitality employers to go remote or hybrid.
check('no remote/hybrid advice anywhere in the set',
  [...day1Bodies, ...nonDay1Bodies].every(b => !/\bremote\b|\bhybrid\b/i.test(b)))

// The shared layout signs off; no template may sign off a second time.
check('no template adds its own sign-off block',
  [...day1Bodies, ...nonDay1Bodies].every(b => (b.match(/The Thrive Team/g) || []).length <= 1))

// Every sent email has a subject, a preheader and at least one link.
for (const [key, e] of Array.from(rendered.entries())) {
  if (!e) continue
  if (!e.subject?.trim()) failures.push(`${key}: empty subject`)
  if (!e.preheader?.trim()) failures.push(`${key}: empty preheader`)
  if (!/href="/.test(e.html)) failures.push(`${key}: no link`)
  if (/undefined|null|NaN|\[object/.test(text(e.html) + e.subject)) failures.push(`${key}: unrendered value leaked into the copy`)
}
check('every sent email has a subject, a preheader, a link and no leaked values',
  !failures.some(f => f.includes(':')))

console.log('\n' + '═'.repeat(72))
if (failures.length) {
  console.log(`${failures.length} FAILED:`)
  for (const f of failures) console.log(`  - ${f}`)
  process.exit(1)
}
console.log(`ALL ASSERTIONS PASSED — ${rendered.size} states rendered, 1 of them sends nothing.`)

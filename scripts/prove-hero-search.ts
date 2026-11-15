// THE HOME HERO IS THE JOB SEARCH, AND EVERY NUMBER ON IT COMES FROM THE ROWS.
//
//   npm run herosearch:prove
//
// The hero used to read "From job ad to signed offer, in one place." with four
// employer proof cards and a "Hire on Thrive" primary. A stranger who taps a
// job post and lands on the home page is looking for WORK, and the page argued
// for the product to somebody else. Candidate signups were down ~50%.
//
// TWO CLAIMS IN THE DESIGN ARE FALSE IF TYPED IN, and both are checked here:
//
//   "251 roles live now"        true on the day it was written, and a number
//                               typed into a page goes stale in silence
//   "with the salary on every one"  FALSE TODAY. Two imported Goldenkeys rows
//                               carry salary_min = 0 AND salary_max = 0, so the
//                               board does not support the sentence. Note that
//                               `salary_max is not null` PASSES on both of them
//                               — a check that is true without being right.
//   "NEWEST TODAY"              FALSE TODAY. Nothing was posted today; only 4
//                               of 251 live roles were posted in the last week.
//
// Filesystem and pure text. The rendered half — the bar, the cards, nothing
// under the consent lane — is a browser question and lives in the drive.

import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = join(__dirname, '..')
const read = (rel: string) => readFileSync(join(ROOT, rel), 'utf8')
const page = read('app/page.tsx')
const css = read('app/page.module.css')
const stripComments = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, '').split(/\r?\n/).filter(l => !/^\s*\/\//.test(l)).join('\n')
const pageCode = stripComments(page)

let failed = 0
let ran = 0
const check = (name: string, got: () => unknown, want: unknown) => {
  ran++
  let v: unknown
  try { v = got() } catch (err) {
    console.log(`FAIL  ${name}`)
    console.log(`        threw: ${(err as Error).message}`)
    failed++
    return
  }
  const a = JSON.stringify(v), b = JSON.stringify(want)
  if (a !== b) {
    console.log(`FAIL  ${name}`)
    console.log(`        want ${b}`)
    console.log(`        got  ${a}`)
    failed++
  } else console.log(`ok    ${name}`)
}

// ── THE HERO SELLS THE SEARCH ──────────────────────────────────────────────

// BOTH HALVES, BECAUSE THE FIRST THREE WORDS SURVIVED A HEADLINE CHANGE.
// This asserted only `page.includes('Hospitality jobs worth')`. The copy changed
// on 24 Aug 2026 from "…worth leaving your shift for." to "…worth building a
// career on." and this check STAYED GREEN THROUGHOUT — it could not tell the two
// headlines apart, so it would equally not notice the old one coming back.
//
// The sentence is split by a <br> in the source, so there is no contiguous
// string to match. Asserting both halves is what makes the check able to fail.
check(
  'the headline is the job-seeker one',
  () => page.includes('Hospitality jobs worth') && page.includes('building a career on.'),
  true
)
check(
  'and the shift-poaching line it replaced is gone',
  () => page.includes('leaving your shift for'),
  false
)
// SCOPED TO THE H1, NOT THE PAGE. The first version of this asserted the
// phrase was absent from the whole file and went red on a TRUE sentence: "From
// job ad to signed offer without leaving the page" is the demo section's
// subtitle, further down, in the employer half — which is exactly where that
// argument belongs and is not being removed. A check whose selector is wider
// than the claim reads as a product fault and is the instrument.
check(
  'the employer pitch is no longer THE HEADLINE',
  () => {
    const h1 = pageCode.match(/<h1[^>]*>([\s\S]*?)<\/h1>/)?.[1] || ''
    return h1.includes('From job ad to signed offer')
  },
  false
)
check(
  'and the headline is the only h1 on the page',
  () => (pageCode.match(/<h1/g) || []).length,
  1
)
check('there is a search form in the hero', () => pageCode.includes('styles.heroSearch'), true)
check('with both fields', () => pageCode.includes('Chef, bartender, manager') && pageCode.includes('Town or postcode'), true)
check(
  'and it routes to the board, carrying what was typed',
  () => pageCode.includes("params.set('search'") && pageCode.includes("params.set('city'") && pageCode.includes('/jobs?'),
  true
)
check(
  'an empty search still goes to the board rather than nowhere',
  () => pageCode.includes("router.push(params.toString() ? `/jobs?${params}` : '/jobs')"),
  true
)

// ── NOT ONE NUMBER IS TYPED IN ─────────────────────────────────────────────
// The design's own figures were correct the day it was drawn. That is exactly
// why they must not be copied: a stale number is wrong silently.

check(
  'the live count is read from the rows, not written down',
  () => pageCode.includes('liveJobs.toLocaleString()'),
  true
)
check(
  'NO HARD-CODED ROLE COUNT ANYWHERE IN THE HERO',
  () => {
    const hero = pageCode.split('</section>')[0]
    return (hero.match(/\b(2[0-9]{2}|1[0-9]{2})\s*(roles|jobs)/gi) || [])
  },
  []
)

// ── THE SALARY CLAIM IS CONDITIONAL, AND ON THE RIGHT TEST ────────────────

check(
  'the salary clause is only said when it is true of every live role',
  () => pageCode.includes('rolesWithSalary === liveJobs'),
  true
)
check(
  'AND THE TEST IS "ABOVE ZERO", NOT "NOT NULL" — the two bad rows pass not-null',
  () => pageCode.includes("gt('salary_max', 0)"),
  true
)
check(
  'a claim we cannot support falls OUT of the sentence rather than defaulting in',
  () => {
    // rolesWithSalary starts null and the clause requires an equality with a
    // number, so a failed count can never render the claim.
    return pageCode.includes('useState<number | null>(null)') && pageCode.includes('rolesWithSalary !== null && rolesWithSalary === liveJobs')
  },
  true
)

// ── "NEWEST TODAY" IS A CLAIM ABOUT TODAY ──────────────────────────────────

check(
  'the eyebrow is computed, not written down',
  () => pageCode.includes('const newestLabel ='),
  true
)
check(
  'it can say TODAY, THIS WEEK, or neither — three states, so it can be wrong-proof',
  () => {
    const labels = ['NEWEST TODAY', 'NEWEST THIS WEEK', 'NEWEST ON THRIVE'].filter(l => pageCode.includes(l))
    return labels.length
  },
  3
)
check(
  'and TODAY is never the unconditional string in the markup',
  () => /className=\{styles\.heroRolesEyebrow\}>NEWEST/.test(pageCode),
  false
)

// ── THE TITLE IS NOT TRUNCATED ─────────────────────────────────────────────
// Cutting at the en dash is right in admin and destroys the board: 40 live
// listings collapse to "Chef De Partie", all from one employer.

check(
  'the role cards are the shared text-led components, which render the job’s own title (design 26, A)',
  () => /<JobRow[\s\S]*?job=\{job\}/.test(pageCode) && /<JobCardLink[\s\S]*?variant="home"/.test(pageCode),
  true
)
check(
  'nothing truncates it on the way to the card',
  () => /shortJobTitle|truncateTitle|split\('–'\)/.test(pageCode),
  false
)
// DESIGN 26 REVERSED ONE HALF OF THIS: from 769 the home cards are a FIXED
// 248px and clamp the title to two lines, so the grid lines up and the reserve
// is exact. The phone rows must still never clamp — the full title stays
// reachable on the home page itself, as well as on every advert.
check(
  'the phone rows never clamp the title; only the fixed-height 1a home card does (design 26)',
  () => {
    const rowCss = read('components/JobRow.module.css')
    const cardCss = read('components/JobTypeCard.module.css')
    const rowTitle = (rowCss.match(/\.title\s*\{[^}]*\}/) || [''])[0]
    return [/line-clamp/.test(rowTitle), /\[data-variant='home'\] \.title\s*\{[^}]*-webkit-line-clamp:\s*2/.test(cardCss)]
  },
  [false, true]
)

// ── EVERY CLASS THE PAGE USES HAS A RULE BEHIND IT ─────────────────────────
// THIS IS THE CHECK THAT CAUGHT A REAL ONE. Rebuilding the hero orphaned
// .heroCtas, .ctaPrimary and .ctaSecondary — except the closing section at the
// foot of the page still used all three, so deleting their rules would have
// left it unstyled with no error, no type failure and nothing to notice until
// somebody looked at a screenshot. A CSS module hands back undefined for a
// class it does not have, and React renders class="undefined" quite happily.

check(
  'NO CLASS IS USED WITH NO RULE BEHIND IT',
  () => {
    const used = Array.from(new Set((pageCode.match(/styles\.([A-Za-z0-9_]+)/g) || []).map(s => s.slice(7))))
    const defined = new Set((css.match(/\.([A-Za-z0-9_]+)\s*[{,]/g) || []).map(s => s.replace(/[\s{,]/g, '').slice(1)))
    return used.filter(c => !defined.has(c)).sort()
  },
  []
)

// The reverse is not an error — a stylesheet may carry rules for a sibling
// page — but the hero's own new classes must exist, or the layout silently
// falls back to unstyled inline content.
for (const cls of ['heroSearch', 'heroField', 'heroInput', 'heroSearchBtn', 'heroUnderline', 'homeList', 'homeGrid', 'homeCardWide', 'foundingStrip']) {
  check(`.${cls} is defined`, () => new RegExp(`\\.${cls}\\s*[{,]`).test(css), true)
}

// ── THE DESKTOP BAR AND THE PHONE STACK ────────────────────────────────────

check(
  'the divider only exists on the one-bar search (769 and up)',
  () => {
    const base = css.split('@media (min-width: 769px)')[0]
    const desktop = css.split('@media (min-width: 769px)')[1] || ''
    return /\.heroFieldRule\s*\{\s*display:\s*none/.test(base) && /\.heroFieldRule\s*\{[^}]*display:\s*block/.test(desktop)
  },
  true
)
check(
  'three rows at 390, a 2x2 of four from 769, a 3x2 of six from 1024 (design 26, A)',
  () => {
    const base = css.split('@media (min-width: 769px)')[0]
    const desktop = css.split('@media (min-width: 769px)')[1] || ''
    const wide = css.split('@media (min-width: 1024px)')[1] || ''
    return [
      /newestRoles\.slice\(0, 3\)\.map/.test(pageCode) && /newestRoles\.slice\(0, 6\)\.map/.test(pageCode) && /\.limit\(6\)/.test(pageCode),
      /\.homeGrid\s*\{\s*display:\s*none/.test(base),
      /\.homeList\s*\{\s*display:\s*none/.test(desktop) && /\.homeGrid\s*\{[^}]*repeat\(2, minmax\(0, 1fr\)\)/.test(desktop) && /\.homeCardWide\s*\{\s*display:\s*none/.test(desktop),
      /\.homeGrid\s*\{[^}]*repeat\(3, minmax\(0, 1fr\)\)/.test(wide) && /\.homeCardWide\s*\{\s*display:\s*block/.test(wide),
    ]
  },
  [true, true, true, true]
)
// ── THE RESERVES ──────────────────────────────────────────────────────────
// A MEDIA QUERY ADDS NO SPECIFICITY, so a later rule wins. The reserves were
// three numbers in three blocks (318, 386, 362), and the 2x2 one was once
// silently beaten by a later <=1024 rule: the diff read correctly and the
// computed value did not move. They are now the LAST rules in the file, and
// this asserts exactly that — order, not the numbers, so re-measuring a
// reserve (which the sheet instructs) never turns it red.
check(
  'the two home reserves are the last heroRolesSection rules in the file: phone, then 769+',
  () => {
    const flat = css.replace(/\r\n/g, '\n')
    const iPhone = flat.lastIndexOf('@media (max-width: 768px) {\n  .heroRolesSection { min-height:')
    const iWide = flat.lastIndexOf('@media (min-width: 769px) {\n  .heroRolesSection { min-height:')
    const lastMention = flat.lastIndexOf('.heroRolesSection')
    const declared = (flat.match(/\.heroRolesSection\s*\{\s*min-height:/g) || []).length
    return [iPhone > -1, iWide > iPhone, lastMention > iWide && lastMention < iWide + 80, declared]
  },
  [true, true, true, 2]
)
check(
  'the fields can shrink — a flex child defaults to refusing to',
  () => /\.heroField\s*\{[^}]*min-width:\s*0/.test(css) && /\.heroInput\s*\{[^}]*min-width:\s*0/.test(css),
  true
)

// CONTROLS WRAP; CONTENT SCROLLS. A sideways-scrolling row of controls hides
// whole controls behind an edge with no affordance.
check(
  'NO overflow-x ON THE SEARCH ROW OR THE CARD GRID',
  () => {
    const rules = (css.match(/\.(heroSearch|heroRoles|heroField)\s*\{[^}]*\}/g) || []).join('')
    return /overflow-x/.test(rules)
  },
  false
)

console.log(`\n${ran - failed}/${ran} passed`)
if (failed) {
  console.error(`${failed} FAILED`)
  process.exit(1)
}

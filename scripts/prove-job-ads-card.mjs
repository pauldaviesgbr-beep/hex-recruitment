// THE JOB ADS CARD AND ITS LIST — the decisions, not the appearance.
//
//   npm run jobadscard:prove
//
// Filesystem only. No network, no database, milliseconds. In verify.
//
// ── WHAT THIS GUARDS, AND WHY EACH ONE IS HERE ──────────────────────────
//
// Every assertion below exists because the thing it checks is EASY TO UNDO BY
// ACCIDENT and produces no error when undone. None of them is about how the
// card looks; a stylesheet is allowed to change.
//
//   1. STYLES.X AGREES WITH THE STYLESHEET. A CSS-module class that does not
//      exist evaluates to `undefined`, React drops the attribute, and the
//      element renders as bare unstyled text. It compiles, it type-checks, it
//      builds, and nothing anywhere says a word. This repo shipped exactly
//      that on five renderers in one day. The assertion is the AGREEMENT --
//      neither side alone is the claim.
//
//      It runs against this branch's two new files only. The same check over
//      app/my-jobs/page.tsx reports six missing classes on the CANDIDATE view
//      (company, cardBody, appliedDate, dateIcon, cardFooter, viewJobBtn),
//      all of them present on main and unrelated to this work. They are
//      reported rather than swept in, because widening a check to cover a
//      fault you are not fixing turns it red on arrival.
//
//   2. THE TITLE NEVER TRUNCATES, IN ANY STATE. This is the single most
//      likely thing to be "fixed" by someone tidying long titles, and it is
//      load-bearing: 111 of the 112 live adverts are "Role – Marketing
//      Phrase", forty of them collapse to "Chef De Partie" from one company,
//      and the longest role STILL needs three lines at 390 after the phrase is
//      gone. A clamp cuts "Manager" off "Assistant Food & Beverage Operations
//      Manager" -- the exact identity loss the wrap exists to prevent.
//
//   3. THE TAB STRIP IS NOT A SIDEWAYS SCROLLER. The handoff specifies one;
//      this build deliberately does not have one, because a scrolling control
//      row hides whole controls behind an edge with no affordance and this
//      product has fixed that fault on four separate rows. The departure is
//      only safe while three tabs FIT, which the drive measures at 320.
//
//   4. THERE ARE EXACTLY THREE FILTERS. The partition assertion in
//      drive-my-jobs-controls is about a fixed number of parts. A fourth tab
//      added here without touching the drive would weaken that check silently.
//
//   5. THE COUNTDOWN IS GATED ON is_recruiter_posting. "3 DAYS LEFT" is a
//      CLAIM, and the expiry cron excludes recruiter postings -- every company
//      on the live board is an agency, so an ungated countdown would be false
//      on almost every advert we hold.
//
//   6. THE ELEVEN TOKENS EXIST. The card reads them; a missing custom property
//      falls back to nothing and paints transparent, silently.
//
//   7. ONE ATTENTION SURFACE. --rs-attn-bg has exactly one consumer. The
//      moment there are two, "the one thing asking for your attention" is a
//      sentence that is no longer true.

import { readFileSync } from 'node:fs'

let bad = 0
let ran = 0
const check = (label, ok, detail) => {
  ran++
  if (!ok) bad++
  console.log('  ' + (ok ? 'ok   ' : 'FAIL ') + String(label).padEnd(62) + (detail ?? ''))
}

const read = (p) => readFileSync(p, 'utf8')
const decomment = (css) => css.replace(/\/\*[\s\S]*?\*\//g, '')

console.log('the job ads card and its list')
console.log('')

// ── 1. styles.X agrees with the stylesheet ──────────────────────────────
for (const [tsx, css] of [
  ['components/JobAdCard.tsx', 'components/JobAdCard.module.css'],
  ['components/EmptyState.tsx', 'components/EmptyState.module.css'],
]) {
  const used = new Set([...read(tsx).matchAll(/\bstyles\.([A-Za-z_][A-Za-z0-9_]*)/g)].map(m => m[1]))
  const declared = new Set([...decomment(read(css)).matchAll(/\.([A-Za-z_][A-Za-z0-9_-]*)/g)].map(m => m[1]))
  const missing = [...used].filter(u => !declared.has(u))
  // ZERO-GUARD: a file where the search finds no classes at all means the
  // search broke, not that everything agrees.
  const name = tsx.split('/').pop()
  check(`${name} references classes at all`, used.size >= 5, `${used.size} used`)
  check(`…and every one has a rule`, missing.length === 0, missing.join(', '))
}

console.log('')

// ── 2. the title never truncates ────────────────────────────────────────
const cardCss = decomment(read('components/JobAdCard.module.css'))
const titleRules = [...cardCss.matchAll(/\.title\b[^{]*\{([^}]*)\}/g)].map(m => m[1])
check('the card stylesheet declares a .title rule at all', titleRules.length >= 1,
  `${titleRules.length} rule(s)`)
const truncators = titleRules
  .flatMap(r => r.split(/\r?\n/))
  .filter(l => /text-overflow|line-clamp|white-space:\s*nowrap|overflow:\s*hidden/.test(l))
  .map(l => l.trim())
check('NO rule on .title truncates it, in any state', truncators.length === 0,
  truncators.join(' | '))

// ── 3. the tab strip is not a sideways scroller ─────────────────────────
const pageCss = decomment(read('app/my-jobs/page.module.css'))
const stripRule = (pageCss.match(/\.tabStrip\s*\{([^}]*)\}/) || [])[1]
check('the list stylesheet declares .tabStrip', !!stripRule)
check('.tabStrip is not an overflow-x scroller',
  !!stripRule && !/overflow-x:\s*(auto|scroll)/.test(stripRule) && !/overflow:\s*(auto|scroll)/.test(stripRule),
  stripRule ? (stripRule.match(/overflow[^;]*;/) || ['none'])[0] : '')
check('.tabStrip is sticky under the MEASURED nav height',
  !!stripRule && /position:\s*sticky/.test(stripRule) && /top:\s*var\(--nav-height\)/.test(stripRule),
  'no literal px — the header renders 69.19 and the token has been wrong before')

console.log('')

// ── 4. exactly three tabs, defined ONCE ─────────────────────────────────
// The rule moved out of the page into lib/jobAdTabs.mjs, because the drive
// needs it too and a Playwright script cannot import a .tsx. This reads it
// where it lives — a check pointed at the old location would have gone red
// about a correct refactor, which is its own kind of wrong.
const page = read('app/my-jobs/page.tsx')
const rule = read('lib/jobAdTabs.mjs')

const tabs = (rule.match(/export const JOB_AD_TABS = \[([^\]]*)\]/) || [])[1]
const tabList = tabs ? tabs.split(',').map(x => x.trim().replace(/'/g, '')).filter(Boolean) : []
check('JOB_AD_TABS is declared in lib/jobAdTabs.mjs', tabList.length > 0, tabList.join(' '))
check('there are exactly three, and they are live/filled/archived',
  tabList.length === 3 && ['live', 'filled', 'archived'].every(f => tabList.includes(f)),
  tabList.join(' '))

// ── THE SECOND COPY IS THE THING BEING PREVENTED ────────────────────────
// This branch created the duplicate and then removed it: tabOf existed in the
// page and again in the drive, and `closed` moved from Live to Archived in one
// of them and not the other, one commit apart. Neither file could have
// disagreed with the other, and nothing type-checks a drive's arithmetic
// against a page's.
const drive = read('scripts/drive-my-jobs-controls.mjs')
check('the page IMPORTS the rule rather than restating it',
  /from '@\/lib\/jobAdTabs\.mjs'/.test(page) && !/const tabOf =/.test(page),
  /const tabOf =/.test(page) ? 'page defines its own tabOf' : 'imported')
check('the drive IMPORTS the rule rather than restating it',
  /from '\.\.\/lib\/jobAdTabs\.mjs'/.test(drive) && !/const tabOf =/.test(drive),
  /const tabOf =/.test(drive) ? 'drive defines its own tabOf' : 'imported')

// PAUSED IS LIVE; CLOSED IS NOT — the distinction a 60-day expiry will make
// real on a live row around 19 Oct 2026, when Collins King's advert becomes
// `expired` and the mapper turns that into `closed`. Under the first version
// of this rule it would have appeared on a tab labelled Live, reading CLOSED.
check("closed files under archived, not live",
  /status === 'archived' \|\| status === 'closed' \? 'archived'/.test(rule),
  'an expired advert is finished, and a tab labelled Live must not hold one')
check('paused is NOT sent to archived',
  !/'paused'\s*\?\s*'archived'/.test(rule),
  'the employer stopped it and means to resume it')

check('the default is live, not a stale tab name',
  /:\s*'live'/.test(page),
  'unknown ?filter= lands on the working set')

console.log('')

// ── 5. the countdown is gated ───────────────────────────────────────────
const models = (page.match(/const cardModels = useMemo[\s\S]*?\}\), \[displayJobs\]\)/) || [''])[0]
check('the card models block was found', models.length > 200, `${models.length} chars`)
check('the expiry countdown is gated on is_recruiter_posting',
  /!job\.isRecruiterPosting/.test(models),
  'the cron excludes recruiter postings — every company on the board is one')
check('…and on the advert actually being active',
  /job\.status === 'active'/.test(models))
check('statusDetail is never set from expires_at',
  !/expiresDate/.test(models),
  'that column is null on every row and nothing writes it')

console.log('')

// ── 6. the eleven tokens ────────────────────────────────────────────────
const globals = read('app/globals.css')
const TOKENS = ['--rs-live', '--rs-live-ink', '--rs-dormant', '--rs-attn-bg',
  '--rs-attn-border', '--rs-attn-ink', '--rs-tap', '--rs-hairline',
  '--rs-met-bg', '--rs-under', '--rs-under-line', '--rs-under-ink']
const undeclared = TOKENS.filter(t => !new RegExp(`\\${t}:\\s*[^;]+;`).test(globals))
check('every token the card reads is declared in globals.css',
  undeclared.length === 0, undeclared.join(' '))

// ── 7. one attention surface ────────────────────────────────────────────
// Counted across the two stylesheets that make up this screen. A consumer is
// a `var(--rs-attn-bg)` in a background declaration; the DECLARATION in
// globals.css is not a consumer and is excluded by only reading these two.
const consumers = [
  ...decomment(read('components/JobAdCard.module.css')).matchAll(/background:[^;]*var\(--rs-attn-bg/g),
  ...decomment(read('app/my-jobs/page.module.css')).matchAll(/background:[^;]*var\(--rs-attn-bg/g),
].length
check('exactly ONE surface on this screen fills with --rs-attn-bg',
  consumers === 1, `${consumers} consumer(s)`)

console.log('')
if (bad) { console.log(`${bad} FAILED of ${ran}`); process.exit(1) }
console.log(`${ran}/${ran} passed — the card's decisions are the ones that were made`)
process.exit(0)

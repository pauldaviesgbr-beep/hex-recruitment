// npm run phonenav:prove
//
// THE PHONE NAVIGATION (design_handoff_phone_navigation, 14 Nov 2026): the
// hamburger went, a bottom bar and two list pages replaced it. Filesystem only —
// no network, no database — so it runs on every push.
//
// THE QUESTION THAT MATTERS IS NOT "DOES THE BAR RENDER". It is whether any
// destination the hamburger used to hold has been left with NO HOME on a
// phone. Nothing errors when that happens: the page still exists, it simply
// cannot be reached, and nobody notices until somebody needs it. So the check
// reads the old menus' own links and asks, for each one, where it lives now.
//
// It IMPORTS the rule (lib/phoneNav.ts) rather than restating it: a check that
// restates a list proves only that it was restated consistently.

import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import {
  EMPLOYER_BAR, CANDIDATE_BAR, EMPLOYER_MORE, CANDIDATE_PROFILE, EMPLOYER_MORE_FOOT,
  EMPLOYER_MORE_PATH, CANDIDATE_PROFILE_PATH, activeSlot, barHiddenOn, moreBackShownOn,
  type MenuGroup,
} from '../lib/phoneNav'

const ROOT = join(__dirname, '..')
const read = (rel: string) => readFileSync(join(ROOT, rel), 'utf8')
const noComments = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '')
const barCssRaw = () => noComments(read('components/PhoneNav.module.css'))

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

const rowHrefs = (groups: MenuGroup[]) =>
  groups.flatMap(g => g.rows).map(r => r.href).filter((h): h is string => !!h)

// ── EVERY LINK GOES TO A PAGE THAT EXISTS ──────────────────────────────────
// A row pointing at a route that is not there renders, taps, and 404s.

const routeExists = (href: string) => {
  const p = href.split('?')[0].replace(/^\//, '')
  return ['page.tsx', 'page.ts'].some(f => existsSync(join(ROOT, 'app', p, f)))
}

check(
  'every bar slot, menu row and foot link points at a page that exists',
  () => [
    ...EMPLOYER_BAR.map(s => s.href), ...CANDIDATE_BAR.map(s => s.href),
    ...rowHrefs(EMPLOYER_MORE), ...rowHrefs(CANDIDATE_PROFILE), EMPLOYER_MORE_FOOT.href,
  ].filter(h => !routeExists(h)),
  []
)

check('five slots in each bar (Apple\'s ceiling, and the design\'s count)',
  () => [EMPLOYER_BAR.length, CANDIDATE_BAR.length], [5, 5])

// ── NOTHING THE HAMBURGER HELD IS LEFT WITHOUT A HOME ──────────────────────
// The sources are the menus' OWN files, read now — so a link added to a
// sidebar later, and never given a phone home, goes red here.

const hrefsIn = (src: string) =>
  Array.from(new Set(Array.from(src.matchAll(/href:\s*'([^']+)'/g)).map(m => m[1])))

const employerSidebar = read('components/EmployerSidebar.tsx')
const candidateSidebar = read('components/CandidateSidebar.tsx')
const header = read('components/Header.tsx')
const chips = read('components/JobsChips.tsx')

const employerSources = [
  ...hrefsIn(employerSidebar),
  // computed, so not a literal the regex can see: the company page / reviews
  '/reviews',
  // the drawer's Share Feedback, and the header icons a phone no longer shows
  '/feedback', '/messages', '/calendar', '/settings/company', '/settings',
]
const candidateSources = [
  ...hrefsIn(candidateSidebar),
  '/feedback', '/messages', '/profile', '/settings', '/job-alerts',
]

// A destination may live INSIDE another page rather than in the nav. Each such
// home is named here AND asserted to exist, so the exception cannot outlive the
// link it relies on.
const inPage: Record<string, { page: string; link: RegExp }> = {
  '/post-job': { page: 'app/my-jobs/page.tsx', link: /href="\/post-job"/ },
}

const homeless = (sources: string[], homes: string[]) =>
  sources.filter(h => !homes.includes(h) && !inPage[h])

check('ZERO-GUARD: the employer sidebar scan still finds its links',
  () => hrefsIn(employerSidebar).length >= 12, true)
check('ZERO-GUARD: the candidate sidebar scan still finds its links',
  () => hrefsIn(candidateSidebar).length >= 9, true)

check(
  'every employer destination has a home on a phone',
  () => homeless(employerSources, [
    ...EMPLOYER_BAR.map(s => s.href), ...rowHrefs(EMPLOYER_MORE), EMPLOYER_MORE_FOOT.href,
  ]),
  []
)

check(
  'every candidate destination has a home on a phone',
  () => homeless(candidateSources, [
    ...CANDIDATE_BAR.map(s => s.href), ...rowHrefs(CANDIDATE_PROFILE),
    ...Array.from(chips.matchAll(/href:\s*'([^']+)'/g)).map(m => m[1]),
  ]),
  []
)

check(
  'and each in-page home really links there',
  () => Object.entries(inPage).filter(([, v]) => !v.link.test(read(v.page))).map(([k]) => k),
  []
)

check('Log out and Ask Thrive are rows on both list pages',
  () => [EMPLOYER_MORE, CANDIDATE_PROFILE].map(g => {
    const acts = g.flatMap(x => x.rows).map(r => r.action)
    return acts.includes('log-out') && acts.includes('ask-thrive')
  }), [true, true])

// ── WHICH SLOT IS LIT ──────────────────────────────────────────────────────

check('each slot lights itself on its own page',
  () => [
    ...EMPLOYER_BAR.map(s => activeSlot('employer', s.href) === s.label),
    ...CANDIDATE_BAR.map(s => activeSlot('candidate', s.href) === s.label),
  ].every(Boolean), true)

check('a page reached from More keeps More lit',
  () => rowHrefs(EMPLOYER_MORE).filter(h => activeSlot('employer', h) !== 'More'), [])

check('a page reached from Profile keeps Profile lit',
  () => rowHrefs(CANDIDATE_PROFILE).filter(h => activeSlot('candidate', h) !== 'Profile'), [])

// ── WHERE THE BAR STEPS ASIDE ──────────────────────────────────────────────
// '/job' must hide the bar on an advert (its Apply bar owns the foot) and
// must NOT swallow '/jobs', the board.

check('pushed pages hide the bar; the board does not',
  () => [barHiddenOn('/job/abc'), barHiddenOn('/post-job'), barHiddenOn('/jobs'), barHiddenOn('/jobs/recommended')],
  [true, true, false, false])

check('the app\'s "‹ More" link: on a More page, not on /messages or a settings sub-page',
  () => [moreBackShownOn('/candidates', null), moreBackShownOn('/messages', null), moreBackShownOn('/settings/team', null)],
  [true, false, false])

// ── THE BRIDGE FOR THE APP ALREADY IN PEOPLE'S HANDS ───────────────────────
// Build 30's More tab presses [aria-label="Open navigation"]. The selector is
// in Swift and the button is in TSX: assert the AGREEMENT, not either side.

const swift = read('ios/App/App/ThriveBridgeViewController.swift')

check('the app still presses "Open navigation"',
  () => swift.includes('[aria-label=\\"Open navigation\\"]'), true)

// CODE, NOT COMMENTS, throughout: the comment above the button quotes this
// very attribute, so a check that read comments would pass on a renamed button
// (watched happening, 14 Nov 2026).
const phoneNavCode = noComments(read('components/PhoneNav.tsx'))

check('the bar component carries that control, and it opens the More page',
  () => /aria-label="Open navigation"/.test(phoneNavCode) &&
        /onClick=\{\(\) => router\.push\(EMPLOYER_MORE_PATH\)\}/.test(phoneNavCode) &&
        EMPLOYER_MORE_PATH === '/employer/more' && routeExists(EMPLOYER_MORE_PATH),
  true)

check('on EVERY page: rendered outside the bar\'s own show/hide, so pushed pages have it too',
  // The CONDITION in front of the bridge, read directly. An earlier version
  // compared positions in the file and passed with the bridge gated on `show`
  // (watched, 14 Nov 2026): a check of where code sits is not a check of when
  // it renders.
  () => {
    const btn = phoneNavCode.lastIndexOf('<button', phoneNavCode.indexOf('aria-label="Open navigation"'))
    const gate = phoneNavCode.slice(phoneNavCode.lastIndexOf('{', btn), btn)
    return { gate: gate.replace(/\s+/g, ' ').trim(), mentionsShow: /\bshow\b/.test(gate) }
  },
  { gate: "{role === 'employer' && (", mentionsShow: false })

check('exactly ONE such control in the product, so the app cannot press the wrong one',
  () => ['components/PhoneNav.tsx', 'components/EmployerSidebar.tsx', 'components/CandidateSidebar.tsx', 'components/Header.tsx']
    .map(f => (noComments(read(f)).match(/aria-label="Open navigation"/g) || []).length).reduce((a, b) => a + b, 0),
  1)

check('and it is never painted',
  () => /\.bridge\s*\{\s*display:\s*none;?\s*\}/.test(barCssRaw()) && !/\.bridge[^{]*\{[^}]*display:\s*(block|flex|inline)/.test(barCssRaw()),
  true)

check('both hamburgers are gone',
  () => [/styles\.mobileToggle/.test(noComments(employerSidebar)), /styles\.mobileToggle/.test(noComments(candidateSidebar))],
  [false, false])

// ── INSIDE THE APP, NONE OF THE WEBSITE'S NAVIGATION SHOWS ─────────────────

const globals = noComments(read('app/globals.css'))
const appHidden = (globals.match(/((?:html\.native-nav \[[^\]]+\],?\s*)+)\{\s*display:\s*none !important/) || [])[1] || ''

check('app mode hides the header, both rails, the hamburger and anything marked',
  () => ['data-site-header', 'data-candidate-rail', 'data-employer-rail', 'data-sidebar-toggle', 'data-hide-in-app']
    .filter(a => !appHidden.includes(`[${a}]`)),
  [])

check('the bar and the employer rail carry the markers app mode hides',
  () => [
    /data-hide-in-app=""/.test(read('components/PhoneNav.tsx')),
    /data-employer-rail=""/.test(employerSidebar),
    /data-candidate-rail=""/.test(candidateSidebar),
  ], [true, true, true])

check('the rails\' left room goes in the app as well',
  () => /html\.native-nav body\[data-sidebar\]/.test(globals), true)

check('the "‹ More" link is shown in the app only',
  () => /html\.native-nav \[data-more-back\]\s*\{\s*display:\s*flex/.test(globals) &&
        /\.moreBack\s*\{\s*display:\s*none/.test(noComments(read('components/Header.module.css'))) &&
        /data-more-back=""/.test(header),
  true)

// ── THE BAR'S OWN STYLESHEET ───────────────────────────────────────────────

const barCss = noComments(read('components/PhoneNav.module.css'))

check('no body padding in the bar\'s stylesheet — the one reserve is in globals.css',
  () => /(^|[\s,}])body\s*\{/.test(barCss), false)

check('the bar is on the z-index token, never a literal',
  () => /\.bar\s*\{[^}]*z-index:\s*var\(--z-sidebar-nav\)/.test(barCss), true)

check('phone width only, the same boundary as the header',
  () => /\.bar\s*\{[^}]*display:\s*none/.test(barCss) &&
        /@media \(max-width: 768px\)\s*\{\s*\.bar\s*\{\s*display:\s*block/.test(barCss),
  true)

check('the bar publishes its measured height, and zero when it is not on screen',
  () => {
    const c = read('components/PhoneNav.tsx')
    return c.includes("getBoundingClientRect().height") &&
      (c.match(/setProperty\('--nav-bottom-h', '0px'\)/g) || []).length >= 2
  },
  true)

check('the candidate Profile page is where the bar\'s last slot goes',
  () => CANDIDATE_BAR[4].href === CANDIDATE_PROFILE_PATH && routeExists(CANDIDATE_PROFILE_PATH), true)

console.log(`\n${ran - failed}/${ran} passed`)
if (failed) {
  console.error(`${failed} FAILED`)
  process.exit(1)
}

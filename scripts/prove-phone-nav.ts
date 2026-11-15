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
  moreOwnHrefs, type MenuGroup,
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

// THE EXACT SIDE MENUS, label and destination, in order — not "at least N"
// (Paul, 15 Nov 2026). A floor passes on a menu that lost an item and gained
// another, and on one that kept the count but moved a link; only the list
// itself says the menu is what it should be. Any change to a side menu has to
// change this list in the same commit. Pipeline and Offers left the employer
// menu on 15 Nov 2026 (design 25 branch 2; both redirect to /applied).
const menuItems = (src: string) =>
  Array.from(src.matchAll(/label:\s*'([^']+)',\s*\r?\n\s*href:\s*([^\r\n]+?),?\s*\r?\n/g)).map(m => `${m[1]} -> ${m[2].trim()}`)
check('the employer side menu is exactly these items, in this order',
  () => menuItems(employerSidebar),
  [
    'Dashboard -> \'/employer/dashboard\'',
    'Applicants -> \'/applied\'',
    'Interviews -> \'/interviews\'',
    'Manage Job Ads -> \'/my-jobs\'',
    'Post Job -> \'/post-job\'',
    'Shifts -> \'/temp-work\'',
    'Candidates -> \'/candidates\'',
    'Talent Pool -> \'/talent-pool\'',
    'Insights -> \'/dashboard/analytics\'',
    'Browse Jobs -> \'/jobs\'',
    'My Reviews -> companyName ? `/company/${encodeURIComponent(companyName)}` : \'/reviews\'',
  ])
check('the candidate side menu is exactly these items, in this order',
  () => menuItems(candidateSidebar),
  [
    'Search Jobs -> \'/jobs\'',
    'Recommended -> \'/jobs/recommended\'',
    'Shifts -> \'/temp-work\'',
    'Saved Jobs -> \'/saved-jobs\'',
    'My Applications -> \'/applications\'',
    'Messages -> \'/messages\'',
    'CV Builder -> \'/cv-builder\'',
    'Notifications -> \'/notifications\'',
    'Company Reviews -> \'/reviews\'',
  ])
// The item parser is what the two lists above are measured with; it must see
// every `label:` in the file, or a new item written in a shape it does not
// recognise would slip past both. Same count, not a floor.
check('ZERO-GUARD: the item parser sees every label in both side menus',
  // Counted ANYWHERE on a line: the first version counted only labels at the
  // start of a line, and an item written on one line before an existing one
  // pushed that one's label off the line start, so both counts stayed equal.
  () => [menuItems(employerSidebar).length === (employerSidebar.match(/\blabel:\s*'/g) || []).length,
         menuItems(candidateSidebar).length === (candidateSidebar.match(/\blabel:\s*'/g) || []).length],
  [true, true])

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

// The rows standing in for an older app's missing tabs are left out: their
// pages ARE slots of the bar (Messages, Calendar) and light themselves.
check('a page reached from More keeps More lit',
  () => moreOwnHrefs(EMPLOYER_MORE).filter(h => activeSlot('employer', h) !== 'More'), [])

check('and Your job ads, and the Post a job it leads to, are reached from More',
  () => [activeSlot('employer', '/my-jobs'), activeSlot('employer', '/post-job')], ['More', 'More'])

check('a page reached from Profile keeps Profile lit',
  () => rowHrefs(CANDIDATE_PROFILE).filter(h => activeSlot('candidate', h) !== 'Profile'), [])

// ── WHERE THE BAR STEPS ASIDE ──────────────────────────────────────────────
// '/job' must hide the bar on an advert (its Apply bar owns the foot) and
// must NOT swallow '/jobs', the board.

check('pushed pages hide the bar; the board does not',
  () => [barHiddenOn('/job/abc'), barHiddenOn('/post-job'), barHiddenOn('/jobs'), barHiddenOn('/jobs/recommended')],
  [true, true, false, false])

check('the app\'s "‹ More" link: on a More page, not on /messages, /calendar or a settings sub-page',
  () => [moreBackShownOn('/candidates', null), moreBackShownOn('/my-jobs', null), moreBackShownOn('/messages', null),
         moreBackShownOn('/calendar', null), moreBackShownOn('/settings/team', null)],
  [true, true, false, false, false])

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

// ── THE APP'S NATIVE TABS (build 31 on) AGREE WITH THE WEBSITE'S BAR ───────
// The same five slots live in Swift and in TypeScript, and nothing compiles
// one against the other. Parsed from ThriveRootViewController.swift.

const rootSwift = read('ios/App/App/ThriveRootViewController.swift')
const employerTabsSwift = (() => {
  const start = rootSwift.indexOf('private static let employerTabs: [Tab] = [')
  const end = rootSwift.indexOf('\n    ]', start)
  if (start < 0 || end < 0) return []
  const block = rootSwift.slice(start, end)
  return Array.from(block.matchAll(/Tab\(title: "([^"]+)", symbol: "[^"]+", path: "([^"]+)",\s*matches: \[([^\]]*)\]/g))
    .map(m => ({ title: m[1], path: m[2], matches: Array.from(m[3].matchAll(/"([^"]+)"/g)).map(x => x[1]) }))
})()

check('ZERO-GUARD: the Swift employer tabs parse',
  () => employerTabsSwift.length, 5)

check('the app\'s employer tabs are the website\'s bar: same titles, same pages, same order',
  () => JSON.stringify(employerTabsSwift.map(t => [t.title, t.path])) === JSON.stringify(EMPLOYER_BAR.map(s => [s.label, s.href])),
  true)

check('and the app\'s More tab lights on exactly the pages the website\'s More slot does',
  () => {
    const swiftMore = employerTabsSwift.find(t => t.title === 'More')?.matches ?? []
    const webMore = EMPLOYER_BAR.find(s => s.label === 'More')!
    const want = Array.from(new Set([webMore.href, ...webMore.match])).sort()
    // The app matches by prefix (currentPath.hasPrefix), so '/settings' there
    // covers '/settings/company' here.
    const covered = (h: string) => swiftMore.some(m => h === m || h.startsWith(m + '/'))
    return { missingInApp: want.filter(h => !covered(h)), extraInApp: swiftMore.filter(m => !want.includes(m)) }
  },
  { missingInApp: [], extraInApp: [] })

check('the next build\'s badges read the endpoint that exists',
  () => /ThriveAPI\.get\("\/me\/unread"/.test(rootSwift) && existsSync(join(ROOT, 'app/api/app/me/unread/route.ts')),
  true)

check('badges: Messages carries unread messages, More carries notifications (app); More has none on the website',
  () => ({
    app: /tab\.path == "\/messages" \{ items\[i\]\.badgeValue = label\(unreadMessages\) \}/.test(rootSwift) &&
         /tab\.path == "\/employer\/more" \{ items\[i\]\.badgeValue = label\(unreadNotifications\) \}/.test(rootSwift),
    webMessages: EMPLOYER_BAR.find(s => s.label === 'Messages')?.badge ?? null,
    webMore: EMPLOYER_BAR.find(s => s.label === 'More')?.badge ?? null,
  }),
  { app: true, webMessages: 'messages', webMore: null })

// ── THE APP IN PEOPLE'S HANDS HAS FEWER TABS THAN THE NEXT ONE ─────────────
// Design 25, decision 1. Build 30's employer tabs are Home · Job ads ·
// Applicants · More (read from 3595eed, the main it was built from; a shipped
// binary cannot change, so this record cannot go stale). Any slot of the
// website's bar that build 30 does not draw must have a stand-in row on More,
// or an employer in build 30 cannot reach that page at all.

const BUILD_30_EMPLOYER_TABS = ['home', 'job ads', 'applicants', 'more']
const moreRows = EMPLOYER_MORE.flatMap(g => g.rows)

check('every slot build 30 lacks has a stand-in row on More, keyed by that tab',
  () => EMPLOYER_BAR
    .filter(s => !BUILD_30_EMPLOYER_TABS.includes(s.label.toLowerCase()))
    .filter(s => !moreRows.some(r => r.href === s.href && r.onlyInAppWithout === s.label.toLowerCase()))
    .map(s => s.label),
  [])

check('ZERO-GUARD: there is at least one such slot to check (Messages, Calendar)',
  () => EMPLOYER_BAR.filter(s => !BUILD_30_EMPLOYER_TABS.includes(s.label.toLowerCase())).map(s => s.label),
  ['Calendar', 'Messages'])

// The keys only work if the app sends the same words: build 31 sends its tab
// titles, lowercased. Assert the AGREEMENT between the row keys and the titles.
check('and the app declares those tabs by the same names the rows are keyed on',
  () => {
    const titles = employerTabsSwift.map(t => t.title.toLowerCase())
    const keys = Array.from(new Set(moreRows.map(r => r.onlyInAppWithout).filter(Boolean)))
    return {
      sendsTitles: /bridge\.setNativeNav\(true, tabs: wanted\.map \{ \$0\.title\.lowercased\(\) \}/.test(rootSwift),
      keysNotInApp: keys.filter(k => !titles.includes(k as string)),
    }
  },
  { sendsTitles: true, keysNotInApp: [] })

check('the bridge writes the list onto <html> and restores it before each page draws',
  () => [
    /d\.setAttribute\('data-native-tabs','\\\(list\)'\)/.test(swift),
    /sessionStorage\.getItem\('thriveNativeTabs'\)/.test(swift) && /setAttribute\('data-native-tabs',t\)/.test(swift),
  ],
  [true, true])

check('the More page marks each stand-in row, and the stylesheet acts on the mark',
  () => {
    // Read here: the shared `globals` below is declared later in the file.
    const css = noComments(read('app/globals.css'))
    const keys = Array.from(new Set(moreRows.map(r => r.onlyInAppWithout).filter(Boolean))) as string[]
    const shows = (k: string) => new RegExp(
      `html\\.native-nav:not\\(\\[data-native-tabs~='${k}'\\]\\) \\[data-only-app-without='${k}'\\]`).test(css)
    return {
      marked: /data-only-app-without=\{row\.onlyInAppWithout\}/.test(noComments(read('components/NavMenuPage.tsx'))),
      hiddenByDefault: /\[data-only-app-without\]\s*\{\s*display:\s*none;?\s*\}/.test(css),
      shownOnlyWhereMissing: keys.filter(k => !shows(k)),
    }
  },
  { marked: true, hiddenByDefault: true, shownOnlyWhereMissing: [] })

check('the native Profile rows open pages that exist (Notifications, Ask Thrive, Share feedback)',
  () => {
    const prof = read('ios/App/App/ThriveProfile.swift')
    const want = [['Notifications', '/notifications'], ['Ask Thrive', '/support?ask=1'], ['Share feedback', '/feedback']]
    return want.filter(([label, path]) => !prof.includes(`plainRow("${label}") { store.openWeb("${path}", "Profile") }`) || !routeExists(path))
      .map(([l]) => l)
  },
  [])

check('and ?ask=1 really opens the chat',
  () => /get\('ask'\) === '1'/.test(noComments(read('components/ChatBot.tsx'))), true)

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

// ── CLAUDE DESIGN'S REVIEW OF BRANCH 1 (15 Nov 2026) ───────────────────────
// Values the review asked for, held here so they cannot drift back.

check('iPad More: left column Notifications then Account, right column Hiring then Help',
  () => (['left', 'right'] as const).map(side =>
    EMPLOYER_MORE.filter(g => g.side === side).map(g => g.heading ?? 'Notifications')),
  [['Notifications', 'Account'], ['Hiring', 'Help']])

check('and every More group names its side, or one would fall into the wrong column',
  () => EMPLOYER_MORE.filter(g => !g.side).length, 0)

check('a row with a second line is 56 tall',
  () => {
    const tsx = noComments(read('components/NavMenuPage.tsx'))
    const css = noComments(read('components/NavMenuPage.module.css'))
    return /row\.subline \? styles\.rowTall/.test(tsx) && /\.rowTall\s*\{\s*min-height:\s*56px/.test(css)
  },
  true)

check('the bar\'s count is 18 round, Inter 700 11',
  () => {
    const badge = (barCssRaw().match(/\.badge\s*\{[^}]*\}/) || [''])[0]
    return [/min-width:\s*18px/, /height:\s*18px/, /font-size:\s*11px/, /font-weight:\s*700/].map(r => r.test(badge))
  },
  [true, true, true, true])

check('Messages: the unread count is the bar\'s red and hangs under the date',
  () => {
    const css = noComments(read('app/messages/page.module.css'))
    const badge = (css.match(/\.unreadBadge\s*\{[^}]*\}/) || [''])[0]
    const tsx = read('app/messages/page.tsx')
    const meta = tsx.slice(tsx.indexOf('className={styles.conversationMeta}'), tsx.indexOf('className={styles.conversationMeta}') + 600)
    return { red: /background:\s*#DC2626/i.test(badge), underDate: /top:\s*calc\(100% \+ 4px\)/.test(badge), insideMeta: meta.includes('styles.unreadBadge') }
  },
  { red: true, underDate: true, insideMeta: true })

// The FAMILY, and only the family: the `font` shorthand also handed every
// control the page's line-height and moved 415 of 1,077 controls (15 Nov
// 2026, measured before merging). Asserting the shorthand is absent stops
// someone "completing" the rule into the version that was measured and refused.
check('form controls take the page\'s typeface, and nothing else (no platform serif on buttons and inputs)',
  () => {
    const css = noComments(read('app/globals.css'))
    return {
      family: /button,\s*input,\s*select,\s*textarea\s*\{\s*font-family:\s*inherit;?\s*\}/.test(css),
      shorthand: /button,\s*input,\s*select,\s*textarea\s*\{\s*font:\s*inherit/.test(css),
    }
  },
  { family: true, shorthand: false })

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

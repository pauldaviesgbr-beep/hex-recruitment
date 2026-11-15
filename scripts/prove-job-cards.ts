// npm run jobcards:prove
//
// THE TEXT-LED JOB CARDS (design_handoff_job_cards_text_led, 16 Oct 2026;
// design 25, 15 Nov 2026: no images anywhere jobs appear, website and app).
// Filesystem only. It IMPORTS the card model rather than restating it.
//
// The check that matters most is the CLASS check at the bottom: every file that
// draws a job for a candidate is listed, and none may render an image, a logo
// or a banner. A surface added later that draws a job must be added to the list
// — the list is exact, not a floor.

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { readdirSync, statSync } from 'node:fs'
import * as jobCard from '../lib/jobCard'
import { jobPay, jobPayText, jobRowModel, primaryEmploymentType } from '../lib/jobCard'
import { shiftPay, shiftPlace, formatWhen, byStartDate, type TempPost } from '../lib/tempWork'
import { appPay } from '../lib/appApi'
// @ts-ignore — a plain .mjs (shared with the drive); tsx loads it as-is
import { tabOf } from '../lib/jobAdTabs.mjs'

const ROOT = join(__dirname, '..')
const read = (rel: string) => readFileSync(join(ROOT, rel), 'utf8')
const noComments = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '').replace(/\{\/\*[\s\S]*?\*\/\}/g, '')

let failed = 0, ran = 0
const check = (name: string, got: () => unknown, want: unknown) => {
  ran++
  let v: unknown
  try { v = got() } catch (err) { console.log(`FAIL  ${name}\n        threw: ${(err as Error).message}`); failed++; return }
  const a = JSON.stringify(v), b = JSON.stringify(want)
  if (a !== b) { console.log(`FAIL  ${name}\n        want ${b}\n        got  ${a}`); failed++ } else console.log(`ok    ${name}`)
}

// ── PAY: amount bold, period in words, nothing when there is no pay ────────
check('annual pay in thousands, en dash, "a year"', () => jobPayText(jobPay({ salaryMin: 50000, salaryMax: 60000, salaryPeriod: 'year' })), '£50k–£60k a year')
check('hourly pay keeps its pence, "an hour"', () => jobPayText(jobPay({ salaryMin: 16.95, salaryMax: 16.95, salaryPeriod: 'hour' })), '£16.95 an hour')
check('NO PAY → no pay line at all (never "Competitive")', () => jobPay({ salaryMin: 0, salaryMax: 0, salaryPeriod: 'year' }), null)
check('above zero, not merely present: a literal 0 is no pay', () => [jobPay({ salaryMin: null, salaryMax: 0 }), jobPayText(jobPay({ salaryMin: 0, salaryMax: 32000, salaryPeriod: 'year' }))], [null, '£32k a year'])
check('two figures that print the same are one figure: never "£42k–£42k"', () => jobPayText(jobPay({ salaryMin: 42000, salaryMax: 42050, salaryPeriod: 'year' })), '£42k a year')
// Design 26 follow-up: CARD PAY MUST NOT ROUND. £41,800 printed "£42k" on the
// card beside "£41,800 a year" on the advert. One decimal when not a whole
// thousand, truncated (never rounded up), and the app reads the same rule.
check('card pay never rounds: "£41.8k", "£41.8k–£48k", whole thousands stay "£42k", and nothing rounds UP to a whole thousand', () => [
  jobPayText(jobPay({ salaryMin: 41800, salaryMax: 41800, salaryPeriod: 'year' })),
  jobPayText(jobPay({ salaryMin: 41800, salaryMax: 48000, salaryPeriod: 'year' })),
  jobPayText(jobPay({ salaryMin: 42000, salaryMax: 42000, salaryPeriod: 'year' })),
  jobPayText(jobPay({ salaryMin: 41960, salaryMax: 41960, salaryPeriod: 'year' })),
  jobPayText(jobPay({ salaryMin: 41800, salaryMax: 42000, salaryPeriod: 'year' })),
  // Agreed (design 26, round 3): under £100 above a thousand reads as the
  // thousand — "£41k", never "£41.0k".
  jobPayText(jobPay({ salaryMin: 41050, salaryMax: 41050, salaryPeriod: 'year' })),
], ['£41.8k a year', '£41.8k–£48k a year', '£42k a year', '£41.9k a year', '£41.8k–£42k a year', '£41k a year'])
check('the app\'s pay (lib/appApi appPay) follows the same rule, through the same function', () => [
  appPay({ salary_min: 41800, salary_max: 48000, salary_type: 'annual' }).payShort,
  appPay({ salary_min: 42000, salary_max: 42000, salary_type: 'annual' }).payShort,
  /payThousands/.test(noComments(read('lib/appApi.ts'))) && !/toFixed\(0\)\}k/.test(noComments(read('lib/appApi.ts'))),
], ['£41.8k–£48k', '£42k', true])
check('a draft with no period yet shows the figure and claims no period', () => jobPayText(jobPay({ salaryMin: 30000, salaryMax: 30000, salaryPeriod: null })), '£30,000')

// ── THE ROW MODEL: role → pay → place · type → via {recruiter} · age ──────
const job = {
  id: 'j1', title: 'Head Chef Events', company: 'Collins King & Associates', salaryMin: 50000, salaryMax: 60000, salaryPeriod: 'year',
  location: 'London', area: 'London E9', employmentType: ['Full-time'], postedAt: 'Today', tags: [],
} as any
check('the row model carries the spec\'s fields, in its order', () => {
  const m = jobRowModel(job)
  return [m.title, jobPayText(m.pay), m.place, m.type, m.via, m.age, m.isNew]
}, ['Head Chef Events', '£50k–£60k a year', 'London E9', 'Full-time', 'via Collins King & Associates', 'Today', true])
check('NEW is the last 48 hours: Today and Yesterday, not "2 days ago"',
  () => ['Today', 'Yesterday', '2 days ago', ''].map(postedAt => jobRowModel({ ...job, postedAt }).isNew), [true, true, false, false])

// ── THE 1b ROW ─────────────────────────────────────────────────────────────
const rowTsx = noComments(read('components/JobRow.tsx'))
const rowCss = noComments(read('components/JobRow.module.css'))
const rule = (name: string) => (rowCss.match(new RegExp(`\\.${name}\\s*\\{[^}]*\\}`)) || [''])[0]
check('the row reads the shared model (no formatting of its own)', () => /jobRowModel\(job\)/.test(rowTsx) && !/formatJobSalary|formatMoney/.test(rowTsx), true)
check('below 768: line 2 pay · place, line 3 type · age; from 768: line 2 adds type, line 3 is via · age', () => {
  const narrow = rowTsx.split('styles.narrowOnly').length - 1, wide = rowTsx.split('styles.wideOnly').length - 1
  return { narrow, wide, viaOnlyWide: rowTsx.indexOf('{m.via}') > rowTsx.lastIndexOf('styles.narrowOnly') }
}, { narrow: 2, wide: 2, viaOnlyWide: true })
check('measured spec: title 600 18 (19 from 768) wraps; pay 700 tabular; line 3 14px', () => ({
  title18: /font-size:\s*18px/.test(rule('title')) && /font-weight:\s*600/.test(rule('title')) && !/text-overflow/.test(rule('title')),
  title19: /@media \(min-width: 768px\) \{ \.title \{ font-size: 19px; \} \}/.test(rowCss),
  pay: /font-weight:\s*700/.test(rule('pay')) && /tabular-nums/.test(rule('pay')),
  line3: /font-size:\s*14px/.test(rule('line3')),
}), { title18: true, title19: true, pay: true, line3: true })
check('NEW chip: Inter 600 13, .06em, navy on #EEF0F4, radius 6 — not yellow', () => {
  const r = rule('newChip')
  return [/font-size:\s*13px/.test(r), /letter-spacing:\s*0\.06em/.test(r), /background:\s*#EEF0F4/i.test(r), /border-radius:\s*6px/.test(r), !/FFE500/i.test(r)]
}, [true, true, true, true, true])
check('Save is a separate 44×44 target above the stretched row button — ONE button, shared by the row and the 1a card', () => {
  const saveCss = noComments(read('components/SaveJobButton.module.css'))
  const saveTsx = noComments(read('components/SaveJobButton.tsx'))
  const s = (saveCss.match(/\.save\s*\{[^}]*\}/) || [''])[0]
  const cardTsx2 = noComments(read('components/JobCardLink.tsx'))
  return [/width:\s*44px/.test(s) && /height:\s*44px/.test(s), /z-index:\s*1/.test(s), /\.main::after\s*\{[^}]*position:\s*absolute;\s*inset:\s*0/.test(rowCss), /e\.stopPropagation\(\)/.test(saveTsx), /<SaveJobButton/.test(rowTsx) && /<SaveJobButton/.test(cardTsx2), /<svg/.test(rowTsx)]
}, [true, true, true, true, true, false])
check('the list: full width below 768; one 760 box, border, radius 16 from 768', () =>
  /@media \(min-width: 768px\) \{\s*\.list \{[^}]*max-width:\s*760px;[^}]*border:\s*1px solid #DFE3EA;[^}]*border-radius:\s*16px/.test(rowCss), true)

// ── WHERE IT IS USED ───────────────────────────────────────────────────────
check('the board\'s JobCard IS the 1b row now', () => {
  const c = noComments(read('components/JobCard.tsx'))
  return [/<JobRow/.test(c), /FeedCard/.test(c)]
}, [true, false])
check('the board lays the rows in the 1b list, not the old photo grid', () => {
  const p = read('app/jobs/page.tsx')
  return [/className=\{rowStyles\.list\}/.test(p), /className=\{styles\.jobsGrid\}/.test(p)]
}, [true, false])

// ── THE CLASS CHECK: no job surface renders an image ───────────────────────
// Exact list of the files that draw a job for a candidate and are DONE. Every
// surface finished on this branch is added here; the rest are named in
// PENDING so the gap is visible rather than forgotten.
// What RENDERS an image — an element, an image component, a background, or the
// banner resolver — not a field name: the apply flow passes companyLogo as the
// new conversation's avatar, which is messaging data, not a picture of the job.
const IMAGE = /<img\b|<Image\b|<SignedImage|<CompanyLogo|<BrandedJobFallback|backgroundImage|background-image|resolveJobBanner\(/
const DONE = [
  'components/JobRow.tsx', 'components/JobCard.tsx',
  // step 2: the advert views
  'app/job/[id]/page.tsx', 'app/jobs/page.tsx', 'components/JobDetailModal.tsx', 'components/ApplyNowModal.tsx',
  // step 3: the list-and-detail pages, now 1b rows
  'app/jobs/sector/[sector]/page.tsx', 'app/jobs/[city]/page.tsx', 'app/jobs/recommended/page.tsx', 'app/saved-jobs/page.tsx',
  // step 4: the 1a card, and the small lists that use it (both dashboards)
  'components/JobTypeCard.tsx', 'components/JobCardLink.tsx',
  // round 2 (design 26): the shared Save, the Shifts feed and its shift row,
  // the employer's manage view and its card, and the home page's role cards
  'components/SaveJobButton.tsx', 'components/ShiftRow.tsx', 'app/temp-work/page.tsx',
  'components/ManageCard.tsx', 'app/temp-work/manage/page.tsx', 'app/page.tsx', 'app/HomeClient.tsx',
  // design 26, C: the employer's job ads
  'app/my-jobs/page.tsx',
]

// ── THE 1a CARD ────────────────────────────────────────────────────────────
const cardTsx = noComments(read('components/JobTypeCard.tsx'))
const cardCss = noComments(read('components/JobTypeCard.module.css'))
const crule = (name: string) => (cardCss.match(new RegExp(`\\.${name}\\s*\\{[^}]*\\}`)) || [''])[0]
check('the 1a card reads the same model as the row (one family, cannot drift)', () => /jobRowModel\(job\)/.test(cardTsx) && !/formatJobSalary|formatMoney|function formatSalary/.test(cardTsx), true)
check('1a measured spec: card radius 16, 1px #DFE3EA, padding 20 12 18 22 (18 8 16 18 below 768); title 700, 23 (22 below 768), −0.02em', () => ({
  card: /border-radius:\s*16px/.test(crule('card')) && /border:\s*1px solid #DFE3EA/i.test(crule('card')) && /padding:\s*18px 8px 16px 18px/.test(crule('card')),
  wide: /@media \(min-width: 768px\) \{\s*\.card \{ padding: 20px 12px 18px 22px; \}/.test(cardCss),
  title: /font-size:\s*22px/.test(crule('title')) && /font-weight:\s*700/.test(crule('title')) && /letter-spacing:\s*-0\.02em/.test(crule('title')),
  title23: /@media \(min-width: 768px\) \{ \.title \{ font-size: 23px; \} \}/.test(cardCss),
}), { card: true, wide: true, title: true, title23: true })
check('1a pay: 700 20 tabular, period 400 16, baseline-aligned; footer at least 44 under a hairline', () => [
  /font-size:\s*20px/.test(crule('pay')) && /font-weight:\s*700/.test(crule('pay')) && /tabular-nums/.test(crule('pay')),
  /font-size:\s*16px/.test(crule('period')) && /font-weight:\s*400/.test(crule('period')),
  /align-items:\s*baseline/.test(crule('payLine')),
  /min-height:\s*44px/.test(crule('footer')) && /border-top:\s*1px solid #EEF0F4/i.test(crule('footer')),
], [true, true, true, true])
check('the dashboards\' small-list card IS the 1a card (no image-led markup, no seventh salary formatter)', () => {
  const l = noComments(read('components/JobCardLink.tsx'))
  return [/<JobTypeCard/.test(l), /jobStyles|cardScrim|function formatSalary/.test(l)]
}, [true, false])
// Design 26: the card's TITLE is the link, stretched over the card, so Save
// (corner) and "Not interested" (footer) are real buttons beside it — not
// buttons inside an <a>, and no grey × floating over the title.
check('the 1a card: title link stretched over the card; Save in the corner; "Not interested" a footer text button; the × gone', () => {
  const l = noComments(read('components/JobCardLink.tsx'))
  const dash = noComments(read('app/dashboard/page.tsx'))
  const emp = noComments(read('app/employer/dashboard/page.tsx'))
  return [
    /\.titleLink::after\s*\{[^}]*position:\s*absolute;\s*inset:\s*0/.test(cardCss),
    /<Link\b/.test(l),
    /onToggleSave=\{j => toggleSave\(j\.id\)\}/.test(dash) && /onNotInterested=/.test(dash),
    /recDismiss|&times;/.test(dash + read('app/dashboard/page.module.css')),
    /applicant\$\{/.test(emp) && !/apps ·/.test(emp),
  ]
}, [true, false, true, false, true])

// ── THE SHIFT ROW (design 26, round 2, B) ──────────────────────────────────
// Imports the rules (lib/tempWork) rather than restating them.
const shift = { hourly_rate: 130, rate_type: 'day', location_area: 'Manchester', postcode: 'm2 4ab', is_ongoing: false, date_from: '2026-11-25', date_to: '2026-11-27', start_time: '11:00:00', end_time: '23:00:00' } as unknown as TempPost
check('shift pay is bold-able text with the period in words; a literal 0 is no pay', () =>
  [shiftPay(shift), shiftPay({ hourly_rate: 12.5, rate_type: 'hour' } as any), shiftPay({ hourly_rate: 0, rate_type: 'hour' } as any)],
  [{ amount: '£130', period: 'a day' }, { amount: '£12.50', period: 'an hour' }, null])
check('the place is the town then the postcode\'s outward part ("Manchester M2")', () => shiftPlace(shift), 'Manchester M2')
check('the shift row\'s date line: no weekday, en dash, "Ongoing, flexible" — and the email/Shifts-box form is unchanged', () => [
  formatWhen(shift, { weekday: false, ongoing: 'Ongoing, flexible' }),
  formatWhen({ ...shift, date_to: null, start_time: '10:00:00', end_time: '17:00:00', date_from: '2026-11-30' } as any, { weekday: false, ongoing: 'Ongoing, flexible' }),
  formatWhen({ ...shift, is_ongoing: true } as any, { weekday: false, ongoing: 'Ongoing, flexible' }),
  formatWhen({ ...shift, date_to: null, start_time: '10:00:00', end_time: '17:00:00', date_from: '2026-11-30' } as any),
], ['25–27 Nov · 11:00–23:00', '30 Nov · 10:00–17:00', 'Ongoing, flexible', 'Mon 30 Nov · 10:00–17:00'])
check('posted shifts sort by start date, soonest first; ongoing ones after the dated', () => {
  const p = (id: string, date_from: string | null, is_ongoing = false) => ({ id, date_from, is_ongoing, created_at: '2026-11-01T00:00:00Z' }) as unknown as TempPost
  return [p('late', '2026-12-05'), p('ongoing', null, true), p('soon', '2026-11-20')].sort(byStartDate).map(x => x.id)
}, ['soon', 'late', 'ongoing'])
check('the Shifts feed: ONE list, two labelled groups, open shifts only, examples on test builds only, shift rows not photo cards', () => {
  const tw = noComments(read('app/temp-work/page.tsx'))
  return [
    /className=\{rowStyles\.list\}/.test(tw),
    /Posted shifts · \{shiftList\.length\}/.test(tw) && /Short-term jobs · \{jobList\.length\}/.test(tw),
    /\.eq\('status', 'open'\)/.test(tw) && !/status\.eq\.filled/.test(tw),
    /const usingExamples = previewAllowed &&/.test(tw),
    /<ShiftRow\b/.test(tw) && !/<FeedCard\b/.test(tw),
  ]
}, [true, true, true, true, true])
check('"I\'m available" is outlined, not yellow; once tapped, navy with a yellow tick', () => {
  const css = noComments(read('components/ShiftRow.module.css'))
  const btn = (css.match(/\.availBtn\s*\{[^}]*\}/) || [''])[0], on = (css.match(/\.availOn\s*\{[^}]*\}/) || [''])[0]
  return [/inset 0 0 0 1\.5px #0F172A/.test(btn), /FFE500|primary-yellow/i.test(btn), /background:\s*#0F172A/.test(on)]
}, [true, false, true])
check('the employer\'s manage card ships with Mark filled and Close only (Edit, Duplicate, Post again hidden until built)', () => {
  const mg = noComments(read('app/temp-work/manage/page.tsx'))
  return [/<ManageCard\b/.test(mg), /'Mark filled'/.test(mg), /'Close'/.test(mg), /Edit shift|Duplicate|Post again/.test(mg), /\{m\.needed\} · \{avail\.length\} available/.test(mg)]
}, [true, true, true, false, true])
check('no advert view or card says "Competitive salary" or builds its own "per year" pay text', () =>
  DONE.filter(f => { const s = noComments(read(f)); return /'Competitive salary'|per year`|per hour`/.test(s) }), [])

// ── ROUND 2 ANSWERS (design 26, second reply) ──────────────────────────────
check('the home card\'s one type is picked by meaning: Temporary, Part-time, Full-time, Fixed-term, Contract; Flexible only alone', () =>
  [['Flexible', 'Temporary'], ['Full-time', 'Permanent'], ['Flexible'], ['Flexible', 'Permanent'], ['Full-time', 'Part-time'], ['Contract', 'Fixed-term'], []].map(t => primaryEmploymentType(t)),
  ['Temporary', 'Full-time', 'Flexible', 'Permanent', 'Part-time', 'Fixed-term', null])
check('the advert pages show whole figures; cards and rows keep the short form', () => [
  jobPayText(jobPay({ salaryMin: 42000, salaryMax: 48000, salaryPeriod: 'year' }, { full: true })),
  jobPayText(jobPay({ salaryMin: 17.85, salaryMax: 20, salaryPeriod: 'hour' }, { full: true })),
  jobPayText(jobPay({ salaryMin: 42000, salaryMax: 48000, salaryPeriod: 'year' })),
], ['£42,000–£48,000 a year', '£17.85–£20 an hour', '£42k–£48k a year'])
check('every advert view asks for the full form, and none for the short one', () => {
  const ADVERTS = ['app/job/[id]/page.tsx', 'app/jobs/page.tsx', 'components/JobDetailModal.tsx', 'app/saved-jobs/page.tsx', 'app/jobs/recommended/page.tsx', 'app/jobs/sector/[sector]/page.tsx', 'app/jobs/[city]/page.tsx']
  return ADVERTS.filter(f => { const s = noComments(read(f)); return !/jobPay\(\w+, \{ full: true \}\)/.test(s) || /jobPay\((job|selectedJob)\)/.test(s) })
}, [])
check('pay is required: no "hide salary" option or tag on post-job, its preview uses the shared formatter, and formatJobSalary is gone', () => {
  const pj = noComments(read('app/post-job/page.tsx'))
  return [/hideSalary|Pay on application|'Competitive salary'/.test(pj), /jobPay\(draftJob, \{ full: true \}\)/.test(pj), 'formatJobSalary' in jobCard]
}, [false, true, false])
// The phrase anywhere a stranger can meet it — page copy, a prompt, a fallback —
// not only in the files this branch touched. Comments are allowed to name it.
check('"Competitive" appears in no string anywhere in app, components or lib', () => {
  const walk = (dir: string): string[] => readdirSync(join(ROOT, dir)).flatMap(n => {
    const rel = `${dir}/${n}`
    return statSync(join(ROOT, rel)).isDirectory() ? walk(rel) : /\.(ts|tsx)$/.test(n) ? [rel] : []
  })
  const files = ['app', 'components', 'lib'].flatMap(walk)
  return { scanned: files.length > 200, hits: files.filter(f => /['"`][^'"`\n]*\bCompetitive\b/.test(noComments(read(f)))) }
}, { scanned: true, hits: [] })
// ── JOB ADS, /my-jobs (design 26, C) ───────────────────────────────────────
check('the three tabs partition every status: paused is live; closed is archived; filled is filled', () =>
  (['active', 'paused', 'filled', 'closed', 'archived'] as const).map(s => tabOf(s)),
  ['live', 'live', 'filled', 'archived', 'archived'])
check('/my-jobs: Live · Filled · Archived on the shared ManageCard, counts from the same list, no applicant-stage tabs, no FeedCard, no images', () => {
  const mj = noComments(read('app/my-jobs/page.tsx'))
  return [
    /<ManageCard\b/.test(mj) && !/<FeedCard\b/.test(mj),
    /(\['live', 'filled', 'archived'\] as const)/.test(mj) && /c\[tabOf\(j\.status\)/.test(mj) && /\.filter\(j => tabOf\(j\.status\) === activeTab\)/.test(mj),
    /key: 'interviewing'|key: 'offers'|key: 'hired'|detailedOffers|rawInterviews/.test(mj),
    IMAGE.test(mj),
    />Job ads<\/h1>/.test(mj) && /aria-label=\{searchOpen \? 'Close search' : 'Search job ads'\}/.test(mj),
  ]
}, [true, true, false, false, true])
check('/my-jobs: no pay shows "Add the pay" ON A LIVE AD ONLY (opening the editor on the pay field), and the quick editor requires pay', () => {
  const mj = noComments(read('app/my-jobs/page.tsx')), qe = noComments(read('components/QuickEditJobModal.tsx'))
  return [
    /Add the pay/.test(mj) && /setEditFocus\('pay'\)/.test(mj) && /focusField=\{editFocus\}/.test(mj),
    // round 3: filled and archived cards leave the pay out
    /\{!pay && isLiveTab && </.test(mj),
    /payRef/.test(qe) && /!\(values\.salaryMin > 0\)/.test(qe),
  ]
}, [true, true, true])
// Design 26, round 3. "Post again" (the shift card's word) starts a COPY in
// the post-job form — the old Reuse inserted it onto the board behind a
// confirm box, skipping the pay rule. "Make live again" revives the SAME ad.
check('/my-jobs: filled and archived ads say "Post again", which opens a copy in the form; nothing on the page inserts an advert; "Make live again", never "Reuse" or "Reactivate"', () => {
  const mj = noComments(read('app/my-jobs/page.tsx'))
  return [
    /label: 'Post again', onClick: \(\) => handlePostAgain\(job\)/.test(mj) && /router\.push\(`\/post-job\?copy=\$\{job\.id\}`\)/.test(mj),
    /\.from\('jobs'\)\s*\.insert\(/.test(mj),
    /label: 'Make live again'/.test(mj),
    /label: '(Reuse|Reactivate)'/.test(mj),
  ]
}, [true, false, true, false])
check('post-job ?copy=: this employer\'s own ad only, a NEW advert (fresh reference, no expiry), never the saved draft, applied once', () => {
  const pj = noComments(read('app/post-job/page.tsx'))
  return [
    /const copyId = searchParams\.get\('edit'\) \? null : searchParams\.get\('copy'\)/.test(pj),
    /\.eq\('id', copyId\)\.eq\('employer_id', ownerId\)/.test(pj),
    /jobReference: '',\s*expiresAt: '',/.test(pj),
    /if \(!stepped \|\| restored \|\| copyId\) return/.test(pj),
    /if \(asCopy\) setCopySource\(null\)/.test(pj),
    // a copy never switches the form into edit mode
    /if \(editId\) \{\s*setIsEditMode\(true\)/.test(pj),
    // a stored 0 fills an EMPTY pay box (the form then asks), never "0"
    /salaryMin: jobToEdit\.salaryMin && jobToEdit\.salaryMin > 0 \? String\(jobToEdit\.salaryMin\) : ''/.test(pj) && !/salaryMin: jobToEdit\.salaryMin\?\.toString\(\)/.test(pj),
    // a copy is not autosaved, so it never claims to be: no "Saving as you go",
    // no "Save & finish later"
    /: copyId\s*\?\s*\{ kind: 'saving', text: 'Copy · not saved yet' \}/.test(pj) && /\{copyId \? 'Cancel' : <>Save &amp; finish later<\/>\}/.test(pj),
  ]
}, [true, true, true, true, true, true, true, true])
check('the manage card\'s ⋯: a danger item goes LAST, red #B42318, below a divider; Remove ad is the danger item', () => {
  const mc = noComments(read('components/ManageCard.tsx')), css = noComments(read('components/ManageCard.module.css')), mj = noComments(read('app/my-jobs/page.tsx'))
  return [
    /\[\.\.\.menu\.filter\(a => !a\.danger\), \.\.\.menu\.filter\(a => a\.danger\)\]/.test(mc) && /role="separator"/.test(mc),
    /\.menuDanger\s*\{\s*color:\s*#B42318;?\s*\}/.test(css) && /\.menuSep\s*\{[^}]*background:\s*#EEF0F4/.test(css),
    /label: 'Remove ad', onClick: \(\) => setRemoveTarget\(job\), danger: true/.test(mj),
  ]
}, [true, true, true])
// Round 4: Make live again on an ad with no pay takes the "Add the pay" path —
// the editor on the pay field — and goes live only once the pay is saved.
check('/my-jobs: Make live again with no pay opens the editor on pay; the ad goes live only after the pay saves; Cancel leaves it', () => {
  const mj = noComments(read('app/my-jobs/page.tsx'))
  return [
    /if \(!jobPay\(job\)\) \{\s*setLiveAfterPay\(job\.id\)\s*setEditFocus\('pay'\)\s*setEditTarget\(job\)\s*return/.test(mj),
    /if \(liveAfterPay === jobId && values\.salaryMin > 0\) \{\s*if \(!\(await makeLive\(jobId\)\)\)/.test(mj),
    /onCancel=\{\(\) => \{ setEditTarget\(null\); setLiveAfterPay\(null\) \}\}/.test(mj),
    /label: 'Make live again', onClick: \(\) => handleMakeLiveAgain\(job\)/.test(mj),
  ]
}, [true, true, true, true])
// Round 4: the post-job header on a phone is ONE line — "Draft saved · {title}",
// the title cut with "…", the town from 768 only.
check('post-job header: one line, the title cut with "…", the town shown from 768 only, the wordmark never shrinks', () => {
  const css = noComments(read('app/post-job/flow.module.css')), fc = noComments(read('app/post-job/FlowChrome.tsx')), pj = noComments(read('app/post-job/page.tsx'))
  return [
    /\.appBarStatus\s*\{[^}]*min-width:\s*0;[^}]*overflow:\s*hidden;[^}]*text-overflow:\s*ellipsis;[^}]*white-space:\s*nowrap/.test(css),
    /\.appBarWordmark\s*\{[^}]*flex:\s*none;[^}]*white-space:\s*nowrap/.test(css),
    /@media \(max-width: 767px\)\s*\{\s*\.appBarStatusExtra\s*\{\s*display:\s*none;?\s*\}/.test(css),
    /\{status\.extra && <span className=\{styles\.appBarStatusExtra\}>/.test(fc),
    // the town is no longer part of the main text for either state
    /text: `Draft saved\$\{formData\.title \? ` · \$\{formData\.title\}` : ''\}`,/.test(pj) && !/join\(', '\)\}`/.test(pj),
  ]
}, [true, true, true, true, true])
check('from 768 a quiet (filled / archived) card\'s action column takes the card\'s #F6F7F9 tint', () =>
  /@media \(min-width: 768px\)\s*\{[^@]*\.card:not\(\[data-live\]\):has\(> \.actions\) \.action\s*\{\s*background:\s*#F6F7F9/.test(noComments(read('components/ManageCard.module.css'))), true)
check('/my-jobs: the countdown is only claimed where the expiry cron will act (never on a recruiter posting); "new" is the Applicants list\'s own stage', () => {
  const mj = noComments(read('app/my-jobs/page.tsx'))
  return [/if \(job\.isRecruiterPosting\) return null/.test(mj), /stageOf\(status\) === 'new'/.test(mj), /\/applied\?job=\$\{job\.id\}/.test(mj)]
}, [true, true, true])
check('the manage card puts its actions inline at the right from 768 (design 26, C: laptop)', () =>
  /@media \(min-width: 768px\)\s*\{[^@]*\.card:has\(> \.actions\)\s*\{[^}]*grid-template-columns:\s*minmax\(0, 1fr\) 150px/.test(noComments(read('components/ManageCard.module.css'))), true)

check('withdrawing: nothing is written during the 5-second Undo; the page going away writes it with keepalive; "I\'m available" inside the window is the Undo', () => {
  const tw = noComments(read('app/temp-work/page.tsx'))
  const fn = tw.slice(tw.indexOf('const withdrawInterest = '), tw.indexOf('// THE PAGE GOING AWAY') > -1 ? tw.indexOf('const withdrawInterest = ') + 1200 : undefined)
  return [
    /const UNDO_MS = 5000/.test(tw),
    /from\('temp_interest'\)/.test(fn),
    /keepalive: true/.test(tw) && /addEventListener\('pagehide'/.test(tw),
    /if \(pendingRef\.current\?\.postId === post\.id\) \{ closeUndo\(false\); return \}/.test(tw),
  ]
}, [true, false, true, true])
check('the list-and-detail pages draw their lists with the 1b row, not their own cards', () =>
  ['app/jobs/sector/[sector]/page.tsx', 'app/jobs/[city]/page.tsx', 'app/jobs/recommended/page.tsx', 'app/saved-jobs/page.tsx']
    .filter(f => { const s = noComments(read(f)); return !/<JobRow\b/.test(s) || /styles\.listCardLogo/.test(s) }), [])
// Design 26 (round 2): the match % is the grey chip "99% match" on line 3
// after the age — not in the right column, not yellow — and with no Save the
// row's right padding equals the left. (Until 15 Nov it was an absolutely
// positioned yellow chip laid over the title.)
check('Recommended\'s match % is the grey "N% match" chip on line 3, and a row with no Save pads its right like its left', () => {
  const rec = noComments(read('app/jobs/recommended/page.tsx'))
  const chip = rule('tagChip'), noSave = rule('noSave')
  return [
    /tag=\{showMatchPercent\(job\) \? `\$\{job\.matchPercentage\}% match`/.test(rec), /aside=/.test(rec), /listCardMatch/.test(rec + read('app/jobs/recommended/page.module.css')),
    /background:\s*#EEF0F4/i.test(chip) && /font-size:\s*13px/.test(chip) && !/FFE500|primary-yellow/i.test(chip),
    /padding-right:\s*18px/.test(noSave),
  ]
}, [true, false, false, true, true])
check('no image, logo or banner in any finished job surface', () => DONE.filter(f => IMAGE.test(noComments(read(f)))), [])
check('ZERO-GUARD: the image pattern still finds an image where one is known to be', () => IMAGE.test(noComments(read('components/FeedCard.tsx'))), true)

console.log(`\n${ran - failed}/${ran} passed`)
if (failed) { console.error(`${failed} FAILED`); process.exit(1) }

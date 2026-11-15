// npm run applicants:prove
//
// THE APPLICANTS LIST (branch 2 of design 25). Filesystem only — no network,
// no database — so it runs on every push.
//
// It IMPORTS the rules (lib/applicantStages, lib/chatbot) rather than
// restating them: a check that restates a rule proves only that it restated
// it consistently.

import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import {
  stageOf, NEXT_STEP, LISTED_STAGES, STAGE_LABEL, toastMoved, toastNotAFit, waitLabel, daysWaiting, OVERDUE_DAYS, UNDO_MS,
  DB_STATUSES, WAITING_STATUSES, effectiveStage,
} from '../lib/applicantStages'
import { APPLICATION_STATUS_LABELS } from '../lib/applicationStatus'
import { employerAnswerLine } from '../lib/answerLine'
import { WELCOME_TEXT, SUGGESTED } from '../lib/chatbot/opening'
import { getKeywordResponse } from '../lib/chatbot/keywordFallback'
import { EMPLOYER_MORE } from '../lib/phoneNav'

const ROOT = join(__dirname, '..')
const read = (rel: string) => readFileSync(join(ROOT, rel), 'utf8')
const noComments = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')

let failed = 0, ran = 0
const check = (name: string, got: () => unknown, want: unknown) => {
  ran++
  let v: unknown
  try { v = got() } catch (err) { console.log(`FAIL  ${name}\n        threw: ${(err as Error).message}`); failed++; return }
  const a = JSON.stringify(v), b = JSON.stringify(want)
  if (a !== b) { console.log(`FAIL  ${name}\n        want ${b}\n        got  ${a}`); failed++ }
  else console.log(`ok    ${name}`)
}

// ── STAGES: display only, every stored spelling has a home ─────────────────
// DB_STATUSES is job_applications_status_check as read from pg_constraint on
// 15 Nov 2026 (lib/applicantStages). Here every one must land somewhere sane.
check('ZERO-GUARD: the eleven statuses the constraint allows are all listed',
  () => DB_STATUSES.length, 11)
check('every status the database allows maps to a stage (decision 3: reviewing shows under New)',
  () => Object.fromEntries(DB_STATUSES.map(s => [s, stageOf(s)])),
  { pending: 'new', applied: 'new', reviewing: 'new', viewed: 'new', interviewing: 'interview', interview: 'interview', shortlisted: 'shortlisted', hired: 'hired', rejected: 'not_a_fit', withdrawn: 'withdrawn', offered: 'offer' })

check('an unknown or missing status lands under New — an applicant never silently vanishes from the list',
  () => [stageOf(null), stageOf(undefined), stageOf('something-new'), stageOf('REVIEWING')], ['new', 'new', 'new', 'new'])

check('the list shows New, Shortlisted, Interview, Offer, with the design\'s labels; Hired and Not a fit are not listed',
  () => LISTED_STAGES.map(s => STAGE_LABEL[s]), ['New', 'Shortlisted', 'Interview', 'Offer'])

check('one next step per stage: Shortlist, Invite to interview, Make offer, Mark hired',
  () => LISTED_STAGES.map(s => NEXT_STEP[s].label), ['Shortlist', 'Invite to interview', 'Make offer', 'Mark hired'])

check('interview and offer open the existing forms; shortlist and hired are plain moves',
  () => LISTED_STAGES.map(s => ('to' in NEXT_STEP[s] ? `to:${(NEXT_STEP[s] as any).to}` : `flow:${(NEXT_STEP[s] as any).flow}`)),
  ['to:shortlisted', 'flow:interview', 'flow:offer', 'to:hired'])

check('the toast says the update WILL be sent (it goes after Undo), and moves name the stage',
  () => [toastNotAFit('Sam Jones'), toastMoved('Sam Jones', 'shortlisted')],
  ["Marked Sam Jones as not a fit. We'll send them a polite update.", 'Moved Sam Jones to Shortlisted.'])

check('Undo lasts six seconds, and the server owes the update six seconds after Not a fit',
  () => [UNDO_MS, /OWED_AFTER_MS = 6000/.test(read('app/api/applications/[id]/not-a-fit/route.ts'))], [6000, true])

check('waiting: "Today", "13d waiting", and amber from 14 days',
  () => {
    const now = Date.parse('2026-11-15T12:00:00Z')
    return [waitLabel(daysWaiting('2026-11-15T09:00:00Z', now)), waitLabel(daysWaiting('2026-11-02T09:00:00Z', now)), OVERDUE_DAYS]
  }, ['Today', '13d waiting', 14])

// ── THE LIST'S CONTROLS WRAP ───────────────────────────────────────────────
const css = noComments(read('components/applicants/Applicants.module.css'))
check('stage chips: 40 tall, 8 apart, wrapping, never a sideways-scrolling row',
  () => {
    const chips = (css.match(/\.chips\s*\{[^}]*\}/) || [''])[0]
    const chip = (css.match(/\.chip\s*\{[^}]*\}/) || [''])[0]
    return { wrap: /flex-wrap:\s*wrap/.test(chips), gap8: /gap:\s*8px/.test(chips), h40: /height:\s*40px/.test(chip), noOverflowX: !/overflow-x/.test(css) }
  }, { wrap: true, gap8: true, h40: true, noOverflowX: true })

// FOUND DRIVING THE PREVIEW, 15 Nov 2026. (1) The toast sat inside the list
// pane, which a phone hides while an applicant is open: every Undo on the
// applicant page was invisible and unreachable. (2) The job select was as wide
// as its longest option (656px on a 358px phone) and pushed Interview and
// Offer past the screen edge.
check('the toast lives OUTSIDE both panes and is fixed above the phone bar and the cookie banner',
  () => {
    const v = read('components/applicants/ApplicantsView.tsx')
    const toastRule = (css.match(/\.toast\s*\{[^}]*\}/) || [''])[0]
    return {
      afterBothPanes: v.indexOf('className={styles.toast}') > v.indexOf('aria-label="Applicant"'),
      once: (v.match(/className=\{styles\.toast\}/g) || []).length === 1,
      fixed: /position:\s*fixed/.test(toastRule),
      clearsBar: /bottom:\s*calc\([^;]*--consent-h[^;]*--nav-bottom-h/.test(toastRule),
    }
  }, { afterBothPanes: true, once: true, fixed: true, clearsBar: true })

check('the controls column and the card column can shrink below their content (minmax(0, 1fr))',
  () => [/\.controls\s*\{[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\)/.test(css), /\.cards\s*\{[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\)/.test(css)], [true, true])

// Paul, 15 Nov 2026: while the toast shows, the page gets room at the bottom
// so the last card's buttons stay visible and tappable; a long advert title
// ends in "…" at the column width — in WebKit too, which does not draw
// text-overflow on a select, so the pill's text is a span over a transparent select.
check('while the toast shows, the page gets bottom room measured from the toast',
  () => {
    const v = read('components/applicants/ApplicantsView.tsx')
    return [/ref=\{toastEl\}/.test(v), /setToastSpace\(toast && toastEl\.current \? Math\.ceil\(toastEl\.current\.getBoundingClientRect\(\)\.height\)/.test(v), /paddingBottom: `calc\(32px \+ \$\{toastSpace\}px\)`/.test(v)]
  }, [true, true, true])

check('long advert titles end in "…": the pill text is a span over a transparent select; the card cuts the title, never the stage',
  () => {
    const rule = (n: string) => (css.match(new RegExp(`\\.${n}\\s*\\{[^}]*\\}`)) || [''])[0]
    const ellipsis = (r: string) => /white-space:\s*nowrap/.test(r) && /overflow:\s*hidden/.test(r) && /text-overflow:\s*ellipsis/.test(r)
    return {
      pillText: ellipsis(rule('jobFilterShown')),
      selectTransparentOver: /opacity:\s*0/.test(rule('jobFilter select')) && /position:\s*absolute/.test(rule('jobFilter select')),
      cardTitle: ellipsis(rule('cardJob')),
      stageKept: /flex-shrink:\s*0/.test(rule('cardStage')),
    }
  }, { pillText: true, selectTransparentOver: true, cardTitle: true, stageKept: true })

check('the page uses every class it names (a missing CSS-module class renders unstyled, silently)',
  () => {
    const used = new Set<string>()
    for (const f of ['components/applicants/ApplicantsView.tsx', 'components/applicants/ApplicantDetail.tsx'])
      for (const m of Array.from(read(f).matchAll(/styles\.([a-zA-Z]+)/g))) used.add(m[1])
    return Array.from(used).filter(c => !new RegExp(`\\.${c}\\b`).test(css))
  }, [])

// ── PIPELINE AND OFFERS ARE REPLACED, NOT ORPHANED ─────────────────────────
check('/pipeline and /offers redirect to the list (Offers lands on its chip)',
  () => {
    const cfg = read('next.config.js')
    return [/source: '\/pipeline', destination: '\/applied'/.test(cfg), /source: '\/offers', destination: '\/applied\?stage=offer'/.test(cfg)]
  }, [true, true])

check('and neither has a row on More or in the laptop side menu',
  () => [
    EMPLOYER_MORE.flatMap(g => g.rows).some(r => r.href === '/pipeline' || r.href === '/offers'),
    /href: '\/(pipeline|offers)'/.test(read('components/EmployerSidebar.tsx')),
  ], [false, false])

check('the open applicant is ?app= on /applied, so opening someone keeps a pending Undo alive',
  () => [/router\.push\(`\/applied\?app=\$\{r\.id\}`/.test(read('components/applicants/ApplicantsView.tsx')), existsSync(join(ROOT, 'app/applied/[id]'))],
  [true, false])

// ── NOT A FIT: the server sends, once, after Undo ──────────────────────────
const route = noComments(read('app/api/applications/[id]/not-a-fit/route.ts'))
const sender = noComments(read('lib/declineNotice.ts'))
check('the route writes statuses as the CALLER (RLS applies), never with the service role',
  () => [/createServerClient\(/.test(route), /supabaseAdmin/.test(route)], [true, false])

// THE UNDO WINDOW WRITES NO STATUS. A status change fires the trigger that
// cancels interviews and withdraws offers (Not a fit) or accepts the offer and
// closes interviews (Mark hired); no Undo can put those back. Found by reading
// trg_cascade_application_status on 15 Nov 2026 — the first version of this
// branch wrote 'rejected' at the tap.
const block = (src: string, from: string, to: string) => src.slice(src.indexOf(from), to ? src.indexOf(to) : undefined)
// What a block WRITES: the fields inside .update({ ... }) — never a
// `{ status: 409 }` response, which the first version of this check matched.
const writesStatus = (src: string) => /\.update\(\{[^}]*\bstatus:/.test(src)
const declineBlock = block(route, "action === 'decline'", "action === 'undo'")
const undoBlock = block(route, "action === 'undo'", "action === 'send'")
const sendBlock = block(route, "action === 'send'", "unknown_action")
check('decline writes ONLY the owed column — no status, so no trigger fires',
  () => [declineBlock.length > 0, writesStatus(declineBlock), /decline_notice_due_at:/.test(declineBlock)], [true, false, true])

check('Undo clears only what is owed, and only before the send has begun (still waiting, nothing stamped sent)',
  () => [writesStatus(undoBlock), /decline_notice_due_at: null/.test(undoBlock), /\.in\('status', WAITING_STATUSES\)/.test(undoBlock), /\.is\('decline_notice_sent_at', null\)/.test(undoBlock)],
  [false, true, true, true])

const sendNowFn = block(route, 'async function sendNow(', 'export async function POST')
check('the status becomes rejected at the SEND, as the employer, before the sender runs',
  () => [/status: 'rejected'/.test(sendNowFn), sendNowFn.indexOf("status: 'rejected'") < sendNowFn.indexOf('sendDeclineNotice('), /sendNow\(supabase, id\)/.test(sendBlock)], [true, true, true])

// A CLOSED TAB MUST NOT DELAY THE UPDATE (Paul, 15 Nov 2026). The decline
// queues its own send on the server, after the Undo window plus grace, and the
// function is allowed to live long enough to do it.
check('decline queues the send on the server (waitUntil), after Undo plus grace, through the same sendNow',
  () => {
    const owed = Number((route.match(/const OWED_AFTER_MS = (\d+)/) || [])[1])
    const graceExpr = (route.match(/const SERVER_SEND_AFTER_MS = OWED_AFTER_MS \+ (\d+)/) || [])[1]
    const maxDur = Number((route.match(/export const maxDuration = (\d+)/) || [])[1])
    return {
      imported: /import \{ waitUntil \} from '@vercel\/functions'/.test(route),
      queuedInDecline: /waitUntil\(/.test(declineBlock) && /SERVER_SEND_AFTER_MS/.test(declineBlock) && /sendNow\(supabase, id\)/.test(declineBlock),
      afterUndo: owed === UNDO_MS && Number(graceExpr) >= 1000,
      livesLongEnough: maxDur * 1000 >= owed + Number(graceExpr) + 10000,
    }
  }, { imported: true, queuedInDecline: true, afterUndo: true, livesLongEnough: true })

check('the package that keeps the function alive is a pinned dependency',
  () => JSON.parse(read('package.json')).dependencies['@vercel/functions'], '3.10.5')

check('the sender moves a still-owed waiting row (the catch-up has no caller), THEN claims it: rejected, owed, not yet sent',
  () => {
    const flip = sender.indexOf(".in('status', WAITING_STATUSES)")
    const claim = sender.indexOf('decline_notice_sent_at: new Date().toISOString()')
    return [
      flip > 0 && flip < claim,
      /\.eq\('status', 'rejected'\)\s*\.not\('decline_notice_due_at', 'is', null\)\s*\.is\('decline_notice_sent_at', null\)/.test(sender),
      claim < sender.indexOf('sendEmail('),
    ]
  }, [true, true, true])

check('Shortlist and Mark hired write nothing until Undo has run out (the write is inside finish)',
  () => {
    const v = read('components/applicants/ApplicantsView.tsx')
    const mv = block(v, 'const move = ', 'const notAFit = ')
    return [mv.length > 0, mv.indexOf('finish:') > 0 && mv.indexOf('finish:') < mv.indexOf('.update(')]
  }, [true, true])

check('an owed Not a fit SHOWS as Not a fit before its status changes; a withdrawn one stays withdrawn',
  () => [
    effectiveStage('reviewing', '2026-11-15T10:00:00Z', null),
    effectiveStage('reviewing', null, null),
    effectiveStage('rejected', '2026-11-15T10:00:00Z', '2026-11-15T10:00:07Z'),
    effectiveStage('withdrawn', '2026-11-15T10:00:00Z', null),
  ], ['not_a_fit', 'new', 'not_a_fit', 'withdrawn'])

check('the waiting statuses are derived from the stages: New to Offer, eight stored spellings',
  () => WAITING_STATUSES.slice().sort(), ['applied', 'interview', 'interviewing', 'offered', 'pending', 'reviewing', 'shortlisted', 'viewed'])

check('the list page reads the owed column through effectiveStage',
  () => /stage: effectiveStage\(a\.status, a\.decline_notice_due_at, a\.decline_notice_sent_at\)/.test(read('components/applicants/useApplicants.ts')), true)

check('the catch-up fails CLOSED without a cron secret',
  () => /if \(!cronSecret \|\| authHeader !== `Bearer \$\{cronSecret\}`\)/.test(read('app/api/cron/decline-notices/route.ts')), true)

check('the page sends what is owed when Undo runs out, when it is hidden (beacon), and when it is left',
  () => {
    const v = read('components/applicants/ApplicantsView.tsx')
    return [/navigator\.sendBeacon/.test(v), /addEventListener\('pagehide'/.test(v), /keepalive: true/.test(v)]
  }, [true, true, true])

check('the daily catch-up exists, is scheduled, and is behind the cron secret',
  () => {
    const cron = read('app/api/cron/decline-notices/route.ts')
    return [/"path": "\/api\/cron\/decline-notices"/.test(read('vercel.json')), /CRON_SECRET/.test(cron), /sendDeclineNotice\(/.test(cron)]
  }, [true, true, true])

check('closing an advert refuses a live one, and uses the list\'s own "still waiting" rule',
  () => {
    const r = read('app/api/jobs/[id]/notify-waiting/route.ts')
    return [/still_live/.test(r), /isListed\(stageOf\(/.test(r)]
  }, [true, true])

check('ONE default message: the Decline box, the server and the templates page share it',
  () => {
    const files = ['components/DeclineModal.tsx', 'lib/declineNotice.ts', 'app/settings/email-templates/page.tsx']
    const imports = files.map(f => /DEFAULT_REJECTED_BODY/.test(read(f)) && /@\/lib\/declineCopy/.test(read(f)))
    const literalCopies = files.filter(f => /Due to a high number of applications/.test(read(f)))
    return { imports, literalCopies }
  }, { imports: [true, true, true], literalCopies: [] })

// ── THE WORDS ──────────────────────────────────────────────────────────────
check('candidates see "Not selected", never "Rejected"',
  () => APPLICATION_STATUS_LABELS.rejected, 'Not selected')

check('the Today card: "{n} people have waited over 2 weeks for you." opens the list',
  () => {
    const m = employerAnswerLine({ newApplications: 0, totalJobs: 3, activeJobs: 2, waitingOverTwoWeeks: 42 })
    const one = employerAnswerLine({ newApplications: 0, totalJobs: 3, activeJobs: 2, waitingOverTwoWeeks: 1 })
    return [m.sentence, m.action?.href, one.sentence]
  }, ['42 people have waited over 2 weeks for you.', '/applied', '1 person has waited over 2 weeks for you.'])

check('Ask Thrive: no pricing and no trial in the opening, any suggestion, or the "I can help with" fallback (a second opening)',
  () => [WELCOME_TEXT, ...Object.values(SUGGESTED).flat(), getKeywordResponse('zzqx').response].filter(t => /pric|trial|£|\bcost/i.test(t)), [])

check('each suggested question lands on the answer meant for it',
  () => {
    const want: Record<string, RegExp> = {
      'How do I post a job?': /Post a job/,
      'How do I move an applicant on?': /^Open Applicants/,
      'How do I schedule interviews?': /Invite to interview/,
      'How do I contact support?': /support@thrivecareer\.co\.uk/,
      'How do I apply for a job?': /Browse the live jobs/,
      'Where can I see my applications?': /Applications tab/,
      'How do I build my CV?': /CV builder/,
    }
    const qs = Array.from(new Set(Object.values(SUGGESTED).flat()))
    return qs.filter(q => !want[q] || !want[q].test(getKeywordResponse(q).response))
  }, [])

check('ZERO-GUARD: every suggested question has an expected answer here',
  () => Array.from(new Set(Object.values(SUGGESTED).flat())).length, 7)

check('the laptop Messages count is the design red, like the bell',
  () => {
    const h = noComments(read('components/Header.module.css'))
    const bell = noComments(read('components/NotificationBell.module.css'))
    return [/\.iconBadgeRed\s*\{[^}]*background:\s*#DC2626/i.test(h), (read('components/Header.tsx').match(/styles\.iconBadgeRed/g) || []).length, /background:\s*#DC2626/i.test(bell)]
  }, [true, 2, true])

console.log(`\n${ran - failed}/${ran} passed`)
if (failed) { console.error(`${failed} FAILED`); process.exit(1) }

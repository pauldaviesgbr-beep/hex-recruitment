'use client'

// Guided employer onboarding tour (driver.js). Runs entirely on the dashboard —
// no navigation — over the real stats and the display-only ExampleShowcase. The
// "post a job" portion fills the example job's fields one at a time (via window
// events the showcase listens for) so a new employer sees how it's done.
//
// Auto-starts once for a new, unflagged, EMPTY employer; replayable via the
// "Take the tour" button. Completion OR skip is persisted per USER so we never
// re-nag.

import { useCallback, useEffect, useRef } from 'react'
import { driver, type DriveStep } from 'driver.js'
import 'driver.js/dist/driver.css'
import { supabase } from '@/lib/supabase'
import './tour.css'
import { Ico } from '@/components/icons'

// Show/hide the example showcase so it appears ONLY while the tour runs — the
// dashboard listens for these and mounts/unmounts <ExampleShowcase/>.
const showExamples = () => window.dispatchEvent(new Event('thrive-tour:show'))
const hideExamples = () => window.dispatchEvent(new Event('thrive-tour:hide'))

// Tell the ExampleShowcase how much of the example job to reveal.
const jobReset = () => window.dispatchEvent(new Event('thrive-tour:job-reset'))
const jobDone = () => window.dispatchEvent(new Event('thrive-tour:job-done'))
const jobReveal = (n: number) => window.dispatchEvent(new CustomEvent('thrive-tour:job-reveal', { detail: n }))

type Side = 'top' | 'bottom' | 'left' | 'right'
type Align = 'start' | 'center' | 'end'
type StepDef = { el?: string; title: string; description: string; onHi?: () => void; noInteract?: boolean; side?: Side; align?: Align }

// The example-* anchors only exist when the account is empty (ExampleShowcase
// rendered); we filter to present anchors at run time, so a replay on a
// populated dashboard just shows what's there.
const STEP_DEFS: StepDef[] = [
  { el: '[data-tour="stats"]', title: 'Your dashboard at a glance', description: 'Live jobs, applications, interviews and views — your key numbers always sit here.', onHi: jobReset },
  { el: '[data-tour="ex-title"]', title: 'Posting a job — 1. Title', description: 'Start with the role you\'re hiring for, like “Bartender”. Watch the example fill in as we go.', noInteract: true, onHi: () => jobReveal(1) },
  // Pinned below-left: the pay field is full-width, so driver.js's default
  // centred popover lands on top of it (~25% cover). Anchoring below + start
  // points the arrow up at the field and keeps the popover clear of it.
  { el: '[data-tour="ex-pay"]', title: '2. Pay', description: 'Add an hourly or annual rate so candidates know what to expect.', noInteract: true, onHi: () => jobReveal(2), side: 'bottom', align: 'start' },
  { el: '[data-tour="ex-location"]', title: '3. Location', description: 'Where is the role based? Candidates filter by area.', noInteract: true, onHi: () => jobReveal(3) },
  { el: '[data-tour="ex-desc"]', title: '4. Description', description: 'A short summary of the role — and that\'s the essentials. Posting your own takes under a minute.', noInteract: true, onHi: () => jobReveal(4) },
  { el: '[data-tour="photo-example-bad"]', title: 'Add a great photo', description: 'The bit people get wrong — a bright, sharp, landscape photo of your venue, food or team gets far more applicants than a dark or blurry one.', onHi: jobDone, side: 'bottom', align: 'end' },
  { el: '[data-tour="example-pipeline"]', title: 'Track your pipeline', description: 'Every applicant moves through your stages — from Applied to Offered — with a simple drag.' },
  { el: '[data-tour="example-ai"]', title: 'AI interview questions', description: 'Thrive reads each CV and application, compares them to your job and must-haves, and suggests tailored questions to ask.' },
  { el: '[data-tour="example-interview"]', title: 'Schedule interviews', description: 'Propose times or let candidates pick a slot — with a friendly reminder before the interview.' },
  // Ordered to match the on-page (DOM) layout: the example cards run top-to-
  // bottom (…interview → offer), THEN the "More you can do" feature tiles as a
  // group. Interleaving a tile (which sits lower on the page) between two cards
  // forced driver.js to scroll down-then-back-up, and with smoothScroll the
  // popover anchored to the target's pre-scroll position — overlapping the card
  // or pointing at the wrong one. Keeping the sequence in DOM order means the
  // tour only ever scrolls forward, so every popover anchors correctly.
  { el: '[data-tour="example-offer"]', title: 'Make an offer', description: 'Send a branded offer letter and the candidate signs it online, right here on Thrive.' },
  { el: '[data-tour="feat-calendar"]', title: 'Sync your calendar', description: 'Connect Google Calendar so booked interviews land straight in your diary — no double-booking.' },
  { el: '[data-tour="feat-analytics"]', title: 'See your analytics', description: 'Views, applications and conversion for every job — so you can see what\'s working and adjust.' },
  { el: '[data-tour="feat-boost"]', title: 'Boost a listing', description: 'Need more applicants fast? Boost a job to rank higher in search with a Featured badge.' },
  { el: '[data-tour="feat-candidates"]', title: 'Search candidates', description: 'Don\'t wait to be found — browse candidates and reach out to the ones you like.' },
  // Pinned above-left: feat-message is the bottom-LEFT tile in the 4-col grid,
  // so driver.js can't place its popover below (section ends) or centred (would
  // overflow the container's left edge) and flings it ~575px to the right,
  // pointing at nothing. Anchoring top + start seats it above the tile with the
  // arrow pointing down at it. (The other bottom-row tiles have room to their
  // right, so they place fine on the default.)
  { el: '[data-tour="feat-message"]', title: 'Message candidates', description: 'Chat with candidates in real time inside Thrive — ask a question or arrange a call.', side: 'top', align: 'start' },
  { el: '[data-tour="feat-email"]', title: 'Email candidates', description: 'Branded emails go out automatically at each stage — customise the wording to sound like you.' },
  { el: '[data-tour="feat-jobs"]', title: 'Browse other jobs', description: 'See what other venues are hiring for and how they pitch their roles.' },
  { el: '[data-tour="feat-team"]', title: 'Invite your team', description: 'Add colleagues with the right permissions so hiring is a team effort.' },
  { title: "You're all set", description: 'Post your first job to get started — you can replay this tour anytime from “Take the tour”.' },
]

function buildSteps(): DriveStep[] {
  const steps: DriveStep[] = []
  for (const s of STEP_DEFS) {
    if (s.el && typeof document !== 'undefined' && !document.querySelector(s.el)) continue
    const step: DriveStep = {
      popover: { title: s.title, description: s.description, side: s.side || 'bottom', align: s.align || 'center' },
    }
    if (s.el) step.element = s.el
    if (s.noInteract) step.disableActiveInteraction = true
    if (s.onHi) step.onHighlightStarted = s.onHi
    steps.push(step)
  }
  return steps
}

export default function EmployerTour({ isEmpty }: { isEmpty: boolean }) {
  const userIdRef = useRef<string | null>(null)
  const autoStartedRef = useRef(false)

  const persistCompleted = useCallback(async () => {
    const uid = userIdRef.current
    if (!uid) return
    try {
      await supabase.from('user_onboarding').upsert(
        { user_id: uid, employer_tour_completed_at: new Date().toISOString() },
        { onConflict: 'user_id' },
      )
    } catch { /* non-fatal: worst case the tour offers once more */ }
  }, [])

  const startTour = useCallback(() => {
    // Reveal the example showcase, then wait a beat for it to mount so the
    // step anchors exist before driver.js resolves them.
    showExamples()
    jobReset() // start the example job blank so it fills in during the tour
    setTimeout(() => {
      const steps = buildSteps()
      if (steps.length === 0) { hideExamples(); return }
      const d = driver({
        showProgress: true,
        allowClose: true, // Esc / overlay closes
        smoothScroll: true, // scroll each target into view so popovers aren't pushed off-screen
        overlayColor: 'rgba(15,23,42,0.6)',
        popoverClass: 'thrive-tour',
        nextBtnText: 'Next',
        prevBtnText: 'Back',
        doneBtnText: 'Done',
        steps,
        // driver.js computes the popover position WHILE the smooth scroll is
        // still animating, so a step that scrolls a fair distance (or a tile at
        // the very bottom of the page) can anchor to the target's mid-scroll
        // position — landing off to one side. Once the scroll has settled,
        // refresh() re-runs the positioning against the element's final rect.
        // refresh() re-renders in place: no re-scroll, no re-animation, and it
        // does NOT re-fire onHighlighted, so this can't loop.
        onHighlighted: (_el, _step, opts) => {
          setTimeout(() => { try { opts.driver.refresh() } catch { /* step moved on */ } }, 400)
        },
        // Fires on finish AND on skip/close — mark done either way (no re-nag)
        // and hide the examples so the dashboard is clean again.
        onDestroyed: () => { persistCompleted(); hideExamples() },
      })
      d.drive()
    }, 240)
  }, [persistCompleted])

  // Auto-start once for a new, unflagged, empty employer.
  useEffect(() => {
    let cancelled = false
    const init = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (cancelled || !user) return
      userIdRef.current = user.id

      if (!isEmpty) return // examples aren't on screen; don't auto-run
      const { data } = await supabase
        .from('user_onboarding')
        .select('employer_tour_completed_at')
        .eq('user_id', user.id)
        .maybeSingle()
      if (cancelled) return
      if (data?.employer_tour_completed_at) return // already completed/skipped
      if (autoStartedRef.current) return
      autoStartedRef.current = true
      // Let the dashboard + showcase finish painting so the anchors exist.
      setTimeout(() => { if (!cancelled) startTour() }, 700)
    }
    init()
    return () => { cancelled = true }
  }, [isEmpty, startTour])

  return (
    <button type="button" className="thrive-tour-trigger" onClick={startTour}>
      <span aria-hidden><Ico name="compass" size={20} /></span> Take the tour
    </button>
  )
}

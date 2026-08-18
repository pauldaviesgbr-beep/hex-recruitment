'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import styles from './CandidateActivityInsight.module.css'

interface Payload {
  error?: string
  candidateActivity: {
    total: number
    distinctPeople: number
    byBand: { band: string; n: number }[]
    /** THE VIEWER'S OWN ZONE, not the candidates'. The only thing an employer
     *  can do with this chart is decide when to press publish, so it has to
     *  be in the clock on their wall. Admin's version of the same data is
     *  bucketed candidate-local instead, because it answers a different
     *  question — behaviour rather than scheduling. */
    timezone?: string
  }
  yourResponse: { applications: number; opened: number; medianHours: number | null }
  platform: { medianHours: number | null; employers: number; minPeers: number }
}

/** Under this, a seven-band distribution is reading noise rather than a
 *  pattern. Named because an employer will ACT on this — in admin the same
 *  thinness is a caveat; here it would become advice. */
const THIN = 100

const BAND_NOTE: Record<string, string> = {
  '06:00-08:59': 'before service',
  '12:00-14:59': 'between lunch and dinner',
  '15:00-17:59': 'between lunch and dinner',
  '21:00-23:59': 'after service',
}

/**
 * WHEN CANDIDATES ARE LOOKING, and how quickly you get to applicants.
 *
 * Everything on the candidate side is AGGREGATE — counts per time band across
 * the whole candidate base. No individual is identifiable, deliberately: an
 * employer must never be able to learn that a named candidate browses at 2am.
 * The scoping is in the RPC, which is keyed on auth.uid() and takes no
 * parameter, so this component cannot ask about anyone else even if it tried.
 */
export default function CandidateActivityInsight() {
  const [data, setData] = useState<Payload | null>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      const { data: rpc, error } = await supabase.rpc('employer_candidate_activity')
      if (cancelled) return
      // Fails QUIET but not silent: this is one panel on a large page and must
      // never be the reason analytics does not render. It says so rather than
      // showing nothing, so an empty space is never mistaken for "no data".
      if (error || !rpc || (rpc as Payload).error) { setFailed(true); return }
      setData(rpc as Payload)
    }
    load()
    return () => { cancelled = true }
  }, [])

  if (failed) {
    return (
      <div className={styles.panel}>
        <h2 className={styles.title}>When candidates are looking</h2>
        <p className={styles.muted}>Couldn&rsquo;t load this right now. Nothing else on this page is affected.</p>
      </div>
    )
  }
  if (!data) return null

  const { candidateActivity: act, yourResponse: you, platform } = data
  if (act.total === 0) return null

  const max = Math.max(...act.byBand.map(b => b.n), 1)
  const pct = (n: number) => Math.round((100 * n) / Math.max(act.total, 1))
  const busiest = act.byBand.slice().sort((a, b) => b.n - a.n)[0]
  const isThin = act.total < THIN

  // 'Europe/London' reads as jargon to a restaurant owner, so the one zone
  // every employer is in today keeps its plain name. Anything else prints the
  // city, which is the readable half of an IANA name — never a made-up
  // abbreviation, which would be wrong twice a year.
  const tz = act.timezone || 'Europe/London'
  const zoneLabel = tz === 'Europe/London' ? 'UK time' : `${tz.split('/').pop()!.replace(/_/g, ' ')} time`

  return (
    <div className={styles.panel}>
      <div className={styles.head}>
        <h2 className={styles.title}>When candidates are looking</h2>
        {/* NOT "UK time" as a literal any more. It was true of every employer
            and stops being true the moment one signs up abroad — and a chart
            that says UK while showing another zone is worse than no label. */}
        <p className={styles.meta}>{zoneLabel} · all candidates on Thrive</p>
      </div>

      <ul className={styles.bars}>
        {act.byBand.map(b => (
          <li key={b.band} className={styles.row}>
            <span className={styles.label}>
              {b.band}
              {BAND_NOTE[b.band] && <em className={styles.note}>{BAND_NOTE[b.band]}</em>}
            </span>
            <span className={styles.track}>
              <span
                className={`${styles.fill} ${busiest && b.band === busiest.band ? styles.fillPeak : ''}`}
                style={{ width: `${(100 * b.n) / max}%` }}
              />
            </span>
            <span className={styles.value}>{pct(b.n)}%</span>
          </li>
        ))}
      </ul>

      {/* THE HONESTY IS LOAD-BEARING HERE IN A WAY IT IS NOT IN ADMIN. This is
          shown to a customer who will change what they do because of it. A
          seven-band chart from 67 sign-ins will always have a tallest bar, and
          without this it reads as a recommendation. */}
      {isThin ? (
        <p className={styles.caveat}>
          Based on {act.total} sign-ins from {act.distinctPeople} candidates — still a small
          sample, so treat the shape as a hint rather than a rule. It sharpens as more
          people join.
        </p>
      ) : (
        <p className={styles.lede}>
          Most activity falls between midday and 18:00 — the gap between lunch and dinner
          service. Messages and new roles posted then are seen soonest.
        </p>
      )}

      {/* ── YOUR SPEED ─────────────────────────────────────────────────── */}
      <div className={styles.response}>
        <h3 className={styles.subTitle}>How quickly you open applications</h3>
        {you.opened === 0 ? (
          <p className={styles.muted}>
            {you.applications === 0
              ? 'No applications yet, so there is nothing to measure.'
              : `${you.applications} application${you.applications === 1 ? '' : 's'} received and none opened yet.`}
          </p>
        ) : (
          <p className={styles.lede}>
            <strong>{you.medianHours} hours</strong> is your median time to open the applicant
            list, across {you.opened} application{you.opened === 1 ? '' : 's'}.
            {platform.medianHours !== null ? (
              <> Other employers take <strong>{platform.medianHours} hours</strong>.</>
            ) : (
              // NOT a zero, and not silence. An aggregate over one or two
              // employers would tell you what those specific competitors do.
              <> There aren&rsquo;t enough other employers yet to compare against
                 — it needs {platform.minPeers}, and there {platform.employers === 1 ? 'is' : 'are'} {platform.employers}.</>
            )}
          </p>
        )}
        <p className={styles.footnote}>
          &ldquo;Opened&rdquo; means the applicant list was loaded, not that an individual
          application was read.
        </p>
      </div>
    </div>
  )
}

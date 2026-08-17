'use client'

import StatsStrip from './StatsStrip'
import styles from './ActivityPanel.module.css'

export interface ActivityData {
  signins: {
    total: number
    distinctPeople: number
    first: string | null
    last: string | null
    byBand: { band: string; n: number }[]
    byHour: { hour: number; n: number }[]
    byDow: { dow: number; label: string; n: number }[]
  }
  countries: {
    candidateSignups: { country: string; n: number }[]
    candidatesUnknown: number
    jobViews: { country: string; n: number }[]
    jobViewsUnknown: number
  }
}

/** A few of the codes we are most likely to see, so the panel reads as words
 *  rather than as a quiz. Anything else falls back to the raw code, which is
 *  still correct — never a guess. */
const COUNTRY_NAMES: Record<string, string> = {
  GB: 'United Kingdom', IE: 'Ireland', US: 'United States', ES: 'Spain',
  IT: 'Italy', FR: 'France', DE: 'Germany', PL: 'Poland', PT: 'Portugal',
  RO: 'Romania', IN: 'India', PK: 'Pakistan', NP: 'Nepal', PH: 'Philippines',
  NG: 'Nigeria', ZA: 'South Africa', AU: 'Australia', NL: 'Netherlands',
  GR: 'Greece', BG: 'Bulgaria', LT: 'Lithuania', LV: 'Latvia', HU: 'Hungary',
  XX: 'Not determined',
}
const label = (code: string) => COUNTRY_NAMES[code] || code

const BAND_NOTE: Record<string, string> = {
  '06:00-08:59': 'before service',
  '12:00-14:59': 'between lunch and dinner',
  '15:00-17:59': 'between lunch and dinner',
  '21:00-23:59': 'after service',
}

/**
 * WHEN AND WHERE. Two questions with very different amounts of evidence
 * behind them, so the panel says which is which rather than presenting both
 * as equally solid.
 */
export default function ActivityPanel({ data }: { data: ActivityData | null }) {
  if (!data) return null

  const { signins, countries } = data
  const bandMax = Math.max(...signins.byBand.map(b => b.n), 1)
  const dowMax = Math.max(...signins.byDow.map(d => d.n), 1)
  const pct = (n: number) => Math.round((100 * n) / Math.max(signins.total, 1))

  // Under this, a bar chart of 24 hours or 7 days is reading noise. Named
  // rather than buried: the panel should say so where a reader can see it.
  const THIN = 100
  const isThin = signins.total < THIN

  const knownCountries = countries.candidateSignups.reduce((a, c) => a + c.n, 0)
  const viewCountries = countries.jobViews.reduce((a, c) => a + c.n, 0)

  return (
    <section className={styles.panel}>
      <h2 className={styles.heading}>When and where</h2>

      <StatsStrip
        tableStatus="ok"
        stats={[
          { label: 'Sign-ins recorded', value: signins.total },
          { label: 'Distinct people', value: signins.distinctPeople },
          { label: 'Countries seen', value: countries.candidateSignups.length || null },
          { label: 'Awaiting country', value: countries.candidatesUnknown },
        ]}
      />

      {/* ── WHEN ──────────────────────────────────────────────────────── */}
      <div className={styles.block}>
        <div className={styles.blockHead}>
          <h3 className={styles.blockTitle}>Sign-ins by time of day</h3>
          <p className={styles.blockMeta}>
            UK time{signins.first && signins.last ? ` · ${signins.first} to ${signins.last}` : ''}
          </p>
        </div>

        <ul className={styles.bars}>
          {signins.byBand.map(b => (
            <li key={b.band} className={styles.barRow}>
              <span className={styles.barLabel}>
                {b.band}
                {BAND_NOTE[b.band] && <em className={styles.barNote}>{BAND_NOTE[b.band]}</em>}
              </span>
              <span className={styles.barTrack}>
                <span className={styles.barFill} style={{ width: `${(100 * b.n) / bandMax}%` }} />
              </span>
              <span className={styles.barValue}>{b.n}<span className={styles.barPct}>{pct(b.n)}%</span></span>
            </li>
          ))}
        </ul>

        <ul className={styles.dow}>
          {signins.byDow.map(d => (
            <li key={d.dow} className={styles.dowCell}>
              <span className={styles.dowBarTrack}>
                <span className={styles.dowBarFill} style={{ height: `${(100 * d.n) / dowMax}%` }} />
              </span>
              <span className={styles.dowLabel}>{d.label}</span>
              <span className={styles.dowValue}>{d.n}</span>
            </li>
          ))}
        </ul>

        {/* THE SAMPLE SIZE IS PART OF THE FINDING, not a disclaimer under it.
            A day-of-week bar chart built from 67 events will show a "busiest
            day" whatever the truth is, and someone will plan around it. */}
        {isThin && (
          <p className={styles.caveat}>
            <strong>{signins.total} sign-ins is a thin sample.</strong> The
            band totals are worth reading — midday to 18:00 holds the largest
            share — but individual hours and the busiest day are not yet
            distinguishable from chance. One busy afternoon moves them.
          </p>
        )}
      </div>

      {/* ── WHERE ─────────────────────────────────────────────────────── */}
      <div className={styles.block}>
        <div className={styles.blockHead}>
          <h3 className={styles.blockTitle}>Country</h3>
          <p className={styles.blockMeta}>Signups · from 17 Aug 2026</p>
        </div>

        {knownCountries === 0 ? (
          /* NOT AN EMPTY STATE, AND IT MUST NOT LOOK LIKE ONE. Zero here means
             the capture is new, not that nobody signed up. */
          <p className={styles.pending}>
            Nothing recorded yet — country capture started 17 Aug 2026 and fills
            forward only. {countries.candidatesUnknown} existing{' '}
            {countries.candidatesUnknown === 1 ? 'candidate' : 'candidates'} predate
            it and will stay blank; the next signup will be the first with a country.
          </p>
        ) : (
          <ul className={styles.countryList}>
            {countries.candidateSignups.map(c => (
              <li key={c.country} className={styles.countryRow}>
                <span className={styles.countryName}>{label(c.country)}</span>
                <span className={styles.countryBarTrack}>
                  <span
                    className={styles.countryBarFill}
                    style={{ width: `${(100 * c.n) / Math.max(knownCountries, 1)}%` }}
                  />
                </span>
                <span className={styles.countryValue}>{c.n}</span>
              </li>
            ))}
            {countries.candidatesUnknown > 0 && (
              <li className={`${styles.countryRow} ${styles.countryMuted}`}>
                <span className={styles.countryName}>Not recorded</span>
                <span className={styles.countryBarTrack} />
                <span className={styles.countryValue}>{countries.candidatesUnknown}</span>
              </li>
            )}
          </ul>
        )}

        {viewCountries > 0 && (
          <>
            <p className={styles.blockMeta} style={{ marginTop: '1rem' }}>
              Job views · includes signed-out visitors
            </p>
            <ul className={styles.countryList}>
              {countries.jobViews.slice(0, 8).map(c => (
                <li key={c.country} className={styles.countryRow}>
                  <span className={styles.countryName}>{label(c.country)}</span>
                  <span className={styles.countryBarTrack}>
                    <span
                      className={styles.countryBarFill}
                      style={{ width: `${(100 * c.n) / Math.max(viewCountries, 1)}%` }}
                    />
                  </span>
                  <span className={styles.countryValue}>{c.n}</span>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>

      <p className={styles.footnote}>
        <strong>What these numbers are.</strong> A sign-in is a new session —
        somebody who stays logged in and returns creates no new row, so this
        counts logging back in, not visits. Times are the candidate&rsquo;s own
        UK local time. Country is the two-letter code our host resolves at the
        edge on each request; no IP address is stored in these figures and
        nothing is sent to a third party to work it out.
      </p>
    </section>
  )
}

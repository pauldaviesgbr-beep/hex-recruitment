'use client'

import { useState, useEffect, useCallback } from 'react'
import { useAdminToken } from '@/lib/admin-context'
import AdminTable, { Column } from '@/components/admin/AdminTable'
import StatsStrip from '@/components/admin/StatsStrip'
import AdminPageHeader from '@/components/admin/AdminPageHeader'
import styles from './page.module.css'

/*
  DELIVERY — OUR OWN LOGS, NOT THE PROVIDER'S.

  This page used to ask Resend for its sent list with a send-scoped key and got
  401 on every read endpoint, so it had never rendered a row. The route caught
  that and returned HTTP 200 with an `error` string, which is why it read as an
  empty inbox rather than a broken page for weeks.

  TWO SURFACES, NOT TWO TABLES ON ONE. email_log is addressed to a string and
  has a subject; push_log is addressed to a user id and carries `outcome`,
  which is where its real information lives. They answer different questions,
  so they get different tabs rather than being stacked.

  BOTH CARRY A FOOTNOTE SAYING WHAT THEY CANNOT SEE, and neither is decorative:
    · email — `success` means the API ACCEPTED the send. No webhook exists, so
      no delivery, open or bounce is recorded anywhere. The old page's
      "Delivered / Opened / Bounced" cards could not be honestly rebuilt.
    · email — the log STARTS 11 AUGUST. It says nothing about anything sent
      before that, including the 26 July discoverability notice.
    · push — the on-device test route writes NOTHING here by design, so "0
      delivered" does not mean push is broken. That exact wrong conclusion was
      drawn from this data on 15 Aug 2026, in good faith, by someone who had
      just read the table. The footnote is the difference between an instrument
      and a trap.
*/

interface EmailRow {
  id: string
  recipient: string
  email_type: string
  subject: string | null
  success: boolean
  provider_message_id: string | null
  error: string | null
  created_at: string
}
interface PushRow {
  id: string
  user_id: string | null
  notification_type: string
  title: string | null
  success: boolean
  outcome: string
  provider_message_id: string | null
  error: string | null
  created_at: string
}

const fmt = (v: string | null) => (v ? new Date(v).toLocaleString('en-GB') : '—')
const fmtDay = (v: string | null) =>
  v ? new Date(v).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }) : '—'

export default function AdminDeliveryPage() {
  const token = useAdminToken()
  const [tab, setTab] = useState<'email' | 'push'>('email')

  // ── email state ──
  const [emails, setEmails] = useState<EmailRow[]>([])
  const [eSummary, setESummary] = useState<any>(null)
  const [typeCounts, setTypeCounts] = useState<{ key: string; count: number }[]>([])
  const [ePage, setEPage] = useState(1)
  const [eTotalPages, setETotalPages] = useState(1)
  const [eFilteredCount, setEFilteredCount] = useState(0)
  const [failedOnly, setFailedOnly] = useState(false)
  const [type, setType] = useState('')
  const [recipient, setRecipient] = useState('')

  // ── push state ──
  const [pushes, setPushes] = useState<PushRow[]>([])
  const [pSummary, setPSummary] = useState<any>(null)
  const [byOutcome, setByOutcome] = useState<{ key: string; count: number }[]>([])
  const [pFailedOnly, setPFailedOnly] = useState(false)
  const [outcome, setOutcome] = useState('')
  const [pPage, setPPage] = useState(1)
  const [pTotalPages, setPTotalPages] = useState(1)

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const loadEmails = useCallback(async () => {
    if (!token) return
    setLoading(true)
    setError('')
    try {
      const qs = new URLSearchParams()
      if (failedOnly) qs.set('failed', '1')
      if (type) qs.set('type', type)
      if (recipient) qs.set('recipient', recipient)
      qs.set('page', String(ePage))
      const r = await fetch(`/api/admin/emails?${qs}`, { headers: { Authorization: `Bearer ${token}` } })
      const d = await r.json()
      if (!r.ok) throw new Error(d.error || 'Failed to load email_log')
      setEmails(d.emails || [])
      setESummary(d.summary)
      setTypeCounts(d.typeCounts || [])
      setETotalPages(d.totalPages || 1)
      setEFilteredCount(d.filteredCount || 0)
    } catch (e: any) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [token, failedOnly, type, recipient, ePage])

  const loadPushes = useCallback(async () => {
    if (!token) return
    setLoading(true)
    setError('')
    try {
      const qs = new URLSearchParams()
      if (pFailedOnly) qs.set('failed', '1')
      if (outcome) qs.set('outcome', outcome)
      qs.set('page', String(pPage))
      const r = await fetch(`/api/admin/push?${qs}`, { headers: { Authorization: `Bearer ${token}` } })
      const d = await r.json()
      if (!r.ok) throw new Error(d.error || 'Failed to load push_log')
      setPushes(d.pushes || [])
      setPSummary(d.summary)
      setByOutcome(d.byOutcome || [])
      setPTotalPages(d.totalPages || 1)
    } catch (e: any) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [token, pFailedOnly, outcome, pPage])

  useEffect(() => { if (tab === 'email') loadEmails() }, [tab, loadEmails])
  useEffect(() => { if (tab === 'push') loadPushes() }, [tab, loadPushes])

  const emailColumns: Column<EmailRow>[] = [
    // RECIPIENT LEADS, so it is the column that sticks at 390. The shared
    // table pins its FIRST column, and the identity of a log row is who the
    // email went to — not when it went. With the date leading, a scrolled
    // table showed a column of timestamps belonging to nobody, which is the
    // same fault the sticky column was introduced to fix.
    { key: 'recipient', label: 'Recipient' },
    { key: 'created_at', label: 'Sent', render: (v: string) => fmt(v) },
    { key: 'email_type', label: 'Type' },
    { key: 'subject', label: 'Subject', render: (v: string | null) => v || <span className={styles.muted}>—</span> },
    {
      key: 'success', label: 'Result',
      render: (v: boolean, row) => (
        <>
          <span className={`${styles.badge} ${v ? styles.badge_ok : styles.badge_fail}`}>{v ? 'accepted' : 'failed'}</span>
          {row.error && <div className={styles.errCell}>{row.error}</div>}
        </>
      ),
    },
    {
      // Visible so a row can be matched against Resend without guessing.
      key: 'provider_message_id', label: 'Message ID',
      render: (v: string | null) => v ? <span className={styles.msgId}>{v}</span> : <span className={styles.muted}>—</span>,
    },
  ]

  const pushColumns: Column<PushRow>[] = [
    { key: 'created_at', label: 'Attempted', render: (v: string) => fmt(v) },
    { key: 'notification_type', label: 'Type' },
    { key: 'title', label: 'Title', render: (v: string | null) => v || <span className={styles.muted}>—</span> },
    {
      key: 'outcome', label: 'Outcome',
      render: (v: string, row) => (
        <>
          <span className={`${styles.badge} ${row.success ? styles.badge_ok : styles.badge_fail}`}>{v.replace(/_/g, ' ')}</span>
          {row.error && <div className={styles.errCell}>{row.error}</div>}
        </>
      ),
    },
    {
      key: 'provider_message_id', label: 'Message ID',
      render: (v: string | null) => v ? <span className={styles.msgId}>{v}</span> : <span className={styles.muted}>—</span>,
    },
  ]

  // THE FOUR STATES, derived rather than stored — this page already tracks
  // `loading` and `error` honestly, so a fifth piece of state would be a
  // second source of truth for the same fact.
  const emailState: 'loading' | 'ok' | 'empty' | 'error' =
    loading ? 'loading' : error ? 'error' : emails.length === 0 ? 'empty' : 'ok'
  const pushState: 'loading' | 'ok' | 'empty' | 'error' =
    loading ? 'loading' : error ? 'error' : pushes.length === 0 ? 'empty' : 'ok'

  return (
    <div>
      <AdminPageHeader
        title="Delivery"
        subtitle="Our own logs — what we attempted and what the provider accepted. Not deliveries, opens or bounces."
      />

      <div className={styles.tabBar}>
        <button type="button" onClick={() => setTab('email')} className={`${styles.tab} ${tab === 'email' ? styles.tabActive : ''}`}>Email</button>
        <button type="button" onClick={() => setTab('push')} className={`${styles.tab} ${tab === 'push' ? styles.tabActive : ''}`}>Push</button>
      </div>

      {/* The banner is gone: the table's own failed state now carries the
          message AND a Try again, and the stats strip shows em-dashes rather
          than numbers. Two renderings of one error is one more than needed,
          and the banner was the one without a way out of it. */}

      {tab === 'email' ? (
        <>
          {/* ATTEMPTED · ACCEPTED · FAILED, not SENT · FAILED. The old pair
              double-counted: "Sent" was every row including the failure, so
              the two cards summed to one more than the table held — and the
              footnote below already said a send counted here is one the
              provider ACCEPTED. The cards now agree with the footnote. */}
          <StatsStrip
            tableStatus={error ? 'error' : loading ? 'loading' : 'ok'}
            stats={[
              { label: 'Attempted', value: eSummary?.attempted ?? null },
              { label: 'Accepted', value: eSummary?.accepted ?? null },
              { label: 'Failed', value: eSummary?.failed ?? null },
              { label: 'Types', value: eSummary?.types ?? null },
              { label: 'Recipients', value: eSummary?.recipients ?? null },
            ]}
          />

          <p className={styles.footnote}>
            <strong>What these numbers are.</strong> A send counted here is one the email
            provider <em>accepted</em>. Nothing records a delivery, an open or a bounce —
            there is no provider webhook — so this page cannot tell you whether anyone read
            anything. <strong>The log starts {fmtDay(eSummary?.firstAt ?? null)}</strong>; it
            holds nothing sent before that, so an empty result for an earlier date means the
            row was never recorded, not that the email was never sent.
          </p>

          {/* THE FILTER ROW IS GONE INTO THE TOOLBAR. It was a third block of
              chrome — cards, footnote, filters — before a single row of the
              log, which is most of why this page was unreadable at 390.
              "Recipient contains…" IS the search, so it becomes the search
              field rather than a fourth control sitting beside one. */}
          <AdminTable
            columns={emailColumns}
            data={emails}
            page={ePage}
            totalPages={eTotalPages}
            onPageChange={setEPage}
            loading={loading}
            status={emailState}
            totalCount={emailState === 'error' ? null : eFilteredCount}
            query={recipient}
            filtersActive={(failedOnly ? 1 : 0) + (type ? 1 : 0) + (recipient ? 1 : 0)}
            filterSummary={[
              failedOnly ? 'Failed only' : null,
              type ? `Type: ${type}` : null,
            ].filter(Boolean).join(' and ') || undefined}
            onClearSearch={() => { setFailedOnly(false); setType(''); setRecipient(''); setEPage(1) }}
            onRetry={loadEmails}
            errorMessage={error || undefined}
            entityName="log rows"
            emptyTitle="Nothing logged yet."
            emptyBody={`The log starts ${fmtDay(eSummary?.firstAt ?? null)} and holds nothing sent before that.`}
            searchValue={recipient}
            onSearch={(v) => { setRecipient(v); setEPage(1) }}
            searchPlaceholder="Recipient contains…"
            filters={
              <>
                <button
                  type="button"
                  onClick={() => { setFailedOnly(v => !v); setEPage(1) }}
                  className={`${styles.failedToggle} ${failedOnly ? styles.failedToggleOn : ''}`}
                  aria-pressed={failedOnly}
                >
                  {failedOnly ? 'Showing failed only' : 'Failed only'}
                </button>
                <select className={styles.filterSelect} value={type} onChange={e => { setType(e.target.value); setEPage(1) }} aria-label="Filter by email type">
                  <option value="">All types</option>
                  {typeCounts.map(t => <option key={t.key} value={t.key}>{t.key} ({t.count})</option>)}
                </select>
              </>
            }
          />
        </>
      ) : (
        <>
          {/* THE ANSWER LINE. For push a sentence says more than the rows do:
              forty-five failures look like a broken feature until you read that
              thirty-four of them had nobody to send to. */}
          <div className={`${styles.answerLine} ${pSummary && pSummary.delivered === 0 ? styles.answerAlarm : ''}`}>
            <p className={styles.answerHead}>
              {pSummary
                ? `${pSummary.hookFires ?? '—'} hook fires, ${pSummary.attempts} dispatch attempts, ${pSummary.delivered} delivered — ${pSummary.noDevice} had no device registered.`
                : 'Loading…'}
            </p>
            <p className={styles.answerBody}>
              {pSummary?.liveTokens === 0
                ? 'No device is currently subscribed, so nothing can be delivered until someone enables push.'
                : `${pSummary?.liveTokens ?? '—'} device${pSummary?.liveTokens === 1 ? '' : 's'} currently subscribed.`}
              {pSummary?.unlogged ? ` ${pSummary.unlogged} hook fire${pSummary.unlogged === 1 ? '' : 's'} produced no dispatch row at all — the dispatcher logs every path including its failures, so those never reached it.` : ''}
            </p>
            {byOutcome.length > 0 && (
              <div className={styles.outcomeRow}>
                {byOutcome.map(o => (
                  <span key={o.key} className={styles.outcomeChip}>{o.key.replace(/_/g, ' ')} · {o.count}</span>
                ))}
              </div>
            )}
          </div>

          <p className={styles.footnote}>
            <strong>What this table cannot see.</strong> The on-device test route
            (<code>/api/diag-push/send</code>) deliberately writes no row here, so a test push
            that genuinely reached a handset leaves no trace — a real one did on 13 August
            2026. <strong>&ldquo;0 delivered&rdquo; therefore means no <em>automatic</em>{' '}
            notification has been delivered, not that push is broken.</strong> The delivery
            chain itself has been proven on a real device.
          </p>

          <AdminTable
            columns={pushColumns}
            data={pushes}
            page={pPage}
            totalPages={pTotalPages}
            onPageChange={setPPage}
            loading={loading}
            status={pushState}
            filtersActive={(pFailedOnly ? 1 : 0) + (outcome ? 1 : 0)}
            filterSummary={[
              pFailedOnly ? 'Failed only' : null,
              outcome ? `Outcome: ${outcome.replace(/_/g, ' ')}` : null,
            ].filter(Boolean).join(' and ') || undefined}
            onClearSearch={() => { setPFailedOnly(false); setOutcome(''); setPPage(1) }}
            onRetry={loadPushes}
            errorMessage={error || undefined}
            entityName="dispatch rows"
            /* "0 delivered" does NOT mean push is broken — the on-device test
               route writes no row here by design. The empty state has to say
               so, because someone drew exactly that wrong conclusion from this
               table on 15 Aug. */
            emptyTitle="No dispatch rows yet."
            emptyBody="Nothing has been dispatched, or nothing matched. The on-device test route writes no row here, so this is not evidence that push is broken."
            filters={
              <>
                <button
                  type="button"
                  onClick={() => { setPFailedOnly(v => !v); setPPage(1) }}
                  className={`${styles.failedToggle} ${pFailedOnly ? styles.failedToggleOn : ''}`}
                  aria-pressed={pFailedOnly}
                >
                  {pFailedOnly ? 'Showing failed only' : 'Failed only'}
                </button>
                <select className={styles.filterSelect} value={outcome} onChange={e => { setOutcome(e.target.value); setPPage(1) }} aria-label="Filter by outcome">
                  <option value="">All outcomes</option>
                  {byOutcome.map(o => <option key={o.key} value={o.key}>{o.key.replace(/_/g, ' ')} ({o.count})</option>)}
                </select>
              </>
            }
          />
        </>
      )}
    </div>
  )
}

'use client'

import { useEffect, useMemo, useState } from 'react'
import { Ico } from '@/components/icons'

/**
 * Status-aware modal for terminating an offer. Three scenarios:
 *
 *   1. status='pending' → "Withdraw offer" (low risk, no reason needed)
 *   2. status='accepted' + offer is conditional → "Rescind offer" (reason dropdown)
 *   3. status='accepted' + offer is unconditional → "Rescind binding offer"
 *      (free-text reason + type-to-confirm phrase)
 *
 * Caller decides which scenario applies (using `isOfferConditional` from
 * lib/offerConditional.ts) and passes it as the `scenario` prop. The modal
 * renders the appropriate copy, captures the necessary fields, and hands the
 * payload to onConfirm — it does not make any network calls itself.
 *
 * Audit-first ordering is enforced server-side; this component just collects
 * the inputs.
 */

export type WithdrawScenario = 'pending' | 'rescind_conditional' | 'rescind_unconditional'

export type ReasonCode =
  | 'failed_rtw'
  | 'failed_references'
  | 'failed_dbs'
  | 'mutual_agreement'
  | 'other'

export interface WithdrawConfirmPayload {
  /** 'withdrawn' | 'rescinded_for_condition' | 'rescinded_unconditional' */
  action: 'withdrawn' | 'rescinded_for_condition' | 'rescinded_unconditional'
  reasonCode: ReasonCode | null
  reasonDetail: string | null
}

interface Props {
  isOpen: boolean
  scenario: WithdrawScenario
  candidateName: string
  jobTitle: string
  submitting?: boolean
  errorMessage?: string | null
  onClose: () => void
  onConfirm: (payload: WithdrawConfirmPayload) => void
}

const REASON_OPTIONS: { value: ReasonCode; label: string }[] = [
  { value: 'failed_rtw', label: 'Failed right-to-work check' },
  { value: 'failed_references', label: 'Unsatisfactory references' },
  { value: 'failed_dbs', label: 'Failed DBS check' },
  { value: 'mutual_agreement', label: 'Mutual agreement (no fault on either side)' },
  { value: 'other', label: 'Other' },
]

const TYPE_TO_CONFIRM_PHRASE = 'I accept the risk of a breach-of-contract claim'

export default function WithdrawOrRescindModal({
  isOpen,
  scenario,
  candidateName,
  jobTitle,
  submitting,
  errorMessage,
  onClose,
  onConfirm,
}: Props) {
  const [reasonCode, setReasonCode] = useState<ReasonCode | ''>('')
  const [otherDetail, setOtherDetail] = useState('')
  const [unconditionalReason, setUnconditionalReason] = useState('')
  const [confirmPhrase, setConfirmPhrase] = useState('')

  // Reset all transient state every time the modal opens — never carry stale
  // input across separate withdraw attempts.
  useEffect(() => {
    if (isOpen) {
      setReasonCode('')
      setOtherDetail('')
      setUnconditionalReason('')
      setConfirmPhrase('')
    }
  }, [isOpen])

  const canConfirm = useMemo(() => {
    if (submitting) return false
    if (scenario === 'pending') return true
    if (scenario === 'rescind_conditional') {
      if (!reasonCode) return false
      if (reasonCode === 'other' && !otherDetail.trim()) return false
      return true
    }
    // unconditional
    return (
      unconditionalReason.trim().length > 0
      && confirmPhrase.trim().toLowerCase() === TYPE_TO_CONFIRM_PHRASE.toLowerCase()
    )
  }, [scenario, reasonCode, otherDetail, unconditionalReason, confirmPhrase, submitting])

  if (!isOpen) return null

  const submit = () => {
    if (!canConfirm) return
    if (scenario === 'pending') {
      onConfirm({ action: 'withdrawn', reasonCode: null, reasonDetail: null })
      return
    }
    if (scenario === 'rescind_conditional') {
      onConfirm({
        action: 'rescinded_for_condition',
        reasonCode: reasonCode as ReasonCode,
        reasonDetail: reasonCode === 'other' ? otherDetail.trim() : null,
      })
      return
    }
    onConfirm({
      action: 'rescinded_unconditional',
      reasonCode: null,
      reasonDetail: unconditionalReason.trim(),
    })
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      style={{
        position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.55)',
        zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: '1rem',
      }}
      onClick={(e) => { if (e.target === e.currentTarget && !submitting) onClose() }}
    >
      <div
        style={{
          background: '#fff', borderRadius: 12, maxWidth: 560, width: '100%',
          maxHeight: '90vh', overflowY: 'auto',
          boxShadow: '0 20px 60px rgba(15,23,42,0.35)',
        }}
      >
        {scenario === 'pending' && (
          <PendingBody
            candidateName={candidateName}
            jobTitle={jobTitle}
          />
        )}
        {scenario === 'rescind_conditional' && (
          <ConditionalBody
            candidateName={candidateName}
            jobTitle={jobTitle}
            reasonCode={reasonCode}
            onReasonCodeChange={setReasonCode}
            otherDetail={otherDetail}
            onOtherDetailChange={setOtherDetail}
            submitting={submitting}
          />
        )}
        {scenario === 'rescind_unconditional' && (
          <UnconditionalBody
            candidateName={candidateName}
            jobTitle={jobTitle}
            reason={unconditionalReason}
            onReasonChange={setUnconditionalReason}
            confirmPhrase={confirmPhrase}
            onConfirmPhraseChange={setConfirmPhrase}
            submitting={submitting}
          />
        )}

        {errorMessage && (
          <div
            role="alert"
            style={{
              margin: '0 1.5rem 1rem', padding: '0.75rem 1rem',
              background: '#fef2f2', border: '1px solid #fecaca',
              borderRadius: 8, color: '#b91c1c', fontSize: '0.85rem',
            }}
          >
            {errorMessage}
          </div>
        )}

        <Footer scenario={scenario} canConfirm={canConfirm} submitting={!!submitting} onClose={onClose} onConfirm={submit} />
      </div>
    </div>
  )
}

// ── Scenario bodies ──────────────────────────────────────

function PendingBody({ candidateName, jobTitle }: { candidateName: string; jobTitle: string }) {
  return (
    <div style={{ padding: '1.5rem 1.5rem 0' }}>
      <h2 style={titleStyle}>Withdraw offer</h2>
      <p style={paragraphStyle}>
        {candidateName} has not yet counter-signed your offer for {jobTitle}. The candidate will be notified that the offer has been withdrawn, and it will be removed from their dashboard. No contract exists, so there is no legal exposure on either side. The offer can&apos;t be reactivated; if you want to re-engage later, you&apos;ll need to send a fresh offer.
      </p>
    </div>
  )
}

function ConditionalBody({
  candidateName, jobTitle, reasonCode, onReasonCodeChange, otherDetail, onOtherDetailChange, submitting,
}: {
  candidateName: string
  jobTitle: string
  reasonCode: ReasonCode | ''
  onReasonCodeChange: (v: ReasonCode | '') => void
  otherDetail: string
  onOtherDetailChange: (v: string) => void
  submitting?: boolean
}) {
  return (
    <div style={{ padding: '1.5rem 1.5rem 0' }}>
      <h2 style={titleStyle}>Rescind offer</h2>
      <p style={paragraphStyle}>
        {candidateName} has counter-signed this offer for {jobTitle}, which means a binding contract of employment now exists between you and them. You may only rescind for a stated reason — typically because a pre-employment condition the offer depended on couldn&apos;t be met, or because both parties agreed to part ways before the start date.
      </p>
      <p style={paragraphStyle}>
        Select the reason below. This is recorded in the offer&apos;s audit log. The candidate will see a sanitised summary explaining why the offer ended.
      </p>

      <label style={labelStyle}>Reason for rescinding *</label>
      <select
        value={reasonCode}
        onChange={(e) => onReasonCodeChange(e.target.value as ReasonCode | '')}
        disabled={submitting}
        data-testid="rescind-reason-select"
        style={selectStyle}
      >
        <option value="">— Select reason —</option>
        {REASON_OPTIONS.map(o => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>

      {reasonCode === 'other' && (
        <div style={{ marginTop: '0.875rem' }}>
          <label style={labelStyle}>Briefly describe the reason *</label>
          <textarea
            value={otherDetail}
            onChange={(e) => onOtherDetailChange(e.target.value.slice(0, 500))}
            disabled={submitting}
            placeholder="This is for internal audit only and is not shown to the candidate."
            rows={3}
            data-testid="rescind-other-detail"
            style={textareaStyle}
          />
          <p style={helperStyle}>{otherDetail.length}/500</p>
        </div>
      )}
    </div>
  )
}

function UnconditionalBody({
  candidateName, jobTitle, reason, onReasonChange, confirmPhrase, onConfirmPhraseChange, submitting,
}: {
  candidateName: string
  jobTitle: string
  reason: string
  onReasonChange: (v: string) => void
  confirmPhrase: string
  onConfirmPhraseChange: (v: string) => void
  submitting?: boolean
}) {
  return (
    <div style={{ padding: '1.5rem 1.5rem 0' }}>
      <h2 style={{ ...titleStyle, color: '#b91c1c' }}><Ico name="alert-triangle" size={16} /> Rescind binding offer</h2>
      <p style={paragraphStyle}>
        {candidateName} has counter-signed this offer for {jobTitle}, creating a binding contract of employment. The offer letter does not appear to contain pre-employment conditions (right-to-work, references, DBS, or probation completion) that would give you a contractual right to rescind.
      </p>
      <p style={{ ...paragraphStyle, color: '#b91c1c', fontWeight: 600 }}>
        Rescinding now may expose you to a breach-of-contract claim. The candidate could seek damages equivalent to the contractual notice period, plus foreseeable losses (e.g. relocation costs, leaving a previous job).
      </p>
      <p style={paragraphStyle}>
        We strongly recommend speaking to an employment solicitor before proceeding. Continue only if you understand the risk.
      </p>

      <label style={labelStyle}>Why are you rescinding this offer? *</label>
      <p style={helperStyle}>
        This is recorded in the audit log for legal review and may be disclosed in any subsequent dispute.
      </p>
      <textarea
        value={reason}
        onChange={(e) => onReasonChange(e.target.value.slice(0, 500))}
        disabled={submitting}
        rows={4}
        data-testid="unconditional-reason"
        style={textareaStyle}
      />
      <p style={helperStyle}>{reason.length}/500</p>

      <label style={{ ...labelStyle, marginTop: '0.875rem' }}>
        Type <strong>{TYPE_TO_CONFIRM_PHRASE}</strong> to enable the rescind button *
      </label>
      <input
        type="text"
        value={confirmPhrase}
        onChange={(e) => onConfirmPhraseChange(e.target.value)}
        disabled={submitting}
        autoComplete="off"
        autoCorrect="off"
        autoCapitalize="off"
        spellCheck={false}
        data-testid="unconditional-confirm-phrase"
        style={inputStyle}
      />
    </div>
  )
}

// ── Footer (shared across all scenarios) ────────────────

function Footer({
  scenario, canConfirm, submitting, onClose, onConfirm,
}: {
  scenario: WithdrawScenario
  canConfirm: boolean
  submitting: boolean
  onClose: () => void
  onConfirm: () => void
}) {
  const confirmLabel =
    scenario === 'pending' ? 'Withdraw offer'
    : scenario === 'rescind_conditional' ? 'Rescind offer for stated reason'
    : 'Rescind anyway'

  const isDestructive = scenario === 'rescind_unconditional'

  return (
    <div style={{ padding: '0 1.5rem 1.25rem' }}>
      <div style={{ display: 'flex', gap: '0.625rem', flexWrap: 'wrap', marginBottom: '0.875rem' }}>
        <button
          type="button"
          onClick={onClose}
          disabled={submitting}
          data-testid="modal-cancel"
          style={cancelButtonStyle}
        >
          Keep offer active
        </button>
        <button
          type="button"
          onClick={onConfirm}
          disabled={!canConfirm}
          data-testid="modal-confirm"
          style={confirmButtonStyle(canConfirm, isDestructive)}
        >
          {submitting ? 'Working…' : confirmLabel}
        </button>
      </div>
      <p
        style={{
          margin: 0,
          fontSize: '0.78rem',
          color: '#475569',
          fontStyle: 'italic',
          lineHeight: 1.4,
          paddingTop: '0.625rem',
          borderTop: '1px solid #e2e8f0',
        }}
      >
        This is not legal advice. Consult a solicitor for guidance on specific employment matters.
      </p>
    </div>
  )
}

// ── Styles ──────────────────────────────────────────────

const titleStyle: React.CSSProperties = {
  margin: '0 0 0.875rem',
  fontSize: '1.125rem',
  fontWeight: 700,
  color: '#0f172a',
}
const paragraphStyle: React.CSSProperties = {
  margin: '0 0 0.75rem',
  fontSize: '0.875rem',
  lineHeight: 1.55,
  color: '#334155',
}
const labelStyle: React.CSSProperties = {
  display: 'block',
  marginTop: '0.625rem',
  marginBottom: '0.375rem',
  fontSize: '0.78rem',
  fontWeight: 600,
  color: '#0f172a',
}
const helperStyle: React.CSSProperties = {
  margin: '0.25rem 0 0',
  fontSize: '0.72rem',
  color: '#64748b',
}
const selectStyle: React.CSSProperties = {
  width: '100%',
  padding: '0.5rem 0.625rem',
  border: '1px solid #cbd5e1',
  borderRadius: 6,
  fontSize: '0.875rem',
  background: '#fff',
}
const textareaStyle: React.CSSProperties = {
  width: '100%',
  padding: '0.5rem 0.625rem',
  border: '1px solid #cbd5e1',
  borderRadius: 6,
  fontSize: '0.85rem',
  fontFamily: 'inherit',
  lineHeight: 1.5,
  resize: 'vertical',
  boxSizing: 'border-box',
}
const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '0.5rem 0.625rem',
  border: '1px solid #cbd5e1',
  borderRadius: 6,
  fontSize: '0.875rem',
  boxSizing: 'border-box',
}
const cancelButtonStyle: React.CSSProperties = {
  flex: '1 1 38%',
  padding: '0.625rem',
  background: '#fff',
  color: '#0f172a',
  border: '1px solid #cbd5e1',
  borderRadius: 6,
  fontSize: '0.85rem',
  fontWeight: 600,
  cursor: 'pointer',
}
const confirmButtonStyle = (canConfirm: boolean, destructive: boolean): React.CSSProperties => ({
  flex: '1 1 55%',
  padding: '0.625rem',
  background: !canConfirm ? '#cbd5e1' : destructive ? '#b91c1c' : '#0f172a',
  color: !canConfirm ? '#fff' : destructive ? '#fff' : '#FFE500',
  border: 'none',
  borderRadius: 6,
  fontSize: '0.85rem',
  fontWeight: 700,
  cursor: canConfirm ? 'pointer' : 'not-allowed',
})

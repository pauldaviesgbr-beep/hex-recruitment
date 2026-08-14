'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import Header from '@/components/Header'
import SignedLink from '@/components/SignedLink'
import { supabase } from '@/lib/supabase'
import { getSessionWithRetry } from '@/lib/getSessionWithRetry'
import { getCurrentEmployerOwnerId } from '@/lib/employer'
import { Ico } from '@/components/icons'

type OfferStatus = 'pending' | 'accepted' | 'declined' | 'withdrawn'

interface OfferRow {
  id: string
  applicationId: string
  jobId: string
  jobTitle: string
  candidateId: string
  candidateName: string
  salary: string
  startDate: string
  contractType: string
  status: OfferStatus
  sentAt: string
  signedAt: string | null
  employerSignedAt: string | null
  offerLetterUrl: string | null
  aiSummary: string | null
  aiTags: string[]
}

// Human-readable label + colour for each tag vocabulary entry. Anything
// outside this list falls through to a neutral default.
const TAG_STYLES: Record<string, { label: string; bg: string; fg: string }> = {
  'full-time': { label: 'Full-time', bg: '#e0f2fe', fg: '#075985' },
  'part-time': { label: 'Part-time', bg: '#e0f2fe', fg: '#075985' },
  'temporary': { label: 'Temporary', bg: '#fef3c7', fg: '#92400e' },
  'fixed-term': { label: 'Fixed-term', bg: '#fef3c7', fg: '#92400e' },
  'zero-hours': { label: 'Zero-hours', bg: '#fef3c7', fg: '#92400e' },
  'casual': { label: 'Casual', bg: '#fef3c7', fg: '#92400e' },
  'probation-3mo': { label: '3mo probation', bg: '#f1f5f9', fg: '#475569' },
  'probation-6mo': { label: '6mo probation', bg: '#f1f5f9', fg: '#475569' },
  'notice-1wk': { label: '1wk notice', bg: '#f1f5f9', fg: '#475569' },
  'notice-1mo': { label: '1mo notice', bg: '#f1f5f9', fg: '#475569' },
  'notice-3mo': { label: '3mo notice', bg: '#f1f5f9', fg: '#475569' },
  'has-nda': { label: 'NDA', bg: '#fae8ff', fg: '#86198f' },
  'has-noncompete': { label: 'Non-compete', bg: '#fae8ff', fg: '#86198f' },
  'has-dbs': { label: 'DBS', bg: '#fef2f2', fg: '#991b1b' },
  'has-uniform': { label: 'Uniform', bg: '#ecfeff', fg: '#155e75' },
  'has-pension': { label: 'Pension', bg: '#f0fdf4', fg: '#166534' },
  'has-health-insurance': { label: 'Health ins.', bg: '#f0fdf4', fg: '#166534' },
  'right-to-work': { label: 'RTW check', bg: '#fef2f2', fg: '#991b1b' },
  'references-required': { label: 'References', bg: '#fef2f2', fg: '#991b1b' },
  'remote-ok': { label: 'Remote', bg: '#eef2ff', fg: '#4338ca' },
  'hybrid': { label: 'Hybrid', bg: '#eef2ff', fg: '#4338ca' },
  'onsite': { label: 'On-site', bg: '#eef2ff', fg: '#4338ca' },
  'garden-leave': { label: 'Garden leave', bg: '#fae8ff', fg: '#86198f' },
  'ip-assignment': { label: 'IP assignment', bg: '#fae8ff', fg: '#86198f' },
  'safeguarding': { label: 'Safeguarding', bg: '#fef2f2', fg: '#991b1b' },
  'occupational-health': { label: 'Occ. health', bg: '#fef2f2', fg: '#991b1b' },
}
const tagStyle = (t: string) => TAG_STYLES[t] || { label: t, bg: '#f1f5f9', fg: '#475569' }

// How many days a pending offer is allowed to sit before we flag it.
const STALE_PENDING_DAYS = 7

const STATUS_LABEL: Record<OfferStatus, { label: string; bg: string; fg: string }> = {
  pending: { label: 'Pending', bg: '#fef3c7', fg: '#92400e' },
  accepted: { label: 'Accepted', bg: '#dcfce7', fg: '#166534' },
  declined: { label: 'Declined', bg: '#fee2e2', fg: '#b91c1c' },
  withdrawn: { label: 'Withdrawn', bg: '#f1f5f9', fg: '#334155' },
}

function csvEscape(value: string): string {
  // Standard RFC 4180 field escaping — quote and double-up internal quotes
  // whenever the value contains a comma, quote, or line break.
  if (/[",\n\r]/.test(value)) return `"${value.replace(/"/g, '""')}"`
  return value
}

// Salary strings come from the DB as free text and are inconsistent — some
// are pre-formatted ("£105,000 per annum"), others are raw ("60000 per annum").
// Normalise display only; storage is untouched. Already-formatted rows pass
// through. Non-numeric labels ("Competitive", "DOE") fall through unchanged.
function formatOfferSalary(raw: string): string {
  if (!raw) return '—'
  if (raw.includes('£')) return raw
  const m = raw.match(/^(\d[\d,]*)(.*)$/)
  if (!m) return raw
  const n = parseInt(m[1].replace(/,/g, ''), 10)
  if (Number.isNaN(n)) return raw
  return `£${n.toLocaleString('en-GB')}${m[2]}`
}

export default function OffersPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [offers, setOffers] = useState<OfferRow[]>([])
  const [statusFilter, setStatusFilter] = useState<OfferStatus | 'all'>('all')
  const [jobFilter, setJobFilter] = useState<string>('all')
  const [tagFilter, setTagFilter] = useState<string>('all')
  const [search, setSearch] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')

  useEffect(() => {
    const load = async () => {
      const session = await getSessionWithRetry()
      if (!session || session.user.user_metadata?.role !== 'employer') {
        router.push('/login/employer')
        return
      }

      // Multi-user: offers are keyed employer_id = owner user_id.
      const ownerId = (await getCurrentEmployerOwnerId(supabase)) ?? session.user.id
      const { data, error } = await supabase
        .from('job_offers')
        .select('id, application_id, job_id, candidate_id, salary, start_date, contract_type, status, offer_letter_url, created_at, signature_timestamp, employer_signature_timestamp, ai_summary, ai_tags, jobs ( title )')
        .eq('employer_id', ownerId)
        .order('created_at', { ascending: false })

      if (error) {
        console.error('Failed to load offers:', error)
        setOffers([])
        setLoading(false)
        return
      }

      // Candidate FK points at auth.users, not candidate_profiles, so we
      // can't join it via PostgREST. Batch-fetch the needed profiles.
      const candidateIds = Array.from(new Set((data || []).map((r: any) => r.candidate_id).filter(Boolean)))
      const nameById: Record<string, string> = {}
      if (candidateIds.length > 0) {
        const { data: profiles } = await supabase
          .from('candidate_profiles')
          .select('user_id, full_name')
          .in('user_id', candidateIds)
        for (const p of profiles || []) nameById[p.user_id as string] = p.full_name || '—'
      }

      const rows: OfferRow[] = (data || []).map((r: any) => {
        const job = Array.isArray(r.jobs) ? r.jobs[0] : r.jobs
        return {
          id: r.id,
          applicationId: r.application_id,
          jobId: r.job_id,
          jobTitle: job?.title || '—',
          candidateId: r.candidate_id,
          candidateName: nameById[r.candidate_id] || '—',
          salary: r.salary,
          startDate: r.start_date,
          contractType: r.contract_type,
          status: r.status,
          sentAt: r.created_at,
          signedAt: r.signature_timestamp,
          employerSignedAt: r.employer_signature_timestamp,
          offerLetterUrl: r.offer_letter_url,
          aiSummary: r.ai_summary || null,
          aiTags: Array.isArray(r.ai_tags) ? r.ai_tags : [],
        }
      })

      setOffers(rows)
      setLoading(false)
    }

    load()
  }, [router])

  // Derive the job-filter options from the loaded offers so the dropdown only
  // lists jobs that actually have offers on them.
  const jobOptions = useMemo(() => {
    const seen = new Map<string, string>()
    for (const o of offers) seen.set(o.jobId, o.jobTitle)
    return Array.from(seen.entries()).map(([id, title]) => ({ id, title }))
  }, [offers])

  // Tag options come from the set of tags actually applied to any offer.
  const tagOptions = useMemo(() => {
    const seen = new Set<string>()
    for (const o of offers) for (const t of o.aiTags) seen.add(t)
    return Array.from(seen).sort()
  }, [offers])

  const staleThreshold = Date.now() - STALE_PENDING_DAYS * 24 * 60 * 60 * 1000
  const isStale = (o: OfferRow) =>
    o.status === 'pending' && new Date(o.sentAt).getTime() < staleThreshold

  const filtered = useMemo(() => {
    const from = dateFrom ? new Date(dateFrom).getTime() : null
    const to = dateTo ? new Date(dateTo).getTime() + 24 * 60 * 60 * 1000 - 1 : null
    const q = search.trim().toLowerCase()

    return offers.filter((o) => {
      if (statusFilter !== 'all' && o.status !== statusFilter) return false
      if (jobFilter !== 'all' && o.jobId !== jobFilter) return false
      if (tagFilter === 'stale' && !isStale(o)) return false
      if (tagFilter !== 'all' && tagFilter !== 'stale' && !o.aiTags.includes(tagFilter)) return false
      if (q) {
        const haystack = `${o.candidateName} ${o.jobTitle} ${o.aiSummary || ''}`.toLowerCase()
        if (!haystack.includes(q)) return false
      }
      const sent = new Date(o.sentAt).getTime()
      if (from !== null && sent < from) return false
      if (to !== null && sent > to) return false
      return true
    })
    // isStale depends on staleThreshold which is recomputed every render;
    // intentionally leaving it out of deps so filter uses the current value.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [offers, statusFilter, jobFilter, tagFilter, search, dateFrom, dateTo])

  const exportCsv = () => {
    const header = ['Candidate', 'Job', 'Summary', 'Tags', 'Salary', 'Start Date', 'Contract', 'Status', 'Sent', 'Employer Signed', 'Candidate Signed']
    const lines = [header.map(csvEscape).join(',')]
    for (const o of filtered) {
      lines.push([
        o.candidateName,
        o.jobTitle,
        o.aiSummary || '',
        o.aiTags.join(';'),
        o.salary,
        o.startDate,
        o.contractType,
        o.status,
        o.sentAt,
        o.employerSignedAt || '',
        o.signedAt || '',
      ].map(v => csvEscape(String(v || ''))).join(','))
    }
    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `offers-${new Date().toISOString().slice(0, 10)}.csv`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  const clearFilters = () => {
    setStatusFilter('all')
    setJobFilter('all')
    setTagFilter('all')
    setSearch('')
    setDateFrom('')
    setDateTo('')
  }

  const hasActiveFilters = statusFilter !== 'all' || jobFilter !== 'all' || tagFilter !== 'all' || search || dateFrom || dateTo

  const fmtDate = (iso: string | null) => {
    if (!iso) return '—'
    try {
      return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
    } catch {
      return iso
    }
  }

  return (
    <main>
      <Header />
      <div style={{ maxWidth: 1200, margin: '0 auto', padding: '1.5rem 1rem 4rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', flexWrap: 'wrap', gap: '1rem', marginBottom: '1rem' }}>
          <div>
            <h1 style={{ margin: 0, fontSize: '1.75rem', fontWeight: 700, color: '#0f172a' }}>Offers</h1>
            <p style={{ margin: '0.25rem 0 0', fontSize: '0.95rem', color: '#64748b' }}>
              Every offer you've sent, across every job. Filter, export, or download the signed PDF.
            </p>
          </div>
          <button
            type="button"
            onClick={exportCsv}
            disabled={filtered.length === 0}
            style={{
              padding: '0.625rem 1rem', border: '1px solid #e2e8f0', borderRadius: 8,
              background: filtered.length === 0 ? '#f1f5f9' : '#fff',
              cursor: filtered.length === 0 ? 'not-allowed' : 'pointer',
              fontSize: '0.85rem', fontWeight: 600, color: '#334155',
            }}
          >
            ⬇ Export CSV ({filtered.length})
          </button>
        </div>

        {/* Filter row */}
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '1rem', padding: '0.875rem', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 10 }}>
          <input
            type="search"
            placeholder="Search candidate or job..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ flex: '2 1 220px', padding: '0.5rem 0.75rem', border: '1px solid #cbd5e1', borderRadius: 8, fontSize: '0.85rem' }}
          />
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as OfferStatus | 'all')}
            style={{ flex: '1 1 140px', padding: '0.5rem 0.75rem', border: '1px solid #cbd5e1', borderRadius: 8, fontSize: '0.85rem', background: '#fff' }}
          >
            <option value="all">All statuses</option>
            <option value="pending">Pending</option>
            <option value="accepted">Accepted</option>
            <option value="declined">Declined</option>
            <option value="withdrawn">Withdrawn</option>
          </select>
          <select
            value={jobFilter}
            onChange={(e) => setJobFilter(e.target.value)}
            style={{ flex: '1 1 180px', padding: '0.5rem 0.75rem', border: '1px solid #cbd5e1', borderRadius: 8, fontSize: '0.85rem', background: '#fff' }}
          >
            <option value="all">All jobs</option>
            {jobOptions.map(j => (
              <option key={j.id} value={j.id}>{j.title}</option>
            ))}
          </select>
          <select
            value={tagFilter}
            onChange={(e) => setTagFilter(e.target.value)}
            style={{ flex: '1 1 160px', padding: '0.5rem 0.75rem', border: '1px solid #cbd5e1', borderRadius: 8, fontSize: '0.85rem', background: '#fff' }}
          >
            <option value="all">All tags</option>
            <option value="stale"><Ico name="clock" size={16} /> Stale (pending &gt;{STALE_PENDING_DAYS}d)</option>
            {tagOptions.length > 0 && <option disabled>──────</option>}
            {tagOptions.map(t => (
              <option key={t} value={t}>{tagStyle(t).label}</option>
            ))}
          </select>
          <div style={{ display: 'flex', gap: '0.375rem', alignItems: 'center', flex: '1 1 240px', flexWrap: 'wrap', minWidth: 0 }}>
            <label style={{ fontSize: '0.75rem', color: '#64748b' }}>Sent:</label>
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              style={{ flex: 1, padding: '0.45rem 0.5rem', border: '1px solid #cbd5e1', borderRadius: 8, fontSize: '0.8rem' }}
            />
            <span style={{ color: '#94a3b8' }}>→</span>
            <input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              style={{ flex: 1, padding: '0.45rem 0.5rem', border: '1px solid #cbd5e1', borderRadius: 8, fontSize: '0.8rem' }}
            />
          </div>
          {hasActiveFilters && (
            <button
              type="button"
              onClick={clearFilters}
              style={{ padding: '0.5rem 0.75rem', background: 'none', border: 'none', color: '#0369a1', cursor: 'pointer', fontSize: '0.8rem', textDecoration: 'underline' }}
            >
              Clear
            </button>
          )}
        </div>

        {loading ? (
          <div style={{ padding: '3rem', textAlign: 'center', color: '#94a3b8' }}>Loading offers...</div>
        ) : filtered.length === 0 ? (
          <div style={{ padding: '3rem', textAlign: 'center', background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, color: '#64748b' }}>
            {offers.length === 0
              ? 'You haven\'t sent any offers yet. They\'ll show up here once you do.'
              : 'No offers match the current filters.'}
          </div>
        ) : (
          <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
              <thead>
                <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                  <th style={{ textAlign: 'left', padding: '0.625rem 0.75rem', fontWeight: 600, color: '#334155', whiteSpace: 'nowrap' }}>Candidate</th>
                  <th style={{ textAlign: 'left', padding: '0.625rem 0.75rem', fontWeight: 600, color: '#334155', minWidth: 160 }}>Job</th>
                  <th style={{ textAlign: 'left', padding: '0.625rem 0.75rem', fontWeight: 600, color: '#334155', minWidth: 180 }}>Summary</th>
                  <th style={{ textAlign: 'left', padding: '0.625rem 0.75rem', fontWeight: 600, color: '#334155', whiteSpace: 'nowrap' }}>Salary</th>
                  <th style={{ textAlign: 'left', padding: '0.625rem 0.75rem', fontWeight: 600, color: '#334155', whiteSpace: 'nowrap' }}>Start</th>
                  <th style={{ textAlign: 'left', padding: '0.625rem 0.75rem', fontWeight: 600, color: '#334155' }}>Status</th>
                  <th style={{ textAlign: 'left', padding: '0.625rem 0.75rem', fontWeight: 600, color: '#334155', whiteSpace: 'nowrap' }}>Sent</th>
                  <th style={{ textAlign: 'left', padding: '0.625rem 0.75rem', fontWeight: 600, color: '#334155', whiteSpace: 'nowrap' }}>Candidate signed</th>
                  <th style={{ textAlign: 'left', padding: '0.625rem 0.75rem', fontWeight: 600, color: '#334155' }}>PDF</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(o => {
                  const badge = STATUS_LABEL[o.status] || STATUS_LABEL.pending
                  const stale = isStale(o)
                  return (
                    <tr
                      key={o.id}
                      style={{ borderBottom: '1px solid #f1f5f9', cursor: 'pointer', verticalAlign: 'top' }}
                      onClick={() => router.push(`/my-jobs/${o.jobId}/applications?applicationId=${o.applicationId}`)}
                    >
                      <td style={{ padding: '0.625rem 0.75rem', fontWeight: 600, color: '#0f172a', whiteSpace: 'nowrap' }}>{o.candidateName}</td>
                      <td style={{ padding: '0.625rem 0.75rem', color: '#475569' }}>{o.jobTitle}</td>
                      <td style={{ padding: '0.625rem 0.75rem', color: '#475569' }}>
                        {o.aiSummary ? (
                          <p style={{ margin: 0, fontSize: '0.82rem', lineHeight: 1.4, color: '#334155' }}>{o.aiSummary}</p>
                        ) : (
                          <span style={{ fontSize: '0.78rem', color: '#cbd5e1' }}>—</span>
                        )}
                      </td>
                      <td style={{ padding: '0.625rem 0.75rem', color: '#475569', whiteSpace: 'nowrap' }}>{formatOfferSalary(o.salary)}</td>
                      <td style={{ padding: '0.625rem 0.75rem', color: '#475569', whiteSpace: 'nowrap' }}>{fmtDate(o.startDate)}</td>
                      <td style={{ padding: '0.625rem 0.75rem', whiteSpace: 'nowrap' }}>
                        <span style={{ display: 'inline-block', padding: '0.15rem 0.55rem', borderRadius: 99, background: badge.bg, color: badge.fg, fontSize: '0.72rem', fontWeight: 600 }}>
                          {badge.label}
                        </span>
                        {stale && (
                          <span title={`Pending > ${STALE_PENDING_DAYS} days`} style={{ marginLeft: 6, display: 'inline-block', padding: '0.15rem 0.5rem', borderRadius: 99, background: '#fff7ed', color: '#c2410c', fontSize: '0.7rem', fontWeight: 600 }}>
                            <Ico name="clock" size={16} /> Stale
                          </span>
                        )}
                      </td>
                      <td style={{ padding: '0.625rem 0.75rem', color: '#64748b', whiteSpace: 'nowrap' }}>{fmtDate(o.sentAt)}</td>
                      <td style={{ padding: '0.625rem 0.75rem', color: '#64748b', whiteSpace: 'nowrap' }}>{fmtDate(o.signedAt)}</td>
                      <td style={{ padding: '0.625rem 0.75rem', whiteSpace: 'nowrap' }} onClick={(e) => e.stopPropagation()}>
                        {o.offerLetterUrl ? (
                          <SignedLink src={o.offerLetterUrl} download style={{ color: '#0369a1', fontSize: '0.8rem', textDecoration: 'underline' }}>
                            ⬇ Download
                          </SignedLink>
                        ) : (
                          <span style={{ color: '#cbd5e1', fontSize: '0.8rem' }}>—</span>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </main>
  )
}

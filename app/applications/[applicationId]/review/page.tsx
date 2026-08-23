'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import Header from '@/components/Header'
import SignedLink from '@/components/SignedLink'
import { supabase } from '@/lib/supabase'
import ReviewClient from './ReviewClient'

type OfferStatus = 'pending' | 'accepted' | 'declined' | 'withdrawn' | 'rescinded'

interface OfferRow {
  id: string
  status: OfferStatus
  offerLetterText: string | null
  offerLetterUrl: string | null
  signatureName: string | null
  signatureTimestamp: string | null
  employerSignatureName: string | null
  jobTitle: string
  company: string
}

type Phase =
  | { kind: 'loading' }
  | { kind: 'redirecting' }
  | { kind: 'not_found' }
  | { kind: 'pending'; offer: OfferRow; candidateName: string }
  | { kind: 'accepted'; offer: OfferRow }
  | { kind: 'declined'; offer: OfferRow }
  | { kind: 'withdrawn'; offer: OfferRow; summary: string | null }
  | { kind: 'rescinded'; offer: OfferRow; summary: string | null }

export default function ReviewOfferPage() {
  const params = useParams<{ applicationId: string }>()
  const router = useRouter()
  const applicationId = params.applicationId
  const [phase, setPhase] = useState<Phase>({ kind: 'loading' })

  useEffect(() => {
    let cancelled = false

    ;(async () => {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) {
        if (!cancelled) setPhase({ kind: 'redirecting' })
        // ?redirect=, NOT ?next=. This sent ?next= to a page that only read
        // ?redirect=, so the return path was silently dropped and somebody
        // opening a review landed on their dashboard instead. The two names
        // for one idea is the fault; the login screen owns ?redirect.
        router.push(`/login?redirect=${encodeURIComponent(`/applications/${applicationId}/review`)}`)
        return
      }

      const { data, error } = await supabase
        .from('job_offers')
        .select(`
          id, status, offer_letter_text, offer_letter_url,
          signature_name, signature_timestamp, employer_signature_name,
          jobs(title, company)
        `)
        .eq('application_id', applicationId)
        .eq('candidate_id', session.user.id)
        .maybeSingle()

      if (cancelled) return

      if (error || !data) {
        setPhase({ kind: 'not_found' })
        return
      }

      const job = Array.isArray(data.jobs) ? data.jobs[0] : (data.jobs as { title?: string; company?: string } | null)
      const offer: OfferRow = {
        id: data.id,
        status: data.status as OfferStatus,
        offerLetterText: data.offer_letter_text,
        offerLetterUrl: data.offer_letter_url,
        signatureName: data.signature_name,
        signatureTimestamp: data.signature_timestamp,
        employerSignatureName: data.employer_signature_name,
        jobTitle: job?.title || 'the role',
        company: job?.company || 'The Company',
      }
      const candidateName = (session.user.user_metadata as { full_name?: string } | null)?.full_name || 'Candidate'

      // For terminal states (withdrawn / rescinded) fetch the sanitised
      // candidate-facing summary from the server. Audit log itself isn't
      // candidate-readable; the endpoint reads it server-side and returns
      // only the safe fields.
      let summary: string | null = null
      if (offer.status === 'withdrawn' || offer.status === 'rescinded') {
        try {
          const res = await fetch(`/api/offers/${offer.id}/status-summary`, {
            headers: { 'Authorization': `Bearer ${session.access_token}` },
          })
          if (res.ok) {
            const body = await res.json()
            summary = body.message || null
          }
        } catch (err) {
          console.error('[review] status-summary fetch failed (rendering fallback):', err)
        }
      }

      switch (offer.status) {
        case 'pending': setPhase({ kind: 'pending', offer, candidateName }); break
        case 'accepted': setPhase({ kind: 'accepted', offer }); break
        case 'declined': setPhase({ kind: 'declined', offer }); break
        case 'withdrawn': setPhase({ kind: 'withdrawn', offer, summary }); break
        case 'rescinded': setPhase({ kind: 'rescinded', offer, summary }); break
        default: setPhase({ kind: 'not_found' })
      }
    })()

    return () => { cancelled = true }
  }, [applicationId, router])

  return (
    <>
      <Header />
      <main style={{ maxWidth: 760, margin: '2rem auto 4rem', padding: '0 1rem' }}>
        {phase.kind === 'loading' && <CenterMessage>Loading offer…</CenterMessage>}
        {phase.kind === 'redirecting' && <CenterMessage>Redirecting to sign in…</CenterMessage>}
        {phase.kind === 'not_found' && <NotFoundCard />}
        {phase.kind === 'withdrawn' && <WithdrawnCard offer={phase.offer} summary={phase.summary} />}
        {phase.kind === 'rescinded' && <RescindedCard offer={phase.offer} summary={phase.summary} />}
        {phase.kind === 'declined' && <DeclinedCard offer={phase.offer} />}
        {phase.kind === 'accepted' && <AcceptedCard offer={phase.offer} />}
        {phase.kind === 'pending' && (
          <ReviewClient
            offerId={phase.offer.id}
            applicationId={applicationId}
            candidateName={phase.candidateName}
            company={phase.offer.company}
            jobTitle={phase.offer.jobTitle}
            employerSignatureName={phase.offer.employerSignatureName}
            offerLetterText={phase.offer.offerLetterText || ''}
            offerLetterUrl={phase.offer.offerLetterUrl}
            onAccepted={(newOfferUrl) => setPhase({
              kind: 'accepted',
              offer: { ...phase.offer, status: 'accepted', offerLetterUrl: newOfferUrl, signatureTimestamp: new Date().toISOString() },
            })}
            onWithdrawn={() => setPhase({ kind: 'withdrawn', offer: { ...phase.offer, status: 'withdrawn' }, summary: null })}
          />
        )}
      </main>
    </>
  )
}

// ── State cards ────────────────────────────────────────

function CenterMessage({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ textAlign: 'center', padding: '3rem 1rem', color: '#64748b', fontSize: '0.9rem' }}>
      {children}
    </div>
  )
}

function NotFoundCard() {
  return (
    <Card>
      <h1 style={titleStyle}>Offer not found</h1>
      <p style={bodyStyle}>This offer doesn't exist or you don't have access to it.</p>
      <BackLink />
    </Card>
  )
}

function WithdrawnCard({ offer, summary }: { offer: OfferRow; summary: string | null }) {
  return (
    <Card>
      <h1 style={titleStyle}>This offer is no longer available</h1>
      <p style={bodyStyle}>
        {summary || `The employer has withdrawn the offer for ${offer.jobTitle} at ${offer.company}.`}
      </p>
      <BackLink />
    </Card>
  )
}

function RescindedCard({ offer, summary }: { offer: OfferRow; summary: string | null }) {
  return (
    <Card>
      <p style={{ margin: 0, fontSize: '0.75rem', fontWeight: 600, color: '#b91c1c', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
        Offer rescinded
      </p>
      <h1 style={{ ...titleStyle, marginTop: '0.5rem' }}>
        {offer.jobTitle} at {offer.company}
      </h1>
      <p style={bodyStyle}>
        {summary || 'This offer was rescinded by the employer after you had counter-signed it.'}
      </p>
      <BackLink />
    </Card>
  )
}

function DeclinedCard({ offer }: { offer: OfferRow }) {
  return (
    <Card>
      <h1 style={titleStyle}>You declined this offer</h1>
      <p style={bodyStyle}>
        You declined the offer for <strong>{offer.jobTitle}</strong> at <strong>{offer.company}</strong>.
        This decision is final from this side of the platform.
      </p>
      <BackLink />
    </Card>
  )
}

function AcceptedCard({ offer }: { offer: OfferRow }) {
  const signedDate = offer.signatureTimestamp
    ? new Date(offer.signatureTimestamp).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
    : 'recently'
  return (
    <Card success>
      <p style={{ margin: 0, fontSize: '0.75rem', fontWeight: 600, color: '#15803d', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
        ✓ Offer accepted
      </p>
      <h1 style={{ ...titleStyle, marginTop: '0.5rem' }}>
        {offer.jobTitle} at {offer.company}
      </h1>
      <p style={bodyStyle}>
        You counter-signed this offer on {signedDate}. Your fully-signed copy is ready below — we've also emailed it to you for your records.
      </p>
      {offer.offerLetterUrl && (
        <SignedLink
          src={offer.offerLetterUrl}
          download
          className="primary-download"
          style={{
            display: 'inline-block',
            marginTop: '1rem',
            padding: '0.75rem 1.25rem',
            background: '#0f172a',
            color: '#FFE500',
            borderRadius: 8,
            textDecoration: 'none',
            fontWeight: 600,
            fontSize: '0.9rem',
          }}
        >
          ⬇ Download signed PDF
        </SignedLink>
      )}
      <div style={{ marginTop: '1rem' }}>
        <BackLink />
      </div>
    </Card>
  )
}

function BackLink() {
  return (
    <Link href="/applications" style={{ fontSize: '0.85rem', color: '#0369a1', textDecoration: 'underline' }}>
      ← Back to applications
    </Link>
  )
}

function Card({ children, success }: { children: React.ReactNode; success?: boolean }) {
  return (
    <div
      style={{
        padding: '1.5rem',
        background: success ? '#f0fdf4' : '#fff',
        border: `1px solid ${success ? '#bbf7d0' : '#e2e8f0'}`,
        borderRadius: 12,
      }}
    >
      {children}
    </div>
  )
}

const titleStyle: React.CSSProperties = { margin: '0 0 0.5rem', fontSize: '1.25rem', fontWeight: 700, color: '#0f172a' }
const bodyStyle: React.CSSProperties = { margin: '0 0 1rem', fontSize: '0.9rem', color: '#475569', lineHeight: 1.5 }

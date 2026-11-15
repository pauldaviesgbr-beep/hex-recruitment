'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Header from '@/components/Header'
import { supabase } from '@/lib/supabase'
import { getCurrentEmployerOwnerId } from '@/lib/employer'
// THE DEFAULT SHOWN HERE IS THE DEFAULT SENT. This page used to carry its own
// "rejected" wording, which nothing sent: the Decline box and the server used
// another. One copy now, in lib/declineCopy.
import { DEFAULT_REJECTED_BODY } from '@/lib/declineCopy'

const TEMPLATE_TYPES = [
  { id: 'shortlisted', label: 'Shortlisted', description: 'Sent when you shortlist a candidate', defaultSubject: 'Application Shortlisted \u2014 {{jobTitle}}', defaultBody: "Great news! Your application for {{jobTitle}} at {{companyName}} has been shortlisted. We'll be in touch with next steps." },
  // The subject is emails/application-status's own default for this status.
  { id: 'rejected', label: 'Not a fit', description: 'Sent when you mark someone as not a fit', defaultSubject: 'Update on your application at {{companyName}}', defaultBody: DEFAULT_REJECTED_BODY },
  // Withdrawn is a SEPARATE template from Declined \u2014 different semantics
  // (candidate dropped out vs. employer rejected), so employers want
  // distinct copy. Same template_type plumbing as the other types.
  { id: 'withdrawn', label: 'Withdrawn', description: 'Sent when you mark a candidate as withdrawn (dropped out or accepted another role)', defaultSubject: 'Application Withdrawn \u2014 {{jobTitle}}', defaultBody: "Hi {{candidateName}},\n\nWe're marking your application for the {{jobTitle}} role at {{companyName}} as withdrawn. If this is a mistake \u2014 or if you'd like to be considered for similar future roles \u2014 please reply and let us know. Otherwise, we wish you all the best." },
  { id: 'reviewing', label: 'Under Review', description: 'Sent when you start reviewing', defaultSubject: 'Application Under Review \u2014 {{jobTitle}}', defaultBody: "Your application for {{jobTitle}} at {{companyName}} is currently being reviewed. We'll be in touch soon." },
  { id: 'interview_invite', label: 'Interview Invite', description: 'Sent with interview invitation', defaultSubject: 'Interview Invitation \u2014 {{jobTitle}}', defaultBody: 'We would like to invite you for an interview for {{jobTitle}} at {{companyName}}. Please check your Thrive dashboard for details and to confirm your attendance.' },
  { id: 'offered', label: 'Job Offer', description: 'Sent when you make an offer', defaultSubject: 'Job Offer \u2014 {{jobTitle}}', defaultBody: 'Congratulations! We are pleased to offer you the position of {{jobTitle}} at {{companyName}}. Please check your messages for full details.' },
  { id: 'hired', label: 'Welcome aboard', description: 'Sent when you officially hire a candidate', defaultSubject: 'Welcome to {{companyName}}!', defaultBody: 'Congratulations! You have been hired for {{jobTitle}} at {{companyName}}. We look forward to working with you.' },
]

const VARIABLES = ['{{candidateName}}', '{{jobTitle}}', '{{companyName}}']

interface Template {
  id?: string
  template_type: string
  subject: string
  body: string
  is_active: boolean
}

export default function EmailTemplatesPage() {
  const router = useRouter()
  const [templates, setTemplates] = useState<Record<string, Template>>({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState<string | null>(null)
  const [saved, setSaved] = useState<string | null>(null)
  const [editing, setEditing] = useState<string | null>(null)
  // "Check rejection messages before they send" (design 25, decision 5). Off:
  // Not a fit on the Applicants list sends the template below after a 6-second
  // Undo. On: Not a fit opens the message for editing first.
  const [reviewRejection, setReviewRejection] = useState(false)
  const [reviewSaving, setReviewSaving] = useState(false)
  const [reviewError, setReviewError] = useState<string | null>(null)
  const [ownerIdState, setOwnerIdState] = useState<string | null>(null)

  const toggleReview = async () => {
    if (!ownerIdState) return
    const next = !reviewRejection
    setReviewSaving(true)
    setReviewError(null)
    const { data, error } = await supabase
      .from('employer_profiles')
      .update({ review_rejection_messages: next })
      .eq('user_id', ownerIdState)
      .select('review_rejection_messages')
    setReviewSaving(false)
    // Believe the row the database returns, not the click: a team member
    // without permission is refused, and the switch must not pretend otherwise.
    if (error || !data?.length) { setReviewError("Couldn't save that. Only the account owner can change it."); return }
    setReviewRejection(!!data[0].review_rejection_messages)
  }

  useEffect(() => {
    const load = async () => {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) { router.push('/login/employer'); return }

      // Multi-user: templates are keyed employer_id = owner user_id.
      const ownerId = (await getCurrentEmployerOwnerId(supabase)) ?? session.user.id
      const { data } = await supabase
        .from('employer_email_templates')
        .select('*')
        .eq('employer_id', ownerId)

      const map: Record<string, Template> = {}
      for (const row of data || []) {
        map[row.template_type] = row
      }
      setTemplates(map)
      setOwnerIdState(ownerId)
      const { data: ep } = await supabase
        .from('employer_profiles').select('review_rejection_messages').eq('user_id', ownerId).maybeSingle()
      setReviewRejection(!!ep?.review_rejection_messages)
      setLoading(false)
    }
    load()
  }, [router])

  const handleSave = async (type: string) => {
    setSaving(type)
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) return

    const tpl = templates[type]
    const defaultTpl = TEMPLATE_TYPES.find(t => t.id === type)!

    const ownerId = (await getCurrentEmployerOwnerId(supabase)) ?? session.user.id
    await supabase
      .from('employer_email_templates')
      .upsert({
        employer_id: ownerId,
        template_type: type,
        subject: tpl?.subject || defaultTpl.defaultSubject,
        body: tpl?.body || defaultTpl.defaultBody,
        is_active: tpl?.is_active ?? true,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'employer_id,template_type' })

    setSaving(null)
    setSaved(type)
    setTimeout(() => setSaved(null), 2000)
  }

  const updateTemplate = (type: string, field: 'subject' | 'body' | 'is_active', value: string | boolean) => {
    setTemplates(prev => ({
      ...prev,
      [type]: { ...prev[type], template_type: type, [field]: value, is_active: prev[type]?.is_active ?? true } as Template,
    }))
  }

  if (loading) {
    return (
      <main>
        <Header />
        <div style={{ maxWidth: 720, margin: '2rem auto', padding: '0 1rem', textAlign: 'center', color: '#94a3b8' }}>Loading templates...</div>
      </main>
    )
  }

  return (
    <main>
      <Header />
      <div style={{ maxWidth: 720, margin: '2rem auto', padding: '0 1rem' }}>
        <h1 style={{ fontSize: '1.5rem', fontWeight: 700, marginBottom: '0.25rem' }}>Email Templates</h1>
        <p style={{ color: '#64748b', marginBottom: '1.5rem', fontSize: '0.9rem' }}>
          Customise the emails sent to candidates at each stage. Use variables: {VARIABLES.map(v => <code key={v} style={{ background: '#f1f5f9', padding: '0.1rem 0.35rem', borderRadius: 3, fontSize: '0.8rem', marginLeft: 4 }}>{v}</code>)}
        </p>

        {/* "Check rejection messages before they send". A real switch
            (role="switch"), 44 tall, its state read back from the row. */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, border: '1px solid #DFE3EA', borderRadius: 14, padding: '12px 16px', marginBottom: '1.5rem', background: '#fff' }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div id="review-rejection-label" style={{ fontWeight: 600, fontSize: 15, color: '#0F172A' }}>Check rejection messages before they send</div>
            <div style={{ color: '#64748b', fontSize: 13, marginTop: 2 }}>
              {reviewRejection
                ? 'On: Not a fit opens your message so you can edit it first.'
                : 'Off: Not a fit sends your Not a fit template below, after a short Undo.'}
            </div>
            {reviewError && <div role="alert" style={{ color: '#B91C1C', fontSize: 13, marginTop: 4 }}>{reviewError}</div>}
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={reviewRejection}
            aria-labelledby="review-rejection-label"
            onClick={toggleReview}
            disabled={reviewSaving || !ownerIdState}
            style={{ flexShrink: 0, width: 52, height: 44, border: 0, background: 'none', padding: 0, cursor: 'pointer', display: 'flex', alignItems: 'center' }}
          >
            <span aria-hidden="true" style={{ width: 52, height: 30, borderRadius: 15, background: reviewRejection ? '#0F172A' : '#DFE3EA', position: 'relative', transition: 'background 0.15s' }}>
              <span style={{ position: 'absolute', top: 3, left: reviewRejection ? 25 : 3, width: 24, height: 24, borderRadius: 12, background: reviewRejection ? '#FFE500' : '#fff', transition: 'left 0.15s' }} />
            </span>
          </button>
        </div>

        {TEMPLATE_TYPES.map(type => {
          const tpl = templates[type.id]
          const isEditing = editing === type.id
          const subject = tpl?.subject ?? type.defaultSubject
          const body = tpl?.body ?? type.defaultBody

          return (
            <div key={type.id} style={{ border: '1px solid #e2e8f0', borderRadius: 10, marginBottom: '1rem', overflow: 'hidden' }}>
              <div
                onClick={() => setEditing(isEditing ? null : type.id)}
                style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.875rem 1rem', cursor: 'pointer', background: isEditing ? '#f8fafc' : '#fff' }}
              >
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ fontWeight: 600, fontSize: '0.95rem' }}>{type.label}</div>
                  <div style={{ color: '#94a3b8', fontSize: '0.8rem' }}>{type.description}</div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexShrink: 0 }}>
                  {saved === type.id && <span style={{ color: '#16a34a', fontSize: '0.8rem', fontWeight: 500 }}>Saved!</span>}
                  {tpl && <span style={{ fontSize: '0.7rem', color: '#16a34a', background: '#f0fdf4', padding: '0.15rem 0.4rem', borderRadius: 4 }}>Customised</span>}
                  <span style={{ color: '#94a3b8' }}>{isEditing ? '▲' : '▼'}</span>
                </div>
              </div>

              {isEditing && (
                <div style={{ padding: '1rem', borderTop: '1px solid #f1f5f9' }}>
                  <div style={{ marginBottom: '0.75rem' }}>
                    <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: '#334155', marginBottom: '0.25rem' }}>Subject</label>
                    <input
                      type="text"
                      value={subject}
                      onChange={e => updateTemplate(type.id, 'subject', e.target.value)}
                      style={{ width: '100%', padding: '0.5rem 0.625rem', border: '1px solid #d1d5db', borderRadius: 6, fontSize: '0.9rem' }}
                    />
                  </div>
                  <div style={{ marginBottom: '0.75rem' }}>
                    <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: '#334155', marginBottom: '0.25rem' }}>Body</label>
                    <textarea
                      value={body}
                      onChange={e => updateTemplate(type.id, 'body', e.target.value)}
                      rows={5}
                      style={{ width: '100%', padding: '0.5rem 0.625rem', border: '1px solid #d1d5db', borderRadius: 6, fontSize: '0.9rem', resize: 'vertical' }}
                    />
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <button
                      onClick={() => {
                        updateTemplate(type.id, 'subject', type.defaultSubject)
                        updateTemplate(type.id, 'body', type.defaultBody)
                      }}
                      style={{ fontSize: '0.8rem', color: '#64748b', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline' }}
                    >
                      Reset to default
                    </button>
                    <button
                      onClick={() => handleSave(type.id)}
                      disabled={saving === type.id}
                      style={{ padding: '0.5rem 1.25rem', background: saving === type.id ? '#94a3b8' : '#0f172a', color: '#FFE500', border: 'none', borderRadius: 6, fontWeight: 600, fontSize: '0.85rem', cursor: 'pointer' }}
                    >
                      {saving === type.id ? 'Saving...' : 'Save Template'}
                    </button>
                  </div>
                </div>
              )}
            </div>
          )
        })}

        <div style={{ marginTop: '1.5rem', textAlign: 'center' }}>
          <button onClick={() => router.push('/employer/dashboard')} style={{ color: '#64748b', background: 'none', border: 'none', cursor: 'pointer', fontSize: '0.85rem' }}>
            ← Back to Dashboard
          </button>
        </div>
      </div>
    </main>
  )
}

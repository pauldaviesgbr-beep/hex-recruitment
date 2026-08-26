'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import AdminPageHeader from '@/components/admin/AdminPageHeader'

// POSSIBLE DUPLICATES — the exit from the hold.
//
// A hold without a way to find out is a silently hidden candidate, which is the
// thirteen who fell through the gap by accident of signup date, rebuilt on
// purpose. So there are three ways out and this page is the first: a count
// where Paul already looks, two buttons here, and — if nobody comes — the hold
// releases itself after seven days.
//
// TWO ROW TYPES, and the difference is whether anybody was ever hidden:
//   HELD     a new signup, hidden, with the expiry counting down
//   FLAGGED  an existing profile, STILL VISIBLE, no expiry, just surfaced

type Failure = {
  userId: string; name: string | null; email: string | null
  joined: string; at: string | null
}
type Unkeyable = {
  userId: string; name: string | null; email: string | null
  joined: string; reason: string
}

// WHAT THE REASON MEANS TO A PERSON. The values are for code; these are for
// whoever opens this page wondering whether the dedup has stopped working.
//
// THE THIRD ONE IS OURS, NOT THEIRS, AND IS WORDED TO SAY SO. The other two
// describe an unfinished profile that the candidate could complete. A name in
// a non-Latin script is complete, and our key rule discards it — so the copy
// must not imply the candidate has done something wrong or could fix it.
const REASON_TEXT: Record<string, string> = {
  'no-name': 'No name on the profile — there is nothing to match on',
  'one-word': 'A single-word name — matching on it would hide real people',
  'non-latin': 'Our matcher only reads Latin letters, so it cannot key this name. Nothing they can change.',
}

type Row = {
  userId: string; name: string | null; email: string | null; jobTitle: string | null
  joined: string; isDiscoverable: boolean
  hold: { heldAt: string | null; releasedAt: string | null; reviewedAt: string | null; verdict: string | null }
  state: 'none' | 'held' | 'flagged' | 'resolved' | 'released'
}

const DAY = 86_400_000

export default function DuplicatesPage() {
  const [groups, setGroups] = useState<{ key: string; rows: Row[] }[]>([])
  const [failures, setFailures] = useState<Failure[]>([])
  const [unkeyable, setUnkeyable] = useState<Unkeyable[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const load = async () => {
    const { data: s } = await supabase.auth.getSession()
    const token = s.session?.access_token
    if (!token) { setError('Sign in as an admin to view this.'); setLoading(false); return }
    const res = await fetch('/api/admin/duplicates', { headers: { authorization: `Bearer ${token}` } })
    if (!res.ok) { setError(`Could not load (${res.status})`); setLoading(false); return }
    const j = await res.json()
    setGroups(j.groups || [])
    setFailures(j.lookupFailures || [])
    setUnkeyable(j.unkeyable || [])
    setLoading(false)
  }
  useEffect(() => { load() }, [])

  const decide = async (userId: string, verdict: 'different' | 'same' | 'undo') => {
    setBusy(userId)
    const { data: s } = await supabase.auth.getSession()
    const res = await fetch('/api/admin/duplicates', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${s.session?.access_token}` },
      body: JSON.stringify({ userId, verdict }),
    })
    if (!res.ok) setError(`That didn't save (${res.status}). Nothing was changed.`)
    await load()
    setBusy(null)
  }

  const daysLeft = (heldAt: string | null) =>
    heldAt ? Math.max(0, 7 - Math.floor((Date.now() - Date.parse(heldAt)) / DAY)) : null

  const open = groups.filter(g => g.rows.some(r => r.state === 'held' || r.state === 'flagged'))
  const resolved = groups.filter(g => !g.rows.some(r => r.state === 'held' || r.state === 'flagged'))

  return (
    <main style={{ maxWidth: 900, margin: '0 auto', padding: '28px 20px 64px' }}>
      <p style={{ fontFamily: 'ui-monospace, monospace', fontSize: 11, letterSpacing: '.08em', textTransform: 'uppercase', color: '#6b7688', margin: '0 0 8px' }}>
        Admin
      </p>
      {/* Was an inline-styled h1 at 26px/700/-.02em — one of the four
          dialects that made the estate look assembled rather than designed.
          The frame's 28px/700/-0.025em replaces it. The eyebrow above and the
          explainer below are UNCHANGED: adopt the frame, hold the rendering
          constant. The explainer is four lines, so it is not a subtitle. */}
      <AdminPageHeader title="Possible duplicates" />
      <p style={{ color: '#475569', fontSize: 14.5, lineHeight: 1.55, maxWidth: '66ch', margin: '0 0 24px' }}>
        Two profiles whose names are the same words. <strong>Held</strong> means a new signup is hidden while
        you decide — and if nobody decides, it becomes visible on its own after seven days rather than
        staying hidden indefinitely. <strong>Flagged</strong> means an existing profile that is still visible
        and always has been; nothing is hidden retroactively.
      </p>

      {/* THE CHECK CANNOT FAIL SILENTLY ANY MORE.
          A dedup that quietly does nothing looks exactly like a dedup finding
          no duplicates, and nobody knows to look. The failures are split in
          two because the remedies are: an errored lookup is an incident and is
          shown open, a name we cannot key on is expected and is folded away. */}
      {failures.length > 0 && (
        <div style={{ border: '1px solid #f0b7b7', background: '#fff5f5', borderRadius: 12, padding: 16, margin: '0 0 16px' }}>
          <strong style={{ fontSize: 15, color: '#8a1c1c' }}>
            {failures.length === 1
              ? 'One signup was never checked for duplicates'
              : failures.length + ' signups were never checked for duplicates'}
          </strong>
          <p style={{ fontSize: 13.5, color: '#7a3030', lineHeight: 1.55, margin: '6px 0 10px', maxWidth: '62ch' }}>
            The lookup errored, so these people were compared to nobody. That is
            not the same as being found clean. If this keeps appearing, the
            duplicate check itself is broken.
          </p>
          {failures.map(n => (
            <div key={n.userId} style={{ fontSize: 13.5, color: '#0f172a', padding: '4px 0' }}>
              {n.name || '(no name)'} <span style={{ color: '#7a3030' }}>· {n.email}</span>
              <span style={{ color: '#94a3b8' }}> · {n.at ? new Date(n.at).toLocaleString('en-GB') : ''}</span>
            </div>
          ))}
        </div>
      )}

      {unkeyable.length > 0 && (
        <details style={{ margin: '0 0 16px' }}>
          <summary style={{ cursor: 'pointer', color: '#475569', fontSize: 14 }}>
            {unkeyable.length} {unkeyable.length === 1 ? 'profile' : 'profiles'} the duplicate check cannot run on — expected, and counted so it is not invisible
          </summary>
          <div style={{ marginTop: 10, border: '1px solid #e2e8f0', borderRadius: 12, background: '#fff', padding: 14 }}>
            <p style={{ fontSize: 13.5, color: '#475569', lineHeight: 1.55, margin: '0 0 10px', maxWidth: '62ch' }}>
              These can duplicate freely and always could. It is the right trade —
              matching on a single word would hide real people — but they have
              never been counted anywhere until now. Counted live from the names,
              so this drops on its own if somebody completes theirs.
            </p>
            {unkeyable.map(n => (
              <div key={n.userId} style={{ fontSize: 13.5, color: '#0f172a', padding: '4px 0' }}>
                {n.name || '(no name)'} <span style={{ color: '#64748b' }}>· {n.email}</span>
                <div style={{ fontSize: 12.5, color: '#94a3b8' }}>
                  {REASON_TEXT[n.reason] || 'Cannot be matched on'}
                  {' · joined ' + new Date(n.joined).toLocaleDateString('en-GB')}
                </div>
              </div>
            ))}
          </div>
        </details>
      )}

      {error && <p style={{ color: '#b45309', fontSize: 14 }}>{error}</p>}
      {loading && <p style={{ color: '#64748b' }}>Loading…</p>}
      {!loading && open.length === 0 && (
        <p style={{ color: '#475569' }}>Nothing waiting. <Link href="/admin" style={{ color: '#0f172a' }}>Back to admin</Link></p>
      )}

      {resolved.length > 0 && (
        <details style={{ marginTop: 8 }}>
          <summary style={{ cursor: 'pointer', color: '#475569', fontSize: 14 }}>
            {resolved.length} already decided — still here, and still reversible
          </summary>
          <div style={{ marginTop: 12 }}>
            {resolved.map(g => {
              // The rows a single "different people" verdict covers — one
              // decision, so one control. "same person" rows keep their own.
              const asDifferent = g.rows.filter(r => r.hold.verdict === 'different')
              const asSame = g.rows.filter(r => r.hold.verdict === 'same')
              return (
              <div key={g.key} style={{ border: '1px solid #e2e8f0', borderRadius: 12, background: '#fff', padding: 14, marginBottom: 10 }}>
                {asDifferent.length > 0 && (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center', justifyContent: 'space-between', padding: '6px 0' }}>
                    <div style={{ fontSize: 14, color: '#0f172a' }}>
                      {asDifferent.map(r => r.name).join(' · ')}
                      <span style={{ color: '#64748b', fontSize: 13 }}> — different people</span>
                    </div>
                    <button
                      type="button" disabled={busy === asDifferent[0].userId}
                      onClick={() => decide(asDifferent[0].userId, 'undo')}
                      style={{ background: '#fff', color: '#0f172a', border: '1px solid #cbd5e1', borderRadius: 8, padding: '7px 12px', fontSize: 12.5, fontWeight: 600, cursor: 'pointer' }}
                    >
                      Undo — puts {asDifferent.length === 1 ? 'it' : 'both'} back
                    </button>
                  </div>
                )}
                {asSame.map(r => (
                  <div key={r.userId} style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center', justifyContent: 'space-between', padding: '6px 0' }}>
                    <div style={{ fontSize: 14, color: '#0f172a' }}>
                      {r.name} <span style={{ color: '#64748b', fontSize: 13 }}>— same person, hidden</span>
                    </div>
                    <button
                      type="button" disabled={busy === r.userId}
                      onClick={() => decide(r.userId, 'undo')}
                      style={{ background: '#fff', color: '#0f172a', border: '1px solid #cbd5e1', borderRadius: 8, padding: '7px 12px', fontSize: 12.5, fontWeight: 600, cursor: 'pointer' }}
                    >
                      Undo — stays hidden either way
                    </button>
                  </div>
                ))}
              </div>
            )})}
          </div>
        </details>
      )}

      {open.map(g => (
        <section key={g.key} style={{ border: '1px solid #e2e8f0', borderRadius: 12, background: '#fff', padding: 18, marginBottom: 16 }}>
          {g.rows.some(r => r.state === 'resolved') && g.rows.some(r => r.state !== 'resolved') && (
            <p style={{ margin: '0 0 12px', fontSize: 13, color: '#8a7a00', background: '#fffbea', border: '1px solid #ebd98a', borderRadius: 8, padding: '8px 12px' }}>
              A decision has already been made on part of this pair. The row marked
              “reviewed” below is settled; the other is still waiting.
            </p>
          )}
          <div style={{ display: 'grid', gap: 12 }}>
            {g.rows.map(r => (
              <div key={r.userId} style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center', justifyContent: 'space-between', paddingBottom: 12, borderBottom: '1px solid #eff2f6' }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                    <strong style={{ fontSize: 15, color: '#0f172a' }}>{r.name || '(no name)'}</strong>
                    {r.state === 'held' && (
                      <span style={{ fontSize: 11.5, fontWeight: 600, background: '#fffbea', border: '1px solid #ebd98a', color: '#8a7a00', borderRadius: 99, padding: '2px 9px' }}>
                        Held · hidden · releases itself in {daysLeft(r.hold.heldAt)}d
                      </span>
                    )}
                    {r.state === 'resolved' && (
                      <span style={{ fontSize: 11.5, fontWeight: 500, border: '1px solid #cbd5e1', color: '#475569', borderRadius: 99, padding: '2px 9px' }}>
                        Reviewed · {r.hold.verdict === 'same' ? 'same person, hidden' : 'different people'}
                      </span>
                    )}
                    {r.state === 'flagged' && (
                      <span style={{ fontSize: 11.5, fontWeight: 500, border: '1px dashed #cbd5e1', color: '#64748b', borderRadius: 99, padding: '2px 9px' }}>
                        Flagged · still visible
                      </span>
                    )}
                  </div>
                  <div style={{ fontSize: 13, color: '#64748b', marginTop: 3 }}>
                    {r.email} {r.jobTitle ? `· ${r.jobTitle}` : ''} · joined {new Date(r.joined).toLocaleDateString('en-GB')}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  {r.state === 'resolved' ? (
                    <button
                      type="button" disabled={busy === r.userId}
                      onClick={() => decide(r.userId, 'undo')}
                      style={{ background: '#fff', color: '#0f172a', border: '1px solid #cbd5e1', borderRadius: 8, padding: '9px 14px', fontSize: 12.5, fontWeight: 600, cursor: 'pointer' }}
                    >
                      {r.hold.verdict === 'different' ? 'Undo — puts the pair back' : 'Undo — stays hidden'}
                    </button>
                  ) : (<>
                  <button
                    type="button" disabled={busy === r.userId}
                    onClick={() => decide(r.userId, 'different')}
                    style={{ background: '#0f172a', color: '#fff', border: '1px solid #0f172a', borderRadius: 8, padding: '9px 14px', fontSize: 12.5, fontWeight: 600, cursor: 'pointer' }}
                  >
                    Different people
                  </button>
                  <button
                    type="button" disabled={busy === r.userId}
                    onClick={() => decide(r.userId, 'same')}
                    style={{ background: '#fff', color: '#0f172a', border: '1px solid #cbd5e1', borderRadius: 8, padding: '9px 14px', fontSize: 12.5, fontWeight: 600, cursor: 'pointer' }}
                  >
                    Same person — hide this one
                  </button>
                  </>)}
                </div>
              </div>
            ))}
          </div>
          <p style={{ fontSize: 12.5, color: '#94a3b8', margin: '10px 0 0' }}>
            Nothing is deleted either way. “Same person” leaves that row hidden and keeps it for the record,
            including for any employer who has already messaged it.
          </p>
        </section>
      ))}
    </main>
  )
}

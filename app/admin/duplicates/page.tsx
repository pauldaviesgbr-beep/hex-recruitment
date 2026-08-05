'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'

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

type Row = {
  userId: string; name: string | null; email: string | null; jobTitle: string | null
  joined: string; isDiscoverable: boolean
  hold: { heldAt: string | null; releasedAt: string | null; reviewedAt: string | null; verdict: string | null }
  state: 'none' | 'held' | 'flagged' | 'resolved' | 'released'
}

const DAY = 86_400_000

export default function DuplicatesPage() {
  const [groups, setGroups] = useState<{ key: string; rows: Row[] }[]>([])
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
    setLoading(false)
  }
  useEffect(() => { load() }, [])

  const decide = async (userId: string, verdict: 'different' | 'same') => {
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

  return (
    <main style={{ maxWidth: 900, margin: '0 auto', padding: '28px 20px 64px' }}>
      <p style={{ fontFamily: 'ui-monospace, monospace', fontSize: 11, letterSpacing: '.08em', textTransform: 'uppercase', color: '#6b7688', margin: '0 0 8px' }}>
        Admin
      </p>
      <h1 style={{ fontSize: 26, fontWeight: 700, letterSpacing: '-.02em', margin: '0 0 6px', color: '#0f172a' }}>
        Possible duplicates
      </h1>
      <p style={{ color: '#475569', fontSize: 14.5, lineHeight: 1.55, maxWidth: '66ch', margin: '0 0 24px' }}>
        Two profiles whose names are the same words. <strong>Held</strong> means a new signup is hidden while
        you decide — and if nobody decides, it becomes visible on its own after seven days rather than
        staying hidden indefinitely. <strong>Flagged</strong> means an existing profile that is still visible
        and always has been; nothing is hidden retroactively.
      </p>

      {error && <p style={{ color: '#b45309', fontSize: 14 }}>{error}</p>}
      {loading && <p style={{ color: '#64748b' }}>Loading…</p>}
      {!loading && open.length === 0 && (
        <p style={{ color: '#475569' }}>Nothing waiting. <Link href="/admin" style={{ color: '#0f172a' }}>Back to admin</Link></p>
      )}

      {open.map(g => (
        <section key={g.key} style={{ border: '1px solid #e2e8f0', borderRadius: 12, background: '#fff', padding: 18, marginBottom: 16 }}>
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

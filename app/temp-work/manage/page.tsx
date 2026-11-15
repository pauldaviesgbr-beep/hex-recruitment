'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import Header from '@/components/Header'
import ReportControl from '@/components/ReportControl'
import { supabase } from '@/lib/supabase'
import { getCurrentEmployerOwnerId, getEmployerCapabilities } from '@/lib/employer'
import { shiftRowModel, timeAgo, type TempPost, type TempComment } from '@/lib/tempWork'
import ManageCard from '@/components/ManageCard'
import styles from './page.module.css'

export default function ManageTempWorkPage() {
  const router = useRouter()
  const [phase, setPhase] = useState<'loading' | 'denied' | 'ready'>('loading')
  const [posts, setPosts] = useState<TempPost[]>([])
  const [comments, setComments] = useState<Record<string, TempComment[]>>({})
  const [busy, setBusy] = useState<string | null>(null)

  // Who has put themselves forward. This is the list an agency actually works
  // from — the reason temp_interest exists and the reason a comment thread was
  // never an adequate substitute for it.
  interface InterestRow { id: string; temp_post_id: string; candidate_user_id: string; message: string | null; created_at: string; name: string }
  const [interest, setInterest] = useState<Record<string, InterestRow[]>>({})

  // Replying from here, because this is the page the notification links to and
  // until now it offered only Hide and Delete.
  const [replyTo, setReplyTo] = useState<string | null>(null)
  const [replyDraft, setReplyDraft] = useState('')

  // Which card's review panel is open: who's available, and the thread.
  const [openId, setOpenId] = useState<string | null>(null)

  // WHO IS LOOKING, not who owns the post — and they are different people on a
  // team account. The report control is hidden on your OWN comment, and the
  // feed decides that from `c.user_id === userId`. Deciding it here from
  // `author_role` or from the owner id instead would be a second definition of
  // "mine", which is the failure this codebase spent 1 Sept cataloguing: two
  // versions of one fact, and the wrong one gets read. Same column, same
  // comparison, both renderers.
  const [me, setMe] = useState<string | null>(null)

  const load = useCallback(async () => {
    const ownerId = (await getCurrentEmployerOwnerId(supabase))
    const { data: { session } } = await supabase.auth.getSession()
    setMe(session?.user?.id ?? null)
    const eid = ownerId ?? session?.user?.id
    if (!eid) return
    const { data: postRows } = await supabase
      .from('temp_posts').select('*').eq('employer_id', eid).order('created_at', { ascending: false })
    const ps = (postRows as TempPost[]) || []
    setPosts(ps)

    if (ps.length) {
      const { data: cRows } = await supabase
        .from('temp_post_comments').select('*').in('post_id', ps.map(p => p.id)).order('created_at', { ascending: true })
      const grouped: Record<string, TempComment[]> = {}
      for (const c of (cRows as TempComment[]) || []) (grouped[c.post_id] ||= []).push(c)
      setComments(grouped)

      // RLS on temp_interest already restricts this to posts I have
      // manage_jobs on, so no employer-scoping filter is needed here beyond the
      // post ids — the database is the guard, not this query.
      const { data: iRows } = await supabase
        .from('temp_interest')
        .select('id, temp_post_id, candidate_user_id, message, created_at')
        .in('temp_post_id', ps.map(p => p.id))
        .order('created_at', { ascending: true })

      const rows = (iRows as Omit<InterestRow, 'name'>[]) || []
      // Names come from candidate_profiles in one read rather than per row.
      const ids = Array.from(new Set(rows.map(r => r.candidate_user_id)))
      const names: Record<string, string> = {}
      if (ids.length) {
        const { data: profs } = await supabase
          .from('candidate_profiles').select('user_id, full_name').in('user_id', ids)
        for (const p of (profs as { user_id: string; full_name: string | null }[]) || []) {
          if (p.full_name) names[p.user_id] = p.full_name
        }
      }
      const byPost: Record<string, InterestRow[]> = {}
      for (const r of rows) {
        (byPost[r.temp_post_id] ||= []).push({ ...r, name: names[r.candidate_user_id] || 'A candidate' })
      }
      setInterest(byPost)
    }
  }, [])

  useEffect(() => {
    const init = async () => {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) { router.push(`/login/employer?redirect=${encodeURIComponent('/temp-work/manage')}`); return }
      if (session.user.user_metadata?.role !== 'employer') { router.push('/dashboard'); return }
      const caps = await getEmployerCapabilities(supabase)
      if (!caps.manage_jobs) { setPhase('denied'); return }
      await load()
      setPhase('ready')
    }
    init()
  }, [router, load])

  const setPostStatus = async (post: TempPost, status: TempPost['status']) => {
    setBusy(post.id)
    await supabase.from('temp_posts').update({ status }).eq('id', post.id)
    await load(); setBusy(null)
  }
  const setCommentHidden = async (c: TempComment, hidden: boolean) => {
    setBusy(c.id)
    await supabase.from('temp_post_comments').update({ hidden }).eq('id', c.id)
    setComments(prev => ({ ...prev, [c.post_id]: (prev[c.post_id] || []).map(x => x.id === c.id ? { ...x, hidden } : x) }))
    setBusy(null)
  }
  const deleteComment = async (c: TempComment) => {
    setBusy(c.id)
    await supabase.from('temp_post_comments').delete().eq('id', c.id)
    setComments(prev => ({ ...prev, [c.post_id]: (prev[c.post_id] || []).filter(x => x.id !== c.id) }))
    setPosts(prev => prev.map(p => p.id === c.post_id ? { ...p, comment_count: Math.max(0, p.comment_count - 1) } : p))
    setBusy(null)
  }

  /**
   * Reply to a comment from here.
   *
   * It is an ordinary comment authored by the employer, which matters: the
   * database trigger sees the post owner commenting and routes a notification to
   * everyone waiting — the other people in the thread and anyone who registered
   * interest. No separate "reply" concept, so there is nothing to keep in step.
   */
  const sendReply = async (post: TempPost) => {
    const body = replyDraft.trim()
    if (!body) return
    setBusy(post.id)
    const { data: { session } } = await supabase.auth.getSession()
    const uid = session?.user?.id
    if (!uid) { setBusy(null); return }

    const { data, error } = await supabase.from('temp_post_comments').insert({
      post_id: post.id, user_id: uid, body,
    }).select('*').single()

    if (!error && data) {
      setComments(prev => ({ ...prev, [post.id]: [...(prev[post.id] || []), data as TempComment] }))
      setPosts(prev => prev.map(p => p.id === post.id ? { ...p, comment_count: p.comment_count + 1 } : p))
      setReplyDraft(''); setReplyTo(null)

      // EMAIL THE CANDIDATES. This page sent nothing at all before — replying
      // from here wrote the comment and fired the in-app notification, and a
      // chef who wasn't logged in heard nothing. The feed's reply path does the
      // same thing; both had to be wired or the gap just moves.
      fetch('/api/temp-notify', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
        },
        body: JSON.stringify({
          kind: 'reply',
          postId: post.id,
          actorName: (data as TempComment).author_name || 'The employer',
          body,
        }),
      }).catch(() => console.warn('[temp-notify] reply email failed'))
    }
    setBusy(null)
  }

  if (phase === 'loading') return <main><Header /><div className={styles.wrap}><p className={styles.centre}>Loading…</p></div></main>
  if (phase === 'denied') return <main><Header /><div className={styles.wrap}><p className={styles.centre}>You need the “manage jobs” permission to manage shifts.</p></div></main>

  // The status line's fact: when the shift starts, or that it is ongoing. Only
  // ever something true of this shift.
  const startLabel = (p: TempPost) => p.is_ongoing ? 'ongoing'
    : p.date_from ? new Date(`${p.date_from}T00:00:00`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : undefined

  return (
    <main>
      <Header />
      <div className={styles.wrap}>
        <div className={styles.head}>
          <h1 className={styles.h1}>Your shifts</h1>
          <Link href="/temp-work/post" className={styles.postBtn}>+ Post a shift</Link>
        </div>
        {/* TWO STATES, TWO SENTENCES: an employer's FIRST view of this page
            has no shifts, and instructions for working a list nobody is on
            describe a state the page isn't in. */}
        <p className={styles.intro}>
          {posts.length === 0
            ? <>Post a shift and people put their names down here. You’ll see who’s available and be able to answer their questions, without handing out your number.</>
            : <>Who’s available for each shift, and what’s been asked. Reply and they’ll be told straight away.</>}
        </p>

        {posts.length === 0 ? (
          <p className={styles.emptyState}>No shifts yet. <Link href="/temp-work/post">Post your first shift →</Link></p>
        ) : (
          <div className={styles.list}>
            {posts.map(post => {
              const rows = comments[post.id] || []
              const avail = interest[post.id] || []
              const m = shiftRowModel(post)
              const live = post.status === 'open'
              const start = startLabel(post)
              const statusDetail = post.status === 'open' ? (start === 'ongoing' ? 'ongoing' : start ? `starts ${start}` : undefined) : start !== 'ongoing' ? start : undefined
              return (
                <ManageCard
                  key={post.id}
                  live={live}
                  statusWord={post.status === 'open' ? 'Live' : post.status}
                  statusDetail={statusDetail}
                  title={post.title}
                  lines={[
                    <>{m.pay && <span className={styles.pay}>{m.pay.amount} {m.pay.period}</span>}{m.pay && m.place && ' · '}{m.place}</>,
                    // Design 26 decisions: no booking exists, so the date line
                    // says what does — "8 needed · 5 available".
                    <><span className={styles.when}>{m.when}</span> · {m.needed} · {avail.length} available</>,
                    // The total, not a "new" count: nothing records which
                    // comments the employer has already seen.
                    <>{post.comment_count === 0 ? 'No comments yet' : `${post.comment_count} comment${post.comment_count === 1 ? '' : 's'}`}</>,
                  ]}
                  attention={live && avail.length > 0 ? `${avail.length} ${avail.length === 1 ? 'person' : 'people'} available` : undefined}
                  open={openId === post.id}
                  onToggleOpen={() => setOpenId(openId === post.id ? null : post.id)}
                  // Design 26 decisions: ship with Mark filled and Close only.
                  // Edit shift, Duplicate and Post again are hidden until built.
                  actions={live ? [{ label: busy === post.id ? 'Saving…' : 'Mark filled', onClick: () => setPostStatus(post, 'filled'), disabled: busy === post.id }] : []}
                  // CLOSE EXISTS IN EVERY STATE THAT ISN'T ALREADY CLOSED — a
                  // filled shift is a state you close FROM. RE-OPEN STAYS: it is
                  // the only undo for a mistaken "Mark filled", and it existed
                  // before this design, which does not mention it.
                  menu={[
                    ...(post.status !== 'closed' ? [{ label: 'Close', onClick: () => setPostStatus(post, 'closed'), disabled: busy === post.id }] : []),
                    ...(post.status !== 'open' ? [{ label: 'Re-open', onClick: () => setPostStatus(post, 'open'), disabled: busy === post.id }] : []),
                  ]}
                  menuLabel={`More actions for ${post.title}`}
                >
                  {/* AVAILABLE — the list to work from, above the comments on
                      purpose: these people have said yes; commenters asked. */}
                  <section className={styles.section}>
                    <h4 className={styles.sectionHead}>{avail.length} available</h4>
                    {avail.length === 0 ? (
                      <p className={styles.muted}>Nobody has said they’re available yet.</p>
                    ) : avail.map(r => (
                      <div key={r.id} className={styles.person}>
                        <div className={styles.personHead}>
                          <Link href={`/candidates/${r.candidate_user_id}`} className={styles.name}>{r.name}</Link>
                          <span className={styles.meta}> · {timeAgo(r.created_at)}</span>
                        </div>
                        {r.message && <p className={styles.body}>{r.message}</p>}
                      </div>
                    ))}
                  </section>

                  <section className={styles.section}>
                    <div className={styles.sectionRow}>
                      <h4 className={styles.sectionHead}>{rows.length} comment{rows.length === 1 ? '' : 's'}</h4>
                      {/* Reply lives HERE, not per comment: a shift with no
                          comments still needs a way to start the thread. */}
                      <button type="button" className={styles.textBtn} onClick={() => { setReplyTo(replyTo === post.id ? null : post.id); setReplyDraft('') }}>
                        {replyTo === post.id ? 'Cancel' : 'Reply'}
                      </button>
                    </div>
                    {rows.length === 0 ? (
                      <p className={styles.muted}>No comments yet.</p>
                    ) : rows.map(c => {
                      // Candidates have a profile page; an erased author has no
                      // user_id, so no link (never /candidates/null).
                      const profileHref = c.user_id && c.author_role === 'candidate' ? `/candidates/${c.user_id}` : null
                      return (
                        <div key={c.id} className={styles.person} data-hidden={c.hidden || undefined}>
                          <div className={styles.personHead}>
                            {profileHref
                              ? <Link href={profileHref} className={styles.name}>{c.author_name || 'Someone'}</Link>
                              : <span className={styles.name}>{c.author_name || 'Someone'}</span>}
                            {c.author_role === 'employer' && <span className={styles.meta}> · employer</span>}
                            {c.hidden && <span className={styles.meta}> · hidden</span>}
                            <span className={styles.meta}> · {timeAgo(c.created_at)}</span>
                          </div>
                          <p className={styles.body}>{c.body}</p>
                          <div className={styles.smallRow}>
                            <button type="button" className={styles.textBtn} disabled={busy === c.id} onClick={() => setCommentHidden(c, !c.hidden)}>{c.hidden ? 'Unhide' : 'Hide'}</button>
                            <button type="button" className={styles.textBtn} disabled={busy === c.id} onClick={() => deleteComment(c)}>Delete</button>
                            {/* HIDE AND DELETE ARE NOT A REPORT: an employer who
                                receives something abusive must be able to report
                                it as well as remove it. Not on your own comment. */}
                            {c.user_id !== me && <ReportControl targetType="comment" targetId={c.id} className={styles.textBtn} />}
                          </div>
                        </div>
                      )
                    })}

                    {/* An ordinary comment from the post owner, which is what
                        makes the notification to everyone waiting fire. */}
                    {replyTo === post.id && (
                      <div className={styles.reply}>
                        <textarea
                          rows={2}
                          className={styles.replyInput}
                          aria-label="Your reply"
                          value={replyDraft}
                          onChange={e => setReplyDraft(e.target.value)}
                          placeholder="Reply, e.g. “Yes, still open. Can you do 5pm till close?”"
                        />
                        <button type="button" className={styles.replyBtn} disabled={busy === post.id || !replyDraft.trim()} onClick={() => sendReply(post)}>
                          {busy === post.id ? 'Sending…' : 'Send reply'}
                        </button>
                        <span className={styles.muted}>Everyone who commented or said they’re available will be told.</span>
                      </div>
                    )}
                  </section>
                </ManageCard>
              )
            })}
          </div>
        )}
      </div>
    </main>
  )
}

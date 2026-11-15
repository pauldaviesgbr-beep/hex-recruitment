'use client'

import { useEffect, useMemo, useRef, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import Header from '@/components/Header'
import JobsChips from '@/components/JobsChips'
import { supabase } from '@/lib/supabase'
import {
  ROLE_GROUPS, rolesInGroup, roleKeyFromTitle, byStartDate, timeAgo, DISCLAIMER,
  type TempPost, type TempComment,
} from '@/lib/tempWork'
import { EXAMPLE_TEMP_POSTS } from '@/lib/tempExamples'
import JobRow from '@/components/JobRow'
import ShiftRow, { FeedGroupLabel } from '@/components/ShiftRow'
import rowStyles from '@/components/JobRow.module.css'
import { useSavedJobs } from '@/lib/useSavedJobs'
import { supabaseJobToJob } from '@/lib/types'
import type { Job } from '@/lib/mockJobs'
import ReportControl from '@/components/ReportControl'
import styles from './page.module.css'

// WHAT THIS PAGE READS, and why it reads two things.
//
// TEMP-FLAGGED JOBS — jobs rows with 'Temporary' in employment_type. These are
// ongoing vacancies that happen to be casual or hourly, and they belong in
// `jobs`: same row, same source of truth, so the weekly reconcile keeps them
// honest. Copying them into temp_posts would take them out of that reconcile
// and leave a filled role sitting here forever.
//
// SHIFTS — temp_posts. A dated shift ("Saturday 7am–3pm, three chefs") carries
// dates, times and a headcount that a jobs row has nowhere to put, so it keeps
// its own table and its own card. Nothing is copied between the two.
//
// They render in ONE bordered list in two labelled groups (design 26, round 2,
// B): "Posted shifts" first, by start date, as text-led shift rows; then
// "Short-term jobs", newest first, as the board's 1b row unchanged. No images
// on either. Separate blocks made shifts and jobs look like two products.

export default function TempWorkPage() {
  const router = useRouter()
  const { isSaved, toggleSave } = useSavedJobs()
  const [posts, setPosts] = useState<TempPost[]>([])
  const [loading, setLoading] = useState(true)
  const [userId, setUserId] = useState<string | null>(null)
  const [canPost, setCanPost] = useState(false)

  const [myLikes, setMyLikes] = useState<Set<string>>(new Set())
  const [busyLike, setBusyLike] = useState<string | null>(null)

  // Which posts I've already put myself forward for. The unique constraint on
  // (temp_post_id, candidate_user_id) means a second attempt is a 23505 rather
  // than a duplicate — so this exists to present that as STATE ("You're
  // available") instead of letting someone tap into an error.
  //
  // THE PRIVATE NOTE IS GONE (design 26): availability is one tap on the row,
  // and saying you're available opens a private chat with the employer in
  // Messages, which is where anything private now goes.
  const [myName, setMyName] = useState('')
  const [myInterest, setMyInterest] = useState<Set<string>>(new Set())
  const [busyInterest, setBusyInterest] = useState<string | null>(null)

  const [openThread, setOpenThread] = useState<string | null>(null)
  const [comments, setComments] = useState<Record<string, TempComment[]>>({})
  const [draft, setDraft] = useState('')
  const [busyComment, setBusyComment] = useState(false)

  const [group, setGroup] = useState('')
  const [role, setRole] = useState('')
  const [loc, setLoc] = useState('')
  const [minRate, setMinRate] = useState(0) // min £/hr; only applies to hourly posts
  const [toast, setToast] = useState('')

  const RATE_PRESETS = [12, 15, 18, 20]

  // Job.postedAt is a humanised string ("3 days ago") by the time it reaches a
  // card, so the raw timestamp is kept alongside for sorting the mixed feed.
  const [tempJobs, setTempJobs] = useState<{ job: Job; at: string }[]>([])

  // ── PREVIEW-ONLY: see the mixed feed before a real shift exists ──────────
  //
  // The feed's whole point is two card types side by side, but temp_posts is
  // empty, so the shape being shipped cannot be looked at. ?preview=shifts adds
  // the display-only examples from lib/tempExamples ALONGSIDE the real jobs, so
  // the mixed feed can be reviewed. It writes nothing and reads nothing extra.
  //
  // THE GATE FAILS CLOSED, which is the property that matters. It enables only
  // on a value it can positively confirm is non-production: an unset
  // NEXT_PUBLIC_VERCEL_ENV yields false rather than true, so a build where the
  // variable is missing behaves like production. Written the other way round —
  // `!== 'production'` — a missing variable would have turned this ON for real
  // candidates, which is exactly the mistake worth designing out.
  //
  // NEXT_PUBLIC_ is inlined at build time, so the production bundle carries a
  // literal false here and the param is inert there no matter who types it.
  const previewAllowed =
    process.env.NEXT_PUBLIC_VERCEL_ENV === 'preview' ||
    process.env.NEXT_PUBLIC_VERCEL_ENV === 'development' ||
    process.env.NODE_ENV === 'development'

  // Read in an effect off window.location rather than via useSearchParams, which
  // would drag a Suspense boundary into a page that has no other need for one.
  const [previewShifts, setPreviewShifts] = useState(false)
  useEffect(() => {
    if (!previewAllowed) return
    setPreviewShifts(new URLSearchParams(window.location.search).get('preview') === 'shifts')
  }, [previewAllowed])

  const load = useCallback(async () => {
    const [shifts, jobs] = await Promise.all([
      // OPEN SHIFTS ONLY (design 26, round 2: "Filled shifts leave the
      // candidate feed straight away"). This used to keep FILLED ones up until
      // their date, so the thread stayed reachable for whoever got the shift.
      // The cost of the change, accepted: a reply notification about a filled
      // shift now lands on the "no longer on the board" message below rather
      // than on its thread. The employer still has the thread on /manage.
      supabase.from('temp_posts').select('*')
        .eq('status', 'open')
        .order('created_at', { ascending: false }),
      // 'Temporary' rather than 'Flexible' or salary_type='hourly'. It says what
      // it means: Flexible misses the one Temporary role that isn't flagged
      // flexible, and salary_type describes how someone is PAID, not what the
      // work is — a salaried three-month contract is temp and hourly would miss it.
      supabase.from('jobs').select('*').eq('status', 'active')
        .contains('employment_type', ['Temporary'])
        .order('created_at', { ascending: false }),
    ])
    setPosts((shifts.data as TempPost[]) || [])
    setTempJobs(((jobs.data as { created_at?: string }[]) || [])
      .map(r => ({ job: supabaseJobToJob(r), at: r.created_at || '' })))
    setLoading(false)
  }, [])

  useEffect(() => {
    const init = async () => {
      const { data: { session } } = await supabase.auth.getSession()
      const uid = session?.user?.id || null
      setUserId(uid)
      setCanPost(session?.user?.user_metadata?.role === 'employer')
      await load()
      if (uid) {
        // Which posts I've already liked (comment identity is resolved server-side).
        const { data: likes } = await supabase.from('temp_post_likes').select('post_id').eq('user_id', uid)
        setMyLikes(new Set((likes || []).map((r: { post_id: string }) => r.post_id)))
        // …and which I've already put myself forward for. RLS restricts this to
        // my own rows, so it cannot leak who else is interested.
        const { data: mine } = await supabase.from('temp_interest').select('temp_post_id').eq('candidate_user_id', uid)
        const rows = (mine || []) as { temp_post_id: string }[]
        setMyInterest(new Set(rows.map(r => r.temp_post_id)))
        // Name for the email only. The notification's name is resolved by the
        // database trigger from candidate_profiles, so the client cannot spoof
        // the one the employer sees in their bell.
        const { data: cp } = await supabase.from('candidate_profiles').select('full_name').eq('user_id', uid).maybeSingle()
        setMyName((cp as { full_name?: string } | null)?.full_name || '')
      }
    }
    init()
  }, [load])

  // Examples only when there is genuinely NOTHING — no shifts AND no temp jobs —
  // AND ONLY ON A TEST BUILD (design 26: examples are "test builds only", and
  // the row says so in place of its age). On production an empty feed now
  // shows its empty state rather than made-up shifts.
  const usingExamples = previewAllowed && !loading && posts.length === 0 && tempJobs.length === 0
  const visible: TempPost[] = usingExamples
    ? EXAMPLE_TEMP_POSTS
    : previewShifts ? [...posts, ...EXAMPLE_TEMP_POSTS] : posts

  const matchesGroupRole = (roleKey: string) => {
    if (role) return roleKey === role
    if (group) return rolesInGroup(group).includes(roleKey)
    return true
  }

  const filteredPosts = useMemo(() => visible.filter(p => {
    if (usingExamples) return true
    if (!matchesGroupRole(p.category)) return false
    if (loc && !(`${p.location_area} ${p.postcode || ''}`.toLowerCase().includes(loc.toLowerCase()))) return false
    // Min £/hr is an hourly-only filter: a per-shift/day rate can't be compared to
    // an hourly minimum, so applying a minimum hides non-hourly posts entirely.
    if (minRate > 0 && !(p.rate_type === 'hour' && p.hourly_rate != null && p.hourly_rate >= minRate)) return false
    return true
  }), [visible, usingExamples, group, role, loc, minRate]) // eslint-disable-line react-hooks/exhaustive-deps

  const filteredJobs = useMemo(() => tempJobs.filter(({ job: j }) => {
    if (!matchesGroupRole(roleKeyFromTitle(j.title))) return false
    if (loc && !(`${j.location || ''} ${j.area || ''}`.toLowerCase().includes(loc.toLowerCase()))) return false
    // Same rule as shifts: an hourly minimum can only judge an hourly role.
    if (minRate > 0 && !(j.salaryPeriod === 'hour' && (j.salaryMax ?? j.salaryMin) >= minRate)) return false
    return true
  }), [tempJobs, group, role, loc, minRate]) // eslint-disable-line react-hooks/exhaustive-deps

  // The two groups. Posted shifts by START DATE (lib/tempWork byStartDate);
  // short-term jobs newest first, as before.
  const shiftList = useMemo(() => [...filteredPosts].sort(byStartDate), [filteredPosts])
  const jobList = useMemo(() => [...filteredJobs]
    .sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime())
    .map(({ job }) => job), [filteredJobs])

  // A reply notification links to /temp-work?post=<id>. Honour it by opening
  // that post, so the notification lands ON the thread rather than on a feed the
  // reader then has to search. A link that can't complete the action it invites
  // is the fault this whole piece of work exists to remove.

  const flash = (m: string) => { setToast(m); setTimeout(() => setToast(''), 3000) }

  /**
   * Load a post's comments.
   *
   * The feed deliberately does NOT fetch comments for every post up front — that
   * would be one query per card for something most readers never open. They are
   * fetched when a thread opens, and cached per post.
   *
   * A function of its own because there are now TWO ways a thread opens: tapping
   * the card, and arriving from a reply notification.
   */
  const loadComments = useCallback(async (postId: string) => {
    const { data } = await supabase
      .from('temp_post_comments').select('*').eq('post_id', postId).order('created_at', { ascending: true })
    setComments(prev => ({ ...prev, [postId]: (data as TempComment[]) || [] }))
  }, [])

  // A reply notification links to /temp-work?post=<id>. Honour it by opening
  // that post AND LOADING IT.
  //
  // This used to set the open state without ever fetching, so the thread opened
  // EMPTY: the badge said "1 comment" and the panel said "be the first to
  // comment". A chef was told there was an answer, clicked through, and found
  // the page denying it existed — the exact fault this feature was built to
  // remove, reproduced inside the fix for it.
  const deepLinked = useRef(false)
  useEffect(() => {
    if (loading || deepLinked.current) return
    const wanted = new URLSearchParams(window.location.search).get('post')
    if (!wanted) return
    deepLinked.current = true

    setOpenThread(wanted)
    loadComments(wanted)

    // The card renders on the same tick the feed does, so wait a frame rather
    // than querying a DOM that hasn't caught up.
    requestAnimationFrame(() => {
      document.getElementById(`post-${wanted}`)?.scrollIntoView({ block: 'center' })
    })

    // If the post isn't in the feed, say so rather than leaving someone staring
    // at a page that silently ignored their notification. That happens the
    // moment a shift is filled or closed: it drops out of the feed, but the
    // notification pointing at it outlives it.
    if (!posts.some(p => p.id === wanted)) {
      flash('That shift has closed, so it’s no longer on the board.')
    }
  }, [loading, posts, loadComments]) // eslint-disable-line react-hooks/exhaustive-deps

  /**
   * Put myself forward for a shift.
   *
   * The row is written first and everything after it is best-effort: the in-app
   * notification is a database trigger, and the email is a fire-and-forget POST.
   * A candidate who has already committed must never be shown a failure because
   * a downstream side effect wobbled.
   */
  const expressInterest = async (post: TempPost) => {
    if (post.isExample) return
    if (!userId) { requireSignup(); return }
    // Tapping "I'm available" INSIDE a withdrawal's Undo window is the Undo:
    // the row was never removed, so inserting would only re-notify the
    // employer and post a second "I'm available" into their Messages.
    if (pendingRef.current?.postId === post.id) { closeUndo(false); return }
    if (myInterest.has(post.id) || busyInterest === post.id) return
    setBusyInterest(post.id)

    // No note any more (design 26): one tap, and anything private goes in the
    // Messages chat this opens. The column stays; it is simply not written.
    const note: string | null = null
    const { error } = await supabase.from('temp_interest').insert({
      temp_post_id: post.id, candidate_user_id: userId, message: note,
    })

    // 23505 is the unique constraint — they were already available, which is the
    // outcome they wanted. Treat it as success, never as an error.
    if (error && (error as { code?: string }).code !== '23505') {
      setBusyInterest(null)
      flash('Could not mark you available just now. Please try again.')
      return
    }

    setMyInterest(prev => new Set(prev).add(post.id))
    flash('You’re available for this shift — the employer has been told.')

    const { data: { session } } = await supabase.auth.getSession()
    fetch('/api/temp-notify', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
      },
      body: JSON.stringify({ kind: 'interest', postId: post.id, actorName: myName, note }),
    }).catch(() => console.warn('[temp-notify] interest email failed'))

    await openConversationForInterest(post, note)
    setBusyInterest(null)
  }

  /**
   * Withdraw — ONE TAP, THEN FIVE SECONDS TO UNDO (design 26, round 2).
   *
   * The same rule as status changes on Applicants: NOTHING IS WRITTEN DURING
   * THE UNDO WINDOW. The button flips to "I'm available" at once and a toast
   * offers Undo; only when the toast closes is the row removed from the
   * employer's available list and the "no longer available" line posted into
   * their Messages. An Undo therefore costs the employer nothing — no list
   * flicker, no second "I'm available" notification, no stray message.
   *
   * If the page is closed or hidden inside the window, the withdrawal is
   * written THEN, with keepalive requests (the conversation id and the token
   * are fetched during the window — reads only — so nothing has to be looked
   * up while the page is going away). A withdrawal is never silently lost.
   *
   * "Off the list", not "erased". The employer's notification stays: it was true
   * when it was sent. The conversation stays too, because deleting a thread out
   * from under an employer mid-exchange is worse than a stale opener. But it
   * does not stay SILENT: a line goes into the conversation, so an agency finds
   * out where they are rather than by messaging into a void and waiting.
   */
  type PendingWithdraw = { postId: string; title: string; employerId: string; userId: string; name: string; convId: string | null; token: string | null; timer: ReturnType<typeof setTimeout> | null }
  const UNDO_MS = 5000
  const pendingRef = useRef<PendingWithdraw | null>(null)
  const [undoFor, setUndoFor] = useState<{ postId: string; title: string } | null>(null)

  // "No longer available", not "no longer interested". Same event, and the
  // difference is the relationship: one is a scheduling fact, the other reads
  // as rejecting the employer.
  const withdrawLine = (p: PendingWithdraw) => `${p.name || 'The candidate'} is no longer available for ${p.title}.`

  const findConv = async (p: PendingWithdraw): Promise<string | null> => {
    const { data } = await supabase
      .from('conversations').select('id')
      .or(`and(participant_1.eq.${p.userId},participant_2.eq.${p.employerId}),and(participant_1.eq.${p.employerId},participant_2.eq.${p.userId})`)
      .eq('related_temp_post_id', p.postId)
      .maybeSingle()
    return (data as { id: string } | null)?.id ?? null
  }

  // The write, when the toast closes.
  const commitWithdraw = async (p: PendingWithdraw) => {
    const { error } = await supabase.from('temp_interest')
      .delete().eq('temp_post_id', p.postId).eq('candidate_user_id', p.userId)
    if (error) {
      setMyInterest(prev => new Set(prev).add(p.postId))
      flash('Could not withdraw just now. Please try again.')
      return
    }
    // Tell the thread, best-effort: the row is already gone, and a failed
    // system line must not make a successful withdrawal look broken.
    try {
      const convId = p.convId ?? await findConv(p)
      if (convId) {
        const line = withdrawLine(p)
        await supabase.from('messages').insert({
          conversation_id: convId, sender_id: p.userId,
          sender_name: p.name || 'A candidate', sender_role: 'candidate',
          content: line, is_read: false,
        })
        await supabase.from('conversations')
          .update({ last_message: line, last_message_at: new Date().toISOString() })
          .eq('id', convId)
      }
    } catch (e: any) {
      console.warn('[withdraw] could not post the system line:', e?.message)
    }
  }

  // Close the toast: commit (the window ran out) or undo (nothing was written).
  const closeUndo = (commit: boolean) => {
    const p = pendingRef.current
    if (!p) return
    if (p.timer) clearTimeout(p.timer)
    pendingRef.current = null
    setUndoFor(null)
    if (commit) commitWithdraw(p)
    else setMyInterest(prev => new Set(prev).add(p.postId))
  }

  const withdrawInterest = (post: TempPost) => {
    if (post.isExample || !userId) return
    if (!myInterest.has(post.id) || busyInterest === post.id) return
    // One window at a time: starting a second closes the first, which writes.
    if (pendingRef.current) closeUndo(true)
    setMyInterest(prev => { const n = new Set(prev); n.delete(post.id); return n })
    const p: PendingWithdraw = { postId: post.id, title: post.title, employerId: post.employer_id, userId, name: myName, convId: null, token: null, timer: null }
    p.timer = setTimeout(() => { if (pendingRef.current === p) closeUndo(true) }, UNDO_MS)
    pendingRef.current = p
    setUndoFor({ postId: post.id, title: post.title })
    // Readied during the window, reads only, for the keepalive path below.
    supabase.auth.getSession().then(({ data }) => { if (pendingRef.current === p) p.token = data.session?.access_token ?? null })
    findConv(p).then(id => { if (pendingRef.current === p) p.convId = id }).catch(() => {})
  }

  // THE PAGE GOING AWAY INSIDE THE WINDOW writes the withdrawal now. A normal
  // supabase call may not finish while a page unloads; keepalive requests do.
  useEffect(() => {
    const flush = () => {
      const p = pendingRef.current
      if (!p) return
      if (p.timer) clearTimeout(p.timer)
      pendingRef.current = null
      const url = process.env.NEXT_PUBLIC_SUPABASE_URL, key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
      if (!url || !key || !p.token) { commitWithdraw(p); return }
      const headers = { apikey: key, Authorization: `Bearer ${p.token}`, 'Content-Type': 'application/json', Prefer: 'return=minimal' }
      fetch(`${url}/rest/v1/temp_interest?temp_post_id=eq.${p.postId}&candidate_user_id=eq.${p.userId}`, { method: 'DELETE', headers, keepalive: true }).catch(() => {})
      if (p.convId) {
        const line = withdrawLine(p)
        fetch(`${url}/rest/v1/messages`, { method: 'POST', headers, keepalive: true, body: JSON.stringify({ conversation_id: p.convId, sender_id: p.userId, sender_name: p.name || 'A candidate', sender_role: 'candidate', content: line, is_read: false }) }).catch(() => {})
        fetch(`${url}/rest/v1/conversations?id=eq.${p.convId}`, { method: 'PATCH', headers, keepalive: true, body: JSON.stringify({ last_message: line, last_message_at: new Date().toISOString() }) }).catch(() => {})
      }
    }
    const onHide = () => { if (document.visibilityState === 'hidden') flush() }
    window.addEventListener('pagehide', flush)
    document.addEventListener('visibilitychange', onHide)
    return () => { window.removeEventListener('pagehide', flush); document.removeEventListener('visibilitychange', onHide); flush() }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  /**
   * Put the candidate in the employer's Messages, the way an application does.
   *
   * An Easy apply creates a conversation and posts an auto-message, so an
   * applicant turns up in the employer's inbox with everyone else. Interest in a
   * shift did not, which gave an agency two places to look and made the shift
   * candidates the easier ones to lose.
   *
   * Mirrors app/jobs/page.tsx exactly — participant_1 is the candidate,
   * participant_2 the employer — so the two kinds of thread sort and render
   * identically. related_job_title carries the SHIFT title, which is a plain
   * text column with no foreign key, so /messages renders it with no change.
   *
   * THE DEDUP IS THE PART THAT MATTERS. It looks up by related_temp_post_id, not
   * related_job_id: the latter has a foreign key to jobs(id) and would reject a
   * shift id outright. And the existing UNIQUE (p1, p2, related_job_id) does NOT
   * cover this case, because Postgres treats NULLs as distinct — so without the
   * partial unique index added alongside this, a chef interested in three of an
   * agency's shifts would silently collect three identical threads.
   *
   * Best-effort throughout: the interest row is already committed and must not be
   * undone because a thread failed to open.
   */
  const openConversationForInterest = async (post: TempPost, note: string | null) => {
    if (!userId) return
    const opener = note || `I'm available for ${post.title}.`
    const company = post.company_name || 'the employer'
    try {
      const { data: existing } = await supabase
        .from('conversations')
        .select('id')
        .or(`and(participant_1.eq.${userId},participant_2.eq.${post.employer_id}),and(participant_1.eq.${post.employer_id},participant_2.eq.${userId})`)
        .eq('related_temp_post_id', post.id)
        .maybeSingle()

      let conv = existing
      if (!conv) {
        const { data: created, error } = await supabase
          .from('conversations')
          .insert({
            participant_1: userId,
            participant_2: post.employer_id,
            participant_1_name: myName || 'A candidate',
            participant_1_role: 'candidate',
            participant_2_name: company,
            participant_2_role: 'employer',
            participant_2_company: company,
            related_temp_post_id: post.id,
            related_job_title: post.title,
            last_message: opener,
            last_message_at: new Date().toISOString(),
          })
          .select('id')
          .single()
        if (error) { console.warn('[interest] conversation failed:', error.message); return }
        conv = created
      } else {
        await supabase.from('conversations')
          .update({ last_message: opener, last_message_at: new Date().toISOString() })
          .eq('id', conv.id)
      }

      if (conv) {
        await supabase.from('messages').insert({
          conversation_id: conv.id,
          sender_id: userId,
          sender_name: myName || 'A candidate',
          sender_role: 'candidate',
          content: opener,
          is_read: false,
        })
      }
    } catch (e: any) {
      console.warn('[interest] conversation failed:', e?.message)
    }
  }
  const requireLogin = () => router.push(`/login/employee?redirect=${encodeURIComponent('/temp-work')}`)
  // Design 26: signed out, "I'm available" opens SIGN-UP, not log-in — the
  // person tapping it on a public feed is more likely new than returning.
  const requireSignup = () => router.push(`/register/employee?redirect=${encodeURIComponent('/temp-work')}`)

  const toggleLike = async (post: TempPost) => {
    if (post.isExample) return
    if (!userId) { requireLogin(); return }
    if (busyLike === post.id) return
    setBusyLike(post.id)
    const liked = myLikes.has(post.id)
    // Optimistic
    setMyLikes(prev => { const n = new Set(prev); liked ? n.delete(post.id) : n.add(post.id); return n })
    setPosts(prev => prev.map(p => p.id === post.id ? { ...p, like_count: Math.max(0, p.like_count + (liked ? -1 : 1)) } : p))
    const { error } = liked
      ? await supabase.from('temp_post_likes').delete().eq('post_id', post.id).eq('user_id', userId)
      : await supabase.from('temp_post_likes').insert({ post_id: post.id, user_id: userId })
    if (error && (error as { code?: string }).code !== '23505') {
      // Roll back on a real failure.
      setMyLikes(prev => { const n = new Set(prev); liked ? n.add(post.id) : n.delete(post.id); return n })
      setPosts(prev => prev.map(p => p.id === post.id ? { ...p, like_count: Math.max(0, p.like_count + (liked ? 1 : -1)) } : p))
      flash('Could not update your like. Please try again.')
    }
    setBusyLike(null)
  }

  const openComments = async (post: TempPost) => {
    if (openThread === post.id) { setOpenThread(null); return }
    // An example expands to show its description, because that is the whole
    // point of an example — a card nobody can open demonstrates nothing. It
    // still fetches no comments and offers no comment box; those need a real
    // post behind them.
    if (post.isExample) { setOpenThread(post.id); return }
    setOpenThread(post.id); setDraft('')
    if (!comments[post.id]) await loadComments(post.id)
  }

  const sendComment = async (post: TempPost) => {
    if (!userId) { requireLogin(); return }
    const body = draft.trim()
    if (!body) return
    setBusyComment(true)
    // author_name/author_avatar are set server-side (BEFORE INSERT trigger) from
    // the commenter's own profile — never trusted from the client — so we don't
    // send them. The returned row carries the authoritative identity.
    const { data, error } = await supabase.from('temp_post_comments').insert({
      post_id: post.id, user_id: userId, body,
    }).select('*').single()
    if (!error && data) {
      setComments(prev => ({ ...prev, [post.id]: [...(prev[post.id] || []), data as TempComment] }))
      setPosts(prev => prev.map(p => p.id === post.id ? { ...p, comment_count: p.comment_count + 1 } : p))
      setDraft('')
      // Email the employer too. The in-app notification is a database trigger,
      // but an agency who isn't logged in learned nothing until they next
      // visited — which for a Saturday shift is too late to be worth anything.
      // Only when the commenter ISN'T the owner: the trigger already routes an
      // owner's reply to the candidates instead, and emailing an employer about
      // their own comment would be daft.
      // BOTH DIRECTIONS NOW. It used to email only when the commenter wasn't the
      // owner, so an employer replying on their own post emailed nobody — the
      // in-app notification went both ways and the email went one. A chef who
      // isn't logged in never learned the agency had answered, and that chef is
      // the whole point of this.
      {
        const { data: { session } } = await supabase.auth.getSession()
        fetch('/api/temp-notify', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
          },
          body: JSON.stringify({
            // The owner commenting IS the reply — it goes to the candidates.
            // Anyone else commenting goes to the employer.
            kind: post.employer_id === userId ? 'reply' : 'comment',
            postId: post.id,
            actorName: (data as TempComment).author_name || myName,
            body,
          }),
        }).catch(() => console.warn('[temp-notify] comment email failed'))
      }
    } else {
      flash(error?.message || 'Could not post your comment.')
    }
    setBusyComment(false)
  }

  const deleteComment = async (post: TempPost, c: TempComment) => {
    const { error } = await supabase.from('temp_post_comments').delete().eq('id', c.id)
    if (!error) {
      setComments(prev => ({ ...prev, [post.id]: (prev[post.id] || []).filter(x => x.id !== c.id) }))
      setPosts(prev => prev.map(p => p.id === post.id ? { ...p, comment_count: Math.max(0, p.comment_count - 1) } : p))
    } else flash('Could not remove the comment.')
  }

  const anyFilter = !!(group || role || loc || minRate)

  return (
    <main>
      <Header />
      <div className={styles.page}>
        <JobsChips current="shifts" tone="light" />
        <div className={styles.grid}>
          {/* THE HEADING IS A CHILD OF THE GRID, NOT OF THE FEED, AND THAT IS
              THE WHOLE FIX. The grid collapses to one column at 760, so source
              order decides what a phone sees — and with the heading nested
              inside .feed the filters came first: the h1 sat at y=413 of an
              844px screen, so the top 45% was category chips before anything
              had said what the page is. "Short-term roles and casual shifts"
              is the sentence that explains the product and it was below the
              fold.
              Hoisting it puts it first on a phone by source order alone. The
              desktop layout is unchanged and pinned explicitly below, because
              auto-placement would otherwise drop it into the filter column. */}
          <div className={styles.feedHead}>
            <div>
              <h1 className={styles.h1}>Shifts</h1>
              <p className={styles.h1sub}>Short-term roles and casual shifts. Apply to a role, or tell an employer you&rsquo;re available for a shift.</p>
            </div>
            {canPost && <Link href="/temp-work/post" className={styles.feedPostBtn}>+ Post</Link>}
          </div>

          {/* Left rail — filters (inline, not a nested component, so inputs keep focus) */}
          <aside className={styles.leftRail}>
            <div className={styles.filterTitle}>Category</div>
            <div className={styles.catCol}>
              <button className={`${styles.catBtn} ${!group ? styles.catBtnOn : ''}`} onClick={() => { setGroup(''); setRole('') }}>All shifts</button>
              {ROLE_GROUPS.map(g => (
                <div key={g.key}>
                  <button className={`${styles.catBtn} ${group === g.key ? styles.catBtnOn : ''}`} onClick={() => { setGroup(group === g.key ? '' : g.key); setRole('') }}>
                    {g.label}
                  </button>
                  {group === g.key && (
                    <div className={styles.roleChips}>
                      <button className={`${styles.roleChip} ${!role ? styles.roleChipOn : ''}`} onClick={() => setRole('')}>All {g.label.toLowerCase()}</button>
                      {g.roles.map(r => (
                        <button key={r.key} className={`${styles.roleChip} ${role === r.key ? styles.roleChipOn : ''}`} onClick={() => setRole(role === r.key ? '' : r.key)}>{r.label}</button>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
            <div className={styles.filterTitle} style={{ marginTop: '1rem' }}>Where</div>
            <input className={styles.filterInput} placeholder="Location or postcode" value={loc} onChange={e => setLoc(e.target.value)} />
            {/* THE DATE FILTER IS GONE, deliberately. It could only ever match a
                dated shift, and every role on this page today is an ongoing
                vacancy with no date to match — so it filtered everything out the
                moment it was touched. A control that silently empties the page
                is worse than one that isn't there. It comes back with shifts. */}

            <div className={styles.filterTitle} style={{ marginTop: '1rem' }}>Min pay (£/hr)</div>
            <div className={styles.rateChips}>
              {RATE_PRESETS.map(r => (
                <button key={r} className={`${styles.roleChip} ${minRate === r ? styles.roleChipOn : ''}`} onClick={() => setMinRate(minRate === r ? 0 : r)}>
                  £{r}+
                </button>
              ))}
            </div>
            <p className={styles.rateHint}>Hourly shifts only</p>

            {anyFilter && <button className={styles.clearBtn} onClick={() => { setGroup(''); setRole(''); setLoc(''); setMinRate(0) }}>Clear filters</button>}
          </aside>

          {/* Centre feed — the heading now sits above the grid's second column
              rather than inside this element; see the comment on it above. */}
          <div className={styles.feed}>
            {toast && <div className={styles.toast}>{toast}</div>}
            {usingExamples && <div className={styles.exNote}>No live shifts yet — here’s what posts look like. Real shifts replace these the moment one is posted.</div>}
            {previewShifts && !usingExamples && <div className={styles.previewNote}>
              PREVIEW MODE — the shifts marked EXAMPLE below are illustrative, not real, and are visible only because <code>?preview=shifts</code> is in the URL on a non-production build. Nothing has been written to the database.
            </div>}

            {loading ? (
              <div className={styles.empty}>Loading shifts…</div>
            ) : shiftList.length + jobList.length === 0 ? (
              <div className={styles.empty}>
                {anyFilter ? 'No shifts or short-term jobs match your filters right now.' : 'No shifts or short-term jobs right now.'}
              </div>
            ) : (
              // ONE BORDERED LIST, TWO LABELLED GROUPS (design 26, B). The same
              // list box as /jobs (components/JobRow.module.css): full width on
              // a phone, one 760-wide bordered list from 768.
              <div className={rowStyles.list}>
                {shiftList.length > 0 && <FeedGroupLabel>Posted shifts · {shiftList.length}</FeedGroupLabel>}
                {shiftList.map(post => {
                  const isOwner = !!userId && post.employer_id === userId
                  const thread = comments[post.id] || []
                  return (
                    <ShiftRow
                      key={post.id}
                      post={post}
                      liked={myLikes.has(post.id)}
                      available={myInterest.has(post.id)}
                      busy={busyInterest === post.id}
                      isOwner={isOwner}
                      threadOpen={openThread === post.id}
                      onAvailable={() => (myInterest.has(post.id) ? withdrawInterest(post) : expressInterest(post))}
                      onLike={() => toggleLike(post)}
                      onToggleThread={() => openComments(post)}
                    >
                      {/* THE SHIFT'S OWN WORDS FIRST. The design's panel is the
                          thread; the description used to be shown only when a
                          shift was opened, so it stays here or it is lost. A
                          label and its own block keep it from reading as the
                          first comment. */}
                      {post.description && (
                        <div className={styles.pAbout}>
                          <div className={styles.pAboutLabel}>About this shift</div>
                          <p className={styles.pDesc}>{post.description}</p>
                          {post.external_link && <a href={post.external_link} target="_blank" rel="noopener noreferrer" className={styles.pLink}>More details ↗</a>}
                        </div>
                      )}

                      {!post.isExample && (
                        <>
                          {thread.length === 0 && <p className={styles.pEmpty}>No comments yet. Ask a question, or say when you’re free.</p>}
                          {thread.map(c => {
                            // Only candidates have a profile page; an erased
                            // author has no user_id, so no link (never /candidates/null).
                            const profileHref = c.user_id && c.author_role === 'candidate' ? `/candidates/${c.user_id}` : null
                            const name = c.author_name || 'Someone'
                            return (
                              <div key={c.id} className={styles.pComment}>
                                <div className={styles.pHead}>
                                  {profileHref
                                    ? <Link href={profileHref} className={styles.pName}>{name}</Link>
                                    : <span className={styles.pName}>{name}</span>}
                                  {c.author_role === 'employer' && <span className={styles.pMeta}> · employer</span>}
                                  {c.hidden && <span className={styles.pMeta}> · hidden</span>}
                                  <span className={styles.pMeta}> · {timeAgo(c.created_at)}</span>
                                </div>
                                <p className={styles.pBody}>{c.body}</p>
                                {c.user_id === userId ? (
                                  <button type="button" className={styles.pSmall} onClick={() => deleteComment(post, c)}>Delete</button>
                                ) : (
                                  /* THE ONE GENUINELY USER-GENERATED SURFACE: a
                                     candidate's words render here publicly, so
                                     anyone else's comment can be reported. */
                                  <ReportControl targetType="comment" targetId={c.id} className={styles.pSmall} />
                                )}
                              </div>
                            )
                          })}

                          <form className={styles.pForm} onSubmit={e => { e.preventDefault(); sendComment(post) }}>
                            <input
                              className={styles.pInput}
                              type="text"
                              aria-label="Add a comment"
                              placeholder={userId ? 'Add a comment' : 'Log in to comment'}
                              value={draft}
                              onFocus={() => { if (!userId) requireLogin() }}
                              onChange={e => setDraft(e.target.value)}
                            />
                            <button type="submit" className={styles.pPost} disabled={busyComment || !draft.trim()}>
                              {busyComment ? 'Posting…' : 'Post'}
                            </button>
                          </form>
                          {/* Said out loud because the difference is invisible
                              and the failure is permanent: someone who wants to
                              be sure the employer sees them will put a phone
                              number in a public comment. */}
                          <p className={styles.pPrivacy}>
                            Comments are public. Saying you’re available opens a private chat with the employer in Messages.
                          </p>
                        </>
                      )}
                    </ShiftRow>
                  )
                })}

                {jobList.length > 0 && <FeedGroupLabel>Short-term jobs · {jobList.length}</FeedGroupLabel>}
                {jobList.map(job => (
                  <JobRow
                    key={job.id}
                    job={job}
                    onSelect={j => router.push(`/jobs?id=${j.id}`)}
                    saved={isSaved(job.id)}
                    onToggleSave={j => toggleSave(j.id)}
                  />
                ))}
              </div>
            )}

            <p className={styles.disclaimer}>{DISCLAIMER}</p>
          </div>

          {/* Right rail — CTA / helper */}
          <aside className={styles.rightRail}>
            {canPost ? (
              <div className={styles.ctaCard}>
                <div className={styles.ctaTitle}>Hiring temp staff?</div>
                <p className={styles.ctaSub}>Post a dated shift and see who likes and comments. Ongoing casual roles go on the job board.</p>
                <Link href="/temp-work/post" className={styles.ctaBtn}>+ Post a shift</Link>
                {/* "Your shifts", not "Your posts & comments". The destination
                    leads with who is AVAILABLE — comments are the secondary
                    thing on it — and the old label described the page as it was
                    before the available list existed. */}
                <Link href="/temp-work/manage" className={styles.ctaLink}>Your shifts & who’s available →</Link>
              </div>
            ) : (
              <div className={styles.ctaCard}>
                <div className={styles.ctaTitle}>How it works</div>
                {/* Two lines, one per card type. The label carries the weight so a
                    reader scanning on a phone can find their own case without
                    reading both. */}
                <p className={styles.ctaStep}>
                  <span className={styles.ctaStepLabel}>Short-term roles:</span> apply as you would any job.
                </p>
                <p className={styles.ctaStep}>
                  <span className={styles.ctaStepLabel}>Posted shifts:</span> like and comment — the employer reads the comments and gets in touch to book you.
                </p>
              </div>
            )}
          </aside>
        </div>
      </div>

      {/* The withdrawal's Undo (design 26, round 2): five seconds, and nothing
          reaches the employer until it closes. Fixed above the consent bar and
          the phone's bottom bar, like the Applicants toast. */}
      {undoFor && (
        <div className={styles.undoToast} role="status" aria-live="polite">
          <span className={styles.undoText}>You’re no longer available for {undoFor.title}.</span>
          <button type="button" className={styles.undoBtn} onClick={() => closeUndo(false)}>Undo</button>
        </div>
      )}
    </main>
  )
}

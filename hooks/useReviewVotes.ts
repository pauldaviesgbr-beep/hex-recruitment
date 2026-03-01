'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { supabase } from '@/lib/supabase'

interface VoteState {
  hasVoted: boolean
  voteCount: number
  isLoading: boolean
}

interface UseReviewVotesReturn {
  /** Get the vote state for a specific review */
  getVoteState: (reviewId: string) => VoteState
  /** Toggle the helpful vote for a review (insert or delete) */
  toggleVote: (reviewId: string) => Promise<void>
  /** Whether the initial load is still in progress */
  loading: boolean
}

/**
 * Custom hook for managing helpful votes on company reviews.
 *
 * Loads the current user's existing votes on mount, then provides
 * per-review vote state and an atomic toggle function that
 * inserts/deletes the vote row and calls an RPC to
 * increment/decrement helpful_count.
 *
 * @param reviewIds — Array of review IDs to track (typically from the current page)
 * @param initialCounts — Map of reviewId → helpful_count from the initial data fetch
 */
export function useReviewVotes(
  reviewIds: string[],
  initialCounts: Record<string, number>,
): UseReviewVotesReturn {
  const [userId, setUserId] = useState<string | null>(null)
  const [votedIds, setVotedIds] = useState<Set<string>>(new Set())
  const [counts, setCounts] = useState<Record<string, number>>(initialCounts)
  const [loading, setLoading] = useState(true)
  const [pendingIds, setPendingIds] = useState<Set<string>>(new Set())

  // Keep counts in sync when initialCounts changes (e.g. new reviews loaded)
  const prevInitial = useRef(initialCounts)
  useEffect(() => {
    if (prevInitial.current !== initialCounts) {
      setCounts(prev => {
        const next = { ...prev }
        for (const [id, count] of Object.entries(initialCounts)) {
          // Only update if we haven't locally modified this one
          if (!(id in prev) || prev[id] === (prevInitial.current[id] ?? 0)) {
            next[id] = count
          }
        }
        return next
      })
      prevInitial.current = initialCounts
    }
  }, [initialCounts])

  // Load current user and their existing votes
  useEffect(() => {
    let cancelled = false

    const init = async () => {
      const { data: { session } } = await supabase.auth.getSession()
      if (cancelled) return

      if (!session) {
        setLoading(false)
        return
      }

      setUserId(session.user.id)

      if (reviewIds.length === 0) {
        setLoading(false)
        return
      }

      const { data: votes } = await supabase
        .from('review_helpful_votes')
        .select('review_id')
        .eq('user_id', session.user.id)
        .in('review_id', reviewIds)

      if (!cancelled && votes) {
        setVotedIds(new Set(votes.map((v: any) => v.review_id)))
      }

      if (!cancelled) setLoading(false)
    }

    init()
    return () => { cancelled = true }
  }, [reviewIds.join(',')]) // eslint-disable-line react-hooks/exhaustive-deps

  const toggleVote = useCallback(async (reviewId: string) => {
    if (!userId) return
    if (pendingIds.has(reviewId)) return // Prevent double-clicks

    const alreadyVoted = votedIds.has(reviewId)

    // Optimistic update
    setPendingIds(prev => new Set(prev).add(reviewId))

    if (alreadyVoted) {
      // Remove vote optimistically
      setVotedIds(prev => {
        const next = new Set(prev)
        next.delete(reviewId)
        return next
      })
      setCounts(prev => ({
        ...prev,
        [reviewId]: Math.max(0, (prev[reviewId] || 0) - 1),
      }))

      // Delete vote row
      const { error: deleteError } = await supabase
        .from('review_helpful_votes')
        .delete()
        .eq('review_id', reviewId)
        .eq('user_id', userId)

      if (deleteError) {
        // Rollback on failure
        setVotedIds(prev => new Set(prev).add(reviewId))
        setCounts(prev => ({
          ...prev,
          [reviewId]: (prev[reviewId] || 0) + 1,
        }))
        setPendingIds(prev => {
          const next = new Set(prev)
          next.delete(reviewId)
          return next
        })
        return
      }

      // Atomically decrement helpful_count via RPC, fall back to direct update
      const { error: rpcError } = await supabase.rpc('decrement_review_helpful', {
        p_review_id: reviewId,
      })

      if (rpcError) {
        // Fallback: direct update
        const currentCount = counts[reviewId] ?? 0
        await supabase
          .from('company_reviews')
          .update({ helpful_count: currentCount })
          .eq('id', reviewId)
      }
    } else {
      // Add vote optimistically
      setVotedIds(prev => new Set(prev).add(reviewId))
      setCounts(prev => ({
        ...prev,
        [reviewId]: (prev[reviewId] || 0) + 1,
      }))

      // Insert vote row
      const { error: insertError } = await supabase
        .from('review_helpful_votes')
        .insert({ review_id: reviewId, user_id: userId })

      if (insertError) {
        // Rollback on failure (e.g. unique constraint)
        setVotedIds(prev => {
          const next = new Set(prev)
          next.delete(reviewId)
          return next
        })
        setCounts(prev => ({
          ...prev,
          [reviewId]: Math.max(0, (prev[reviewId] || 0) - 1),
        }))
        setPendingIds(prev => {
          const next = new Set(prev)
          next.delete(reviewId)
          return next
        })
        return
      }

      // Atomically increment helpful_count via RPC, fall back to direct update
      const { error: rpcError } = await supabase.rpc('increment_review_helpful', {
        p_review_id: reviewId,
      })

      if (rpcError) {
        // Fallback: direct update
        const currentCount = counts[reviewId] ?? 0
        await supabase
          .from('company_reviews')
          .update({ helpful_count: currentCount })
          .eq('id', reviewId)
      }
    }

    setPendingIds(prev => {
      const next = new Set(prev)
      next.delete(reviewId)
      return next
    })
  }, [userId, votedIds, pendingIds, counts])

  const getVoteState = useCallback((reviewId: string): VoteState => ({
    hasVoted: votedIds.has(reviewId),
    voteCount: counts[reviewId] ?? 0,
    isLoading: pendingIds.has(reviewId),
  }), [votedIds, counts, pendingIds])

  return { getVoteState, toggleVote, loading }
}

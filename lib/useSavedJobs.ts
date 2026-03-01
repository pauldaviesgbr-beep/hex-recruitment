'use client'

import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import { DEV_MODE, getMockUser } from '@/lib/mockAuth'

const SEEN_KEY = 'savedJobsSeenIds'

function loadSeenIds(): Set<string> {
  if (typeof window === 'undefined') return new Set()
  try {
    const raw = localStorage.getItem(SEEN_KEY)
    return raw ? new Set(JSON.parse(raw)) : new Set()
  } catch {
    return new Set()
  }
}

function persistSeenIds(ids: Set<string>) {
  try {
    localStorage.setItem(SEEN_KEY, JSON.stringify(Array.from(ids)))
  } catch { /* ignore */ }
}

export function useSavedJobs() {
  const [savedIds, setSavedIds] = useState<Set<string>>(new Set())
  const [seenIds, setSeenIds] = useState<Set<string>>(() => loadSeenIds())
  const [loading, setLoading] = useState(true)
  const fetchedRef = useRef(false)

  const getUserId = useCallback(async (): Promise<string | null> => {
    if (DEV_MODE) {
      const mockUser = getMockUser()
      return mockUser?.id || null
    }
    const { data: { session } } = await supabase.auth.getSession()
    return session?.user.id || null
  }, [])

  const fetchSavedJobs = useCallback(async () => {
    const userId = await getUserId()
    if (!userId) {
      setSavedIds(new Set())
      setLoading(false)
      return
    }

    try {
      const { data, error } = await supabase
        .from('saved_jobs')
        .select('job_id')
        .eq('candidate_id', userId)

      if (error) {
        // Table may not exist yet — fail silently
        setLoading(false)
        return
      }
      setSavedIds(new Set((data || []).map(row => row.job_id)))
    } catch {
      // Network or other errors — fail silently
    } finally {
      setLoading(false)
    }
  }, [getUserId])

  useEffect(() => {
    if (!fetchedRef.current) {
      fetchedRef.current = true
      fetchSavedJobs()
    }
  }, [fetchSavedJobs])

  const isSaved = useCallback((jobId: string): boolean => {
    return savedIds.has(jobId)
  }, [savedIds])

  const toggleSave = useCallback(async (jobId: string) => {
    const userId = await getUserId()
    if (!userId) return

    const currentlySaved = savedIds.has(jobId)

    // Optimistic update
    setSavedIds(prev => {
      const next = new Set(prev)
      if (currentlySaved) {
        next.delete(jobId)
      } else {
        next.add(jobId)
      }
      return next
    })

    try {
      if (currentlySaved) {
        const { error } = await supabase
          .from('saved_jobs')
          .delete()
          .eq('candidate_id', userId)
          .eq('job_id', jobId)
        if (error) throw error
      } else {
        const { error } = await supabase
          .from('saved_jobs')
          .insert({ candidate_id: userId, job_id: jobId })
        if (error) throw error
      }
    } catch {
      // Revert optimistic update
      setSavedIds(prev => {
        const next = new Set(prev)
        if (currentlySaved) {
          next.add(jobId)
        } else {
          next.delete(jobId)
        }
        return next
      })
    }
  }, [savedIds, getUserId])

  // Count of saved jobs the user hasn't "seen" yet
  const unseenCount = useMemo(() => {
    let count = 0
    savedIds.forEach(id => { if (!seenIds.has(id)) count++ })
    return count
  }, [savedIds, seenIds])

  // Mark all current saved jobs as seen (call when saved-jobs page mounts)
  const markAllSeen = useCallback(() => {
    setSeenIds(new Set(savedIds))
    persistSeenIds(savedIds)
  }, [savedIds])

  return {
    savedIds,
    savedCount: savedIds.size,
    unseenCount,
    loading,
    isSaved,
    toggleSave,
    markAllSeen,
    refresh: fetchSavedJobs,
  }
}

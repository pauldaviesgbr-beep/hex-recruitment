'use client'

import { useCallback, useRef, useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

export type ViewSource = 'search' | 'direct' | 'recommendation' | 'saved' | 'external'

function getDeviceType(): 'mobile' | 'tablet' | 'desktop' {
  if (typeof window === 'undefined') return 'desktop'
  const w = window.innerWidth
  if (w < 768) return 'mobile'
  if (w < 1024) return 'tablet'
  return 'desktop'
}

/**
 * Custom hook for tracking job analytics events.
 *
 * Provides three tracking functions that insert rows into
 * `job_views`, `job_click_events`, and `job_impressions`.
 *
 * `trackJobView` is debounced per job — the same user viewing
 * the same job within 30 seconds will not create a duplicate row.
 */
export function useAnalyticsTracking() {
  const [userId, setUserId] = useState<string | null>(null)

  // Map of jobId → timestamp of last tracked view (for debounce)
  const recentViews = useRef<Map<string, number>>(new Map())

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) setUserId(session.user.id)
    })
  }, [])

  const trackJobView = useCallback(
    async (jobId: string, source: ViewSource) => {
      if (!userId) {
        console.warn('[Analytics] trackJobView skipped — no userId yet')
        return
      }

      // Debounce: skip if same job was viewed in the last 30 seconds
      const now = Date.now()
      const lastView = recentViews.current.get(jobId)
      if (lastView && now - lastView < 30_000) return

      recentViews.current.set(jobId, now)

      const device = getDeviceType()

      const { error } = await supabase.from('job_views').insert({
        job_id: jobId,
        viewer_id: userId,
        source,
        device_type: device,
      })

      if (error) {
        console.error('[Analytics] trackJobView insert failed:', error.message, { jobId, userId, source, device })
        // Fallback: try with only base columns
        const { error: fallbackError } = await supabase.from('job_views').insert({
          job_id: jobId,
          viewer_id: userId,
        })
        if (fallbackError) {
          console.error('[Analytics] trackJobView fallback also failed:', fallbackError.message)
        }
      } else {
        console.log('[Analytics] trackJobView success:', { jobId, source, device })
      }
    },
    [userId],
  )

  const trackClickEvent = useCallback(
    async (jobId: string, eventType: string) => {
      if (!userId) return

      const { error } = await supabase.from('job_click_events').insert({
        job_id: jobId,
        user_id: userId,
        event_type: eventType,
      })
      if (error) {
        console.error('[Analytics] trackClickEvent failed:', error.message, { jobId, eventType })
      }
    },
    [userId],
  )

  const trackImpression = useCallback(
    async (jobId: string, searchQuery: string, position: number) => {
      if (!userId) return

      const { error } = await supabase.from('job_impressions').insert({
        job_id: jobId,
        user_id: userId,
        search_query: searchQuery,
        position,
      })
      if (error) {
        console.error('[Analytics] trackImpression failed:', error.message, { jobId, searchQuery })
      }
    },
    [userId],
  )

  return { trackJobView, trackClickEvent, trackImpression }
}

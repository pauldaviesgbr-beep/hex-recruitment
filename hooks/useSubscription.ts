'use client'

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { DEV_MODE, getMockUser } from '@/lib/mockAuth'
import { getUserSubscription, hasFeatureAccess, type UserSubscription } from '@/lib/subscription'

export function useSubscription() {
  const [subscription, setSubscription] = useState<UserSubscription | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      try {
        let userId: string | null = null

        if (DEV_MODE) {
          const mockUser = getMockUser()
          userId = mockUser?.id || null
        } else {
          const { data: { session } } = await supabase.auth.getSession()
          userId = session?.user?.id || null
        }

        if (userId) {
          const sub = await getUserSubscription(userId)
          setSubscription(sub)
        }
      } catch (err) {
        console.error('Error loading subscription:', err)
      } finally {
        setLoading(false)
      }
    }

    load()
  }, [])

  const canAccess = (feature: string): boolean => {
    if (!subscription) return false
    return hasFeatureAccess(subscription, feature as any)
  }

  return {
    subscription,
    loading,
    isActive: subscription?.isActive || false,
    isTrial: subscription?.isTrial || false,
    tier: subscription?.tier || null,
    canAccess,
  }
}

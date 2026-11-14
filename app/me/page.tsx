'use client'

// /me — the candidate's Profile page on the website: the last slot of the
// phone bottom bar (design_handoff_phone_navigation, 1c). The iOS app's Profile
// tab is native (ThriveProfile.swift); this is the website's version of the
// same list, so the candidate hamburger can go.
//
// Signed out goes to sign in; an employer goes to their own More page, so
// nobody lands on a list of somebody else's destinations.

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import NavMenuPage from '@/components/NavMenuPage'
import Header from '@/components/Header'
import { supabase } from '@/lib/supabase'
import { DEV_MODE, getMockUser } from '@/lib/mockAuth'
import { CANDIDATE_PROFILE, EMPLOYER_MORE_PATH } from '@/lib/phoneNav'

export default function CandidateProfileMenuPage() {
  const router = useRouter()
  const [ready, setReady] = useState(false)

  useEffect(() => {
    const decide = (user: any) => {
      if (!user) { router.replace('/login'); return }
      if (user.user_metadata?.role === 'employer') { router.replace(EMPLOYER_MORE_PATH); return }
      setReady(true)
    }
    if (DEV_MODE) { decide(getMockUser()); return }
    supabase.auth.getSession().then(({ data: { session } }) => decide(session?.user))
  }, [router])

  if (!ready) return <main><Header /></main>
  return <NavMenuPage title="Profile" groups={CANDIDATE_PROFILE} />
}

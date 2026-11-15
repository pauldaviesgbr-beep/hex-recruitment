'use client'

// /applied — THE APPLICANTS LIST (design 24 section 4). It was the "New
// Applications" queue of pending applications; it is now the one list that
// replaces the pipeline board and the Offers page (both redirect here,
// next.config.js). Build 30's Applicants tab already loads this address, so
// the list reaches the app with no new build.
//
// A Suspense boundary because the view reads ?app= and ?stage=.

import { Suspense } from 'react'
import ApplicantsView from '@/components/applicants/ApplicantsView'

export default function AppliedPage() {
  return (
    <Suspense fallback={null}>
      <ApplicantsView />
    </Suspense>
  )
}

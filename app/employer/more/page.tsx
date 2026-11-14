'use client'

// /employer/more — the employer's More page (design_handoff_phone_navigation,
// mockup 3c). It replaces the hamburger sheet on a phone, and it is what the
// iOS app's More tab opens: build 30's tab presses the website's hidden
// "Open navigation" control, which now comes here (components/EmployerSidebar).
//
// Inside app/employer, so the server entitlement guard in app/employer/layout
// has already run: only an approved employer reaches this page.

import NavMenuPage from '@/components/NavMenuPage'
import { EMPLOYER_MORE, EMPLOYER_MORE_FOOT } from '@/lib/phoneNav'

export default function EmployerMorePage() {
  return <NavMenuPage title="More" groups={EMPLOYER_MORE} foot={EMPLOYER_MORE_FOOT} />
}

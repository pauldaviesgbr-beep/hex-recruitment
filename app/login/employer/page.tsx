// /login/employer IS NOW A REDIRECT TO /login.
//
// There was one login screen per role, reached through a chooser. Three screens
// to answer a question the account already answers, and it produced a dead end:
// sign in on the wrong one and you were told "This login is for job seekers
// only", having typed the right password.
//
// A REDIRECT RATHER THAN A DELETION, deliberately. Seventy-nine references
// across fifty-one files point at these two paths, plus bookmarks, nine sent
// emails and Google's index. Deleting a page turned /register/employer into a
// 404 once already — tsc cannot see a dead href and neither can the build.
//
// THE QUERY STRING MUST SURVIVE. Everything that bounces somebody here carries
// ?redirect=, and dropping it lands them on a dashboard instead of the page
// they were trying to reach.

import { redirect } from 'next/navigation'

export default async function LoginEmployerRedirect({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const params = await searchParams
  const qs = new URLSearchParams()
  for (const [k, v] of Object.entries(params)) {
    if (typeof v === 'string') qs.set(k, v)
    else if (Array.isArray(v) && v[0]) qs.set(k, v[0])
  }
  const query = qs.toString()
  redirect(query ? `/login?${query}` : '/login')
}

// WHICH IDENTITY PROVIDER DID THIS PERSON USE — ONE MAP, TWO READERS.
//
// There was already a map inside signupSource() in lib/profileCompleteness.ts,
// used to label the admin user list. Meanwhile /settings/security told EVERY
// OAuth user "You signed in with Google" — hardcoded, so a LinkedIn user has
// been told they signed in with Google for as long as LinkedIn has been
// offered. That is a live fault for real people today, not an Apple
// prerequisite; it was simply found while scoping Apple.
//
// Rather than add a second map, both now read this one. Adding a provider is a
// single line here instead of a hunt for every place that names one.

const LABELS: Record<string, string> = {
  google: 'Google',
  linkedin_oidc: 'LinkedIn',
  linkedin: 'LinkedIn',
  apple: 'Apple',
  email: 'Email',
}

interface ProviderUserish {
  app_metadata?: { provider?: string } | null
  identities?: { provider?: string }[] | null
}

/** The raw provider string Supabase holds, or 'email'. */
export function providerKey(user: ProviderUserish | null | undefined): string {
  return user?.app_metadata?.provider
    || user?.identities?.[0]?.provider
    || 'email'
}

/**
 * A provider name fit to put in a sentence.
 *
 * FALLS BACK TO SOMETHING THAT READS, NOT TO THE RAW KEY. An unmapped provider
 * would otherwise render as lowercase 'apple' or 'linkedin_oidc' mid-sentence —
 * which is exactly what the admin list does today, and is the reason this
 * function exists rather than an inline lookup.
 */
export function providerLabel(user: ProviderUserish | null | undefined): string {
  const key = providerKey(user)
  return LABELS[key] || 'your provider'
}

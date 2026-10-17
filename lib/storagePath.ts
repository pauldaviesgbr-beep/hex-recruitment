// Storage paths in the private 'profiles' bucket, with no client attached, so
// both the browser helper (lib/storageUrl.ts) and server routes can use it.
const BUCKET = 'profiles'

/**
 * Extract the storage path from a Supabase public URL or return the
 * value as-is if it's already a relative path.
 *
 * Public URLs look like:
 *   https://<ref>.supabase.co/storage/v1/object/public/profiles/<path>
 */
export function extractPath(urlOrPath: string): string {
  if (!urlOrPath) return ''
  // Already a relative path (no protocol)
  if (!urlOrPath.startsWith('http')) return urlOrPath
  // Extract path after /profiles/
  const marker = `/storage/v1/object/public/${BUCKET}/`
  const idx = urlOrPath.indexOf(marker)
  if (idx !== -1) return urlOrPath.slice(idx + marker.length)
  // Signed URL marker
  const signedMarker = `/storage/v1/object/sign/${BUCKET}/`
  const sIdx = urlOrPath.indexOf(signedMarker)
  if (sIdx !== -1) return urlOrPath.slice(sIdx + signedMarker.length).split('?')[0]
  return urlOrPath
}

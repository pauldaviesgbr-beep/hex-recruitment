import { supabase } from './supabase'
import { extractPath } from './storagePath'

const BUCKET = 'profiles'
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || ''

// One copy, shared with the server (app routes cannot import the browser client).

/**
 * Get a signed URL for a file in the profiles bucket. Returns the
 * original value unchanged if it's not a Supabase storage URL (e.g.
 * an external avatar URL from Google).
 *
 * @param urlOrPath - full public URL, signed URL, or relative path
 * @param expiresIn - seconds until the signed URL expires (default 1 hour)
 * @param download - if true, Supabase adds Content-Disposition: attachment so
 *   browsers save the file instead of viewing it inline. Pass a filename to
 *   override what the browser saves it as.
 */
export async function getSignedStorageUrl(
  urlOrPath: string | null | undefined,
  expiresIn = 3600,
  download?: boolean | string,
  /**
   * Ask the server for a thumbnail instead of the original.
   *
   * WHY THIS EXISTS. The candidate directory renders fifty avatars at 46px and
   * the stored photos are whatever people uploaded — one is 1052x1536 and
   * 1.7MB. Fifty full-resolution photographs squeezed into 46px circles is the
   * base64-logo fault in a new coat, so the size is requested at the size it
   * is drawn.
   */
  transform?: { width: number; height: number }
): Promise<string> {
  if (!urlOrPath) return ''
  // External URLs (Google avatar, etc.) — pass through
  if (urlOrPath.startsWith('http') && !urlOrPath.includes(SUPABASE_URL)) {
    return urlOrPath
  }
  const path = extractPath(urlOrPath)
  if (!path) return ''
  const options: { download?: string | boolean; transform?: Record<string, unknown> } = {}
  if (download !== undefined) options.download = download
  if (transform) {
    options.transform = { width: transform.width, height: transform.height, resize: 'cover' }
  }
  const { data, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(path, expiresIn, options)

  // IMAGE TRANSFORMATION IS A PAID SUPABASE FEATURE AND MAY NOT BE ON.
  // If it is not, asking for a transform fails the whole request — which would
  // turn a size optimisation into a blank avatar. So a transform failure falls
  // back to the untransformed original: heavier, and still a photo. The
  // measurement script reports whether the transform actually applied, so this
  // degrades loudly in the numbers rather than silently on the page.
  if ((error || !data?.signedUrl) && transform) {
    const plain = await supabase.storage.from(BUCKET).createSignedUrl(path, expiresIn, { ...options, transform: undefined })
    return plain.data?.signedUrl || ''
  }
  if (error || !data?.signedUrl) return ''
  return data.signedUrl
}

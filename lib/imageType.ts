// WHAT AN IMAGE ACTUALLY IS, read from its own first bytes.
//
// WHY THIS EXISTS. `app/job/[id]/opengraph-image.tsx` proxies an employer's
// banner photo as the link-preview image, and from 20 June 2026 (7f820f1,
// "Harden OG photo proxy") it forced every one of them out as
// `Content-Type: image/webp` with `X-Content-Type-Options: nosniff`. Its
// comment gave the reason — "we only ever store WebP" — and that was a claim
// about the data which was never true of the data: measured 16 Sept 2026,
// 117 of 119 live adverts carry a `.jpg` banner and NOT ONE is WebP.
//
// So the route labelled 117 JPEGs as WebP, and `nosniff` is what made it
// fatal: it forbids the crawler from sniffing the real type and correcting
// us. LinkedIn tries to decode a JPEG as WebP, fails, and drops the image —
// which is why job links have had no preview card for nearly three months,
// on every platform that builds one.
//
// THE FIX IS NOT TO TRUST THE UPSTREAM HEADER. That was the actual
// vulnerability 7f820f1 closed and it stays closed. It is to stop asserting
// a type we never checked, and read the bytes instead: a file cannot lie
// about its own magic number the way a header can.
//
// Anything not recognised returns null, and the caller must refuse to serve
// it rather than guess. Refusing is the safe direction — the route falls back
// to a branded card it renders itself.

export type ServableImageType = 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif'

function ascii(bytes: Uint8Array, from: number, to: number): string {
  let s = ''
  for (let i = from; i < to && i < bytes.length; i++) s += String.fromCharCode(bytes[i])
  return s
}

/**
 * The image's real media type, from its magic bytes — or null if these bytes
 * are not one of the four raster formats a link-preview crawler will accept.
 *
 * Deliberately NOT a general sniffer. It answers one question: "may this be
 * served as an og:image, and under what type", and an unknown answer is a
 * refusal rather than a default.
 */
export function sniffImageType(input: ArrayBuffer | Uint8Array): ServableImageType | null {
  const b = input instanceof Uint8Array ? input : new Uint8Array(input)

  // JPEG — SOI marker FF D8, then FF for the first segment.
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'image/jpeg'

  // PNG — the 8-byte signature.
  if (
    b.length >= 8 &&
    b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47 &&
    b[4] === 0x0d && b[5] === 0x0a && b[6] === 0x1a && b[7] === 0x0a
  ) return 'image/png'

  // WebP — a RIFF container whose form type is WEBP. Both halves are required:
  // "RIFF" alone is also WAV and AVI.
  if (b.length >= 12 && ascii(b, 0, 4) === 'RIFF' && ascii(b, 8, 12) === 'WEBP') return 'image/webp'

  // GIF — GIF87a or GIF89a.
  if (b.length >= 6) {
    const sig = ascii(b, 0, 6)
    if (sig === 'GIF87a' || sig === 'GIF89a') return 'image/gif'
  }

  return null
}

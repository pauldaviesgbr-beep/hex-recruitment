import { ImageResponse } from 'next/og'
import { getJobForMeta, formatSalaryShort } from '@/lib/jobMeta'
import { sniffImageType } from '@/lib/imageType'

// Per-job link-preview image (1200x630).
//   - job has a banner photo (public Storage URL) -> serve the REAL photo as the
//     preview image. We proxy the actual bytes rather than compositing a card;
//     the role title / company / salary show via og:title + og:description.
//
//     THE REASON GIVEN HERE USED TO BE "our banners are WebP" AND IT WAS NEVER
//     TRUE. Measured 16 Sept 2026: 117 of 119 live adverts carry a .jpg banner
//     and not one is WebP. That sentence is what produced the forced
//     Content-Type below, so it is corrected rather than deleted — and it means
//     compositing a real 1200x630 card IS possible now, which is the better fix
//     and a separate change.
//   - no usable photo -> a branded navy card carrying the role text (safety net).
//
// Edge runtime is the supported path for @vercel/og — it bundles the font inline
// and avoids the node-runtime font-path resolution (which breaks on Windows
// paths containing spaces).
export const runtime = 'edge'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'
export const alt = 'Hospitality role on Thrive'

interface Props {
  params: { id: string }
}

export default async function OgImage({ params }: Props) {
  const job = await getJobForMeta(params.id)
  const banner = job?.bannerUrl || null

  // Photo job: serve the real banner image bytes as the preview.
  //
  // SSRF-safe: only proceed when the banner URL is under our own public
  // job-banners Storage prefix. We follow redirects (Supabase Storage may 3xx to
  // its CDN from some edge regions) but require the FINAL response to stay on a
  // supabase.co host before serving, so a redirect can't escape to an arbitrary
  // host.
  //
  // THE TYPE COMES FROM THE BYTES, NEVER FROM UPSTREAM AND NEVER FROM A GUESS.
  // Trusting the upstream Content-Type is the hole 7f820f1 closed and it stays
  // closed. Asserting a fixed 'image/webp' was the other way to get it wrong:
  // with nosniff set a wrong type is not cosmetic, it FORBIDS the crawler from
  // correcting us, and every link-preview card died for three months.
  // An unrecognised file is REFUSED — we fall through to the branded card
  // rather than serve bytes we cannot identify.
  const supaUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
  const allowedPrefix = `${supaUrl}/storage/v1/object/public/job-banners/`
  let storageHost = ''
  try { storageHost = new URL(supaUrl).host } catch {}
  if (banner && allowedPrefix.startsWith('http') && banner.startsWith(allowedPrefix)) {
    try {
      const res = await fetch(banner)
      let finalHost = ''
      try { finalHost = new URL(res.url || banner).host } catch {}
      // Strict: after following any (same-host) Storage redirect, the final
      // response must still be on OUR exact project host — never another tenant.
      if (res.ok && finalHost === storageHost) {
        const buf = await res.arrayBuffer()
        const realType = sniffImageType(buf)
        if (realType) return new Response(buf, {
          headers: {
            'Content-Type': realType,
            'X-Content-Type-Options': 'nosniff',
            'Content-Security-Policy': "default-src 'none'; sandbox",
            'Cache-Control': 'public, max-age=86400, s-maxage=86400',
          },
        })
      }
    } catch {
      // fall through to the branded card if the photo can't be fetched
    }
  }

  // No usable photo (or fetch failed) -> branded navy card with the role text.
  const title = job?.title || 'Hospitality role'
  const company = job?.company || 'Thrive'
  const salary = job ? formatSalaryShort(job) : null
  const metaLine = [job?.location, salary].filter(Boolean).join('   ·   ')

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          padding: '72px 80px',
          backgroundColor: '#0a1628',
          backgroundImage: 'linear-gradient(135deg, #0a1628 0%, #12294a 100%)',
          color: '#ffffff',
          fontFamily: 'sans-serif',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center' }}>
          <div style={{ width: 46, height: 46, borderRadius: 12, backgroundColor: '#ffe500', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#0a1628', fontSize: 30, fontWeight: 800 }}>T</div>
          <div style={{ marginLeft: 18, fontSize: 30, fontWeight: 700, letterSpacing: 1 }}>Thrive</div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <div style={{ fontSize: 30, fontWeight: 600, color: '#ffe500', marginBottom: 18 }}>{company}</div>
          <div style={{ display: 'flex', fontSize: title.length > 48 ? 60 : 74, fontWeight: 800, lineHeight: 1.05, maxWidth: 1000 }}>{title}</div>
          {metaLine ? <div style={{ fontSize: 34, color: 'rgba(255,255,255,0.82)', marginTop: 26 }}>{metaLine}</div> : null}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', fontSize: 28, color: 'rgba(255,255,255,0.75)' }}>
          View the role and apply on Thrive
        </div>
      </div>
    ),
    size,
  )
}

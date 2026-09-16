// THE LINK-PREVIEW IMAGE IS SERVED AS WHAT IT ACTUALLY IS.
//
// Watches the fault that killed every job-share preview for nearly three
// months: `app/job/[id]/opengraph-image.tsx` forced `Content-Type: image/webp`
// onto banners that are JPEG, alongside `nosniff` — which is the combination
// that makes a wrong type fatal rather than cosmetic, because it forbids the
// crawler from sniffing past us.
//
// THE ASSERTION IS THE AGREEMENT, not either side. "The route serves
// image/jpeg" proves nothing on its own; "the bytes are JPEG" proves nothing
// either. What matters is that the type the route emits is DERIVED FROM the
// bytes it is emitting, so the two cannot drift apart again.
//
// Fixtures are produced by a real encoder rather than hand-written magic
// numbers — a detector that has only ever been shown bytes its author typed
// has not been tested on the thing that beats it.
//
// No network and no database: sharp encodes in memory and the route is read
// off disk, so this runs everywhere and can never be a red nobody expects.

import { readFileSync } from 'node:fs'
import path from 'node:path'
import sharp from 'sharp'
import { sniffImageType } from '../lib/imageType'

const ROUTE = path.join(process.cwd(), 'app', 'job', '[id]', 'opengraph-image.tsx')
const src = readFileSync(ROUTE, 'utf8')

let failures = 0
function check(label: string, pass: boolean, detail: string) {
  if (!pass) failures++
  console.log(`  ${pass ? 'ok  ' : 'FAIL'} ${label.padEnd(62)} ${detail}`)
}

// ── 1. the sniffer tells the four formats apart, on real encoder output ──
const seed = { create: { width: 8, height: 8, channels: 3 as const, background: '#123456' } }

async function main() {
const made: Array<[string, Buffer]> = [
  ['image/jpeg', await sharp(seed).jpeg().toBuffer()],
  ['image/png', await sharp(seed).png().toBuffer()],
  ['image/webp', await sharp(seed).webp().toBuffer()],
  ['image/gif', await sharp(seed).gif().toBuffer()],
]
for (const [want, buf] of made) {
  const got = sniffImageType(buf)
  check(`a real ${want.split('/')[1].toUpperCase()} is recognised as ${want}`, got === want, String(got))
}

// ── 2. THE CASE THAT CAUSED THE OUTAGE: a JPEG must not read as WebP ──
const jpegBuf = made[0][1]
check(
  'a JPEG is NOT reported as image/webp — the three-month fault',
  sniffImageType(jpegBuf) !== 'image/webp',
  String(sniffImageType(jpegBuf)),
)

// ── 3. an unknown file is REFUSED, not defaulted ──
check('unrecognised bytes return null rather than a guess',
  sniffImageType(Buffer.from('<html>not an image at all</html>')) === null, 'null')
check('an empty file returns null',
  sniffImageType(Buffer.alloc(0)) === null, 'null')
// "RIFF" alone is also WAV/AVI — the form type is required, not optional.
const riffOnly = Buffer.concat([Buffer.from('RIFF'), Buffer.alloc(4), Buffer.from('WAVE')])
check('a RIFF container that is not WebP is refused', sniffImageType(riffOnly) === null, 'null')

// ── 4. the route derives the type rather than asserting one ──
check('the route no longer hardcodes a Content-Type',
  !/'Content-Type':\s*'image\/(webp|png|jpeg)'/.test(src), 'no literal image type')
check('the route sets Content-Type from the sniffed value',
  /'Content-Type':\s*realType/.test(src), "'Content-Type': realType")
check('the route asks the shared sniffer, not a second copy',
  src.includes("from '@/lib/imageType'") && src.includes('sniffImageType(buf)'), 'imports lib/imageType')
check('the route REFUSES bytes it cannot identify',
  /if\s*\(realType\)\s*return new Response/.test(src), 'falls through to the branded card')

// ── 5. the hardening 7f820f1 added must still be there ──
// This fix must not become the next "removing a fault took a feature with it".
check('nosniff is still set', src.includes("'X-Content-Type-Options': 'nosniff'"), 'present')
check('the SSRF host re-check survives', src.includes('finalHost === storageHost'), 'present')
check('the Storage prefix allow-list survives', src.includes('banner.startsWith(allowedPrefix)'), 'present')
check('the sandbox CSP survives',
  src.includes("'Content-Security-Policy': \"default-src 'none'; sandbox\""), 'present')

console.log(
  failures === 0
    ? '\nthe preview image is served as what it actually is, and the hardening is intact'
    : `\n${failures} FAILED`,
)
process.exit(failures ? 1 : 0)
}

main().catch(err => { console.error(err); process.exit(1) })

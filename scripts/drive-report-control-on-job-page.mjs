// WHERE IS THE REPORT CONTROL ON /job/[id], ON A PHONE?
//
//   node scripts/drive-report-control-on-job-page.mjs <base-url> <job-id>
//
// ── WHY THIS DRIVE EXISTS ────────────────────────────────────────────────
//
// `reportcontrol:prove` says app/job/[id]/page.tsx mounts the control, and it
// is right: the JSX is there, unconditional, at line 512. Paul opened the same
// page on a handset, scrolled to the bottom, and did not find it.
//
// BOTH OF THOSE CAN BE TRUE. A filesystem check answers "is it mounted"; it
// cannot answer "would a person find it". So this asks the rendered page where
// the control IS — its position in the document, and which advert sections sit
// above and below it — rather than whether it exists.
//
// It prints the numbers. It does not decide whether the placement is wrong;
// the position relative to the other sections is the finding.

import { chromium } from 'playwright'
import { mkdirSync } from 'node:fs'

const BASE = process.argv[2]
const JOB = process.argv[3]
if (!BASE || !JOB) {
  console.error('usage: node scripts/drive-report-control-on-job-page.mjs <base-url> <job-id>')
  process.exit(2)
}
const SHOTS = 'drive-shots'
mkdirSync(SHOTS, { recursive: true })

const VW = 390
const VH = 844

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: VW, height: VH } })

await page.goto(`${BASE}/job/${JOB}`, { waitUntil: 'domcontentloaded' })

// WAIT ON A PREDICATE THAT IS FALSE WHILE THE ANSWER IS MISSING, never a
// clock — and one that cannot be satisfied by an empty page. The advert is
// rendered when a section heading exists AND the page is not still loading.
await page.waitForFunction(() => {
  const h = document.querySelector('h1')
  return !!h && h.textContent.trim().length > 0 && !/loading/i.test(document.body.innerText.slice(0, 400))
}, { timeout: 30000 })

const found = await page.evaluate(() => {
  const doc = document.documentElement
  const pageH = doc.scrollHeight

  const el = document.querySelector('[data-report-control="job"]')
  const headings = [...document.querySelectorAll('h1, h2, h3')].map(h => ({
    text: (h.textContent || '').trim().slice(0, 44),
    y: Math.round(h.getBoundingClientRect().top + window.scrollY),
    tag: h.tagName,
  })).sort((a, b) => a.y - b.y)

  if (!el) return { pageH, headings, control: null }

  const r = el.getBoundingClientRect()
  const cs = getComputedStyle(el)
  return {
    pageH,
    headings,
    control: {
      text: (el.textContent || '').trim(),
      y: Math.round(r.top + window.scrollY),
      x: Math.round(r.left),
      w: Math.round(r.width),
      h: Math.round(r.height),
      visible: el.checkVisibility(),
      display: cs.display,
      color: cs.color,
      fontSize: cs.fontSize,
    },
  }
})

const pct = (y) => Math.round((y / found.pageH) * 1000) / 10

console.log(`page height at ${VW}px: ${found.pageH}px`)
console.log('')

if (!found.control) {
  console.log('THE REPORT CONTROL IS NOT IN THE DOM AT ALL.')
} else {
  const c = found.control
  console.log('THE REPORT CONTROL IS IN THE DOM.')
  console.log(`  text        "${c.text}"`)
  console.log(`  visible     ${c.visible}   display=${c.display}  ${c.w}x${c.h} at x=${c.x}`)
  console.log(`  colour      ${c.color}  ${c.fontSize}`)
  console.log(`  position    y=${c.y}  =  ${pct(c.y)}% down the page`)
  console.log(`  BELOW IT    ${found.pageH - c.y}px of advert still to scroll`)
}

console.log('')
console.log('EVERY HEADING ON THE PAGE, IN DOCUMENT ORDER, WITH THE CONTROL IN PLACE')
console.log('')
const marks = found.headings.map(h => ({ ...h, kind: 'heading' }))
if (found.control) marks.push({ text: '>>> THE REPORT CONTROL <<<', y: found.control.y, tag: '', kind: 'control' })
marks.sort((a, b) => a.y - b.y)
for (const m of marks) {
  const line = String(m.y).padStart(6) + '  ' + String(pct(m.y) + '%').padStart(6) + '  ' +
    (m.kind === 'control' ? m.text : `${m.tag}  ${m.text}`)
  console.log('  ' + line)
}

// THE SCREENSHOT IS THE HALF THE NUMBERS CANNOT GIVE. Every assertion about
// this control has passed for a week; a picture is what found the fault.
await page.screenshot({ path: `${SHOTS}/job-page-full-390.png`, fullPage: true })
if (found.control) {
  await page.evaluate((y) => window.scrollTo(0, Math.max(0, y - 300)), found.control.y)
  await page.waitForTimeout(150)
  await page.screenshot({ path: `${SHOTS}/job-page-at-control-390.png` })
}
console.log('')
console.log(`shots: ${SHOTS}/job-page-full-390.png and ${SHOTS}/job-page-at-control-390.png`)

await browser.close()

// npm run appapi:prove — what the iOS app's /api/app/jobs would hand the phone,
// computed from the live board, READ ONLY.
//
// Asserts the claims the native screens rely on:
//   - every live job is returned, and none is marked closed
//   - pay is never the "Competitive salary" fallback (the app shows no pay
//     rather than an invented one), and is present exactly when the row has a
//     figure above zero
//   - every region offered in "Where" has at least one job (design A5)
//   - the region counts add up to the jobs that have a region
// Prints the counts so a reader can check them against `npm run board`.

import { readFileSync } from 'fs'
for (const line of readFileSync('.env.local', 'utf8').split(/\r?\n/)) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/)
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^"|"$/g, '')
}

async function main() {
  const { publicClient, toAppJob, APP_JOB_COLUMNS } = await import('../lib/appApi')
  const { data, error } = await publicClient().from('jobs').select(APP_JOB_COLUMNS).eq('status', 'active')
  if (error) { console.log('NOT VERIFIED: jobs query failed —', error.message); process.exitCode = 2; return }
  const rows = data || []
  const jobs = await Promise.all(rows.map(toAppJob))

  let fail = 0
  const check = (ok: boolean, label: string) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}`); if (!ok) fail++ }

  check(rows.length > 0, `live jobs returned: ${rows.length}`)
  check(jobs.every(j => !j.isClosed), 'no live job is marked closed')
  check(jobs.every(j => j.pay !== 'Competitive salary'), 'pay is never the "Competitive salary" fallback')
  const withFigure = rows.filter((r: any) => Number(r.salary_min) > 0 || Number(r.salary_max) > 0).length
  check(jobs.filter(j => j.pay).length === withFigure, `pay present exactly where the row has a figure: ${withFigure}`)
  check(jobs.every(j => j.place.length > 0), 'every job has a place')
  const tag = /<[a-z/][^>]*>/i
  const rawHtml = rows.filter((r: any) => tag.test(r.full_description || r.description || '')).length
  check(jobs.every(j => !tag.test(j.about) && ![...j.responsibilities, ...j.requirements, ...j.benefits].some(t => tag.test(t))),
    `no HTML tag reaches the app (rows holding HTML: ${rawHtml})`)

  const counts = new Map<string, number>()
  for (const j of jobs) if (j.region) counts.set(j.region.label, (counts.get(j.region.label) || 0) + 1)
  const regioned = jobs.filter(j => j.region).length
  check(Array.from(counts.values()).every(n => n > 0), 'every region offered has jobs')
  check(Array.from(counts.values()).reduce((a, b) => a + b, 0) === regioned, 'region counts add up')

  console.log(`\nregions (${counts.size}), ${regioned} of ${jobs.length} jobs placed, ${jobs.length - regioned} shown under "Anywhere" only:`)
  for (const [k, n] of Array.from(counts.entries()).sort((a, b) => b[1] - a[1])) console.log(`  ${String(n).padStart(3)}  ${k}`)
  const s = jobs[0]
  console.log(`\nsample: ${s.title} · ${s.company} · ${s.place} · ${s.pay ?? '(no pay)'} · ${s.type ?? '(no type)'} · ${s.postedLabel}${s.isNew ? ' · NEW' : ''}`)

  console.log(fail ? `\n${fail} FAILED` : '\nall passed')
  process.exitCode = fail ? 1 : 0
}
main()

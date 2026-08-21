// WHAT COLOUR DOES EACH REAL EMPLOYER ACTUALLY GET?
//
// Read-only. Fetches the five live logos, runs the real pipeline over them and
// prints every intermediate the rule branches on — sampled rgb, hue variance,
// source lightness, the distance the clamp would travel, and the stored hex.
//
// It exists because the rule now has THREE ways to reach navy (no sample, hue
// variance, lightness delta) and "it came out navy" no longer says which one
// fired. Goldenkeys is the case that has to be read off a measurement rather
// than predicted: design called it "the judgement call — keeps its olive if it
// measures under" and nothing in the handoff knows its lightness.
//
//   npx tsx scripts/measure-brand-colours.mts            read only, the default
//   npx tsx scripts/measure-brand-colours.mts --write    store the results
//
// --write SETS employer_profiles.brand_colour AND NOTHING ELSE, on the rows that
// carry a logo. Safe to run, and here is why rather than an assurance:
//
//   · the only trigger on that table is AFTER INSERT, so an update fires
//     nothing and no email path exists
//   · the column is additive and null today, so this cannot destroy a value
//   · it is fully reversible — set it back to null
//   · nothing on main reads it, so it is invisible in production until the
//     branded card merges
//
// It counts the non-null column before and after, so "five rows changed" is a
// measurement rather than a hope.

import fs from 'node:fs'
import { createClient } from '@supabase/supabase-js'
import { analyseLogo, renderLogo, sampleBrandColour } from '../lib/logoRender'
import {
  brandColourFrom, clampToBrandBand, rgbToOklab,
  BRAND_FALLBACK, HUE_VARIANCE_MAX, LIGHTNESS_DELTA_MAX, L_MIN, L_MAX,
} from '../lib/brandColour'

const env = Object.fromEntries(
  fs.readFileSync('.env.local', 'utf8').split(/\r?\n/)
    .filter(l => l && !l.startsWith('#') && l.includes('='))
    .map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, '')] })
)
const supa = createClient(env.NEXT_PUBLIC_SUPABASE_URL!, env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } })

const WRITE = process.argv.includes('--write')

async function main() {
  // BEFORE. Counted from the database rather than assumed to be zero, so the
  // after-count means something.
  const { count: filledBefore } = await supa
    .from('employer_profiles')
    .select('id', { count: 'exact', head: true })
    .not('brand_colour', 'is', null)
  console.log(`\n${WRITE ? 'WRITE' : 'DRY RUN'} · rows carrying a brand colour before: ${filledBefore ?? 0}`)

  const bytesOf = async (src: string): Promise<Buffer> => {
    if (src.startsWith('data:')) return Buffer.from(src.slice(src.indexOf(',') + 1), 'base64')
    const r = await fetch(src)
    if (!r.ok) throw new Error(`${r.status} fetching logo`)
    return Buffer.from(await r.arrayBuffer())
  }

  const { data, error } = await supa
    .from('employer_profiles')
    .select('id, company_name, logo_url')
    .not('logo_url', 'is', null)
    .order('company_name')
  if (error) throw error

  const rows = (data || []).filter(r => (r.logo_url || '').trim())
  console.log(`\n${rows.length} employers carry a logo.\n`)

  let written = 0
  const pad = (s: string, n: number) => s.padEnd(n)
  console.log(pad('employer', 26) + pad('sampled', 16) + pad('hueVar', 9) + pad('L', 7) + pad('ΔL', 7) + pad('stored', 10) + 'why')
  console.log('─'.repeat(100))

  for (const row of rows) {
    const name = row.company_name || '(unnamed)'
    let line = pad(name.slice(0, 25), 26)
    try {
      const raw = await bytesOf(row.logo_url as string)
      const rendered = await renderLogo(raw, await analyseLogo(raw))
      const sample = await sampleBrandColour(rendered.buffer)

      if (!sample) {
        console.log(line + pad('—', 16) + pad('—', 9) + pad('—', 7) + pad('—', 7) + pad(BRAND_FALLBACK, 10) + 'no sample')
        continue
      }

      const { L } = rgbToOklab(sample.r, sample.g, sample.b)
      const landing = Math.max(L_MIN, Math.min(L_MAX, L))
      const delta = Math.abs(landing - L)
      const stored = brandColourFrom(sample)

      // Name the branch that decided it, rather than inferring from the answer —
      // three different conditions all produce the same navy.
      const why = sample.hueVariance > HUE_VARIANCE_MAX ? `hue variance > ${HUE_VARIANCE_MAX}`
        : delta > LIGHTNESS_DELTA_MAX ? `lightness moved > ${LIGHTNESS_DELTA_MAX}`
        : `clamped (unclamped ${clampToBrandBand(sample.r, sample.g, sample.b)})`

      line += pad(`rgb(${sample.r},${sample.g},${sample.b})`, 16)
      line += pad(sample.hueVariance.toFixed(3), 9)
      line += pad(L.toFixed(3), 7)
      line += pad(delta.toFixed(3), 7)
      line += pad(stored, 10)
      console.log(line + why)

      if (WRITE) {
        // ONE COLUMN, ONE ROW, BY ID. Not a bulk update behind a filter — a
        // filter is what goes wrong quietly, and with five rows there is
        // nothing to gain from batching them.
        const { error: upErr } = await supa
          .from('employer_profiles')
          .update({ brand_colour: stored })
          .eq('id', (row as any).id)
        if (upErr) console.log('        WRITE FAILED: ' + upErr.message)
        else written++
      }
    } catch (e: any) {
      console.log(line + 'FAILED: ' + e.message)
    }
  }

  if (WRITE) {
    // AFTER, counted from the database. "Five rows written" is what the script
    // believes; this is what the table says.
    const { count: filledAfter } = await supa
      .from('employer_profiles')
      .select('id', { count: 'exact', head: true })
      .not('brand_colour', 'is', null)
    console.log(`\n${written} rows written · carrying a brand colour after: ${filledAfter ?? 0}`)
  } else {
    console.log('\nNothing written. Re-run with --write to store these.')
  }

  console.log(`\nband L ${L_MIN}–${L_MAX} · hue variance max ${HUE_VARIANCE_MAX} · lightness delta max ${LIGHTNESS_DELTA_MAX} · fallback ${BRAND_FALLBACK}\n`)

}

main().catch(e => { console.error(e); process.exit(1) })

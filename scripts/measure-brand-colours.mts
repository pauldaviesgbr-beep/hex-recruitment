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
//   npx tsx scripts/measure-brand-colours.mts
//
// Writes nothing, to the database or to disk.

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

async function main() {
  const bytesOf = async (src: string): Promise<Buffer> => {
    if (src.startsWith('data:')) return Buffer.from(src.slice(src.indexOf(',') + 1), 'base64')
    const r = await fetch(src)
    if (!r.ok) throw new Error(`${r.status} fetching logo`)
    return Buffer.from(await r.arrayBuffer())
  }

  const { data, error } = await supa
    .from('employer_profiles')
    .select('company_name, logo_url')
    .not('logo_url', 'is', null)
    .order('company_name')
  if (error) throw error

  const rows = (data || []).filter(r => (r.logo_url || '').trim())
  console.log(`\n${rows.length} employers carry a logo.\n`)

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
    } catch (e: any) {
      console.log(line + 'FAILED: ' + e.message)
    }
  }

  console.log(`\nband L ${L_MIN}–${L_MAX} · hue variance max ${HUE_VARIANCE_MAX} · lightness delta max ${LIGHTNESS_DELTA_MAX} · fallback ${BRAND_FALLBACK}\n`)

}

main().catch(e => { console.error(e); process.exit(1) })

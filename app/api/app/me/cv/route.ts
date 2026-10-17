// POST /api/app/me/cv — a scanned CV from the app (design D3: "Upload it to
// the same storage bucket and profile field as file uploads, so employers see
// no difference"). The body is the PDF made on the device.
//
// Same bucket ('profiles'), same path pattern and same two columns as the
// profile form's upload (components/JobSeekerProfileForm.tsx: cvs/{uid}/{ts},
// cv_url and cv_file_name), written AS THE USER so storage and row policies
// apply exactly as on the website. The app then asks /api/candidate/parse-cv
// to read it, fire and forget, as the website does.

import { NextRequest, NextResponse } from 'next/server'
import { userFromRequest } from '@/lib/appApi'

export const dynamic = 'force-dynamic'

// Under Vercel's 4.5 MB request limit. The app writes scans as compressed
// JPEG pages, so a two-page CV is well under a megabyte.
const MAX_BYTES = 4 * 1024 * 1024

export async function POST(req: NextRequest) {
  const me = await userFromRequest(req)
  if (!me) return NextResponse.json({ error: 'signed_out' }, { status: 401 })

  const bytes = new Uint8Array(await req.arrayBuffer())
  if (bytes.byteLength === 0) return NextResponse.json({ error: 'empty' }, { status: 400 })
  if (bytes.byteLength > MAX_BYTES) return NextResponse.json({ error: 'too_large' }, { status: 413 })
  // The file's own first bytes, not the header the caller sent, say what it is.
  if (Buffer.from(bytes.slice(0, 5)).toString('latin1') !== '%PDF-') {
    return NextResponse.json({ error: 'not_pdf' }, { status: 415 })
  }

  const { data: row } = await me.client
    .from('candidate_profiles').select('full_name').eq('user_id', me.userId).maybeSingle()
  if (!row) return NextResponse.json({ error: 'no_profile' }, { status: 404 })

  const path = `cvs/${me.userId}/${Date.now()}.pdf`
  const up = await me.client.storage.from('profiles')
    .upload(path, bytes, { contentType: 'application/pdf', upsert: true })
  if (up.error) return NextResponse.json({ error: 'not_stored' }, { status: 503 })

  // "CV – {Full name}.pdf" (design D3); with no name, no invented one.
  const name = (row.full_name || '').trim()
  const fileName = name ? `CV – ${name}.pdf` : 'CV.pdf'
  const { error } = await me.client
    .from('candidate_profiles').update({ cv_url: path, cv_file_name: fileName }).eq('user_id', me.userId)
  if (error) {
    // Do not leave an object nothing points at.
    await me.client.storage.from('profiles').remove([path])
    return NextResponse.json({ error: 'not_saved' }, { status: 503 })
  }
  return NextResponse.json({ fileName }, { headers: { 'Cache-Control': 'no-store' } })
}

import { createClient } from '@supabase/supabase-js'

// ─── Simulator core ──────────────────────────────────────────────────────────
// Shared by:
//   - /api/simulate/tick  (cron-style entry, Bearer-secret auth — kept around
//     so a deploy hook or external scheduler can still trigger it)
//   - /api/simulate/run   (employer-session entry, fired from the employer
//     dashboard on mount so the simulator feels live without needing a cron;
//     Hobby plan only allows daily crons)
//
// Picks up any activity on active jobs and has the fake "sim" candidates
// respond on a realistic delay:
//   - apply to active jobs that have fewer than 3 sim applications
//   - confirm new interview invitations
//   - accept / decline pending offers
//
// Idempotent: every branch checks state before acting, so running it a
// hundred times with no fresh employer activity is a no-op.
// ─────────────────────────────────────────────────────────────────────────────

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!

export const SIM_USER_IDS = [
  '11111111-1111-4000-a000-000000000001',
  '11111111-1111-4000-a000-000000000002',
  '11111111-1111-4000-a000-000000000003',
  '11111111-1111-4000-a000-000000000004',
  '11111111-1111-4000-a000-000000000005',
  '11111111-1111-4000-a000-000000000006',
  '11111111-1111-4000-a000-000000000007',
  '11111111-1111-4000-a000-000000000008',
]

const SIM_SIGNATURE_PATH = 'signatures/_sim/default.png'
const SIM_SIGNATURE_B64 = 'iVBORw0KGgoAAAANSUhEUgAAAMgAAAA8CAYAAADHqXsWAAAACXBIWXMAAA7EAAAOxAGVKw4bAAABKElEQVR4nO3UwQmAMAwF0L9n3MAJHMARHMEJnMARnMQJnMQJnMQJnMQJnMQNfAsNFGlbCf4FtSS/KZKYZVn1YQBqrXPOOQfgPuewLMv2pTmTUCCJjoaBBGuFhIVkFJJhL2VZEKO1TkREAAyAHPhV1VmVRKM0dN8HbfvGGEREZLb/WwSAYzg9T1MKEdFa/4nIGEMAqBrRaIxR7efv1WNJQohBkiSJyHgMIkRE1Lquz3FEHCsLCwu7I0oihCT/AOa7oQc8fLlLAAAAAElFTkSuQmCC'

function rand<T>(arr: T[]): T { return arr[Math.floor(Math.random() * arr.length)] }
function chance(p: number): boolean { return Math.random() < p }

export interface SimulatorCounts {
  applications: number
  interviewsConfirmed: number
  offersAccepted: number
  offersDeclined: number
  errors: number
}

export async function runSimulatorTick(): Promise<SimulatorCounts> {
  const admin = createClient(SUPABASE_URL, SERVICE_KEY)
  const counts: SimulatorCounts = { applications: 0, interviewsConfirmed: 0, offersAccepted: 0, offersDeclined: 0, errors: 0 }

  // Ensure the placeholder signature PNG exists in storage once.
  try {
    const probe = await admin.storage.from('profiles').list('signatures/_sim', { limit: 1 })
    const hasIt = probe.data?.some(f => f.name === 'default.png')
    if (!hasIt) {
      const bin = Buffer.from(SIM_SIGNATURE_B64, 'base64')
      await admin.storage.from('profiles').upload(SIM_SIGNATURE_PATH, bin, { contentType: 'image/png', upsert: true })
    }
  } catch (err) {
    console.error('[sim] sig bootstrap failed:', err)
  }

  // ─── 1. Fake candidates apply to any active job ──────────────────────────
  try {
    const { data: sims } = await admin
      .from('candidate_profiles')
      .select('user_id, full_name, job_sector, years_experience')
      .in('user_id', SIM_USER_IDS)
    const simList = sims || []

    const { data: jobs } = await admin
      .from('jobs')
      .select('id, title, company, screening_questions, employer_id')
      .eq('status', 'active')
    const allJobs = jobs || []

    for (const job of allJobs) {
      const { data: existing } = await admin
        .from('job_applications')
        .select('candidate_id')
        .eq('job_id', job.id)
      const existingSet = new Set((existing || []).map((a: any) => a.candidate_id))

      const currentSimApps = simList.filter(s => existingSet.has(s.user_id)).length
      const target = 1 + Math.floor(Math.random() * 3)
      if (currentSimApps >= target) continue

      const available = simList.filter(s => !existingSet.has(s.user_id))
      for (let i = 0; i < target - currentSimApps && available.length > 0; i++) {
        const pick = available.splice(Math.floor(Math.random() * available.length), 1)[0]
        const screeningAnswers = Array.isArray(job.screening_questions)
          ? job.screening_questions.map((q: any) => {
              const text: string = (q.question || q.text || '').trim()
              const lower = text.toLowerCase()
              const isYesNo = /^(are|have|do|did|can|could|would|will|is|is there|willing)\b/.test(lower)
              const asksYears = /(how many years|years of experience|how long)/.test(lower)
              let answer: string
              if (asksYears) answer = rand(['2-3 years', '4-5 years', '6+ years', '1-2 years'])
              else if (isYesNo) answer = chance(0.8) ? 'Yes' : 'No'
              else answer = rand(['Yes', 'Comfortable with this', 'Some experience in this area'])
              return {
                questionId: q.id || q.questionId || '',
                question: text,
                answer,
              }
            })
          : []

        const coverLetter = `Dear ${job.company || 'hiring team'},\n\nI'd love to be considered for the ${job.title} role. My background as a ${pick.job_sector} professional with ${pick.years_experience} years of experience aligns well with what you're looking for.\n\nHappy to share more on a call.\n\nBest regards,\n${pick.full_name}`

        const { error: insErr } = await admin.from('job_applications').insert({
          candidate_id: pick.user_id,
          job_id: job.id,
          status: 'pending',
          cover_letter: coverLetter,
          job_title: job.title,
          company: job.company,
          screening_answers: screeningAnswers,
        })
        if (insErr) { counts.errors++; continue }
        counts.applications++

        await admin.from('notifications').insert({
          user_id: job.employer_id,
          type: 'application_update',
          title: 'New Application',
          message: `${pick.full_name} applied for ${job.title}`,
          read: false,
          related_type: 'application',
          link: `/my-jobs/${job.id}/applications`,
        })
      }
    }
  } catch (err) {
    console.error('[sim] apply step failed:', err)
    counts.errors++
  }

  // ─── 2. Confirm new interview invitations ────────────────────────────────
  try {
    const { data: apps } = await admin
      .from('job_applications')
      .select('id, candidate_id, job_id, job_title, interview_interest_status')
      .in('candidate_id', SIM_USER_IDS)
      .is('interview_interest_status', null)
    for (const app of apps || []) {
      const { data: interview } = await admin
        .from('interviews')
        .select('id, employer_id, interview_date, interview_time, duration_minutes, interview_type, status, application_id')
        .eq('application_id', app.id)
        .in('status', ['scheduled', 'pending_self_schedule'])
        .maybeSingle()
      if (!interview) continue

      const response = chance(0.85) ? 'interested' : 'not_interested'

      await admin.from('job_applications').update({ interview_interest_status: response }).eq('id', app.id)

      const { data: sim } = await admin.from('candidate_profiles').select('full_name').eq('user_id', app.candidate_id).maybeSingle()
      const candidateName = sim?.full_name || 'A candidate'

      if (response === 'interested') {
        await admin.from('interviews').update({ status: 'confirmed' }).eq('id', interview.id)
        counts.interviewsConfirmed++
        await admin.from('notifications').insert({
          user_id: interview.employer_id,
          type: 'application_status_change',
          title: 'Interview Confirmed',
          message: `${candidateName} confirmed their interview for ${app.job_title}`,
          read: false,
          related_id: app.id,
          related_type: 'application',
          link: `/my-jobs/${app.job_id}/applications`,
        })
      } else {
        await admin.from('notifications').insert({
          user_id: interview.employer_id,
          type: 'application_status_change',
          title: 'Interview Invitation Declined',
          message: `${candidateName} declined the interview invitation for ${app.job_title}`,
          read: false,
          related_id: app.id,
          related_type: 'application',
          link: `/my-jobs/${app.job_id}/applications`,
        })
      }
    }
  } catch (err) {
    console.error('[sim] interview step failed:', err)
    counts.errors++
  }

  // ─── 3. Respond to pending offers (accept / decline) ─────────────────────
  try {
    const { data: offers } = await admin
      .from('job_offers')
      .select('id, candidate_id, employer_id, application_id, job_id, offer_letter_url, jobs ( title )')
      .in('candidate_id', SIM_USER_IDS)
      .eq('status', 'pending')

    for (const offer of offers || []) {
      const { data: sim } = await admin.from('candidate_profiles').select('full_name').eq('user_id', offer.candidate_id).maybeSingle()
      const candidateName = sim?.full_name || 'The candidate'
      const jobTitle = (Array.isArray(offer.jobs) ? offer.jobs[0]?.title : (offer.jobs as any)?.title) || 'the role'

      const roll = Math.random()
      if (roll < 0.65) {
        let updatedUrl: string | null = null
        try {
          const { data: signed } = await admin.storage.from('profiles').createSignedUrl(offer.offer_letter_url as string, 120)
          if (signed?.signedUrl) {
            const pdfRes = await fetch(signed.signedUrl)
            if (pdfRes.ok) {
              const original = new Uint8Array(await pdfRes.arrayBuffer())
              const sigBytes = Uint8Array.from(Buffer.from(SIM_SIGNATURE_B64, 'base64'))
              const { appendSignaturesToPdf } = await import('@/lib/signPdf')
              const signedBytes = await appendSignaturesToPdf(original, [{
                role: 'Candidate',
                name: candidateName,
                imageBytes: sigBytes,
                signedAt: new Date().toISOString(),
                userAgent: 'Thrive Simulator',
              }])
              const newPath = `offer-letters/${offer.candidate_id}/signed-${offer.id}-${Date.now()}.pdf`
              const { error: upErr } = await admin.storage.from('profiles').upload(newPath, Buffer.from(signedBytes as any), { contentType: 'application/pdf', upsert: true })
              if (!upErr) updatedUrl = newPath
            }
          }
        } catch (err) {
          console.error('[sim] accept pdf step failed (continuing):', err)
        }

        const update: Record<string, unknown> = {
          status: 'accepted',
          signature_name: candidateName,
          signature_timestamp: new Date().toISOString(),
          signature_image_url: SIM_SIGNATURE_PATH,
          signature_ip: null,
          signature_user_agent: 'Thrive Simulator',
        }
        if (updatedUrl) update.offer_letter_url = updatedUrl
        await admin.from('job_offers').update(update).eq('id', offer.id)

        await admin.from('notifications').insert({
          user_id: offer.employer_id,
          type: 'application_status_change',
          title: 'Offer Accepted',
          message: `${candidateName} has accepted the offer for ${jobTitle}`,
          read: false,
          related_id: offer.application_id,
          related_type: 'application',
          link: '/my-jobs',
        })
        counts.offersAccepted++
      } else if (roll < 0.85) {
        await admin.from('job_offers').update({ status: 'declined', decline_reason: 'After careful consideration I have decided to pursue a different opportunity. Thank you for the time and the offer.' }).eq('id', offer.id)
        await admin.from('notifications').insert({
          user_id: offer.employer_id,
          type: 'application_status_change',
          title: 'Offer Declined',
          message: `${candidateName} has declined the offer for ${jobTitle}`,
          read: false,
          related_id: offer.application_id,
          related_type: 'application',
          link: '/my-jobs',
        })
        counts.offersDeclined++
      }
    }
  } catch (err) {
    console.error('[sim] offer step failed:', err)
    counts.errors++
  }

  return counts
}
